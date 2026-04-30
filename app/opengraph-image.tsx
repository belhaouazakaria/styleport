import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "What Type Of | Translator";
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #4A40E8 0%, #665DFF 45%, #8FB3FF 100%)",
          color: "#FFFFFF",
          fontFamily: "Inter, Arial, sans-serif",
        }}
      >
        <div
          style={{
            width: 1050,
            height: 470,
            borderRadius: 36,
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            gap: 24,
            border: "1px solid rgba(255,255,255,0.35)",
            background: "rgba(255,255,255,0.12)",
            padding: "64px 72px",
          }}
        >
          <div style={{ fontSize: 28, fontWeight: 700, opacity: 0.9 }}>What Type Of</div>
          <div style={{ fontSize: 74, fontWeight: 800, lineHeight: 1.02 }}>Translator</div>
          <div style={{ fontSize: 34, fontWeight: 500, maxWidth: 880, opacity: 0.95 }}>
            AI-powered text translators for rewriting text into different styles, tones, and personalities.
          </div>
        </div>
      </div>
    ),
    {
      ...size,
    },
  );
}
