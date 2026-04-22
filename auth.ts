import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { Role } from "@prisma/client";
import bcrypt from "bcryptjs";
import { z } from "zod";

import { getServerEnv } from "@/lib/env";
import { logError, logWarn } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

const credentialSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

const env = getServerEnv();
const isProduction = env.NODE_ENV === "production";

function maskEmail(email: string) {
  const [localPart, domain = ""] = email.toLowerCase().split("@");
  if (!localPart) {
    return `***@${domain}`;
  }

  const first = localPart[0];
  const last = localPart.length > 1 ? localPart[localPart.length - 1] : "";
  return `${first}***${last}@${domain}`;
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  trustHost: true,
  session: {
    strategy: "jwt",
    maxAge: 60 * 60 * 24 * 7,
  },
  secret: env.NEXTAUTH_SECRET || process.env.AUTH_SECRET,
  useSecureCookies: isProduction,
  pages: {
    signIn: "/login",
  },
  providers: [
    Credentials({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        try {
          const parsed = credentialSchema.safeParse(credentials);
          if (!parsed.success) {
            logWarn(
              "auth_authorize_validation_failed",
              "Credentials authorize failed validation for admin login.",
            );
            return null;
          }

          const normalizedEmail = parsed.data.email.toLowerCase();
          const user = await prisma.user.findUnique({
            where: { email: normalizedEmail },
          });

          if (!user) {
            logWarn("auth_authorize_user_not_found", "Credentials authorize could not resolve user.", {
              email: maskEmail(normalizedEmail),
            });
            return null;
          }

          const isValid = await bcrypt.compare(parsed.data.password, user.passwordHash);
          if (!isValid) {
            logWarn("auth_authorize_password_mismatch", "Credentials authorize rejected password.", {
              email: maskEmail(normalizedEmail),
            });
            return null;
          }

          return {
            id: user.id,
            email: user.email,
            name: user.name,
            role: user.role,
          };
        } catch (error) {
          logError(
            "auth_authorize_exception",
            "Credentials authorize failed unexpectedly.",
            undefined,
            error,
          );
          return null;
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        if (user.id) {
          token.id = user.id;
        }

        if ("role" in user && user.role) {
          token.role = user.role as Role;
        }
      }

      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = (token.id || token.sub) as string;
        session.user.role = (token.role as Role | undefined) || Role.EDITOR;
      }

      return session;
    },
  },
});
