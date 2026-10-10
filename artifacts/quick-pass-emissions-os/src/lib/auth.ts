import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { APIError, createAuthMiddleware, getSessionFromCtx } from "better-auth/api";
import { db } from "./db";
import { previewTrustedOrigins } from "./auth-origins";
export const auth = betterAuth({
  database: prismaAdapter(db, { provider: "postgresql" }),
  baseURL: process.env.BETTER_AUTH_URL,
  secret: process.env.BETTER_AUTH_SECRET,
  trustedOrigins: previewTrustedOrigins(process.env),
  emailAndPassword: {
    enabled: true,
    disableSignUp: true,
    minPasswordLength: 12,
    maxPasswordLength: 128,
  },
  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      if (ctx.path !== "/change-password") return;
      const session = await getSessionFromCtx(ctx);
      if (!session) throw new APIError("UNAUTHORIZED", { message: "Sign in to continue." });
      const user = await db.user.findUnique({
        where: { id: session.user.id },
        select: { active: true },
      });
      if (!user?.active) throw new APIError("FORBIDDEN", { message: "Account is inactive." });
      // Enforce this on the supported endpoint as well as the native form.
      ctx.body.revokeOtherSessions = true;
    }),
  },
  databaseHooks: {
    account: {
      update: {
        after: async (account, ctx) => {
          if (ctx?.path !== "/change-password") return;
          // Only fixed metadata: never password hashes, request bodies, or tokens.
          // Record the completed credential update even if subsequent session rotation fails.
          await db.auditLog.create({
            data: {
              actorId: account.userId,
              entityId: account.userId,
              action: "PASSWORD_CHANGED",
              details: { source: "self_service", sessionPolicy: "rotate-current-revoke-others" },
            },
          });
        },
      },
    },
    session: {
      create: {
        before: async (session) => {
          const user = await db.user.findUnique({
            where: { id: session.userId },
            select: { active: true },
          });
          return user?.active === true;
        },
      },
    },
  },
  session: { expiresIn: 60 * 60 * 12, updateAge: 60 * 60, cookieCache: { enabled: false } },
  rateLimit: {
    enabled: true,
    storage: "database",
    window: 60,
    max: 40,
    customRules: {
      "/sign-in/email": { window: 60, max: 5 },
      "/change-password": { window: 60, max: 5 },
    },
  },
  advanced: {
    useSecureCookies: process.env.NODE_ENV === "production",
    // Better Auth otherwise disables origin checks automatically in test mode.
    // Exercise the same CSRF boundary in isolated tests as in the running app.
    disableOriginCheck: false,
    disableCSRFCheck: false,
  },
});
