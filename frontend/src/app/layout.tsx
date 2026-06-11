import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ||
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : "https://malmatch.vercel.app");

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "말맞춤 (MalMatch) - 유사도 단어 추측 게임",
    template: "%s | 말맞춤 (MalMatch)",
  },
  description: "유사도를 활용해 숨겨진 비밀 단어를 유추해내는 두뇌 게임입니다. 실시간 랭킹 시스템과 명예의 전당에 도전하여 단어 맞추기 실력을 검증해 보세요!",
  keywords: ["말맞춤", "MalMatch", "단어추측", "꼬들", "꼬망", "단어 게임", "유사도", "단어 퀴즈", "두뇌 게임"],
  authors: [{ name: "MalMatch Team" }],
  creator: "MalMatch Team",
  publisher: "MalMatch Team",
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
  icons: {
    icon: "/icon.svg",
  },
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "말맞춤 (MalMatch) - 유사도 단어 추측 게임",
    description: "유사도를 활용해 숨겨진 비밀 단어를 유추해내는 두뇌 게임입니다. 실시간 랭킹 시스템과 명예의 전당에 도전하세요!",
    url: "/",
    siteName: "말맞춤 (MalMatch)",
    locale: "ko_KR",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "말맞춤 (MalMatch) - 유사도 단어 추측 게임",
    description: "유사도를 활용해 숨겨진 비밀 단어를 유추해내는 두뇌 게임입니다. 실시간 랭킹 시스템과 명예의 전당에 도전하세요!",
    creator: "@malmatch",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ko"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  var savedTheme = localStorage.getItem('malmatch_theme');
                  var theme = savedTheme;
                  if (!theme) {
                    var mql = window.matchMedia('(prefers-color-scheme: dark)');
                    theme = mql.matches ? 'dark' : 'light';
                  }
                  if (theme === 'dark') {
                    document.documentElement.classList.add('dark');
                  } else {
                    document.documentElement.classList.remove('dark');
                  }
                } catch (e) {}
              })();
            `,
          }}
        />
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
