import { randomBytes, randomUUID, createHash } from "node:crypto";
import { z } from "zod";
import { db } from "@/lib/db";

import { encrypt, decrypt, hash } from "@/lib/google-business/crypto";
import {
  authorizationUrl,
  exchange,
  googleGet,
  refresh,
  revoke,
  tokensSchema,
  GoogleError,
} from "@/lib/google-business/client";
import { audit, requireRule, type Tx } from "../phase2";
import { stationConfig } from "../station/service";
import { analytics, stationAccess } from "./transaction";
const CONNECTION = "business";
export async function beginConnection(actorId: string, browser: string) {
  return analytics(actorId, async (tx) => {
    const connection = await tx.googleBusinessConnection.upsert({
      where: { id: CONNECTION },
      create: { id: CONNECTION, createdBy: actorId },
      update: {},
    });
    const state = randomBytes(32).toString("base64url"),
      verifier = randomBytes(48).toString("base64url");
    await tx.googleBusinessOAuth.deleteMany({
      where: { OR: [{ expiresAt: { lt: new Date() } }, { actorId }] },
    });
    await tx.googleBusinessOAuth.create({
      data: {
        stateHash: hash(state),
        browserHash: hash(browser),
        actorId,
        generation: connection.generation,
        verifier: encrypt(verifier, `oauth:${hash(state)}`),
        expiresAt: new Date(Date.now() + 10 * 60000),
      },
    });
    return authorizationUrl(state, createHash("sha256").update(verifier).digest("base64url"));
  });
}
export async function finishConnection(
  actorId: string,
  state: string,
  browser: string,
  code: string,
) {
  // Consume before exchanging. A failed/ambiguous exchange requires a new consent flow.
  const attempt = await analytics(actorId, async (tx) => {
    const row = await tx.googleBusinessOAuth.findUnique({ where: { stateHash: hash(state) } });
    requireRule(
      row &&
        row.actorId === actorId &&
        row.browserHash === hash(browser) &&
        row.expiresAt > new Date(),
      "Google connection expired or could not be verified. Start Connect Google again.",
    );
    const c = await tx.googleBusinessConnection.findUniqueOrThrow({ where: { id: CONNECTION } });
    requireRule(c.generation === row.generation, "Connection changed. Start Connect Google again.");
    await tx.googleBusinessOAuth.delete({ where: { stateHash: row.stateHash } });
    return row;
  });
  const verifier = z.string().parse(decrypt(attempt.verifier, `oauth:${attempt.stateHash}`));
  const credentials = await exchange(code, verifier);
  await analytics(actorId, async (tx) => {
    const c = await tx.googleBusinessConnection.findUniqueOrThrow({ where: { id: CONNECTION } });
    requireRule(c.generation === attempt.generation, "Connection changed. Reconnect Google.");
    await tx.googleBusinessCache.deleteMany({});
    await tx.googleBusinessSync.deleteMany({});
    await tx.googleBusinessRequest.deleteMany({});
    await tx.googleBusinessLocation.updateMany({ data: { enabled: false } });
    await tx.googleBusinessConnection.update({
      where: { id: CONNECTION },
      data: {
        status: "CONNECTED",
        credentials: encrypt(credentials, `tokens:${CONNECTION}`),
        createdBy: actorId,
        generation: { increment: 1 },
        connectedAt: new Date(),
        error: null,
        discovery: null,
        discoveryAt: null,
        discoveryExpiresAt: null,
        cooldownUntil: null,
      },
    });
    await audit(tx, actorId, "GOOGLE_CONNECTED", CONNECTION, {});
  });
}
export async function connectionTokens(tx: Tx, deadline: number) {
  const c = await tx.googleBusinessConnection.findUnique({ where: { id: CONNECTION } });
  requireRule(c?.status === "CONNECTED" && c.credentials, "Connect Google before requesting data.");
  const actor = await tx.user.findUnique({ where: { id: c.createdBy } });
  requireRule(
    actor?.active && ["OWNER", "ADMIN"].includes(actor.role),
    "The Google connection authorizer no longer has management access. Reconnect with an active account.",
  );
  const old = tokensSchema.parse(decrypt(c.credentials, `tokens:${CONNECTION}`)),
    tokens = await refresh(old, deadline);
  if (tokens !== old)
    await tx.googleBusinessConnection.update({
      where: { id: CONNECTION },
      data: { credentials: encrypt(tokens, `tokens:${CONNECTION}`) },
    });
  return tokens;
}
const accountName = z.string().regex(/^accounts\/[A-Za-z0-9_-]+$/),
  locationName = z.string().regex(/^locations\/[A-Za-z0-9_-]+$/);
