"use client";

import type { ReactNode } from "react";

import { useRequestTranslatorModal } from "@/components/providers/request-translator-provider";

interface RequestTranslatorModalProps {
  triggerLabel?: string;
  triggerClassName?: string;
  prefillIdea?: string;
  icon?: ReactNode;
}

export function RequestTranslatorModal({
  triggerLabel = "Request a translator",
  triggerClassName,
  prefillIdea,
  icon,
}: RequestTranslatorModalProps) {
  const { openRequestModal } = useRequestTranslatorModal();

  return (
    <button
      type="button"
      onClick={() => openRequestModal(prefillIdea)}
      className={
        triggerClassName ||
        "inline-flex h-11 items-center gap-2 rounded-xl bg-brand-500 px-4 text-sm font-semibold text-white transition hover:bg-brand-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60"
      }
    >
      {icon}
      <span>{triggerLabel}</span>
    </button>
  );
}

