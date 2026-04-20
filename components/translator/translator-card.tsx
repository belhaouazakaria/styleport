"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRightLeft, Copy, Loader2, RefreshCcw, Sparkles, Square, Trash2, Volume2 } from "lucide-react";

import { useAutoResizeTextarea } from "@/hooks/use-auto-resize";
import { useLocalStorage } from "@/hooks/use-local-storage";
import { MAX_INPUT_CHARS } from "@/lib/constants";
import type { PublicTranslator, TranslateResponse } from "@/lib/types";
import { ModeSelector } from "@/components/translator/mode-selector";
import { useToast } from "@/components/providers/toast-provider";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";

const LOADING_COPY = "Composing your translation...";

interface TranslatorCardProps {
  translator: PublicTranslator;
}

export function TranslatorCard({ translator }: TranslatorCardProps) {
  const initialMode = translator.modes[0]?.key || "";
  const storagePrefix = useMemo(() => `styleport:${translator.slug}`, [translator.slug]);

  const [inputText, setInputText] = useLocalStorage<string>(`${storagePrefix}:last-input`, "");
  const [outputText, setOutputText] = useLocalStorage<string>(`${storagePrefix}:last-output`, "");
  const [modeKey, setModeKey] = useLocalStorage<string>(`${storagePrefix}:last-mode`, initialMode);

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [speechSupported] = useState(
    () => typeof window !== "undefined" && "speechSynthesis" in window,
  );
  const [isSpeaking, setIsSpeaking] = useState(false);

  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const outputRef = useRef<HTMLTextAreaElement | null>(null);

  const { toast } = useToast();

  useAutoResizeTextarea(inputRef, inputText);
  useAutoResizeTextarea(outputRef, outputText);

  useEffect(() => {
    if (!translator.modes.some((mode) => mode.key === modeKey) && initialMode) {
      setModeKey(initialMode);
    }
  }, [initialMode, modeKey, setModeKey, translator.modes]);

  useEffect(
    () => () => {
      if (typeof window !== "undefined") {
        window.speechSynthesis?.cancel();
      }
    },
    [],
  );

  async function translate() {
    if (!inputText.trim()) {
      setError("Please enter some text first.");
      return;
    }

    setError(null);
    setIsLoading(true);

    try {
      const response = await fetch("/api/translate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text: inputText,
          translatorSlug: translator.slug,
          modeKey: translator.showModeSelector ? modeKey : undefined,
        }),
      });

      const payload = (await response.json()) as TranslateResponse;

      if (!response.ok || !payload.ok) {
        setError(payload.ok ? "We couldn't refine that text just now." : payload.error.message);
        return;
      }

      setOutputText(payload.result);
    } catch {
      setError("We couldn't refine that text just now.");
    } finally {
      setIsLoading(false);
    }
  }

  function handleSwap() {
    setInputText(outputText);
    setOutputText(inputText);
    setError(null);
  }

  async function handleCopy(value: string, label: "Input" | "Output") {
    if (!value.trim()) {
      return;
    }

    try {
      await navigator.clipboard.writeText(value);
      toast({
        title: `${label} copied`,
        description: `${label} text is now in your clipboard.`,
      });
    } catch {
      toast({
        title: "Copy failed",
        description: "Your browser blocked clipboard access.",
        variant: "error",
      });
    }
  }

  function handleClear() {
    setInputText("");
    setOutputText("");
    setError(null);
  }

  function handleSpeakOutput() {
    if (!speechSupported) {
      toast({
        title: "Speech unavailable",
        description: "This browser does not support text-to-speech.",
        variant: "error",
      });
      return;
    }

    if (!outputText.trim()) {
      return;
    }

    if (isSpeaking) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
      return;
    }

    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(outputText);
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);

    setIsSpeaking(true);
    window.speechSynthesis.speak(utterance);
  }

  return (
    <section className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
      <Card className="overflow-hidden border-border bg-surface">
        <div className="border-b border-border px-4 py-3 sm:px-6">
          <div className="grid items-center gap-3 md:grid-cols-[1fr_auto_1fr]">
            <div className="flex items-center justify-between gap-2 text-sm font-semibold uppercase tracking-wide text-muted-ink md:justify-start">
              <span>{translator.sourceLabel}</span>
              <span className="text-xs font-medium text-muted-ink md:ml-2">
                {inputText.length} / {MAX_INPUT_CHARS}
              </span>
            </div>

            {translator.showSwap ? (
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={handleSwap}
                aria-label="Swap input and output"
                disabled={isLoading}
                className="mx-auto"
              >
                <ArrowRightLeft className="h-4 w-4" />
              </Button>
            ) : (
              <div className="mx-auto h-9" />
            )}

            <h2 className="text-left text-sm font-semibold uppercase tracking-wide text-muted-ink md:text-right">
              {translator.targetLabel}
            </h2>
          </div>
        </div>

        <div className="grid grid-cols-1 divide-y divide-border md:grid-cols-2 md:divide-x md:divide-y-0">
          <div className="p-4 sm:p-6">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-ink">Original text</p>
              <Button type="button" variant="ghost" size="sm" onClick={() => void handleCopy(inputText, "Input")}>
                <Copy className="h-4 w-4" />
                Copy
              </Button>
            </div>
            <Textarea
              ref={inputRef}
              value={inputText}
              onChange={(event) => setInputText(event.target.value)}
              onKeyDown={(event) => {
                if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                  event.preventDefault();
                  void translate();
                }
              }}
              placeholder={`Write your ${translator.sourceLabel.toLowerCase()} text here...`}
              aria-label="Input text"
            />

            {translator.showExamples && translator.examples.length ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {translator.examples.map((example) => (
                  <button
                    key={example.id}
                    type="button"
                    onClick={() => setInputText(example.value)}
                    className="rounded-full border border-border bg-muted-surface px-3 py-1.5 text-xs font-medium text-muted-ink hover:border-brand-300 hover:text-ink"
                  >
                    {example.label}
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          <div className="p-4 sm:p-6">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-ink">Translated result</p>
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => void handleCopy(outputText, "Output")}
                >
                  <Copy className="h-4 w-4" />
                  Copy
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleSpeakOutput}
                  disabled={!speechSupported || (!outputText.trim() && !isSpeaking)}
                >
                  {isSpeaking ? <Square className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                  {isSpeaking ? "Stop" : "Speak"}
                </Button>
              </div>
            </div>
            <Textarea
              ref={outputRef}
              value={outputText}
              onChange={() => undefined}
              readOnly
              aria-label="Output text"
              placeholder={`Your ${translator.targetLabel.toLowerCase()} text appears here...`}
              className="bg-muted-surface"
            />

            {!outputText.trim() && !isLoading ? (
              <p className="mt-3 text-xs text-muted-ink">
                Translate your text to generate an output in this style.
              </p>
            ) : null}
            {!speechSupported ? (
              <p className="mt-2 text-xs text-muted-ink">Voice playback is not supported in this browser.</p>
            ) : null}
          </div>
        </div>

        <div className="flex flex-col gap-3 border-t border-border bg-muted-surface p-4 sm:p-5">
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" onClick={() => void translate()} disabled={isLoading}>
              {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              Translate
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => void translate()}
              disabled={isLoading || !inputText.trim()}
            >
              <RefreshCcw className="h-4 w-4" />
              Regenerate
            </Button>
            <Button type="button" variant="ghost" onClick={handleClear} disabled={isLoading}>
              <Trash2 className="h-4 w-4" />
              Clear
            </Button>
          </div>

          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
            {translator.showModeSelector ? (
              <ModeSelector value={modeKey} modes={translator.modes} onChange={setModeKey} />
            ) : (
              <p className="text-xs text-muted-ink">Mode selection is locked for this translator.</p>
            )}

            {isLoading ? (
              <p className="text-sm text-brand-700">{LOADING_COPY}</p>
            ) : (
              <p className="text-xs text-muted-ink">Tip: Press Ctrl/Cmd + Enter to translate quickly.</p>
            )}
          </div>

          {error ? <p className="text-sm text-red-600">{error}</p> : null}
        </div>
      </Card>

      <div className="sticky bottom-3 z-20 mt-4 md:hidden">
        <Button
          type="button"
          onClick={() => void translate()}
          disabled={isLoading}
          className="h-12 w-full rounded-xl text-base"
        >
          {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          Translate
        </Button>
      </div>
    </section>
  );
}
