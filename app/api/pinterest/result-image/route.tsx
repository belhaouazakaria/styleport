import { ImageResponse } from "next/og";
import { NextResponse } from "next/server";
import OpenAI from "openai";

import { DEFAULT_MODEL } from "@/lib/constants";
import { getServerEnv } from "@/lib/env";
import { logError } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const IMAGE_WIDTH = 1000;
const IMAGE_HEIGHT = 1500;
const BRAND_NAME = "What Type Of | Translator";
const MAX_TRANSLATOR_LENGTH = 100;
const MAX_INPUT_LENGTH = 320;
const MAX_OUTPUT_LENGTH = 360;
const MAX_STYLE_HINT_LENGTH = 220;
const MAX_CTA_LENGTH = 120;
const AI_CTA_TIMEOUT_MS = 3200;
const RESPONSE_HEADERS = {
  "Content-Type": "image/png",
  "Cache-Control": "no-store, max-age=0",
} as const;

interface ResultPinSnapshot {
  translatorTitle: string;
  inputText: string;
  outputText: string;
  styleHint: string;
  cta: string;
}

const globalForCta = globalThis as typeof globalThis & {
  __styleportResultPinOpenAI?: OpenAI;
};

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

function getOpenAIClient() {
  if (globalForCta.__styleportResultPinOpenAI) {
    return globalForCta.__styleportResultPinOpenAI;
  }

  const env = getServerEnv();
  if (!env.OPENAI_API_KEY) {
    return null;
  }

  const client = new OpenAI({ apiKey: env.OPENAI_API_KEY });
  globalForCta.__styleportResultPinOpenAI = client;
  return client;
}

function extractResponseText(response: OpenAI.Responses.Response) {
  if (response.output_text && response.output_text.trim()) {
    return response.output_text.trim();
  }

  for (const item of response.output ?? []) {
    if (item.type !== "message") {
      continue;
    }

    for (const part of item.content ?? []) {
      if (part.type === "output_text" && part.text.trim()) {
        return part.text.trim();
      }
    }
  }

  return "";
}

async function generateAiCta(params: {
  translatorTitle: string;
  outputText: string;
  styleHint: string;
}) {
  const client = getOpenAIClient();
  if (!client) {
    return null;
  }

  const env = getServerEnv();
  const model = env.OPENAI_MODEL || DEFAULT_MODEL;

  try {
    const response = await client.responses.create(
      {
        model,
        temperature: 0.8,
        max_output_tokens: 60,
        input: [
          {
            role: "system",
            content: [
              {
                type: "input_text",
                text:
                  "Rewrite the phrase 'Try this translator for free' in the target style. Keep it short (5-12 words), natural, and safe. Return only one sentence. Do not use hashtags or emojis.",
              },
            ],
          },
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text: [
                  `Translator title: ${params.translatorTitle}`,
                  `Style hint: ${params.styleHint || "None"}`,
                  `Sample translated output style: ${params.outputText}`,
                  "Preserve meaning: Try this translator for free.",
                ].join("\n"),
              },
            ],
          },
        ],
      },
      {
        signal: AbortSignal.timeout(AI_CTA_TIMEOUT_MS),
      },
    );

    const raw = extractResponseText(response)
      .replace(/[\r\n]+/g, " ")
      .replace(/[“”]/g, '"')
      .replace(/\s+/g, " ")
      .trim()
      .replace(/^["']|["']$/g, "");

    if (!raw) {
      return null;
    }

    const normalized = clampText(raw, MAX_CTA_LENGTH);
    if (!/\bfree\b/i.test(normalized)) {
      return null;
    }

    return normalized;
  } catch (error) {
    logError("result_pin_ai_cta_failed", "AI CTA generation failed for Pinterest result pin.", {
      error: error instanceof Error ? error.message : String(error),
      model,
    });
    return null;
  }
}