const accountPage = z.object({
  accounts: z.array(z.object({ name: accountName, accountName: z.string().optional() })).optional(),
  nextPageToken: z.string().max(20000).optional(),
});
const locationPage = z.object({
  locations: z
    .array(
      z.object({
        name: locationName,
        title: z.string(),
        storefrontAddress: z.unknown().optional(),
      }),
    )
    .optional(),
  nextPageToken: z.string().max(20000).optional(),
});
export const discoverySchema = z.array(z.object({ accountName, raw: z.unknown() }));
export async function discoverLocations(actorId: string) {
  return analytics(actorId, async (tx) => {
    const c = await tx.googleBusinessConnection.findUniqueOrThrow({ where: { id: CONNECTION } });
    requireRule(
      !c.cooldownUntil || c.cooldownUntil <= new Date(),
      "Google refresh is cooling down. Try again in a minute.",
    );
    await tx.googleBusinessConnection.update({
      where: { id: CONNECTION },
      data: { cooldownUntil: new Date(Date.now() + 60000) },
    });
    try {
      const deadline = Date.now() + 30000,
        tokens = await connectionTokens(tx, deadline),
        pages: z.infer<typeof discoverySchema> = [];
      let cursor = "";
      let requests = 0;
      do {
        requireRule(
          ++requests <= 20,
          "Too many Google account pages. Contact the operator to narrow the authorized account.",
        );
        const raw = await googleGet(
          "mybusinessaccountmanagement.googleapis.com",
          "/v1/accounts",
          new URLSearchParams({ pageSize: "20", ...(cursor ? { pageToken: cursor } : {}) }),
          tokens.access_token,
          deadline,
        );
        const accounts = accountPage.parse(raw);
        for (const account of accounts.accounts ?? []) {
          let locationCursor = "";
          do {
            requireRule(
              ++requests <= 20,
              "Too many Google location pages. Contact the operator to narrow the authorized account.",
            );
            const raw = await googleGet(
              "mybusinessbusinessinformation.googleapis.com",
              `/v1/${account.name}/locations`,
              new URLSearchParams({
                readMask: "name,title,storefrontAddress",
                pageSize: "100",
                ...(locationCursor ? { pageToken: locationCursor } : {}),
              }),
              tokens.access_token,
              deadline,
            );
            const response = locationPage.parse(raw);
            pages.push({ accountName: account.name, raw });
            locationCursor = response.nextPageToken ?? "";
          } while (locationCursor);
        }
        cursor = accounts.nextPageToken ?? "";
      } while (cursor);
      await tx.googleBusinessConnection.update({
        where: { id: CONNECTION },
        data: {
          discovery: encrypt(pages, "discovery"),
          discoveryAt: new Date(),
          discoveryExpiresAt: new Date(Date.now() + 29 * 86400000),
          error: null,
        },
      });
      await audit(tx, actorId, "GOOGLE_LOCATIONS_REFRESHED", CONNECTION, {});
      return { ok: true };
    } catch (e) {
      await tx.googleBusinessConnection.update({
        where: { id: CONNECTION },
        data: {
          error:
            e instanceof GoogleError
              ? e.message
              : "Location discovery failed. Check Google setup and retry.",
          ...(e instanceof GoogleError && e.code === "RECONNECT"
            ? { status: "RECONNECT", credentials: null }
            : {}),
        },
      });
      return { ok: false };
    }
  });
}
export function discovered(raw: string | null, expires: Date | null) {
  if (!raw || !expires || expires <= new Date()) return [];
  const pages = discoverySchema.parse(decrypt(raw, "discovery"));
  return pages.flatMap((p) =>
    (locationPage.parse(p.raw).locations ?? []).map((l) => ({
      accountName: p.accountName,
      name: l.name,
      title: l.title,
    })),
  );
}
export async function disconnectGoogle(actorId: string) {
  return analytics(actorId, async (tx, actor) => {
    const c = await tx.googleBusinessConnection.findUnique({ where: { id: CONNECTION } });
    requireRule(
      c && (actor.role === "OWNER" || c.createdBy === actorId),
      "Only an owner or the connecting manager may disconnect Google.",
    );
    let revoked = true;
    if (c.credentials) {
      try {
        revoked = await revoke(tokensSchema.parse(decrypt(c.credentials, `tokens:${CONNECTION}`)));
      } catch {
        revoked = false;
      }
    }
    await tx.googleBusinessConnection.update({
      where: { id: CONNECTION },
      data: {
        status: "DISCONNECTED",
        credentials: null,
        discovery: null,
        discoveryExpiresAt: null,
        discoveryAt: null,
        generation: { increment: 1 },
        error: revoked
          ? null
          : "Local access removed. Also remove Quick Pass access in your Google Account permissions; Google revocation could not be confirmed.",
      },
    });
    await tx.googleBusinessOAuth.deleteMany({});
    await tx.googleBusinessCache.deleteMany({});
    await tx.googleBusinessSync.deleteMany({});
    await tx.googleBusinessRequest.deleteMany({});
    await tx.googleBusinessLocation.updateMany({ data: { enabled: false } });
    await audit(tx, actorId, "GOOGLE_DISCONNECTED", CONNECTION, { revocationConfirmed: revoked });
  });
}
export async function registerAnalyticsStation(actorId: string, input: unknown) {
  const d = z
    .object({ name: z.string().trim().min(1).max(100), timezoneConfirmed: z.literal(true) })
    .parse(input);
  return analytics(actorId, async (tx, actor) => {
    requireRule(actor.role === "OWNER", "Only owners register station mappings.");
    // Reuse the current source station identity; never invent or cross-map source records.
    const config = stationConfig();
    const row = await tx.analyticsStation.upsert({
      where: { stationHash: config.hash },
      create: {
        name: d.name,
        stationHash: config.hash,
        createdBy: actorId,
        timezoneConfirmed: true,
      },
      update: { name: d.name, timezoneConfirmed: true },
    });
    await audit(tx, actorId, "ANALYTICS_STATION_SAVED", row.id, { name: d.name });
    return row.id;
  });
}
export async function grantAnalyticsStation(actorId: string, input: unknown) {
  const d = z
    .object({ stationId: z.string().min(1), userId: z.string().min(1), allow: z.boolean() })
    .parse(input);
  return analytics(actorId, async (tx, actor) => {
    requireRule(actor.role === "OWNER", "Only owners manage station permissions.");
    await stationAccess(tx, actor, d.stationId);
    const user = await tx.user.findUnique({ where: { id: d.userId } });
    requireRule(user?.active && user.role === "ADMIN", "Select an active manager.");
    if (d.allow)
      await tx.analyticsStationGrant.upsert({
        where: { stationId_userId: { stationId: d.stationId, userId: d.userId } },
        create: { stationId: d.stationId, userId: d.userId },
        update: {},
      });
    else
      await tx.analyticsStationGrant.deleteMany({
        where: { stationId: d.stationId, userId: d.userId },
      });
    await audit(tx, actorId, "ANALYTICS_STATION_ACCESS", d.stationId, {
      userId: d.userId,
      allow: d.allow,
    });
  });
}
export async function mapGoogleLocation(actorId: string, input: unknown) {
  const d = z.object({ stationId: z.string().min(1), accountName, locationName }).parse(input);
  return analytics(actorId, async (tx, actor) => {
    requireRule(actor.role === "OWNER", "Only owners map Google locations.");
    await stationAccess(tx, actor, d.stationId);
    const c = await tx.googleBusinessConnection.findUnique({ where: { id: CONNECTION } });
    requireRule(
      c?.status === "CONNECTED" &&
        discovered(c.discovery, c.discoveryExpiresAt).some(
          (l) => l.accountName === d.accountName && l.name === d.locationName,
        ),
      "Refresh authorized Google locations and select one from that list.",
    );
    const existing = await tx.googleBusinessLocation.findFirst({
      where: { OR: [{ stationId: d.stationId }, { locationName: d.locationName }] },
    });
    requireRule(
      !existing || (existing.stationId === d.stationId && existing.locationName === d.locationName),
      "This station or Google location is already mapped. Disconnect and contact the operator before changing historical mapping.",
    );
    const l = await tx.googleBusinessLocation.upsert({
      where: { locationName: d.locationName },
      create: {
        connectionId: CONNECTION,
        stationId: d.stationId,
        accountName: d.accountName,
        locationName: d.locationName,
        createdBy: actorId,
      },
      update: { accountName: d.accountName, enabled: true, createdBy: actorId },
    });
    await audit(tx, actorId, "GOOGLE_LOCATION_MAPPED", l.id, { stationId: d.stationId });
    return l.id;
  });
}
export async function purgeGoogleCache(now = new Date()) {
  // Independent cleanup runs even when OAuth/configuration is absent or revoked.
  await db.googleBusinessCache.deleteMany({ where: { expiresAt: { lte: now } } });
  await db.googleBusinessOAuth.deleteMany({ where: { expiresAt: { lte: now } } });
  await db.googleBusinessConnection.updateMany({
    where: { discoveryExpiresAt: { lte: now } },
    data: { discovery: null, discoveryExpiresAt: null },
  });
}
export async function expireAuthorizers(tx: Tx) {
  const c = await tx.googleBusinessConnection.findUnique({ where: { id: CONNECTION } });
  if (!c || c.status !== "CONNECTED") return;
  const actor = await tx.user.findUnique({ where: { id: c.createdBy } });
  if (!actor?.active || !["OWNER", "ADMIN"].includes(actor.role))
    await tx.googleBusinessConnection.update({
      where: { id: CONNECTION },
      data: {
        status: "RECONNECT",
        credentials: null,
        error: "Connection authorizer lost management access. Reconnect Google.",
      },
    });
}
export const newCycle = () => randomUUID();
export const cacheExpiry = () => new Date(Date.now() + 29 * 86400000);
