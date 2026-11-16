"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export function GrowthReviewActions({
  requestId,
  snapshotChecksum,
  label = "Approve Pin",
  canReschedule = false,
}: {
  requestId: string;
  snapshotChecksum: string;
  label?: string;
  canReschedule?: boolean;
}) {
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const router = useRouter();
  async function decide(action: "APPROVE" | "REJECT") {
    setPending(true);
    setMessage("");
    try {
      const response = await fetch("/api/admin/growth/approvals", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ requestId, snapshotChecksum, action }),
      });
      const result = await response.json();
      if (!response.ok) throw Error(result.error?.message || "Decision could not be applied.");
      setMessage(result.status === "APPROVED" ? "Approved." : result.status === "REJECTED" ? "Rejected." : "Review closed: " + String(result.status).toLowerCase() + ". Refresh to see the current plan.");
      router.refresh();
    } catch (e) {
      setMessage(
        e instanceof Error ? e.message : "Decision could not be applied.",
      );
    } finally {
      setPending(false);
    }
  }
  async function reschedule() {
    setPending(true);
    setMessage("");
    try {
      const response = await fetch("/api/admin/growth/approvals", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind: "RESCHEDULE", requestId }),
      });
      const result = await response.json();
      if (!response.ok) throw Error(result.error?.message || "Could not find a new time.");
      setMessage("New plan ready. Review it before approving.");
      router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not find a new time."); }
    finally { setPending(false); }
  }
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-3">
        <Button disabled={pending} onClick={() => decide("APPROVE")}>
          {label}
        </Button>
        <Button
          variant="outline"
          disabled={pending}
          onClick={() => decide("REJECT")}
        >
          Reject
        </Button>
        {canReschedule ? <Button variant="ghost" disabled={pending} onClick={reschedule}>Find a new time</Button> : null}
      </div>
      <p role="status" aria-live="polite" className="text-muted-ink text-sm">
        {message}
      </p>
    </div>
  );
}
export function PrepareGrowthReview({
  candidateId,
  source = false,
}: {
  candidateId: string;
  source?: boolean;
}) {
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const router = useRouter();
  async function prepare() {
    setPending(true);
    try {
      const response = await fetch("/api/admin/growth/approvals", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(
          source
            ? { kind: "SOURCE_PIN", draftId: candidateId }
            : { kind: "NATIVE_PIN", candidateId },
        ),
      });
      const result = await response.json();
      if (!response.ok) throw Error(result.error?.message || "Review preparation failed.");
      router.refresh();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Review preparation failed.");
    } finally {
      setPending(false);
    }
  }
  return (
    <div>
      <Button variant="outline" disabled={pending} onClick={prepare}>
        {pending ? "Preparing…" : "Prepare exact review"}
      </Button>
      <p role="status" className="text-sm">
        {message}
      </p>
    </div>
  );
}
