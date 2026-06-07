"use client";

import React, { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { db } from "@/lib/firebase";
import { collection, query, orderBy, limit, onSnapshot } from "firebase/firestore";
import { Award, Zap } from "lucide-react";

interface ClearItem {
  id: string;
  word: string;
  attempts: number;
  timestamp: Date;
}

const OFFLINE_MOCK_CLEARS: ClearItem[] = [
  { id: "mock-1", word: "노트북", attempts: 14, timestamp: new Date(Date.now() - 500000) },
  { id: "mock-2", word: "강아지", attempts: 8, timestamp: new Date(Date.now() - 1500000) },
  { id: "mock-3", word: "바나나", attempts: 21, timestamp: new Date(Date.now() - 3600000) },
  { id: "mock-4", word: "자전거", attempts: 11, timestamp: new Date(Date.now() - 7200000) },
  { id: "mock-5", word: "여름", attempts: 5, timestamp: new Date(Date.now() - 10800000) },
];

export default function ClearTicker() {
  const [clears, setClears] = useState<ClearItem[]>([]);
  const [isOffline, setIsOffline] = useState(false);

  useEffect(() => {
    let unsubscribe = () => {};

    try {
      const q = query(
        collection(db, "clears"),
        orderBy("timestamp", "desc"),
        limit(5)
      );

      unsubscribe = onSnapshot(
        q,
        (snapshot) => {
          const loadedClears: ClearItem[] = [];
          snapshot.forEach((doc) => {
            const data = doc.data();
            loadedClears.push({
              id: doc.id,
              word: data.word || "비밀단어",
              attempts: data.attempts || 0,
              timestamp: data.timestamp?.toDate() || new Date(),
            });
          });

          if (loadedClears.length > 0) {
            setClears(loadedClears);
            setIsOffline(false);
          } else {
            setClears(OFFLINE_MOCK_CLEARS);
          }
        },
        (error) => {
          console.warn("Firestore listener failed. Switching to offline mockup:", error.message);
          setIsOffline(true);
          setClears(OFFLINE_MOCK_CLEARS);
        }
      );
    } catch (err) {
      console.warn("Firestore subscription caught exception:", err);
      setIsOffline(true);
      setClears(OFFLINE_MOCK_CLEARS);
    }

    return () => unsubscribe();
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
    <div className="liquid-glass w-full rounded-3xl p-5 overflow-hidden text-slate-200">
      <div className="flex items-center justify-between border-b border-white/5 pb-2.5 mb-3">
        <div className="flex items-center gap-1.5 text-indigo-400">
          <Award className="w-4 h-4 text-indigo-400 animate-pulse" />
          <h4 className="text-xs font-bold uppercase tracking-wider">실시간 클리어 현황</h4>
        </div>
        
        {isOffline && (
          <span className="text-[9px] px-1.5 py-0.5 rounded-md bg-white/5 text-slate-500 font-bold uppercase">
            오프라인 모드
          </span>
        )}
      </div>

      <div className="space-y-2.5 max-h-[160px] overflow-y-auto pr-1">
        <AnimatePresence initial={false}>
          {clears.map((clear) => (
            <motion.div
              key={clear.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="flex items-center justify-between text-xs p-2.5 rounded-xl bg-white/5 border border-white/5"
            >
              <div className="flex items-center gap-2">
                <Zap className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                <span className="font-semibold text-slate-300">
                  누군가 <span className="text-indigo-400 font-bold">'{clear.word}'</span>을(를) 맞췄습니다!
                </span>
              </div>
              
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-[10px] text-slate-400 font-mono bg-indigo-500/10 px-1.5 py-0.5 rounded-md text-indigo-300 font-bold">
                  {clear.attempts}회 시도
                </span>
                <span className="text-[9px] text-slate-500 min-w-[38px] text-right">
                  {formatTimeAgo(clear.timestamp)}
                </span>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}
