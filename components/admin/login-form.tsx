"use client";

import { useActionState } from "react";
import { useSearchParams } from "next/navigation";

import { Button } from "@/components/ui/button";
import { loginAction } from "@/lib/actions/auth-actions";

const initialLoginActionState = {
  error: null as string | null,
};

export function LoginForm() {
  const [state, formAction, isPending] = useActionState(loginAction, initialLoginActionState);
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") || "/admin";

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="callbackUrl" value={callbackUrl} />

      <div>
        <label htmlFor="email" className="mb-1 block text-sm font-medium text-muted-ink">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          className="h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60"
          placeholder="admin@yourdomain.com"
          required
        />
      </div>

      <div>
        <label htmlFor="password" className="mb-1 block text-sm font-medium text-muted-ink">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          className="h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60"
          placeholder="Enter your password"
          required
        />
      </div>

      {state.error ? <p className="text-sm text-red-600">{state.error}</p> : null}

      <Button type="submit" disabled={isPending} className="w-full">
        {isPending ? "Signing in..." : "Connect"}
      </Button>
    </form>
  );
}
