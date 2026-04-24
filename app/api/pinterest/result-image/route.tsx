import { ImageResponse } from "next/og";

import { APP_NAME } from "@/lib/constants";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const IMAGE_WIDTH = 1000;
const IMAGE_HEIGHT = 1500;
const MAX_TRANSLATOR_LENGTH = 96;
const MAX_INPUT_LENGTH = 260;
const MAX_OUTPUT_LENGTH = 320;
const MAX_CTA_LENGTH = 120;

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

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const translatorTitle = clampText(searchParams.get("translator"), MAX_TRANSLATOR_LENGTH) || "Style Translator";
  const inputText = clampText(searchParams.get("input"), MAX_INPUT_LENGTH) || "No source text provided.";
  const outputText = clampText(searchParams.get("output"), MAX_OUTPUT_LENGTH) || "No translated result provided.";
  const cta =
    clampText(searchParams.get("cta"), MAX_CTA_LENGTH) || `Translate your text with ${APP_NAME}`;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          backgroundColor: "#fff6f8",
          color: "#111827",
          fontFamily:
            "Inter, Montserrat, Poppins, ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif",
          padding: "56px",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: "24px",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: "46px",
              height: "46px",
              borderRadius: "12px",
              backgroundColor: "#E60023",
              color: "#ffffff",
              fontSize: "20px",
              fontWeight: 800,
            }}
          >
            WT
          </div>
          <div
            style={{
              color: "#be123c",
              fontSize: "24px",
              fontWeight: 700,
            }}
          >
            {APP_NAME}
          </div>
        </div>

        <div
          style={{
            marginBottom: "28px",
            display: "flex",
            flexDirection: "column",
            borderRadius: "24px",
            backgroundColor: "#ffffff",
            border: "2px solid #fecdd3",
            padding: "28px",
          }}
        >
          <div
            style={{
              color: "#9f1239",
              fontSize: "28px",
              fontWeight: 700,
              marginBottom: "8px",
            }}
          >
            Translator
          </div>
          <div
            style={{
              fontSize: "52px",
              lineHeight: 1.06,
              fontWeight: 800,
              letterSpacing: "-0.02em",
            }}
          >
            {translatorTitle}
          </div>
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "22px",
            flexGrow: 1,
          }}
        >
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              borderRadius: "20px",
              backgroundColor: "#ffffff",
              border: "2px solid #e5e7eb",
              padding: "24px",
            }}
          >
            <div
              style={{
                fontSize: "24px",
                fontWeight: 700,
                color: "#374151",
                marginBottom: "10px",
              }}
            >
              Your text
            </div>
            <div
              style={{
                fontSize: "30px",
                lineHeight: 1.28,
                color: "#111827",
              }}
            >
              {inputText}
            </div>
          </div>

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              borderRadius: "20px",
              backgroundColor: "#ffffff",
              border: "2px solid #fbcfe8",
              padding: "24px",
            }}
          >
            <div
              style={{
                fontSize: "24px",
                fontWeight: 700,
                color: "#9d174d",
                marginBottom: "10px",
              }}
            >
              Translated result
            </div>
            <div
              style={{
                fontSize: "30px",
                lineHeight: 1.28,
                color: "#3f3f46",
              }}
            >
              {outputText}
            </div>
          </div>
        </div>

        <div
          style={{
            marginTop: "26px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: "18px",
            backgroundColor: "#E60023",
            color: "#ffffff",
            fontSize: "34px",
            lineHeight: 1.2,
            fontWeight: 800,
            padding: "24px 20px",
            textAlign: "center",
          }}
        >
          {cta}
        </div>
      </div>
    ),
    {
      width: IMAGE_WIDTH,
      height: IMAGE_HEIGHT,
      headers: {
        "Cache-Control": "no-store, max-age=0",
      },
    },
  );
}