function buildDeterministicCta(params: { translatorTitle: string; styleHint?: string }) {
  const normalized = `${params.translatorTitle} ${params.styleHint || ""}`.toLowerCase();

  if (/(pirate|captain|sea|ship|corsair|buccaneer)/i.test(normalized)) {
    return clampText("Try this translator fer free, matey!", MAX_CTA_LENGTH);
  }
  if (/(stone age|caveman|cave|prehistoric|neanderthal)/i.test(normalized)) {
    return clampText("Try this talk-maker free, big brain!", MAX_CTA_LENGTH);
  }
  if (/(gen z|tiktok|slang|teen|zoomer)/i.test(normalized)) {
    return clampText("Try this translator for free, no cap.", MAX_CTA_LENGTH);
  }
  if (/(professional|linkedin|corporate|business|formal|executive)/i.test(normalized)) {
    return clampText("Try this translator for free today.", MAX_CTA_LENGTH);
  }
  if (/(shakespeare|old english|elizabethan|bard)/i.test(normalized)) {
    return clampText("Try this translator freely, good friend.", MAX_CTA_LENGTH);
  }
  if (/(romantic|love|poetic|poem|valentine)/i.test(normalized)) {
    return clampText("Try this translator for free, my dear.", MAX_CTA_LENGTH);
  }
  if (/(funny|joke|comedy|meme)/i.test(normalized)) {
    return clampText("Try this translator for free, guaranteed giggles.", MAX_CTA_LENGTH);
  }

  return "Try this translator for free.";
}

async function buildSnapshot(requestUrl: string, options: { allowAiCta: boolean }): Promise<ResultPinSnapshot> {
  const { searchParams } = new URL(requestUrl);
  const translatorTitle = clampText(searchParams.get("translator"), MAX_TRANSLATOR_LENGTH) || "Style Translator";
  const inputText = clampText(searchParams.get("input"), MAX_INPUT_LENGTH) || "No source text provided.";
  const outputText = clampText(searchParams.get("output"), MAX_OUTPUT_LENGTH) || "No translated result provided.";
  const styleHint = clampText(searchParams.get("styleHint"), MAX_STYLE_HINT_LENGTH) || "";
  const ctaFromQuery = clampText(searchParams.get("cta"), MAX_CTA_LENGTH);
  const ctaMode = (searchParams.get("ctaMode") || "").toLowerCase();
  const fallbackCta = buildDeterministicCta({
    translatorTitle,
    styleHint,
  });

  let cta =
    ctaFromQuery &&
    ctaFromQuery.toLowerCase() !== "try this translator free" &&
    ctaFromQuery.toLowerCase() !== "translate your text for free"
      ? ctaFromQuery
      : fallbackCta;

  if (options.allowAiCta && ctaMode === "ai") {
    const aiCta = await generateAiCta({
      translatorTitle,
      outputText,
      styleHint,
    });
    if (aiCta) {
      cta = aiCta;
    }
  }

  return {
    translatorTitle,
    inputText,
    outputText,
    styleHint,
    cta,
  };
}

