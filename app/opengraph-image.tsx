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
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none">
              <path
                d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"
                stroke="white"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
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
