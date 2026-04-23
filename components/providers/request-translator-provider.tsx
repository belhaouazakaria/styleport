"use client";

import { createPortal } from "react-dom";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useRef,
  type ReactNode,
} from "react";
import { Sparkles, X } from "lucide-react";

import { useToast } from "@/components/providers/toast-provider";
import { Button } from "@/components/ui/button";

interface RequestTranslatorContextValue {
  openRequestModal: (initialIdea?: string) => void;
  closeRequestModal: () => void;
}

const RequestTranslatorContext = createContext<RequestTranslatorContextValue | null>(null);

interface RequestFormState {
  requesterEmail: string;
  requestedName: string;
  description: string;
}

function createDefaultFormState(initialIdea?: string): RequestFormState {
  return {
    requesterEmail: "",
    requestedName: initialIdea?.trim() || "",
    description: "",
  };
}

export function RequestTranslatorProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<RequestFormState>(createDefaultFormState());

  const firstInputRef = useRef<HTMLInputElement | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    window.setTimeout(() => {
      firstInputRef.current?.focus();
    }, 0);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const openRequestModal = useCallback((initialIdea?: string) => {
    setForm(createDefaultFormState(initialIdea));
    setError(null);
    setOpen(true);
  }, []);

  const closeRequestModal = useCallback(() => {
    setOpen(false);
    setError(null);
  }, []);

  const contextValue = useMemo(
    () => ({
      openRequestModal,
      closeRequestModal,
    }),
    [closeRequestModal, openRequestModal],
  );

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    const formData = new FormData(event.currentTarget);
    const payload = {
      ...form,
      honeypot: String(formData.get("website") || ""),
    };

    const response = await fetch("/api/translator-requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const result = await response.json();
    setSubmitting(false);

    if (!response.ok || !result.ok) {
      setError(result?.error?.message || "Unable to submit your create request right now.");
      return;
    }

    toast({
      title: "Check your inbox",
      description:
        "We sent a verification link so we can notify you if your translator gets approved and goes live. Check spam/junk too.",
    });

    setForm(createDefaultFormState());
    setOpen(false);
  }

  return (
    <RequestTranslatorContext.Provider value={contextValue}>
      {children}
      {open
        ? createPortal(
            <div
              className="fixed inset-0 z-[90] overflow-y-auto bg-ink/50 p-4 backdrop-blur-[2px]"
              onMouseDown={(event) => {
                if (event.target === event.currentTarget) {
                  closeRequestModal();
                }
              }}
            >
              <div className="mx-auto my-8 w-full max-w-xl rounded-2xl border border-border bg-surface shadow-[0_36px_80px_-45px_rgba(17,24,39,0.65)]">
                <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-4 sm:px-6">
                  <div>
                    <p className="inline-flex items-center gap-1 rounded-full border border-brand-300 bg-brand-50 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-brand-700">
                      <Sparkles className="h-3.5 w-3.5" />
                      Create translator
                    </p>
                    <h2 className="mt-2 font-display text-2xl font-semibold text-ink">Create a Translator Idea</h2>
                    <p className="mt-1 text-sm text-muted-ink">
                      Share a name and description. We&apos;ll review it and generate the translator with AI.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={closeRequestModal}
                    className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-muted-surface text-muted-ink transition hover:border-brand-300 hover:bg-surface hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60"
                    aria-label="Close request modal"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                <form onSubmit={onSubmit} className="space-y-4 px-4 py-4 sm:px-6 sm:py-6">
                  <input
                    type="text"
                    name="website"
                    tabIndex={-1}
                    autoComplete="off"
                    className="hidden"
                    aria-hidden="true"
                  />

                  <label className="block space-y-1 text-sm">
                    <span className="font-medium text-ink">Your email</span>
                    <input
                      name="requesterEmail"
                      type="email"
                      value={form.requesterEmail}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          requesterEmail: event.target.value,
                        }))
                      }
                      required
                      className="h-11 w-full rounded-xl border border-border bg-surface px-3 text-ink placeholder:text-muted-ink/75 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60"
                      placeholder="you@example.com"
                    />
                  </label>

                  <p className="rounded-xl border border-border bg-muted-surface px-3 py-2 text-xs leading-5 text-muted-ink">
                    We ask for your email so we can let you know if your translator idea gets approved and goes live.
                    After submitting, please confirm your email address through the verification email we send. If
                    you don&apos;t see it, check your spam/junk folder.
                  </p>

                  <label className="block space-y-1 text-sm">
                    <span className="font-medium text-ink">Translator name</span>
                    <input
                      ref={firstInputRef}
                      name="requestedName"
                      value={form.requestedName}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          requestedName: event.target.value,
                        }))
                      }
                      required
                      className="h-11 w-full rounded-xl border border-border bg-surface px-3 text-ink placeholder:text-muted-ink/75 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60"
                      placeholder="Ex: Pirate Captain Translator"
                    />
                  </label>

                  <label className="block space-y-1 text-sm">
                    <span className="font-medium text-ink">Translator description</span>
                    <textarea
                      name="description"
                      value={form.description}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          description: event.target.value,
                        }))
                      }
                      required
                      className="min-h-28 w-full rounded-xl border border-border bg-surface px-3 py-2 text-ink placeholder:text-muted-ink/75 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60"
                      placeholder="Describe what this translator should transform and the style it should produce."
                    />
                  </label>

                  {error ? <p className="text-sm text-red-600">{error}</p> : null}

                  <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
                    <Button type="button" variant="outline" onClick={closeRequestModal}>
                      Cancel
                    </Button>
                    <Button type="submit" disabled={submitting}>
                      {submitting ? "Sending..." : "Create translator"}
                    </Button>
                  </div>
                </form>
              </div>
            </div>,
            document.body,
          )
        : null}
    </RequestTranslatorContext.Provider>
  );
}

export function useRequestTranslatorModal() {
  const context = useContext(RequestTranslatorContext);

  if (!context) {
    throw new Error("useRequestTranslatorModal must be used inside RequestTranslatorProvider.");
  }

  return context;
}
