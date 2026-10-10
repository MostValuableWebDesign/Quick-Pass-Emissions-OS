import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { db } from "./db";
export const auth = betterAuth({
  database: prismaAdapter(db, { provider: "postgresql" }),
  baseURL: process.env.BETTER_AUTH_URL,
  secret: process.env.BETTER_AUTH_SECRET,
  emailAndPassword: {
    enabled: true,
    disableSignUp: true,
    minPasswordLength: 12,
    maxPasswordLength: 128,
  },
  databaseHooks: {
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
    customRules: { "/sign-in/email": { window: 60, max: 5 } },
  },
  advanced: { useSecureCookies: process.env.NODE_ENV === "production" },
});