function renderResultPin(snapshot: ResultPinSnapshot) {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        backgroundColor: "#f2eeff",
        color: "#13162e",
        padding: "30px 32px 30px",
        boxSizing: "border-box",
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          borderRadius: "30px",
          backgroundColor: "#ffffff",
          border: "3px solid #d5d0ff",
          padding: "20px 22px",
          marginBottom: "14px",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "16px",
              flex: 1,
            }}
          >
            <div
              style={{
                width: "112px",
                height: "112px",
                borderRadius: "28px",
                backgroundColor: "#4e46d6",
                color: "#ffffff",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontFamily: 'Manrope, Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif',
                fontWeight: 800,
                fontSize: "46px",
                lineHeight: 1,
                boxShadow: "0 16px 28px rgba(78, 70, 214, 0.28)",
              }}
            >
              WT
            </div>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                justifyContent: "center",
                flex: 1,
              }}
            >
              <p
                style={{
                  margin: 0,
                  color: "#3b35b8",
                  fontFamily: 'Manrope, Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif',
                  fontWeight: 800,
                  fontSize: "34px",
                  lineHeight: 1.02,
                  letterSpacing: "-0.018em",
                }}
              >
                {BRAND_NAME}
              </p>
              <p
                style={{
                  margin: "8px 0 0",
                  color: "#6158a8",
                  fontFamily: 'Manrope, Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif',
                  fontWeight: 600,
                  fontSize: "22px",
                  lineHeight: 1.06,
                }}
              >
                Text transformed in one tap
              </p>
            </div>
          </div>
          <p
            style={{
              margin: 0,
              color: "#6b63b6",
              fontFamily: 'Manrope, Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif',
              fontWeight: 700,
              fontSize: "20px",
              lineHeight: 1.1,
              textTransform: "uppercase",
              letterSpacing: "0.06em",
            }}
          >
            Instant before and after
          </p>
        </div>
      </div>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          borderRadius: "30px",
          backgroundColor: "#ffffff",
          border: "3px solid #dad5ff",
          padding: "22px 24px 18px",
          marginBottom: "14px",
        }}
      >
        <p
          style={{
            margin: "0 0 10px",
            color: "#4d44bf",
            fontFamily: 'Manrope, Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif',
            fontSize: "29px",
            fontWeight: 700,
            lineHeight: 1.1,
            textTransform: "uppercase",
            letterSpacing: "0.055em",
          }}
        >
          Translator
        </p>
        <h1
          style={{
            margin: 0,
            color: "#191944",
            fontFamily: '"Cormorant Garamond", Georgia, "Times New Roman", serif',
            fontWeight: 700,
            fontSize: "78px",
            lineHeight: 0.92,
            letterSpacing: "-0.028em",
          }}
        >
          {snapshot.translatorTitle}
        </h1>
      </div>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "10px",
          flex: 1,
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "flex-start",
            alignItems: "flex-start",
            flex: 1,
            borderRadius: "24px 24px 12px 12px",
            backgroundColor: "#ffffff",
            border: "3px solid #dfdbff",
            padding: "18px 18px",
          }}
        >
          <p
            style={{
              margin: "0 0 12px",
              color: "#4440aa",
              fontFamily: 'Manrope, Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif',
              fontSize: "32px",
              fontWeight: 700,
              lineHeight: 1.1,
            }}
          >
            Your text
          </p>
          <p
            style={{
              margin: 0,
              color: "#181b39",
              fontFamily: 'Manrope, Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif',
              fontSize: "35px",
              lineHeight: 1.16,
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
            alignItems: "flex-start",
            flex: 1.22,
            borderRadius: "12px 12px 26px 26px",
            backgroundColor: "#ece8ff",
            border: "3px solid #bdb4ff",
            padding: "20px 20px 20px",
          }}
        >
          <p
            style={{
              margin: "0 0 12px",
              color: "#3327ab",
              fontFamily: 'Manrope, Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif',
              fontSize: "33px",
              fontWeight: 800,
              lineHeight: 1.1,
            }}
          >
            Translated result
          </p>
          <p
            style={{
              margin: 0,
              color: "#1a1e42",
              fontFamily: 'Manrope, Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif',
              fontSize: "45px",
              lineHeight: 1.14,
              fontWeight: 700,
            }}
          >
            {snapshot.outputText}
          </p>
        </div>
      </div>

      <p
        style={{
          margin: "12px 0 0",
          paddingTop: "12px",
          borderTop: "4px solid #a79ff6",
          color: "#27227b",
          textAlign: "center",
          fontFamily: '"Cormorant Garamond", Georgia, "Times New Roman", serif',
          fontWeight: 800,
          fontSize: "50px",
          lineHeight: 1.03,
          letterSpacing: "-0.012em",
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
  try {
    const snapshot = await buildSnapshot(request.url, { allowAiCta: false });
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
  try {
    const snapshot = await buildSnapshot(request.url, { allowAiCta: true });
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
