import type { Metadata } from "next";
import Link from "next/link";

import { RequestVerificationResendForm } from "@/components/public/request-verification-resend-form";
import { Footer } from "@/components/sections/footer";
import { Navbar } from "@/components/sections/navbar";
import { getAppSettings } from "@/lib/settings";

export const metadata: Metadata = {
  title: "Verify Submission Email",
  description: "Confirm your email so StylePort can review your translator idea and notify you if it goes live.",
  robots: {
    index: false,
    follow: false,
  },
};

interface PageProps {
  searchParams: Promise<{
    status?: string;
    requestId?: string;
  }>;
}

function getStatusCopy(status: string) {
  if (status === "verified") {
    return {
      title: "Email verified successfully",
      body: "Thanks for confirming your email. Your translator idea is now queued for admin review.",
      tone: "text-emerald-700 bg-emerald-50 border-emerald-200",
    };
  }

  if (status === "already-verified") {
    return {
      title: "Already verified",
      body: "This submission email was already confirmed. We will contact you if your translator goes live.",
      tone: "text-brand-700 bg-brand-50 border-brand-200",
    };
  }

  if (status === "expired") {
    return {
      title: "Verification link expired",
      body: "No worries. You can request a new verification email below and continue from there.",
      tone: "text-amber-700 bg-amber-50 border-amber-200",
    };
  }

  return {
    title: "Verification link is invalid",
    body: "This link is not valid anymore. Request a fresh verification email below if you still need one.",
    tone: "text-red-700 bg-red-50 border-red-200",
  };
}

export default async function CreateTranslatorVerificationPage({ searchParams }: PageProps) {
  const [settings, params] = await Promise.all([getAppSettings(), searchParams]);
  const status = params.status || "invalid";
  const requestId = params.requestId || "";
  const copy = getStatusCopy(status);

  return (
    <div className="relative overflow-x-hidden">
      <Navbar />
      <main className="mx-auto w-full max-w-3xl px-4 pb-16 pt-10 sm:px-6 lg:px-8">
        <section className={`rounded-2xl border p-6 sm:p-8 ${copy.tone}`}>
          <h1 className="font-display text-3xl font-semibold sm:text-4xl">{copy.title}</h1>
          <p className="mt-3 text-sm leading-6 sm:text-base">{copy.body}</p>
          <p className="mt-5 text-sm text-ink">
            We ask for email so we can tell you when your translator idea is approved and live.
          </p>
          <p className="mt-1 text-sm text-ink">
            If you don&apos;t see our email, please check your spam/junk folder.
          </p>
          <div className="mt-6">
            <Link
              href="/translators"
              className="inline-flex h-10 items-center rounded-xl border border-border bg-white px-4 text-sm font-medium text-ink transition hover:border-brand-300 hover:text-brand-700"
            >
              Back to translators
            </Link>
          </div>
        </section>

        {(status === "expired" || status === "invalid") && requestId ? (
          <RequestVerificationResendForm requestId={requestId} />
        ) : null}
      </main>
      <Footer platformName={settings.platformName} />
    </div>
  );
}
