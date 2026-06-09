"use client";

import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Trophy, Medal, Loader2, RotateCcw } from "lucide-react";

interface LeaderboardModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: string | null;
}

export default function LeaderboardModal({ isOpen, onClose, currentUser }: LeaderboardModalProps) {
  const [activeTab, setActiveTab] = useState<"daily" | "overall">("daily");
  const [dailyData, setDailyData] = useState<any[]>([]);
  const [overallData, setOverallData] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const fetchLeaderboard = async (tab: "daily" | "overall") => {
    setIsLoading(true);
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
      console.error("Failed to fetch leaderboard", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchLeaderboard(activeTab);
    }
  }, [isOpen, activeTab]);

  const renderRankIcon = (index: number) => {
    if (index === 0) return <Medal className="w-5 h-5 text-yellow-500" />;
    if (index === 1) return <Medal className="w-5 h-5 text-slate-400" />;
    if (index === 2) return <Medal className="w-5 h-5 text-amber-700" />;
    return <span className="font-bold text-slate-400 w-5 text-center">{index + 1}</span>;
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4 sm:px-0">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="relative w-full max-w-md max-h-[85vh] flex flex-col bg-white dark:bg-zinc-900 rounded-2xl shadow-xl border border-slate-200 dark:border-zinc-800 overflow-hidden"
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-zinc-800 shrink-0">
              <div className="flex items-center gap-2">
                <Trophy className="w-5 h-5 text-yellow-500" />
                <h2 className="text-lg font-bold text-slate-900 dark:text-white">리더보드 (Top 10)</h2>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => fetchLeaderboard(activeTab)}
                  disabled={isLoading}
                  className="p-1.5 rounded-full hover:bg-slate-100 dark:hover:bg-zinc-800 text-slate-500 transition-colors disabled:opacity-50"
                  title="새로고침"
                >
                  <RotateCcw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
                </button>
                <button
                  onClick={onClose}
                  className="p-1.5 rounded-full hover:bg-slate-100 dark:hover:bg-zinc-800 text-slate-500 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
            
            <div className="flex border-b border-slate-100 dark:border-zinc-800 shrink-0">
              <button
                onClick={() => setActiveTab("daily")}
                className={`flex-1 py-3 text-sm font-bold transition-colors ${
                  activeTab === "daily" 
                    ? "text-[var(--apple-blue)] border-b-2 border-[var(--apple-blue)] bg-blue-50/50 dark:bg-blue-900/10" 
                    : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                }`}
              >
                이번 회차 (적은 시도순)
              </button>
              <button
                onClick={() => setActiveTab("overall")}
                className={`flex-1 py-3 text-sm font-bold transition-colors ${
                  activeTab === "overall" 
                    ? "text-[var(--apple-blue)] border-b-2 border-[var(--apple-blue)] bg-blue-50/50 dark:bg-blue-900/10" 
                    : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                }`}
              >
                전체 회차 (누적 정답순)
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-2 bg-slate-50 dark:bg-black">
              {isLoading ? (
                <div className="flex items-center justify-center py-20">
                  <Loader2 className="w-8 h-8 animate-spin text-[var(--apple-blue)]" />
                </div>
              ) : activeTab === "daily" ? (
                <div className="flex flex-col gap-1.5">
                  {dailyData.length === 0 && (
                    <div className="py-10 text-center text-slate-500 text-sm">아직 정답자가 없습니다!</div>
                  )}
                  {dailyData.map((user, idx) => (
                    <div 
                      key={idx} 
                      className={`flex items-center justify-between p-3 rounded-xl bg-white dark:bg-zinc-900 border ${
                        user.nickname === currentUser 
                          ? "border-[var(--apple-blue)]/50 shadow-[0_0_10px_rgba(0,122,255,0.1)]" 
                          : "border-slate-100 dark:border-zinc-800 shadow-sm"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        {renderRankIcon(idx)}
                        <span className="font-semibold text-slate-800 dark:text-slate-200">{user.nickname}</span>
                      </div>
                      <span className="font-mono font-bold text-[var(--apple-blue)]">{user.attempts}회</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col gap-1.5">
                  {overallData.length === 0 && (
                    <div className="py-10 text-center text-slate-500 text-sm">아직 기록이 없습니다.</div>
                  )}
                  {overallData.map((user, idx) => (
                    <div 
                      key={idx} 
                      className={`flex items-center justify-between p-3 rounded-xl bg-white dark:bg-zinc-900 border ${
                        user.nickname === currentUser 
                          ? "border-[var(--apple-blue)]/50 shadow-[0_0_10px_rgba(0,122,255,0.1)]" 
                          : "border-slate-100 dark:border-zinc-800 shadow-sm"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        {renderRankIcon(idx)}
                        <div className="flex flex-col">
                          <span className="font-semibold text-slate-800 dark:text-slate-200">{user.nickname}</span>
                          <span className="text-[10px] text-slate-400">총 시도: {user.total_attempts_played}회</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 bg-yellow-100 dark:bg-yellow-900/30 px-2 py-1 rounded-md">
                        <Trophy className="w-3.5 h-3.5 text-yellow-600 dark:text-yellow-500" />
                        <span className="font-mono font-bold text-yellow-700 dark:text-yellow-400">{user.total_wins}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
