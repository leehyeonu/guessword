"use client";

import { motion, AnimatePresence } from "framer-motion";
import { Bell, ArrowRight, Sparkles } from "lucide-react";

interface RoundChangedModalProps {
  isOpen: boolean;
  prevRound: number;
  prevWord: string;
  newRound: number;
  onAccept: () => void;
}

export default function RoundChangedModal({
  isOpen,
  prevRound,
  prevWord,
  newRound,
  onAccept,
}: RoundChangedModalProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* 배경 어둡게 처리 & 블러 */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/65 backdrop-blur-md"
          />

          {/* 모달 본문 */}
          <motion.div
            initial={{ scale: 0.95, opacity: 0, y: 15 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0, y: 15 }}
            transition={{ type: "spring", duration: 0.4 }}
            className="liquid-glass w-[94%] max-w-md h-auto rounded-2xl p-6 sm:p-7 relative text-slate-900 dark:text-white z-10 border border-slate-200/50 dark:border-white/10 shadow-2xl"
          >
            {/* 상단 알림 아이콘 */}
            <div className="flex items-center gap-3 mb-5">
              <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-500 border-none shrink-0 flex items-center justify-center">
                <Bell className="w-5 h-5 animate-bounce" />
              </div>
              <div>
                <span className="text-[10px] text-amber-500 dark:text-amber-400 font-bold uppercase tracking-wider block">Real-time Update</span>
                <h2 className="text-base sm:text-lg font-extrabold tracking-normal text-slate-900 dark:text-white leading-tight">
                  라운드 자동 종료 안내 🏁
                </h2>
              </div>
            </div>

            {/* 설명 영역 */}
            <div className="space-y-4 my-4 text-xs sm:text-sm leading-relaxed text-slate-600 dark:text-slate-350">
              <p className="font-semibold text-slate-800 dark:text-slate-200">
                다른 플레이어가 방금 정답을 맞추었습니다! 🎉
              </p>

              <div className="p-4 rounded-xl bg-[rgba(120,120,128,0.06)] dark:bg-[rgba(120,120,128,0.12)] border border-slate-250/30 dark:border-zinc-800 space-y-2.5">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-500">이전 #{prevRound}회차 정답</span>
                  <span className="font-bold text-slate-900 dark:text-white font-mono bg-[var(--apple-blue)]/10 text-[var(--apple-blue)] px-2 py-0.5 rounded">
                    {prevWord}
                  </span>
                </div>
                
                <div className="h-px bg-slate-200 dark:bg-zinc-800" />
                
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-500">새롭게 시작되는 회차</span>
                  <span className="font-bold text-slate-950 dark:text-slate-100 flex items-center gap-1">
                    <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                    #{newRound}회차 단어
                  </span>
                </div>
              </div>

              <p className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 leading-normal">
                💡 진행 중이던 시도 내역(히스토리)은 안전하게 백업되어 하단의 <strong>'이전 시도 기록'</strong> 목록에서 언제든지 확인할 수 있습니다.
              </p>
            </div>

            {/* 확인 버튼 */}
            <div className="mt-6 flex justify-end">
              <button
                onClick={onAccept}
                className="w-full sm:w-auto px-6 py-3 rounded-xl text-xs sm:text-sm font-bold bg-gradient-to-r from-[var(--apple-blue)] to-indigo-600 hover:from-[var(--apple-blue-hover)] hover:to-indigo-700 text-white cursor-pointer active:scale-97 transition-all duration-150 flex items-center justify-center gap-2 border-none shadow-md shadow-blue-500/10 dark:shadow-none"
              >
                <span>새 회차 도전하기</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
