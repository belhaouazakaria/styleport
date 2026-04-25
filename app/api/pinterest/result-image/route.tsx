import { ImageResponse } from "next/og";
import { NextResponse } from "next/server";

import { logError } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const IMAGE_WIDTH = 1000;
const IMAGE_HEIGHT = 1500;
const BRAND_NAME = "What Type Of | Translator";
const MAX_TRANSLATOR_LENGTH = 96;
const MAX_INPUT_LENGTH = 300;
const MAX_OUTPUT_LENGTH = 340;
const MAX_CTA_LENGTH = 120;
const RESPONSE_HEADERS = {
  "Content-Type": "image/png",
  "Cache-Control": "no-store, max-age=0",
} as const;

interface ResultPinSnapshot {
  translatorTitle: string;
  inputText: string;
  outputText: string;
  cta: string;
}

function clampText(value: string | null, maxLength: number) {
  const normalized = (value || "").replace(/\s+/g, " ").trim();
  if (!normalized) {
    return "";
  }

  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength - 1).trimEnd()}…`;
}

function parseSnapshot(requestUrl: string): ResultPinSnapshot {
  const { searchParams } = new URL(requestUrl);
  const translatorTitle = clampText(searchParams.get("translator"), MAX_TRANSLATOR_LENGTH) || "Style Translator";
  const ctaFromQuery = clampText(searchParams.get("cta"), MAX_CTA_LENGTH);

  return {
    translatorTitle,
    inputText: clampText(searchParams.get("input"), MAX_INPUT_LENGTH) || "No source text provided.",
    outputText: clampText(searchParams.get("output"), MAX_OUTPUT_LENGTH) || "No translated result provided.",
    cta:
      ctaFromQuery &&
      ctaFromQuery.toLowerCase() !== "try this translator free" &&
      ctaFromQuery.toLowerCase() !== "translate your text for free"
        ? ctaFromQuery
        : buildDynamicCta(translatorTitle),
  };
}

function normalizeTranslatorCtaBase(title: string) {
  return title
    .replace(/\s+/g, " ")
    .replace(/\btranslator\b/gi, "")
    .replace(/[|:]+/g, " ")
    .trim();
}

function buildDynamicCta(translatorTitle: string) {
  const title = translatorTitle.trim();
  const normalized = title.toLowerCase();
  const base = normalizeTranslatorCtaBase(title);

  if (/(pirate|captain|sea|ship)/i.test(normalized)) {
    return clampText("Try the Pirate Translator free", MAX_CTA_LENGTH);
  }
  if (/(stone age|caveman|cave)/i.test(normalized)) {
    return clampText("Turn your text into caveman talk", MAX_CTA_LENGTH);
  }
  if (/(professional|linkedin|corporate|business|formal)/i.test(normalized)) {
    return clampText("Make your message sound professional", MAX_CTA_LENGTH);
  }
  if (/(gen z|tiktok|slang|teen)/i.test(normalized)) {
    return clampText("Rewrite your text in Gen Z style", MAX_CTA_LENGTH);
  }
  if (/(romantic|love|poetic|poem|valentine)/i.test(normalized)) {
    return clampText("Make your words feel more romantic", MAX_CTA_LENGTH);
  }
  if (/(funny|joke|comedy|meme)/i.test(normalized)) {
    return clampText("Make your text funnier in seconds", MAX_CTA_LENGTH);
  }

  if (base) {
    return clampText(`Try the ${base} Translator free`, MAX_CTA_LENGTH);
  }

  return "Translate your text for free";
}

function renderResultPin(snapshot: ResultPinSnapshot) {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        backgroundColor: "#f1efff",
        color: "#111827",
        padding: "42px 44px 34px",
        boxSizing: "border-box",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "18px",
        }}
      >
        <div
          style={{
            width: "56px",
            height: "56px",
            borderRadius: "14px",
            backgroundColor: "#5b5bf6",
            color: "#ffffff",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontFamily: 'Manrope, Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif',
            fontWeight: 800,
            fontSize: "24px",
            lineHeight: 1,
          }}
        >
          WT
        </div>
        <p
          style={{
            margin: 0,
            color: "#4040cb",
            fontFamily: 'Manrope, Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif',
            fontWeight: 700,
            fontSize: "25px",
            lineHeight: 1.1,
          }}
        >
          {BRAND_NAME}
        </p>
      </div>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          borderRadius: "26px",
          backgroundColor: "#ffffff",
          border: "2px solid #d9d6ff",
          padding: "24px 26px 20px",
          marginBottom: "16px",
        }}
      >
        <p
          style={{
            margin: "0 0 10px",
            color: "#4040cb",
            fontFamily: 'Manrope, Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif',
            fontSize: "27px",
            fontWeight: 600,
            lineHeight: 1.1,
          }}
        >
          Translator
        </p>
        <h1
          style={{
            margin: 0,
            color: "#1f2145",
            fontFamily: '"Cormorant Garamond", Georgia, "Times New Roman", serif',
            fontWeight: 700,
            fontSize: "66px",
            lineHeight: 0.95,
            letterSpacing: "-0.02em",
          }}
        >
          {snapshot.translatorTitle}
        </h1>
      </div>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "14px",
          flex: 1,
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "flex-start",
            flex: 1,
            borderRadius: "24px",
            backgroundColor: "#ffffff",
            border: "2px solid #e1ddff",
            padding: "18px 20px",
          }}
        >
          <p
            style={{
              margin: "0 0 10px",
              color: "#3737a6",
              fontFamily: 'Manrope, Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif',
              fontSize: "28px",
              fontWeight: 700,
              lineHeight: 1.1,
            }}
          >
            Your text
          </p>
          <p
            style={{
              margin: 0,
              color: "#151932",
              fontFamily: 'Manrope, Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif',
              fontSize: "38px",
              lineHeight: 1.2,
              fontWeight: 500,
            }}
          >
            {snapshot.inputText}
          </p>
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "flex-start",
            flex: 1,
            borderRadius: "24px",
            backgroundColor: "#ffffff",
            border: "2px solid #d8d1ff",
            padding: "18px 20px",
          }}
        >
          <p
            style={{
              margin: "0 0 10px",
              color: "#4338ca",
              fontFamily: 'Manrope, Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif',
              fontSize: "28px",
              fontWeight: 700,
              lineHeight: 1.1,
            }}
          >
            Translated result
          </p>
          <p
            style={{
              margin: 0,
              color: "#1d2347",
              fontFamily: 'Manrope, Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif',
              fontSize: "38px",
              lineHeight: 1.2,
              fontWeight: 500,
            }}
          >
            {snapshot.outputText}
          </p>
        </div>
      </div>

      <p
        style={{
          margin: "16px 0 0",
          paddingTop: "14px",
          borderTop: "3px solid #b4adff",
          color: "#332f92",
          textAlign: "center",
          fontFamily: '"Cormorant Garamond", Georgia, "Times New Roman", serif',
          fontWeight: 700,
          fontSize: "39px",
          lineHeight: 1.12,
          letterSpacing: "-0.01em",
          textDecorationLine: "underline",
          textDecorationColor: "#7f73ff",
          textDecorationThickness: "2px",
          textUnderlineOffset: "6px",
        }}
      >
        {snapshot.cta}
      </p>
    </div>
  );
}

async function generateResultPinBuffer(snapshot: ResultPinSnapshot) {
  const imageResponse = new ImageResponse(renderResultPin(snapshot), {
    width: IMAGE_WIDTH,
    height: IMAGE_HEIGHT,
    headers: RESPONSE_HEADERS,
  });

  return imageResponse.arrayBuffer();
}

export async function HEAD(request: Request) {
  const snapshot = parseSnapshot(request.url);
  try {
    await generateResultPinBuffer(snapshot);
    return new Response(null, {
      status: 200,
      headers: RESPONSE_HEADERS,
    });
  } catch (error) {
    logError("result_pin_image_generation_failed", "Failed to generate Pinterest result pin preview.", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "IMAGE_GENERATION_FAILED",
          message: "Unable to generate Pinterest result image right now.",
        },
      },
      {
        status: 500,
        headers: {
          "Cache-Control": "no-store, max-age=0",
        },
      },
    );
  }
}

export async function GET(request: Request) {
  const snapshot = parseSnapshot(request.url);

  try {
    const arrayBuffer = await generateResultPinBuffer(snapshot);
    return new Response(arrayBuffer, {
      status: 200,
      headers: RESPONSE_HEADERS,
    });
  } catch (error) {
    logError("result_pin_image_generation_failed", "Failed to generate Pinterest result pin.", {
      error: error instanceof Error ? error.message : String(error),
    });

    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "IMAGE_GENERATION_FAILED",
          message: "Unable to generate Pinterest result image right now.",
        },
      },
      {
        status: 500,
        headers: {
          "Cache-Control": "no-store, max-age=0",
        },
      },
    );
  }
}
