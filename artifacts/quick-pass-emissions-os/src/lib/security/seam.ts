import { createHmac } from "node:crypto";
import { z } from "zod";
import { BusinessError, requireRule } from "@/modules/phase2";

export function doorConfig() {
  const key = process.env.SEAM_API_KEY?.trim();
  const accountId = process.env.SEAM_CONNECTED_ACCOUNT_ID?.trim();
  const fingerprintKey = process.env.DOOR_CODE_HMAC_KEY?.trim();
  return key &&
    z.uuid().safeParse(accountId).success &&
    /^[a-f0-9]{64}$/i.test(fingerprintKey ?? "")
    ? { key, accountId: accountId!, fingerprintKey: fingerprintKey! }
    : null;
}
export function configured() {
  const c = doorConfig();
  requireRule(c, "Door connection setup is incomplete. Ask the owner to complete setup.");
  return c;
}
export function fingerprint(doorId: string, pin: string) {
  return createHmac("sha256", Buffer.from(configured().fingerprintKey, "hex"))
    .update(`${doorId}:${pin}`)
    .digest("hex");
}
const deviceSchema = z.object({
  device_id: z.uuid(),
  connected_account_id: z.uuid(),
  device_type: z.string(),
  is_managed: z.boolean(),
  can_program_online_access_codes: z.boolean(),
  properties: z
    .object({
      online: z.boolean(),
      locked: z.boolean().optional(),
      battery: z
        .object({ level: z.number().min(0).max(1) })
        .passthrough()
        .optional(),
      schlage_metadata: z.object({ model: z.string() }),
      supported_code_lengths: z.array(z.number().int().min(4).max(12)).min(1),
      code_constraints: z.array(z.object({ constraint_type: z.string() }).passthrough()).optional(),
    })
    .passthrough(),
});
export type SeamDevice = z.infer<typeof deviceSchema>;
export const codeSchema = z.object({
  access_code_id: z.uuid(),
  device_id: z.uuid(),
  name: z.string(),
  code: z.string(),
  status: z.enum(["setting", "set", "unset", "removing", "unknown"]),
  is_managed: z.boolean(),
  is_scheduled_on_device: z.boolean().optional(),
  starts_at: z.string().nullable().optional(),
  ends_at: z.string().nullable().optional(),
  errors: z.array(z.unknown()).optional(),
  warnings: z.array(z.unknown()).optional(),
  pending_mutations: z.array(z.unknown()).optional(),
});
export type SeamCode = z.infer<typeof codeSchema>;
// A fixed origin, bounded requests, no redirect following, and no provider payload logging.
export async function seam(
  path: string,
  method: "GET" | "POST" | "DELETE",
  params: Record<string, unknown>,
  deadline: number,
) {
  const c = configured();
  const remaining = deadline - Date.now();
  requireRule(remaining > 0, "Door check timed out; confirmation remains pending.");
  const url = new URL(path, "https://connect.getseam.com");
  requireRule(url.origin === "https://connect.getseam.com", "Unsupported door provider origin.");
  if (method !== "POST")
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
  try {
    const response = await fetch(url, {
      method,
      headers: { Authorization: `Bearer ${c.key}`, "Content-Type": "application/json" },
      ...(method === "POST" ? { body: JSON.stringify(params) } : {}),
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(Math.min(6000, remaining)),
    });
    if (!response.ok) throw new Error("provider");
    return (await response.json()) as unknown;
  } catch {
    throw new BusinessError(
      "Door provider could not confirm the request. Check the connection and refresh status; do not assume access changed.",
    );
  }
}
export async function getDevice(deviceId: string, accountId: string, deadline: number) {
  const r = z
    .object({ device: deviceSchema })
    .safeParse(await seam("/devices/get", "GET", { device_id: deviceId }, deadline));
  requireRule(r.success, "Door details could not be verified. Check the device in Seam.");
  const d = r.data.device;
  requireRule(
    d.device_id === deviceId &&
      d.connected_account_id === accountId &&
      accountId === configured().accountId,
    "Door does not belong to the configured Schlage account.",
  );
  requireRule(
    d.is_managed &&
      d.can_program_online_access_codes &&
      /BE489|^Encode(?: Smart Wi.?Fi Deadbolt)?$/i.test(d.properties.schlage_metadata.model),
    "Connect a managed Schlage Encode BE489WB with online keypad-code support.",
  );
  return d;
}
export function checkPin(pin: string, device: SeamDevice) {
  requireRule(
    /^\d{4,12}$/.test(pin) && device.properties.supported_code_lengths.includes(pin.length),
    "Use a numeric code with the code length configured on this lock.",
  );
  for (const c of device.properties.code_constraints ?? []) {
    requireRule(
      c.constraint_type === "no_zeros",
      "This lock has an unsupported code restriction. Review setup in Seam.",
    );
    requireRule(!pin.includes("0"), "This lock does not accept zero in keypad codes.");
  }
}
export async function listCodes(deviceId: string, deadline: number) {
  const r = z
    .object({
      access_codes: z.array(codeSchema),
      pagination: z.object({ has_next_page: z.boolean() }),
    })
    .safeParse(
      await seam("/access_codes/list", "GET", { device_id: deviceId, limit: 200 }, deadline),
    );
  requireRule(
    r.success &&
      !r.data.pagination.has_next_page &&
      r.data.access_codes.every((c) => c.device_id === deviceId),
    "The complete door-code list could not be verified. No removal is confirmed.",
  );
  return r.data.access_codes;
}
export async function removalConfirmed(
  deviceId: string,
  codeId: string,
  since: Date,
  deadline: number,
) {
  const r = z
    .object({
      events: z.array(
        z.object({
          device_id: z.string().optional(),
          access_code_id: z.string().optional(),
          event_type: z.string(),
          occurred_at: z.string(),
        }),
      ),
    })
    .safeParse(
      await seam(
        "/events/list",
        "GET",
        {
          device_id: deviceId,
          access_code_id: codeId,
          since: since.toISOString(),
          event_type: "access_code.removed_from_device",
          limit: 100,
        },
        deadline,
      ),
    );
  return (
    r.success &&
    r.data.events.some(
      (e) =>
        e.device_id === deviceId &&
        e.access_code_id === codeId &&
        e.event_type === "access_code.removed_from_device" &&
        new Date(e.occurred_at) >= since,
    )
  );
}
