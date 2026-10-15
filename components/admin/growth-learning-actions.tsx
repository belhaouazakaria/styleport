"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { useToast } from "@/components/providers/toast-provider";

async function mutate(url: string, body?: unknown) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body || {}),
  });
  const result = await response.json();
  if (!response.ok || !result.ok)
    throw new Error(result?.error?.message || "The action failed.");
  return result;
}

export function LearningAnalyzeButton() {
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const { toast } = useToast();
  return (
    <Button
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          const result = await mutate("/api/admin/growth/learning/analyze");
          toast({
            title: result.created
              ? "Learning analysis queued"
              : "Today’s analysis is already queued",
          });
          router.refresh();
        } catch (error) {
          toast({
            title: "Analysis was not queued",
            description:
              error instanceof Error ? error.message : "Please try again.",
            variant: "error",
          });
        } finally {
          setBusy(false);
        }
      }}
    >
      {busy ? "Queuing…" : "Evaluate current evidence"}
    </Button>
  );
}

export function PrepareEvergreenButton({
  recommendationId,
}: {
  recommendationId: string;
}) {
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const { toast } = useToast();
  return (
    <Button
      variant="outline"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          await mutate("/api/admin/growth/learning/prepare", {
            recommendationId,
            confirmation: true,
          });
          toast({
            title: "Creative preparation queued",
            description:
              "The result still requires the normal individual Pin approval.",
          });
          router.refresh();
        } catch (error) {
          toast({
            title: "Recommendation was not prepared",
            description:
              error instanceof Error ? error.message : "Please try again.",
            variant: "error",
          });
        } finally {
          setBusy(false);
        }
      }}
    >
      {busy ? "Preparing…" : "Prepare new creative"}
    </Button>
  );
}

export function ExperimentActionButton({
  experimentId,
  action,
  label,
}: {
  experimentId: string;
  action: "START" | "PAUSE" | "RESUME" | "REQUEST_ANALYSIS" | "FINALIZE";
  label: string;
}) {
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const { toast } = useToast();
  return (
    <Button
      variant="outline"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          const result = await mutate(
            "/api/admin/growth/learning/experiments",
            {
              experimentId,
              action,
              confirmation: true,
            },
          );
          toast({ title: `Experiment ${String(result.status).toLowerCase()}` });
          router.refresh();
        } catch (error) {
          toast({
            title: "Experiment was not changed",
            description:
              error instanceof Error ? error.message : "Please try again.",
            variant: "error",
          });
        } finally {
          setBusy(false);
        }
      }}
    >
      {busy ? "Working…" : label}
    </Button>
  );
}
