import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { LoginForm } from "@/components/admin/login-form";
import { Navbar } from "@/components/sections/navbar";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const session = await auth();

  if (session?.user?.role === "ADMIN") {
    redirect("/admin");
  }

  return (
    <div className="min-h-screen bg-page">
      <Navbar />
      <main className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-md items-center px-4 py-10">
        <div className="w-full rounded-2xl border border-border bg-white p-6 shadow-[0_20px_45px_-35px_rgba(17,24,39,0.3)]">
          <h1 className="font-display text-3xl font-semibold text-ink">Admin Login</h1>
          <p className="mt-2 text-sm text-muted-ink">
            Sign in to manage translators, categories, models, analytics, and monetization.
          </p>
          <div className="mt-6">
            <LoginForm />
          </div>
        </div>
      </main>
    </div>
  );
}
