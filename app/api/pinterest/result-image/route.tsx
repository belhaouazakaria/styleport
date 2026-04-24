import { ImageResponse } from "next/og";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const IMAGE_WIDTH = 1000;
const IMAGE_HEIGHT = 1500;
const BRAND_NAME = "What Type Of | Translator";
const MAX_TRANSLATOR_LENGTH = 96;
const MAX_INPUT_LENGTH = 300;
const MAX_OUTPUT_LENGTH = 340;
const MAX_CTA_LENGTH = 120;

const DISPLAY_FONT_NAME = "PinDisplayCormorant";
const BODY_FONT_NAME = "PinBodyManrope";
const DISPLAY_FONT_CSS_URL = "https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@700";

let resultPinFontsPromise:
  | Promise<Array<{ name: string; data: ArrayBuffer; style: "normal"; weight: 400 | 600 | 700 }>>
  | null = null;

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

async function fetchFontFromGoogleCss(cssUrl: string) {
  const cssResponse = await fetch(cssUrl, {
    cache: "force-cache",
    next: { revalidate: 60 * 60 * 24 * 30 },
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
    },
  });

  if (!cssResponse.ok) {
    throw new Error(`Font CSS request failed with status ${cssResponse.status}`);
  }

  const cssText = await cssResponse.text();
  const match = cssText.match(/src:\s*url\(([^)]+)\)\s*format\('(opentype|truetype|woff2?)'\)/i);
  if (!match?.[1]) {
    throw new Error("Unable to locate font src URL in Google Fonts CSS.");
  }

  const fontUrl = match[1].replace(/["']/g, "");
  const fontResponse = await fetch(fontUrl, {
    cache: "force-cache",
    next: { revalidate: 60 * 60 * 24 * 30 },
  });

  if (!fontResponse.ok) {
    throw new Error(`Font file request failed with status ${fontResponse.status}`);
  }

  return fontResponse.arrayBuffer();
}

async function getResultPinFonts() {
  if (resultPinFontsPromise) {
    return resultPinFontsPromise;
  }

  resultPinFontsPromise = (async () => {
    const [display, bodyRegular, bodySemiBold, bodyBold] = await Promise.allSettled([
      fetchFontFromGoogleCss(DISPLAY_FONT_CSS_URL),
      fetchFontFromGoogleCss("https://fonts.googleapis.com/css2?family=Manrope:wght@400"),
      fetchFontFromGoogleCss("https://fonts.googleapis.com/css2?family=Manrope:wght@600"),
      fetchFontFromGoogleCss("https://fonts.googleapis.com/css2?family=Manrope:wght@700"),
    ]);

    const fonts: Array<{
      name: string;
      data: ArrayBuffer;
      style: "normal";
      weight: 400 | 600 | 700;
    }> = [];

    if (display.status === "fulfilled") {
      fonts.push({
        name: DISPLAY_FONT_NAME,
        data: display.value,
        style: "normal",
        weight: 700,
      });
    }

    if (bodyRegular.status === "fulfilled") {
      fonts.push({
        name: BODY_FONT_NAME,
        data: bodyRegular.value,
        style: "normal",
        weight: 400,
      });
    }

    if (bodySemiBold.status === "fulfilled") {
      fonts.push({
        name: BODY_FONT_NAME,
        data: bodySemiBold.value,
        style: "normal",
        weight: 600,
      });
    }

    if (bodyBold.status === "fulfilled") {
      fonts.push({
        name: BODY_FONT_NAME,
        data: bodyBold.value,
        style: "normal",
        weight: 700,
      });
    }

    return fonts;
  })().catch(() => []);

  return resultPinFontsPromise;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const translatorTitle = clampText(searchParams.get("translator"), MAX_TRANSLATOR_LENGTH) || "Style Translator";
  const inputText = clampText(searchParams.get("input"), MAX_INPUT_LENGTH) || "No source text provided.";
  const outputText = clampText(searchParams.get("output"), MAX_OUTPUT_LENGTH) || "No translated result provided.";
  const cta =
    clampText(searchParams.get("cta"), MAX_CTA_LENGTH) || "Translate your text for free";
  const fonts = await getResultPinFonts();

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          backgroundColor: "#f4f2ff",
          backgroundImage:
            "radial-gradient(circle at 10% 0%, rgba(91,91,246,0.09) 0, rgba(91,91,246,0.01) 45%), radial-gradient(circle at 95% 90%, rgba(64,64,203,0.08) 0, rgba(64,64,203,0.01) 42%)",
          color: "#111827",
          padding: "44px 44px 38px",
          boxSizing: "border-box",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: "20px",
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
              backgroundColor: "#5b5bf6",
              color: "#ffffff",
              fontSize: "22px",
              fontWeight: 800,
              fontFamily: `${BODY_FONT_NAME}, ui-sans-serif, system-ui, sans-serif`,
            }}
          >
            WT
          </div>
          <div
            style={{
              color: "#4040cb",
              fontSize: "25px",
              fontWeight: 700,
              fontFamily: `${BODY_FONT_NAME}, ui-sans-serif, system-ui, sans-serif`,
              letterSpacing: "-0.01em",
            }}
          >
            {BRAND_NAME}
          </div>
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            borderRadius: "28px",
            backgroundColor: "#ffffff",
            border: "2px solid #d9d6ff",
            padding: "26px 28px 22px",
            marginBottom: "20px",
          }}
        >
          <div
            style={{
              color: "#4040cb",
              fontSize: "24px",
              fontWeight: 600,
              marginBottom: "10px",
              fontFamily: `${BODY_FONT_NAME}, ui-sans-serif, system-ui, sans-serif`,
            }}
          >
            Translator
          </div>
          <div
            style={{
              fontSize: "68px",
              lineHeight: 0.96,
              fontWeight: 700,
              letterSpacing: "-0.02em",
              color: "#1f2145",
              fontFamily: `${DISPLAY_FONT_NAME}, "Cormorant Garamond", Georgia, serif`,
            }}
          >
            {translatorTitle}
          </div>
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "16px",
            flexGrow: 1,
          }}
        >
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              flex: 1,
              justifyContent: "space-between",
              borderRadius: "24px",
              backgroundColor: "#ffffff",
              border: "2px solid #e0e7ff",
              padding: "20px 22px",
            }}
          >
            <div
              style={{
                fontSize: "25px",
                fontWeight: 700,
                color: "#3737a6",
                marginBottom: "12px",
                fontFamily: `${BODY_FONT_NAME}, ui-sans-serif, system-ui, sans-serif`,
              }}
            >
              Your text
            </div>
            <div
              style={{
                fontSize: "38px",
                lineHeight: 1.2,
                color: "#151932",
                fontFamily: `${BODY_FONT_NAME}, ui-sans-serif, system-ui, sans-serif`,
              }}
            >
              {inputText}
            </div>
          </div>

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              flex: 1,
              justifyContent: "space-between",
              borderRadius: "24px",
              backgroundColor: "#ffffff",
              border: "2px solid #ddd6fe",
              padding: "20px 22px",
            }}
          >
            <div
              style={{
                fontSize: "25px",
                fontWeight: 700,
                color: "#4338ca",
                marginBottom: "12px",
                fontFamily: `${BODY_FONT_NAME}, ui-sans-serif, system-ui, sans-serif`,
              }}
            >
              Translated result
            </div>
            <div
              style={{
                fontSize: "38px",
                lineHeight: 1.2,
                color: "#1d2347",
                fontFamily: `${BODY_FONT_NAME}, ui-sans-serif, system-ui, sans-serif`,
              }}
            >
              {outputText}
            </div>
          </div>
        </div>

        <div
          style={{
            marginTop: "18px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#4040cb",
            fontSize: "33px",
            lineHeight: 1.2,
            fontWeight: 700,
            padding: "14px 8px 0",
            textAlign: "center",
            fontFamily: `${DISPLAY_FONT_NAME}, "Cormorant Garamond", Georgia, serif`,
            letterSpacing: "-0.01em",
            borderTop: "2px solid #d9d6ff",
          }}
        >
          {cta}
        </div>
      </div>
    ),
    {
      width: IMAGE_WIDTH,
      height: IMAGE_HEIGHT,
      fonts,
      headers: {
        "Cache-Control": "no-store, max-age=0",
      },
    },
  );
}
