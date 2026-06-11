import { ImageResponse } from "next/og";

// Route segment config
export const runtime = "edge";

// Image metadata
export const alt = "말맞춤 (MalMatch) - 유사도 단어 추측 게임";
export const size = {
  width: 1200,
  height: 630,
};

export const contentType = "image/png";

// Image generation
export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          background: "linear-gradient(135deg, #090d16 0%, #111827 50%, #1e1b4b 100%)",
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "sans-serif",
          color: "white",
          padding: "40px",
          position: "relative",
        }}
      >
        {/* Glow background effects */}
        <div
          style={{
            position: "absolute",
            top: "15%",
            left: "20%",
            width: "300px",
            height: "300px",
            borderRadius: "50%",
            background: "rgba(0, 122, 255, 0.15)",
            filter: "blur(60px)",
          }}
        />
        <div
          style={{
            position: "absolute",
            bottom: "15%",
            right: "20%",
            width: "300px",
            height: "300px",
            borderRadius: "50%",
            background: "rgba(16, 185, 129, 0.12)",
            filter: "blur(60px)",
          }}
        />

        {/* Outer Premium Frame */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            background: "rgba(255, 255, 255, 0.02)",
            border: "1px solid rgba(255, 255, 255, 0.06)",
            padding: "55px 90px",
            borderRadius: "28px",
            boxShadow: "0 25px 60px rgba(0, 0, 0, 0.4)",
            width: "90%",
            maxWidth: "960px",
          }}
        >
          {/* Logo Brand Header */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              fontSize: "72px",
              fontWeight: "900",
              letterSpacing: "-2px",
              marginBottom: "15px",
            }}
          >
            <span style={{ color: "#ffffff" }}>말</span>
            <span style={{ color: "#007aff" }}>맞춤</span>
          </div>

          {/* Subtitle / English Name */}
          <div
            style={{
              fontSize: "22px",
              fontWeight: "600",
              color: "#64748b",
              marginBottom: "35px",
              letterSpacing: "2px",
              textTransform: "uppercase",
            }}
          >
            MalMatch - Word Similarity Game
          </div>

          {/* Core App Tagline */}
          <div
            style={{
              fontSize: "30px",
              fontWeight: "750",
              color: "#f1f5f9",
              textAlign: "center",
              lineHeight: "1.4",
              maxWidth: "700px",
              letterSpacing: "-0.5px",
            }}
          >
            "유사도를 분석해 숨겨진 비밀 단어를 추측하세요!"
          </div>

          {/* Tech/Feature Pills */}
          <div
            style={{
              display: "flex",
              gap: "18px",
              marginTop: "45px",
            }}
          >
            <div
              style={{
                background: "rgba(0, 122, 255, 0.12)",
                border: "1px solid rgba(0, 122, 255, 0.25)",
                padding: "8px 18px",
                borderRadius: "10px",
                fontSize: "14px",
                color: "#3b82f6",
                fontWeight: "700",
                display: "flex",
                alignItems: "center",
              }}
            >
              🔄 실시간 동기화
            </div>
            <div
              style={{
                background: "rgba(16, 185, 129, 0.12)",
                border: "1px solid rgba(16, 185, 129, 0.25)",
                padding: "8px 18px",
                borderRadius: "10px",
                fontSize: "14px",
                color: "#10b981",
                fontWeight: "700",
                display: "flex",
                alignItems: "center",
              }}
            >
              🧠 AI 유사도 스코어
            </div>
            <div
              style={{
                background: "rgba(245, 158, 11, 0.12)",
                border: "1px solid rgba(245, 158, 11, 0.25)",
                padding: "8px 18px",
                borderRadius: "10px",
                fontSize: "14px",
                color: "#f59e0b",
                fontWeight: "700",
                display: "flex",
                alignItems: "center",
              }}
            >
              🏆 명예의 전당 도전
            </div>
          </div>
        </div>
      </div>
    ),
    {
      ...size,
    }
  );
}
