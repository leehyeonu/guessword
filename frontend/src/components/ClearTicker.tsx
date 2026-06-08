"use client";

import React, { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Award, Zap } from "lucide-react";

interface ClearItem {
  id: string;
  gameId: string;
  attempts: number;
  timestamp: Date;
  nickname: string;
}

interface ClearTickerProps {
  userNickname?: string;
}

interface GameStatsApiResponse {
  recent_clears?: Array<{
    id: string;
    gameId?: string;
    attempts?: number;
    timestamp?: string;
    nickname?: string;
  }>;
}

const getApiUrl = () => {
  const rawApiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
  return rawApiUrl.replace(/\/$/, "");
};

export default function ClearTicker({ userNickname }: ClearTickerProps) {
  const [clears, setClears] = useState<ClearItem[]>([]);
  const [errorMsg, setErrorMsg] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    let statsTimer: ReturnType<typeof setInterval> | null = null;

    const loadClears = async () => {
      try {
        const response = await fetch(`${getApiUrl()}/api/game_stats?limit=5`);
        if (!response.ok) {
          throw new Error("Game stats fetch failed");
        }
        const data = await response.json() as GameStatsApiResponse;
        const loadedClears = (data.recent_clears || []).map((clear) => ({
          id: clear.id,
          gameId: clear.gameId || "",
          attempts: clear.attempts || 0,
          timestamp: clear.timestamp ? new Date(clear.timestamp) : new Date(),
          nickname: clear.nickname || "누군가",
        }));

        if (isMounted) {
          setClears(loadedClears);
          setErrorMsg("");
          setIsLoading(false);
        }
      } catch (error) {
        console.error("클리어 현황 로드 실패:", error);
        if (isMounted) {
          setErrorMsg("기록을 읽을 수 없습니다. 백엔드 API와 Firebase Admin 설정을 확인해 주세요.");
          setIsLoading(false);
        }
      }
    };

    loadClears();
    statsTimer = setInterval(loadClears, 10000);

    return () => {
      isMounted = false;
      if (statsTimer) {
        clearInterval(statsTimer);
      }
    };
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

  return (
    <div className="liquid-glass w-full rounded-2xl p-5 overflow-hidden text-slate-900 dark:text-white">
      <div className="flex items-center justify-between border-b border-slate-200 dark:border-zinc-800 pb-2.5 mb-3">
        <div className="flex items-center gap-1.5 text-[var(--apple-blue)]">
          <Award className="w-4 h-4 text-[var(--apple-blue)] animate-pulse" />
          <h4 className="text-xs font-bold uppercase tracking-normal text-slate-800 dark:text-slate-200">실시간 클리어 현황</h4>
        </div>
      </div>

      <div className="space-y-2.5 max-h-[160px] overflow-y-auto pr-1">
        {isLoading ? (
          <div className="text-center text-xs text-slate-500 py-6">
            데이터베이스 연결 중...
          </div>
        ) : errorMsg ? (
          <div className="text-center text-xs text-red-500 bg-red-500/10 border border-red-500/15 p-4 rounded-xl leading-relaxed">
            {errorMsg}
          </div>
        ) : clears.length > 0 ? (
          <AnimatePresence initial={false}>
            {clears.map((clear) => {
              const isMe = clear.nickname === userNickname;
              return (
                <motion.div
                  key={clear.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className={`flex items-center justify-between text-[11px] sm:text-xs p-2 sm:p-2.5 rounded-lg border-none transition-all ${
                    isMe
                      ? "bg-blue-500/10 dark:bg-blue-500/20 ring-1.5 ring-blue-500/20 font-bold"
                      : "bg-[var(--apple-gray-btn)]"
                  }`}
                >
                  <div className="flex items-center gap-1.5 min-w-0">
                    <Zap className="w-3.5 h-3.5 text-[var(--apple-blue)] shrink-0" />
                    <span className="font-semibold text-slate-700 dark:text-slate-300 truncate">
                      <span className="text-slate-900 dark:text-white font-bold">
                        {clear.nickname}
                        {isMe && <span className="text-[9px] sm:text-[10px] text-[var(--apple-blue)] font-bold ml-1">(나)</span>}
                      </span>님이 <span className="text-[var(--apple-blue)] font-bold">정답</span>을 맞췄습니다!
                    </span>
                  </div>
                  
                  <div className="flex items-center gap-1.5 shrink-0 ml-1">
                    <span className="text-[9px] sm:text-[10px] text-[var(--apple-blue)] font-mono bg-blue-500/10 px-1.5 py-0.5 rounded-md font-bold">
                      {clear.attempts}회
                    </span>
                    <span className="text-[8px] sm:text-[9px] text-slate-500 dark:text-slate-400 min-w-[34px] text-right">
                      {formatTimeAgo(clear.timestamp)}
                    </span>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        ) : (
          <div className="text-center text-xs text-slate-500 py-6 leading-relaxed">
            아직 등록된 기록이 없습니다. <br />
            첫 번째 클리어의 주인공이 되어 보세요!
          </div>
        )}
      </div>
    </div>
  );
}
