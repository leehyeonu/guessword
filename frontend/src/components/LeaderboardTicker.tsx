"use client";

import React, { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Trophy, Medal, RotateCw } from "lucide-react";

interface LeaderboardTickerProps {
  currentUser: string | null;
}

export default function LeaderboardTicker({ currentUser }: LeaderboardTickerProps) {
  const [activeTab, setActiveTab] = useState<"daily" | "overall">("daily");
  const [dailyData, setDailyData] = useState<any[]>([]);
  const [overallData, setOverallData] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchLeaderboard = async (tab: "daily" | "overall", isManualRefresh = false) => {
    if (isManualRefresh) setIsRefreshing(true);
    else setIsLoading(true);

    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || ""}/api/leaderboard/${tab}`, {
        cache: "no-store",
        headers: { "Cache-Control": "no-cache" }
      });
      const data = await res.json();
      if (tab === "daily") {
        setDailyData(data.leaderboard || []);
      } else {
        setOverallData(data.leaderboard || []);
      }
    } catch (err) {
      console.error(`Failed to fetch ${tab} leaderboard`, err);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    fetchLeaderboard(activeTab);
  }, [activeTab]);

  const renderRankIcon = (index: number) => {
    if (index === 0) return <Medal className="w-5 h-5 text-yellow-500" />;
    if (index === 1) return <Medal className="w-5 h-5 text-slate-400" />;
    if (index === 2) return <Medal className="w-5 h-5 text-amber-700" />;
    return <span className="font-bold text-slate-400 w-5 text-center">{index + 1}</span>;
  };

  return (
    <div className="liquid-glass w-full rounded-2xl p-5 overflow-hidden text-slate-900 dark:text-white mt-4">
      <div className="flex items-center justify-between border-b border-slate-200 dark:border-zinc-800 pb-2.5 mb-3">
        <div className="flex items-center gap-1.5 text-yellow-500">
          <Trophy className="w-4 h-4 text-yellow-500" />
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200">명예의 전당</h4>
        </div>
        <button
          onClick={() => fetchLeaderboard(activeTab, true)}
          disabled={isRefreshing || isLoading}
          className="p-1.5 rounded-lg hover:bg-slate-200 dark:hover:bg-zinc-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          title="새로고침"
        >
          <RotateCw className={`w-4 h-4 text-yellow-500 ${isRefreshing ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <div className="flex border-b border-slate-200/50 dark:border-zinc-800 mb-3 shrink-0">
        <button
          onClick={() => setActiveTab("daily")}
          className={`flex-1 py-1.5 text-[11px] font-bold transition-colors ${
            activeTab === "daily" 
              ? "text-yellow-600 dark:text-yellow-500 border-b-2 border-yellow-500 bg-yellow-50/50 dark:bg-yellow-900/10" 
              : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
          }`}
        >
          오늘 (적은 시도순)
        </button>
        <button
          onClick={() => setActiveTab("overall")}
          className={`flex-1 py-1.5 text-[11px] font-bold transition-colors ${
            activeTab === "overall" 
              ? "text-yellow-600 dark:text-yellow-500 border-b-2 border-yellow-500 bg-yellow-50/50 dark:bg-yellow-900/10" 
              : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
          }`}
        >
          전체 (누적 정답순)
        </button>
      </div>

      <div className="space-y-1.5 max-h-[250px] overflow-y-auto pr-1">
        {isLoading ? (
          <div className="text-center text-xs text-slate-500 py-6">
            명예의 전당 기록을 불러오는 중...
          </div>
        ) : activeTab === "daily" ? (
          dailyData.length > 0 ? (
            <AnimatePresence initial={false}>
              {dailyData.map((user, idx) => {
                const isMe = user.nickname === currentUser;
                return (
                  <motion.div
                    key={idx}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    className={`flex items-center justify-between text-[11px] sm:text-xs p-2 sm:p-2.5 rounded-lg border-none transition-all ${
                      isMe
                        ? "bg-yellow-500/10 dark:bg-yellow-500/15 ring-1 ring-yellow-500/20 font-bold"
                        : "bg-[var(--apple-gray-btn)]"
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      {renderRankIcon(idx)}
                      <span className="font-semibold text-slate-900 dark:text-white truncate">
                        {user.nickname}
                        {isMe && <span className="text-[9px] sm:text-[10px] text-yellow-600 dark:text-yellow-500 font-bold ml-1">(나)</span>}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0 ml-1">
                      <span className={`text-[9px] sm:text-[10px] font-mono px-1.5 py-0.5 rounded-md font-bold ${
                        isMe ? 'text-yellow-600 dark:text-yellow-400 bg-yellow-500/10' : 'text-[var(--apple-blue)] bg-blue-500/10'
                      }`}>
                        {user.attempts}회
                      </span>
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          ) : (
            <div className="text-center text-xs text-slate-500 py-6 leading-relaxed">
              오늘 아직 정답을 맞힌 사람이 없습니다. <br />
              첫 번째 주인공이 되어보세요!
            </div>
          )
        ) : (
          overallData.length > 0 ? (
            <AnimatePresence initial={false}>
              {overallData.map((user, idx) => {
                const isMe = user.nickname === currentUser;
                return (
                  <motion.div
                    key={idx}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    className={`flex items-center justify-between text-[11px] sm:text-xs p-2 sm:p-2.5 rounded-lg border-none transition-all ${
                      isMe
                        ? "bg-yellow-500/10 dark:bg-yellow-500/15 ring-1 ring-yellow-500/20 font-bold"
                        : "bg-[var(--apple-gray-btn)]"
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      {renderRankIcon(idx)}
                      <div className="flex flex-col">
                        <span className="font-semibold text-slate-900 dark:text-white truncate">
                          {user.nickname}
                          {isMe && <span className="text-[9px] sm:text-[10px] text-yellow-600 dark:text-yellow-500 font-bold ml-1">(나)</span>}
                        </span>
                        <span className="text-[9px] text-slate-500 dark:text-slate-400">총 시도: {user.total_attempts_played}회</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 bg-yellow-100 dark:bg-yellow-900/30 px-2 py-1 rounded-md shrink-0 ml-1">
                      <Trophy className="w-3 h-3 text-yellow-600 dark:text-yellow-500" />
                      <span className="text-[10px] font-mono font-bold text-yellow-700 dark:text-yellow-400">
                        {user.total_wins}
                      </span>
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          ) : (
            <div className="text-center text-xs text-slate-500 py-6 leading-relaxed">
              아직 전체 기록이 없습니다.
            </div>
          )
        )}
      </div>
    </div>
  );
}
