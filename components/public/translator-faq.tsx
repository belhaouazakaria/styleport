"use client";

import { ChevronDown } from "lucide-react";
import type { EditorialFaq } from "@/lib/types";

export function TranslatorFaq({ faq }: { faq: EditorialFaq[] }) {
  return (
    <div className="divide-y divide-border overflow-hidden rounded-[1.4rem] border border-border bg-white">
      {faq.map((item, index) => (
        <details key={`${item.question}-${index}`} className="group">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-4 py-4 text-left font-semibold text-ink marker:hidden sm:px-5">
            <span>{item.question}</span>
            <ChevronDown className="h-5 w-5 shrink-0 text-brand-700 transition-transform group-open:rotate-180" aria-hidden="true" />
          </summary>
          <div className="px-4 pb-4 text-sm leading-6 text-muted-ink sm:px-5">{item.answer}</div>
        </details>
      ))}
    </div>
  );
}
