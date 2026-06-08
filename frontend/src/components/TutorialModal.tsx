"use client";

import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { BookOpen, Check, HelpCircle, Flame, Target } from "lucide-react";

interface TutorialModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function TutorialModal({ isOpen, onClose }: TutorialModalProps) {
  const handleClose = () => {
    localStorage.setItem("guessword_tutorial_seen", "true");
    onClose();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* 배경 블러 어둡게 처리 */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={handleClose}
            className="absolute inset-0 bg-black/60 backdrop-blur-md"
          />

          {/* 모달 본문 */}
          <motion.div
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 20 }}
            transition={{ type: "spring", duration: 0.5 }}
            className="liquid-glass w-[94%] max-w-md h-auto max-h-[85vh] overflow-y-auto rounded-3xl p-5 sm:p-7 relative text-slate-800 dark:text-slate-100 z-10"
          >
            {/* 내부 장식 광원 효과 (스크롤 영역 팽창 방지를 위해 overflow-hidden 컨테이너로 감싸기) */}
            <div className="absolute inset-0 overflow-hidden rounded-3xl pointer-events-none">
              <div className="absolute -top-20 -right-20 w-44 h-44 rounded-full bg-violet-600/20 blur-3xl" />
              <div className="absolute -bottom-20 -left-20 w-44 h-44 rounded-full bg-pink-600/20 blur-3xl" />
            </div>

            {/* 모달 헤더 (텍스트 투명 에러 방지를 위해 플랫 텍스트로 보정) */}
            <div className="flex items-center gap-2.5 mb-4 sm:mb-5">
              <div className="p-2 rounded-xl bg-slate-200/50 dark:bg-white/5 border border-slate-300/10 dark:border-white/10 text-violet-600 dark:text-violet-400">
                <BookOpen className="w-5 h-5" />
              </div>
              <h2 className="text-base sm:text-lg md:text-xl font-bold tracking-tight text-slate-800 dark:text-slate-100">
                GuessKorean 플레이 가이드 🎮
              </h2>
            </div>

            {/* 게임 방법 가이드 */}
            <div className="space-y-3 sm:space-y-4 my-3 sm:my-4 text-xs sm:text-sm leading-relaxed text-slate-700 dark:text-slate-300">
              <div className="flex items-start gap-3 p-3 rounded-2xl bg-white/5 border border-white/5">
                <div className="p-1.5 rounded-lg bg-violet-500/10 text-violet-400 shrink-0">
                  <Target className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="font-semibold text-slate-800 dark:text-slate-100 text-xs sm:text-sm mb-0.5">1. 정답 단어 맞추기</h4>
                  <p className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400">
                    비밀 정답 단어를 유추해내는 게임입니다.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3 p-3 rounded-2xl bg-white/5 border border-white/5">
                <div className="p-1.5 rounded-lg bg-pink-500/10 text-pink-400 shrink-0">
                  <HelpCircle className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="font-semibold text-slate-800 dark:text-slate-100 text-xs sm:text-sm mb-0.5">2. 유사도 분석</h4>
                  <p className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400">
                    단어를 입력하면 정답과 얼마나 비슷한 맥락에서 자주 쓰이는지 유사도 점수(0~100점)로 변환해 알려줍니다.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3 p-3 rounded-2xl bg-white/5 border border-white/5">
                <div className="p-1.5 rounded-lg bg-amber-500/10 text-amber-400 shrink-0">
                  <Flame className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="font-semibold text-slate-800 dark:text-slate-100 text-xs sm:text-sm mb-0.5">3. 붉은 빛이 들어오면 찬스!</h4>
                  <p className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400">
                    정답과 밀접한 상위 1,000위 단어에 진입하는 순간 점수가 50점 위로 도약하고, 카드 뒤에서 붉은빛 오우라가 나옵니다.
                  </p>
                </div>
              </div>
            </div>

            {/* 확인 버튼 */}
            <div className="mt-5 sm:mt-6 flex justify-end">
              <button
                onClick={handleClose}
                className="liquid-glass liquid-glass-interactive px-5 py-2 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-200 hover:text-slate-900 dark:hover:text-white flex items-center gap-1.5 cursor-pointer shadow-lg active:scale-95"
              >
                <Check className="w-3.5 h-3.5" />
                준비 완료, 게임 시작!
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
