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
const RESULT_PIN_TRANSLATOR_MAX = 96;
const RESULT_PIN_INPUT_MAX = 220;
const RESULT_PIN_OUTPUT_MAX = 260;
const RESULT_PIN_DESCRIPTION_MAX = 180;
const RESULT_PIN_WIDTH = 1000;
const RESULT_PIN_HEIGHT = 1500;
const RESULT_PIN_MAX_TEXT_LINES = 7;
const RESULT_PIN_MAX_TEXT_CHARS = 320;
const RESULT_PIN_MAX_TITLE_LINES = 3;
const RESULT_PIN_MAX_TITLE_CHARS = 96;
const RESULT_PIN_MAX_CTA_CHARS = 82;
const RESULT_PIN_MAX_UPLOAD_BYTES = 3 * 1024 * 1024;

function truncateShareText(value: string, maxLength: number) {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return "";
  }

  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength - 1).trimEnd()}…`;
}

function normalizeText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function buildResultPinCta(translator: PublicTranslator) {
  const context = `${translator.name} ${translator.title || ""} ${translator.shortDescription || ""}`.toLowerCase();

  if (/(pirate|captain|sea|ship|corsair|buccaneer)/i.test(context)) {
    return "Try this translator fer free, matey!";
  }
  if (/(stone age|caveman|prehistoric|neanderthal)/i.test(context)) {
    return "Try this talk-maker free, big brain!";
  }
  if (/(gen z|slang|zoomer|tiktok|vibe|no cap)/i.test(context)) {
    return "Try this translator for free, no cap.";
  }
  if (/(professional|linkedin|business|formal|corporate|executive)/i.test(context)) {
    return "Try this translator for free today.";
  }
  if (/(shakespeare|old english|elizabethan|bard)/i.test(context)) {
    return "Try this translator freely, good friend.";
  }
  if (/(romantic|love|poetic|valentine)/i.test(context)) {
    return "Try this translator for free, my dear.";
  }
  return "Try this translator for free.";
}

function drawRoundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function fitLineWithEllipsis(ctx: CanvasRenderingContext2D, text: string, maxWidth: number) {
  if (!text) {
    return "";
  }
  if (ctx.measureText(text).width <= maxWidth) {
    return text;
  }

  let output = text;
  while (output.length > 1 && ctx.measureText(`${output}…`).width > maxWidth) {
    output = output.slice(0, -1).trimEnd();
  }
  return `${output}…`;
}

function wrapTextByWidth(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number,
) {
  const normalized = normalizeText(text);
  if (!normalized) {
    return [];
  }

  const words = normalized.split(" ");
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (ctx.measureText(candidate).width <= maxWidth) {
      current = candidate;
      continue;
    }

    if (current) {
      lines.push(current);
    }

    if (ctx.measureText(word).width <= maxWidth) {
      current = word;
      continue;
    }

    let chunk = "";
    for (const char of word) {
      const chunkCandidate = `${chunk}${char}`;
      if (ctx.measureText(chunkCandidate).width <= maxWidth) {
        chunk = chunkCandidate;
      } else {
        if (chunk) {
          lines.push(chunk);
        }
        chunk = char;
      }
    }
    current = chunk;
  }

  if (current) {
    lines.push(current);
  }

  if (lines.length <= maxLines) {
    return lines;
  }

  const trimmed = lines.slice(0, maxLines);
  trimmed[maxLines - 1] = fitLineWithEllipsis(ctx, trimmed[maxLines - 1], maxWidth);
  return trimmed;
}

async function canvasToPngBlob(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("Canvas blob generation failed."));
        return;
      }
      resolve(blob);
    }, "image/png");
  });
}

async function buildResultPinBlob(params: {
  translatorTitle: string;
  inputText: string;
  outputText: string;
  cta: string;
}) {
  const canvas = document.createElement("canvas");
  canvas.width = RESULT_PIN_WIDTH;
  canvas.height = RESULT_PIN_HEIGHT;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Canvas context unavailable.");
  }

  const pageGradient = ctx.createLinearGradient(0, 0, RESULT_PIN_WIDTH, RESULT_PIN_HEIGHT);
  pageGradient.addColorStop(0, "#5547f1");
  pageGradient.addColorStop(0.5, "#7f86ff");
  pageGradient.addColorStop(1, "#8bc7ff");
  ctx.fillStyle = pageGradient;
  ctx.fillRect(0, 0, RESULT_PIN_WIDTH, RESULT_PIN_HEIGHT);

  const whiteGlass = "rgba(255,255,255,0.22)";
  const glassBorder = "rgba(255,255,255,0.62)";
  const softText = "rgba(255,255,255,0.94)";
  const darkText = "#181734";

  const logoSize = 108;
  const logoX = RESULT_PIN_WIDTH / 2 - logoSize / 2;
  const logoY = 118;
  drawRoundedRect(ctx, logoX, logoY, logoSize, logoSize, 28);
  const logoGradient = ctx.createLinearGradient(logoX, logoY, logoX + logoSize, logoY + logoSize);
  logoGradient.addColorStop(0, "#6b66ff");
  logoGradient.addColorStop(1, "#4f52f7");
  ctx.fillStyle = logoGradient;
  ctx.fill();

  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = '800 48px Inter, "Segoe UI", Arial, sans-serif';
  ctx.fillText("WT", RESULT_PIN_WIDTH / 2, logoY + logoSize / 2 + 2);

  ctx.fillStyle = softText;
  ctx.textBaseline = "top";
  ctx.font = '700 56px Inter, "Segoe UI", Arial, sans-serif';
  ctx.fillText("What Type Of", RESULT_PIN_WIDTH / 2, logoY + logoSize + 30);

  const title = truncateShareText(params.translatorTitle, RESULT_PIN_MAX_TITLE_CHARS);
  ctx.font = '800 106px Inter, "Segoe UI", Arial, sans-serif';
  const titleLines = wrapTextByWidth(ctx, title, RESULT_PIN_WIDTH - 140, RESULT_PIN_MAX_TITLE_LINES);
  let titleY = 338;
  for (const line of titleLines) {
    ctx.fillText(line, RESULT_PIN_WIDTH / 2, titleY);
    titleY += 106;
  }

  const cardX = 92;
  const cardY = 500;
  const cardWidth = RESULT_PIN_WIDTH - cardX * 2;
  const cardHeight = 810;
  drawRoundedRect(ctx, cardX, cardY, cardWidth, cardHeight, 58);
  ctx.fillStyle = whiteGlass;
  ctx.fill();
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = glassBorder;
  ctx.stroke();
  ctx.shadowColor = "rgba(44, 35, 115, 0.25)";
  ctx.shadowBlur = 34;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 16;
  drawRoundedRect(ctx, cardX, cardY, cardWidth, cardHeight, 58);
  ctx.strokeStyle = "rgba(255,255,255,0.35)";
  ctx.stroke();
  ctx.shadowColor = "transparent";
  ctx.shadowBlur = 0;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;

  const innerX = cardX + 34;
  const innerWidth = cardWidth - 68;

  ctx.textAlign = "left";
  ctx.fillStyle = darkText;
  ctx.font = '700 52px Inter, "Segoe UI", Arial, sans-serif';
  ctx.fillText("Your text", innerX, cardY + 52);

  const inputBoxY = cardY + 118;
  const inputBoxH = 238;
  drawRoundedRect(ctx, innerX - 2, inputBoxY, innerWidth + 4, inputBoxH, 34);
  ctx.fillStyle = "rgba(255,255,255,0.22)";
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = "rgba(255,255,255,0.54)";
  ctx.stroke();

  ctx.fillStyle = darkText;
  ctx.font = '500 46px Inter, "Segoe UI", Arial, sans-serif';
  const inputLines = wrapTextByWidth(
    ctx,
    truncateShareText(params.inputText, RESULT_PIN_MAX_TEXT_CHARS),
    innerWidth - 42,
    RESULT_PIN_MAX_TEXT_LINES,
  );
  let inputTextY = inputBoxY + 34;
  for (const line of inputLines) {
    ctx.fillText(line, innerX + 20, inputTextY);
    inputTextY += 52;
    if (inputTextY > inputBoxY + inputBoxH - 22) {
      break;
    }
  }

  ctx.textAlign = "center";
  ctx.fillStyle = "rgba(255,255,255,0.55)";
  ctx.font = '500 64px Inter, "Segoe UI", Arial, sans-serif';
  ctx.fillText("↓", RESULT_PIN_WIDTH / 2, inputBoxY + inputBoxH + 62);

  ctx.textAlign = "left";
  ctx.fillStyle = darkText;
  ctx.font = '700 52px Inter, "Segoe UI", Arial, sans-serif';
  ctx.fillText("Translated result", innerX, inputBoxY + inputBoxH + 114);

  const outputBoxY = inputBoxY + inputBoxH + 180;
  const outputBoxH = 262;
  drawRoundedRect(ctx, innerX - 2, outputBoxY, innerWidth + 4, outputBoxH, 34);
  ctx.fillStyle = "rgba(255,255,255,0.24)";
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = "rgba(158, 126, 255, 0.95)";
  ctx.stroke();
  ctx.shadowColor = "rgba(173, 106, 255, 0.58)";
  ctx.shadowBlur = 26;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;
  drawRoundedRect(ctx, innerX - 2, outputBoxY, innerWidth + 4, outputBoxH, 34);
  ctx.strokeStyle = "rgba(204, 155, 255, 0.86)";
  ctx.stroke();
  ctx.shadowColor = "transparent";
  ctx.shadowBlur = 0;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;

  ctx.fillStyle = darkText;
  ctx.font = '600 48px Inter, "Segoe UI", Arial, sans-serif';
  const outputLines = wrapTextByWidth(
    ctx,
    truncateShareText(params.outputText, RESULT_PIN_MAX_TEXT_CHARS),
    innerWidth - 42,
    RESULT_PIN_MAX_TEXT_LINES,
  );
  let outputTextY = outputBoxY + 36;
  for (const line of outputLines) {
    ctx.fillText(line, innerX + 20, outputTextY);
    outputTextY += 54;
    if (outputTextY > outputBoxY + outputBoxH - 22) {
      break;
    }
  }

  const ctaWidth = 560;
  const ctaHeight = 126;
  const ctaX = RESULT_PIN_WIDTH / 2 - ctaWidth / 2;
  const ctaY = cardY + cardHeight + 58;
  drawRoundedRect(ctx, ctaX, ctaY, ctaWidth, ctaHeight, 30);
  const ctaGradient = ctx.createLinearGradient(ctaX, ctaY, ctaX + ctaWidth, ctaY + ctaHeight);
  ctaGradient.addColorStop(0, "#5f56ff");
  ctaGradient.addColorStop(1, "#4839f2");
  ctx.fillStyle = ctaGradient;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = "rgba(255,255,255,0.45)";
  ctx.stroke();
  ctx.shadowColor = "rgba(86, 75, 255, 0.45)";
  ctx.shadowBlur = 24;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 8;
  drawRoundedRect(ctx, ctaX, ctaY, ctaWidth, ctaHeight, 30);
  ctx.strokeStyle = "rgba(255,255,255,0.18)";
  ctx.stroke();
  ctx.shadowColor = "transparent";
  ctx.shadowBlur = 0;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;

  const ctaText = truncateShareText(params.cta, RESULT_PIN_MAX_CTA_CHARS);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#ffffff";
  ctx.font = '800 58px Inter, "Segoe UI", Arial, sans-serif';
  ctx.fillText(ctaText, RESULT_PIN_WIDTH / 2, ctaY + ctaHeight / 2 + 2);
  ctx.textAlign = "left";

  return canvasToPngBlob(canvas);
}

interface TranslatorCardProps {
  translator: PublicTranslator;
  shareUrl?: string;
  pinImageUrl?: string;
}

function PinterestIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className} fill="currentColor">
      <path d="M12 2a10 10 0 0 0-3.64 19.31c-.05-.82-.1-2.08.02-2.98l1.27-5.4s-.32-.65-.32-1.61c0-1.51.88-2.64 1.97-2.64.93 0 1.38.7 1.38 1.53 0 .93-.59 2.33-.9 3.63-.26 1.09.55 1.97 1.64 1.97 1.96 0 3.47-2.06 3.47-5.03 0-2.63-1.89-4.48-4.59-4.48-3.13 0-4.97 2.35-4.97 4.78 0 .95.37 1.97.82 2.53a.33.33 0 0 1 .08.31l-.33 1.36c-.05.21-.17.26-.4.16-1.5-.7-2.43-2.9-2.43-4.67 0-3.8 2.76-7.29 7.97-7.29 4.18 0 7.44 2.98 7.44 6.96 0 4.15-2.61 7.49-6.24 7.49-1.22 0-2.37-.63-2.76-1.38l-.75 2.85c-.27 1.03-1.01 2.33-1.51 3.12A10 10 0 1 0 12 2Z" />
    </svg>
  );
}

export function TranslatorCard({ translator, shareUrl, pinImageUrl }: TranslatorCardProps) {
  const initialMode = translator.modes[0]?.key || "";
  const storagePrefix = useMemo(() => `styleport:${translator.slug}`, [translator.slug]);

  const [inputText, setInputText] = useLocalStorage<string>(`${storagePrefix}:last-input`, "");
  const [outputText, setOutputText] = useLocalStorage<string>(`${storagePrefix}:last-output`, "");
  const [modeKey, setModeKey] = useLocalStorage<string>(`${storagePrefix}:last-mode`, initialMode);

  const [isLoading, setIsLoading] = useState(false);
  const [isPreparingResultPin, setIsPreparingResultPin] = useState(false);
  const [resultPinMediaUrl, setResultPinMediaUrl] = useState<string | null>(null);
  const [resultPinError, setResultPinError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [speechSupported] = useState(
    () => typeof window !== "undefined" && "speechSynthesis" in window,
  );
  const [isSpeaking, setIsSpeaking] = useState(false);

  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const outputRef = useRef<HTMLTextAreaElement | null>(null);
  const resultPinRequestIdRef = useRef(0);

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

  function clearPreparedResultPin() {
    setResultPinMediaUrl(null);
    setResultPinError(null);
  }

  async function translate() {
    const sourceText = inputText.trim();
    if (!sourceText) {
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
          text: sourceText,
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
      void prepareResultPin({
        sourceText,
        translatedText: payload.result,
        announceFailure: false,
      });
    } catch {
      setError("We couldn't refine that text just now.");
    } finally {
      setIsLoading(false);
    }
  }

  function handleSwap() {
    setInputText(outputText);
    setOutputText(inputText);
    clearPreparedResultPin();
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
    clearPreparedResultPin();
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

  function handlePinterestShare() {
    const pageUrl =
      shareUrl || (typeof window !== "undefined" ? window.location.href : "");
    const mediaUrl =
      pinImageUrl ||
      (typeof window !== "undefined" ? `${window.location.origin}/translators/${translator.slug}/pin-image` : "");

    if (!pageUrl || !mediaUrl) {
      return;
    }

    const description = `${translator.name} — ${translator.shortDescription}`;
    const intentUrl = new URL("https://www.pinterest.com/pin/create/button/");
    intentUrl.searchParams.set("url", pageUrl);
    intentUrl.searchParams.set("media", mediaUrl);
    intentUrl.searchParams.set("description", description);

    window.open(intentUrl.toString(), "_blank", "noopener,noreferrer");
  }

  function openPinterestIntent(mediaUrl: string, translatedText: string) {
    const pageUrl = shareUrl || window.location.href;
    const description = truncateShareText(`${translator.name}: ${translatedText}`, RESULT_PIN_DESCRIPTION_MAX);
    const intentUrl = new URL("https://www.pinterest.com/pin/create/button/");
    intentUrl.searchParams.set("url", pageUrl);
    intentUrl.searchParams.set("media", mediaUrl);
    intentUrl.searchParams.set("description", description);

    window.open(intentUrl.toString(), "_blank", "noopener,noreferrer");
  }

  async function uploadResultPinBlob(blob: Blob) {
    if (blob.size > RESULT_PIN_MAX_UPLOAD_BYTES) {
      throw new Error("Result image is too large to upload.");
    }

    const formData = new FormData();
    formData.append("image", blob, "result-pin.png");

    const response = await fetch("/api/pinterest/result-image", {
      method: "POST",
      body: formData,
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(`Result image upload failed (${response.status}).`);
    }

    const payload = (await response.json()) as {
      ok?: boolean;
      mediaUrl?: string;
    };

    if (!payload.ok || !payload.mediaUrl) {
      throw new Error("Result image upload did not return a media URL.");
    }

    return payload.mediaUrl;
  }

  async function prepareResultPin(options: {
    sourceText: string;
    translatedText: string;
    announceFailure: boolean;
  }) {
    if (typeof window === "undefined" || !options.translatedText.trim()) {
      return null;
    }

    const requestId = resultPinRequestIdRef.current + 1;
    resultPinRequestIdRef.current = requestId;

    setIsPreparingResultPin(true);
    setResultPinError(null);

    try {
      const blob = await buildResultPinBlob({
        translatorTitle: truncateShareText(translator.title || translator.name, RESULT_PIN_TRANSLATOR_MAX),
        inputText: truncateShareText(options.sourceText || "No source text provided.", RESULT_PIN_INPUT_MAX),
        outputText: truncateShareText(options.translatedText, RESULT_PIN_OUTPUT_MAX),
        cta: buildResultPinCta(translator),
      });
      const mediaUrl = await uploadResultPinBlob(blob);
      if (resultPinRequestIdRef.current !== requestId) {
        return null;
      }
      setResultPinMediaUrl(mediaUrl);
      setResultPinError(null);
      return mediaUrl;
    } catch {
      if (resultPinRequestIdRef.current === requestId) {
        setResultPinMediaUrl(null);
        setResultPinError("Unable to prepare Pinterest image right now.");
      }
      if (options.announceFailure) {
        toast({
          title: "Share unavailable",
          description: "Unable to generate Pinterest image right now. Please try again.",
          variant: "error",
        });
      }
      return null;
    } finally {
      if (resultPinRequestIdRef.current === requestId) {
        setIsPreparingResultPin(false);
      }
    }
  }

  async function handlePinterestResultShare() {
    if (typeof window === "undefined" || !outputText.trim()) {
      return;
    }

    if (isPreparingResultPin) {
      return;
    }

    if (resultPinMediaUrl) {
      openPinterestIntent(resultPinMediaUrl, outputText);
      return;
    }

    const prepared = await prepareResultPin({
      sourceText: inputText || "No source text provided.",
      translatedText: outputText,
      announceFailure: true,
    });
    if (prepared) {
      openPinterestIntent(prepared, outputText);
    }
  }

  return (
    <section className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
      <Card className="overflow-hidden border-border bg-surface">
        <div className="hidden border-b border-border px-4 py-3 sm:px-6 md:block">
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
              <p className="text-xs font-medium uppercase tracking-wide text-muted-ink">{translator.sourceLabel}</p>
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
              <p className="text-xs font-medium uppercase tracking-wide text-muted-ink">{translator.targetLabel}</p>
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
            <Button type="button" onClick={() => void translate()} disabled={isLoading} className="hidden md:inline-flex">
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
            {translator.showSwap ? (
              <Button type="button" variant="ghost" onClick={handleSwap} disabled={isLoading}>
                <ArrowRightLeft className="h-4 w-4" />
                Swap
              </Button>
            ) : null}
            <Button type="button" variant="ghost" onClick={handleClear} disabled={isLoading}>
              <Trash2 className="h-4 w-4" />
              Clear
            </Button>
            <Button
              type="button"
              onClick={() => void handlePinterestResultShare()}
              disabled={isLoading || !outputText.trim() || isPreparingResultPin}
              className="bg-[#E60023] text-white hover:bg-[#cc001f] focus-visible:ring-[#E60023]/60 disabled:bg-[#E60023]/65 disabled:text-white"
            >
              {isPreparingResultPin ? <Loader2 className="h-4 w-4 animate-spin" /> : <PinterestIcon className="h-4 w-4" />}
              {isPreparingResultPin
                ? "Preparing Pinterest image..."
                : resultPinError
                  ? "Retry result Pinterest image"
                  : "Share result to Pinterest"}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={handlePinterestShare}
              disabled={isLoading}
              className="border-[#E60023] text-[#E60023] hover:border-[#E60023] hover:bg-[#E60023]/10 hover:text-[#E60023] focus-visible:ring-[#E60023]/60"
            >
              <PinterestIcon className="h-4 w-4" />
              Share translator to Pinterest
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
          {!error && resultPinError ? <p className="text-xs text-muted-ink">{resultPinError}</p> : null}
          {!error && !resultPinError && resultPinMediaUrl ? (
            <p className="text-xs text-muted-ink">Result pin image is ready to share.</p>
          ) : null}
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
