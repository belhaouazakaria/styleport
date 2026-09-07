import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "SayTwist";
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
          background: "#FFF9F4",
          color: "#0F172A",
          fontFamily: "Arial, sans-serif",
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
            alignItems: "center",
            gap: 20,
            background: "white",
            border: "1px solid #E2E8F0",
            padding: "64px 72px",
          }}
        >
          {/* SayTwist icon mark */}
          <div
            style={{
              width: 80,
              height: 80,
              borderRadius: 20,
              background: "#14B8A6",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <svg width="48" height="48" viewBox="0 0 32 32" fill="none">
              <path d="M8 22C8 22 7 20 8 17C9.5 12 14 10 17 10C20 10 23 11 24 14C25 17 24 20 22 22C20 24 16 25 13 24C10 23 9 22 8 22Z" fill="white"/>
              <path d="M10 23L8 27L13 24.5" fill="white"/>
              <rect x="5" y="4" width="3.5" height="2" rx="1" transform="rotate(-30 5 4)" fill="#FF7A59"/>
              <rect x="11" y="2.5" width="3.5" height="2" rx="1" transform="rotate(-10 11 2.5)" fill="#F59E0B"/>
              <rect x="17" y="4" width="3" height="2" rx="1" transform="rotate(15 17 4)" fill="#60C5F7"/>
            </svg>
          </div>
          <div style={{ fontSize: 72, fontWeight: 800, color: "#0F172A", letterSpacing: -2 }}>
            Say<span style={{ color: "#14B8A6" }}>Twist</span>
          </div>
          <div style={{ fontSize: 28, fontWeight: 500, color: "#64748B", maxWidth: 700, textAlign: "center" }}>
            Give your words a different twist.
          </div>
        </div>
      </div>
    ),
    {
      ...size,
    },
  );
}
