"use server";

import { AuthError } from "next-auth";
import { z } from "zod";

import { signIn, signOut } from "@/auth";
import { logError, logWarn } from "@/lib/logger";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  callbackUrl: z.string().optional(),
});

function normalizeCallbackUrl(callbackUrl: string | undefined) {
  if (!callbackUrl) {
    return "/admin";
  }

  if (!callbackUrl.startsWith("/") || callbackUrl.startsWith("//")) {
    return "/admin";
  }

  return callbackUrl;
}

function isNextRedirectError(error: unknown) {
  if (!error || typeof error !== "object") {
    return false;
  }

  if ("digest" in error && typeof (error as { digest?: unknown }).digest === "string") {
    return (error as { digest: string }).digest.startsWith("NEXT_REDIRECT");
  }

  if ("message" in error && typeof (error as { message?: unknown }).message === "string") {
    return (error as { message: string }).message === "NEXT_REDIRECT";
  }

  return false;
}

export async function loginAction(
  _previousState: { error: string | null },
  formData: FormData,
): Promise<{ error: string | null }> {
  const parsed = loginSchema.safeParse({
    email: String(formData.get("email") || "").trim().toLowerCase(),
    password: String(formData.get("password") || ""),
    callbackUrl: String(formData.get("callbackUrl") || ""),
  });

  if (!parsed.success) {
    return {
      error: "Please enter a valid email and password.",
    };
  }

  try {
    await signIn("credentials", {
      email: parsed.data.email,
      password: parsed.data.password,
      redirectTo: normalizeCallbackUrl(parsed.data.callbackUrl),
    });
  } catch (error) {
    if (isNextRedirectError(error)) {
      throw error;
    }

    if (error instanceof AuthError) {
      if (error.type === "CredentialsSignin") {
        logWarn("admin_login_failed", "Admin login rejected due to invalid credentials.", {
          email: parsed.data.email,
        });
        return {
          error: "Invalid credentials. Please try again.",
        };
      }

      logWarn("admin_login_auth_error", "Admin login failed due to an authentication error.", {
        type: error.type,
      });
      return {
        error: "Unable to sign in right now. Please try again.",
      };
    }

    logError("admin_login_unexpected_error", "Admin login failed due to an unexpected error.", undefined, error);
    return {
      error: "Unable to sign in right now. Please try again.",
    };
  }

  return { error: null };
}

export async function logoutAction() {
  await signOut({
    redirectTo: "/login",
  });
}
