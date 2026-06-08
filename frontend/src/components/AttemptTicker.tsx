"use client";

import React, { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Activity, RotateCw } from "lucide-react";

interface AttemptItem {
  id: string;
  nickname: string;
  score: number;
  timestamp: Date;
}

interface AttemptTickerProps {
  userNickname?: string;
}

interface GameStatsApiResponse {
  recent_attempts?: Array<{
    id: string;
    nickname?: string;
    score?: number;
    timestamp?: string;
  }>;
}

const getApiUrl = () => {
  const rawApiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
  return rawApiUrl.replace(/\/$/, "");
};

export default function AttemptTicker({ userNickname }: AttemptTickerProps) {
  const [attempts, setAttempts] = useState<AttemptItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const loadAttempts = useCallback(async (isManualRefresh = false) => {
    const startTime = Date.now();
    const maxRetries = 3;
    const timeout = 8000; // 8초 타임아웃
    let lastError: Error | null = null;

    if (isManualRefresh) {
      setIsRefreshing(true);
    } else if (!isLoading && !isRefreshing) {
      return;
    }

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);

        const response = await fetch(`${getApiUrl()}/api/game_stats?limit=5`, {
          signal: controller.signal,
        });
        clearTimeout(timeoutId);

        if (!response.ok) {
          throw new Error(`API 오류: ${response.status}`);
        }

        const data = (await response.json()) as GameStatsApiResponse;
        const loaded = (data.recent_attempts || []).map((a) => ({
          id: a.id || `attempt-${Math.random()}`,
          nickname: a.nickname || "누군가",
          score: typeof a.score === "number" ? Math.max(0, Math.min(100, a.score)) : 0,
          timestamp: a.timestamp && !isNaN(new Date(a.timestamp).getTime()) 
            ? new Date(a.timestamp) 
            : new Date(),
        }));

        setAttempts(loaded);
        setErrorMsg("");
        setIsLoading(false);
        setIsRefreshing(false);
        return;
      } catch (error) {
        lastError = error as Error;
        console.warn(`시도 기록 로드 시도 ${attempt + 1}/${maxRetries} 실패:`, error);

        if (attempt < maxRetries - 1) {
          await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)));
        }
      }
    }

    // 모든 재시도 실패
    console.error("시도 현황 로드 최종 실패:", lastError);
    setErrorMsg(`기록을 불러올 수 없습니다 (${lastError?.message || '불명의 오류'})`);
    setIsLoading(false);
    setIsRefreshing(false);
  }, [isLoading, isRefreshing]);

  useEffect(() => {
    loadAttempts();
  }, []);

  const formatTimeAgo = (date: Date) => {
    const seconds = Math.floor((new Date().getTime() - date.getTime()) / 1000);
    if (seconds < 0) return "방금 전";
    if (seconds < 60) return "방금 전";
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}분 전`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}시간 전`;
    return date.toLocaleDateString();
  };

  // 점수에 따른 색상
  const getScoreStyle = (score: number) => {
    if (score >= 90) return "text-red-600 dark:text-red-400 bg-red-500/10";
    if (score >= 70) return "text-orange-600 dark:text-orange-400 bg-orange-500/10";
    if (score >= 50) return "text-amber-600 dark:text-amber-400 bg-amber-500/10";
    if (score >= 30) return "text-blue-600 dark:text-blue-400 bg-blue-500/10";
    if (score >= 10) return "text-slate-600 dark:text-slate-400 bg-slate-500/10";
    return "text-slate-500 dark:text-slate-500 bg-slate-500/5";
  };

  return (
    <div className="liquid-glass w-full rounded-2xl p-5 overflow-hidden text-slate-900 dark:text-white">
      <div className="flex items-center justify-between border-b border-slate-200 dark:border-zinc-800 pb-2.5 mb-3">
        <div className="flex items-center gap-1.5 text-[var(--apple-green)]">
          <Activity className="w-4 h-4 text-[var(--apple-green)]" />
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200">시도 현황</h4>
        </div>
        <button
          onClick={() => loadAttempts(true)}
          disabled={isRefreshing || isLoading}
          className="p-1.5 rounded-lg hover:bg-slate-200 dark:hover:bg-zinc-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          title="새로고침"
        >
          <RotateCw className={`w-4 h-4 text-[var(--apple-green)] ${isRefreshing ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <div className="space-y-1.5 max-h-[200px] overflow-y-auto pr-1">
        {isLoading ? (
          <div className="text-center text-xs text-slate-500 py-6">
            데이터베이스 연결 중...
          </div>
        ) : errorMsg ? (
          <div className="text-center text-xs text-red-500 bg-red-500/10 border border-red-500/15 p-4 rounded-xl leading-relaxed">
            {errorMsg}
          </div>
        ) : attempts.length > 0 ? (
          <AnimatePresence initial={false}>
            {attempts.map((attempt) => {
              const isMe = attempt.nickname === userNickname;
              return (
                <motion.div
                  key={attempt.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  className={`flex items-center justify-between text-[11px] sm:text-xs p-2 sm:p-2.5 rounded-lg border-none transition-all ${
                    isMe
                      ? "bg-green-500/10 dark:bg-green-500/15 ring-1 ring-green-500/20 font-bold"
                      : "bg-[var(--apple-gray-btn)]"
                  }`}
                >
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="font-semibold text-slate-900 dark:text-white truncate">
                      {attempt.nickname}
                      {isMe && <span className="text-[9px] sm:text-[10px] text-[var(--apple-green)] font-bold ml-1">(나)</span>}
                    </span>
                    <span className="text-slate-500 dark:text-slate-400 shrink-0">님이 시도</span>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0 ml-1">
                    <span className={`text-[9px] sm:text-[10px] font-mono px-1.5 py-0.5 rounded-md font-bold ${getScoreStyle(attempt.score)}`}>
                      {attempt.score}점
                    </span>
                    <span className="text-[8px] sm:text-[9px] text-slate-500 dark:text-slate-400 min-w-[34px] text-right">
                      {formatTimeAgo(attempt.timestamp)}
                    </span>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        ) : (
          <div className="text-center text-xs text-slate-500 py-6 leading-relaxed">
            아직 시도 기록이 없습니다.
          </div>
        )}
      </div>
    </div>
  );
}
