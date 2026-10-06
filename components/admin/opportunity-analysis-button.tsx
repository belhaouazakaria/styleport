"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
export function OpportunityAnalysisButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  return (
    <div className="flex items-center gap-3">
      <Button
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setMessage("");
          try {
            const response = await fetch(
              "/api/admin/growth/opportunities/analyses",
              { method: "POST" },
            );
            if (!response.ok) throw new Error("Unable to queue analysis.");
            const body = await response.json();
            setMessage(
              body.data?.created
                ? "Analysis queued."
                : "Today's analysis is already queued.",
            );
            router.refresh();
          } catch (error) {
            setMessage(
              error instanceof Error
                ? error.message
                : "Unable to queue analysis.",
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "Queuing…" : "Queue opportunity analysis"}
      </Button>
      {message ? (
        <span className="text-muted-ink text-sm" role="status">
          {message}
        </span>
      ) : null}
    </div>
  );
}
