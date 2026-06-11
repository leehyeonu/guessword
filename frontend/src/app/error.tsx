"use client";

import React, { useEffect } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";

// Next.js 13+ App Router의 글로벌 에러 바운더리 컴포넌트
// 클라이언트 렌더링 도중 발생하는 Unhandled Runtime Exception을 격리하여 화이트 스크린 크래시를 방지합니다.
interface ErrorProps {
  error: Error & { digest?: string }; // 에러 개체 (Vercel 로그 대응용 고유 해시 digest 포함)
  reset: () => void; // 에러 상태를 초기화하고 리렌더링을 시도하는 Next.js 복구 함수
}

export default function Error({ error, reset }: ErrorProps) {
  useEffect(() => {
    // SRE 관측성 확보를 위한 런타임 크래시 서버/클라이언트 콘솔 로깅
    console.error("Application runtime crash captured:", error);
  }, [error]);

  return (
    <div className="min-h-dvh w-full flex flex-col items-center justify-center p-6 text-center bg-slate-50 dark:bg-zinc-950 text-slate-900 dark:text-white">
      <div className="max-w-md w-full bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-2xl p-6 md:p-8 shadow-xl flex flex-col items-center">
        <div className="p-4 rounded-full bg-red-100 dark:bg-red-950/40 text-red-600 dark:text-red-400 mb-5">
          <AlertTriangle className="w-12 h-12" />
        </div>
        <h2 className="text-xl md:text-2xl font-extrabold tracking-tight mb-3">어플리케이션 오류 발생</h2>
        <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-450 mb-6 leading-relaxed">
          화면을 그리는 도중 예기치 못한 내부 오류가 발생해 멈췄습니다. 
          데이터 손상을 방지하기 위해 화면 복구를 준비하고 있으며, 아래 버튼을 눌러 다시 연결을 시도해 보세요.
        </p>

        {error.digest && (
          <div className="w-full mb-6 p-2.5 bg-slate-100 dark:bg-zinc-800/50 rounded-lg text-[10px] sm:text-[11px] font-mono text-slate-500 text-left truncate" title={`Digest ID: ${error.digest}`}>
            <strong>오류 식별자 (Digest):</strong> {error.digest}
          </div>
        )}

        <button
          onClick={() => reset()}
          className="flex items-center justify-center gap-2 w-full px-5 py-3 rounded-xl text-sm font-bold text-white bg-red-600 hover:bg-red-700 transition-colors shadow-md shadow-red-500/10 cursor-pointer border-none"
        >
          <RotateCcw className="w-4 h-4" />
          <span>다시 시도하기</span>
        </button>
      </div>
    </div>
  );
}
