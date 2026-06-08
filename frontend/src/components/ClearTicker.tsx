"use client";

import React, { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { db } from "@/lib/firebase";
import { collection, query, orderBy, limit, onSnapshot } from "firebase/firestore";
import { Award, Zap } from "lucide-react";

interface ClearItem {
  id: string;
  gameId: string;
  attempts: number;
  timestamp: Date;
}

export default function ClearTicker() {
  const [clears, setClears] = useState<ClearItem[]>([]);
  const [errorMsg, setErrorMsg] = useState("");
  const [isLoading, setIsLoading] = useState(true);

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
              gameId: data.gameId || "",
              attempts: data.attempts || 0,
              timestamp: data.timestamp?.toDate() || new Date(),
            });
          });

          setClears(loadedClears);
          setErrorMsg("");
          setIsLoading(false);
        },
        (error) => {
          console.error("Firestore 리스너 에러:", error);
          setErrorMsg("데이터베이스에서 기록을 읽을 수 없습니다. 환경변수(.env.local) 설정이나 보안 규칙을 확인해 주세요.");
          setIsLoading(false);
        }
      );
    } catch (err: any) {
      console.error("Firestore 구독 예외 발생:", err);
      setErrorMsg("Firebase DB 초기화 실패. 환경 설정을 점검해 주세요.");
      setIsLoading(false);
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
      </div>

      <div className="space-y-2.5 max-h-[160px] overflow-y-auto pr-1">
        {isLoading ? (
          <div className="text-center text-xs text-slate-500 py-6">
            데이터베이스 연결 중...
          </div>
        ) : errorMsg ? (
          <div className="text-center text-xs text-red-400 bg-red-950/20 border border-red-500/10 p-4 rounded-2xl leading-relaxed">
            {errorMsg}
          </div>
        ) : clears.length > 0 ? (
          <AnimatePresence initial={false}>
            {clears.map((clear) => (
              <motion.div
                key={clear.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="flex items-center justify-between text-[11px] sm:text-xs p-2 sm:p-2.5 rounded-xl bg-white/5 border border-white/5"
              >
                <div className="flex items-center gap-1.5 min-w-0">
                  <Zap className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                  <span className="font-semibold text-slate-300 truncate">
                    누군가 <span className="text-indigo-400 font-bold">정답</span>을 맞췄습니다!
                  </span>
                </div>
                
                <div className="flex items-center gap-1.5 shrink-0 ml-1">
                  <span className="text-[9px] sm:text-[10px] text-slate-400 font-mono bg-indigo-500/10 px-1.5 py-0.5 rounded-md text-indigo-300 font-bold">
                    {clear.attempts}회
                  </span>
                  <span className="text-[8px] sm:text-[9px] text-slate-500 min-w-[34px] text-right">
                    {formatTimeAgo(clear.timestamp)}
                  </span>
                </div>
              </motion.div>
            ))}
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

