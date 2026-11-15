import Image from "next/image";
import Link from "next/link";
import { requireAdminRoute } from "@/lib/auth";
import { getSessionOrNull } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { listGrowthReviews } from "@/lib/growth/approvals/service";
import {
  budgetChangeSchema,
  pinReviewSnapshotSchema,
} from "@/lib/growth/approvals/contracts";
import { AdminTopbar } from "@/components/admin/admin-topbar";
import {
  GrowthReviewActions,
  PrepareGrowthReview,
} from "@/components/admin/growth-review-actions";
export const dynamic = "force-dynamic";
export default async function GrowthApprovalsPage() {
  await requireAdminRoute();
  const session = await getSessionOrNull();
  if (!session?.user?.id) return null;
  const [reviews, candidates, sources] = await Promise.all([
    listGrowthReviews(session.user.id),
    prisma.growthPinCandidate.findMany({
      where: { status: "READY", approvals: { none: { status: "APPROVED" } } },
      select: { id: true, title: true },
      orderBy: { createdAt: "desc" },
      take: 30,
    }),
    prisma.growthViralPinTest.findMany({
      where: { channel: "SOURCE", status: "PLANNED", rightsVerified: true },
      select: { id: true, title: true },
      orderBy: { createdAt: "desc" },
      take: 30,
    }),
  ]);
  const pending = reviews.filter(
    (r) => r.status === "PENDING" && r.expiresAt > new Date(),
  );
  const offered = new Set(
    reviews
      .filter((r) => ["PENDING", "APPROVED", "REJECTED"].includes(r.status))
      .map((r) => r.subjectId),
  );
  return (
    <>
      <AdminTopbar
        title="Approval Center"
        subtitle="Your decisions. One exact Pin at a time."
      />
      <main className="mx-auto max-w-7xl space-y-8 p-4 sm:p-8">
        <section className="rounded-3xl bg-[#173e35] p-6 text-white sm:p-9">
          <p className="text-xs font-bold tracking-[0.2em] text-[#a9cdb8] uppercase">
            SayTwist / Owner desk
          </p>
          <div className="mt-4 flex flex-wrap items-end justify-between gap-5">
            <div>
              <h1 className="font-display text-4xl font-bold">
                Ready for your eye.
              </h1>
              <p className="mt-3 max-w-xl text-sm leading-6 text-[#d4e4d9]">
                Review the creative, destination and publishing plan below. Your
                decision is saved here even when Discord is offline.
              </p>
            </div>
            <div>
              <strong className="font-display text-5xl">
                {pending.length}
              </strong>
              <p className="mt-1 text-sm text-[#d4e4d9]">awaiting a decision</p>
            </div>
          </div>
        </section>
        <nav
          aria-label="Growth workspace"
          className="flex flex-wrap gap-5 text-sm font-bold underline underline-offset-4"
        >
          <Link href="/admin/growth">Overview</Link>
          <Link href="/admin/growth/creative">Creative Studio</Link>
          <Link href="/admin/growth/viral">Source experiments</Link>
          <Link href="/admin/growth/analytics">Analytics coverage</Link>
        </nav>
        <div className="space-y-6">
          {reviews.map((review) => {
            const operation = budgetChangeSchema.safeParse(review.snapshot);
            if (operation.success)
              return (
                <article
                  key={review.id}
                  className="space-y-4 rounded-2xl border bg-white p-6"
                >
                  <p className="text-xs font-bold tracking-widest uppercase">
                    Protected operation · {review.status}
                  </p>
                  <h2 className="font-display text-2xl font-bold">
                    Change Growth AI budget ceilings
                  </h2>
                  <p>{operation.data.reason}</p>
                  <dl className="grid gap-3 text-sm sm:grid-cols-2">
                    <div>
                      <dt className="font-bold">Current limits</dt>
                      <dd>{JSON.stringify(operation.data.before)}</dd>
                    </div>
                    <div>
                      <dt className="font-bold">Proposed limits</dt>
                      <dd>{JSON.stringify(operation.data.after)}</dd>
                    </div>
                  </dl>
                  <p className="text-sm">{operation.data.benefits}</p>
                  <p className="text-sm">{operation.data.risks}</p>
                  <p className="text-muted-ink text-sm">
                    Approval applies only these exact limits if the policy has
                    not changed. No paid request is started by this decision.
                  </p>
                  {review.status === "PENDING" &&
                  review.expiresAt > new Date() ? (
                    <GrowthReviewActions
                      requestId={review.id}
                      snapshotChecksum={review.snapshotChecksum}
                      label="Approve exact budget limits"
                    />
                  ) : null}
                </article>
              );
            const parsed = pinReviewSnapshotSchema.safeParse(review.snapshot);
            if (!parsed.success) return null;
            const s = parsed.data;
            const status =
              review.status === "PENDING" && review.expiresAt <= new Date()
                ? "EXPIRED"
                : review.status;
            return (
              <article
                key={review.id}
                className="border-border grid overflow-hidden rounded-3xl border bg-white md:grid-cols-[240px_1fr]"
              >
                <div className="bg-[#f2efe6] p-5">
                  <Image
                    src={s.assetUrl}
                    alt={s.title + " — Pin creative preview"}
                    width={1000}
                    height={1500}
                    unoptimized
                    className="mx-auto h-auto w-full max-w-60 rounded-xl"
                  />
                </div>
                <div className="space-y-5 p-5 sm:p-7">
                  <div className="flex flex-wrap justify-between gap-3">
                    <span className="text-xs font-bold tracking-widest text-[#245749] uppercase">
                      {review.kind.replaceAll("_", " ")}
                    </span>
                    <span className="rounded-full bg-[#f2efe6] px-3 py-1 text-xs font-bold">
                      {status}
                    </span>
                  </div>
                  <h2 className="font-display text-2xl font-bold">{s.title}</h2>
                  <p className="text-muted-ink text-sm leading-6 whitespace-pre-wrap">
                    {s.description}
                  </p>
                  <dl className="grid gap-4 text-sm sm:grid-cols-2">
                    <div>
                      <dt className="text-muted-ink">Account / board</dt>
                      <dd className="mt-1 font-bold">
                        {s.accountName} / {s.boardName}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted-ink">
                        Recommended publication
                      </dt>
                      <dd className="mt-1 font-bold">
                        {s.scheduledAt
                          .replace("T", " ")
                          .replace(".000Z", " UTC")}
                      </dd>
                    </div>
                    <div className="sm:col-span-2">
                      <dt className="text-muted-ink">Destination</dt>
                      <dd className="mt-1 break-all">
                        <a
                          href={s.destinationUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="underline"
                        >
                          {s.destinationUrl}
                        </a>
                      </dd>
                    </div>
                  </dl>
                  <div className="rounded-xl bg-[#f7f8f4] p-4 text-sm leading-6">
                    <p>{s.reason}</p>
                    <p className="text-muted-ink mt-2">
                      {s.risks} Additional API cost: {s.estimatedCostCents}{" "}
                      cents.
                    </p>
                  </div>
                  <p className="text-muted-ink text-xs">
                    Discord:{" "}
                    {review.notifications.map((n) => n.status).join(", ") ||
                      "Not queued"}{" "}
                    · Review expires {review.expiresAt.toISOString()}
                  </p>
                  {status === "PENDING" ? (
                    <GrowthReviewActions
                      requestId={review.id}
                      snapshotChecksum={review.snapshotChecksum}
                    />
                  ) : (
                    <p className="text-sm font-bold">
                      {status === "APPROVED"
                        ? "Approval recorded. The publishing worker will revalidate this exact snapshot."
                        : "This review is closed."}
                    </p>
                  )}
                </div>
              </article>
            );
          })}
          {reviews.length === 0 && (
            <p className="border-border rounded-2xl border border-dashed p-8 text-center text-sm">
              No reviews yet. Prepare a candidate below to see its exact
              publishing plan.
            </p>
          )}
        </div>
        <section className="space-y-4">
          <h2 className="font-display text-2xl font-bold">
            Prepared creatives
          </h2>
          <p className="text-muted-ink text-sm">
            Preparing a review does not approve or publish the Pin.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            {candidates
              .filter((c) => !offered.has(c.id))
              .map((c) => (
                <div
                  key={c.id}
                  className="border-border space-y-3 rounded-xl border bg-white p-5"
                >
                  <h3 className="font-bold">{c.title}</h3>
                  <PrepareGrowthReview candidateId={c.id} />
                </div>
              ))}
          </div>
        </section>
        <section className="space-y-4">
          <h2 className="font-display text-2xl font-bold">
            Source experiments
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {sources
              .filter((s) => !offered.has(s.id))
              .map((s) => (
                <div
                  key={s.id}
                  className="border-border space-y-3 rounded-xl border bg-white p-5"
                >
                  <h3 className="font-bold">{s.title}</h3>
                  <PrepareGrowthReview candidateId={s.id} source />
                </div>
              ))}
          </div>
        </section>
      </main>
    </>
  );
}
