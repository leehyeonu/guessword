import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "말맞춤 (MalMatch)",
    short_name: "MalMatch",
    description:
      "유사도를 활용해 숨겨진 비밀 단어를 유추해내는 두뇌 게임입니다. 실시간 랭킹 시스템과 명예의 전당에 도전하세요!",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait-primary",
    theme_color: "#0a0a0a",
    background_color: "#ffffff",
    categories: ["games"],
    screenshots: [
      {
        src: "/ogfile.jpg",
        type: "image/jpeg",
        sizes: "1200x630",
        form_factor: "wide",
      },
    ],
    icons: [
      {
        src: "/favicon.ico",
        sizes: "16x16 32x32",
        type: "image/x-icon",
      },
      {
        src: "/favicon-96x96.png",
        sizes: "96x96",
        type: "image/png",
      },
      {
        src: "/web-app-manifest-192x192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/web-app-manifest-512x512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any maskable",
      },
      {
        src: "/apple-touch-icon.png",
        sizes: "180x180",
        type: "image/png",
        purpose: "any",
      },
    ],
    lang: "ko-KR",
  };
}
