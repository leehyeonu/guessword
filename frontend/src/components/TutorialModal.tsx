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
          {/* 글래스 오버레이 배경 */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={handleClose}
            className="absolute inset-0 bg-black/60 backdrop-blur-md"
          />

          {/* 모달 컨테이너 */}
          <motion.div
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 20 }}
            transition={{ type: "spring", duration: 0.5 }}
             className="liquid-glass w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-3xl p-5 sm:p-6 md:p-8 relative text-slate-100 z-10"
          >
            {/* 모달 내부의 은은한 배경 광원 */}
            <div className="absolute -top-20 -right-20 w-44 h-44 rounded-full bg-violet-600/20 blur-3xl pointer-events-none" />
            <div className="absolute -bottom-20 -left-20 w-44 h-44 rounded-full bg-pink-600/20 blur-3xl pointer-events-none" />

            {/* 헤더 */}
            <div className="flex items-center gap-3 mb-4 sm:mb-6">
              <div className="p-2 sm:p-2.5 rounded-2xl bg-white/5 border border-white/10 text-violet-400">
                <BookOpen className="w-5 h-5 sm:w-6 sm:h-6" />
              </div>
              <h2 className="text-lg sm:text-xl md:text-2xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-slate-100 to-slate-400">
                단어 의미 추정 게임 설명서
              </h2>
            </div>

            {/* 튜토리얼 규칙 목록 */}
            <div className="space-y-4 sm:space-y-5 my-4 sm:my-6 text-xs sm:text-sm md:text-base leading-relaxed text-slate-300">
              <div className="flex items-start gap-4 p-3 rounded-2xl bg-white/5 border border-white/5">
                <div className="p-2 rounded-xl bg-violet-500/10 text-violet-400 shrink-0">
                  <Target className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="font-semibold text-slate-100 mb-0.5">정답 단어 추측</h4>
                  <p className="text-xs md:text-sm text-slate-400">
                    인공지능 모델이 알고 있는 단어 중 무작위로 설정된 정답 단어를 찾아내는 게임입니다.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-4 p-3 rounded-2xl bg-white/5 border border-white/5">
                <div className="p-2 rounded-xl bg-pink-500/10 text-pink-400 shrink-0">
                  <HelpCircle className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="font-semibold text-slate-100 mb-0.5">의미론적 유사도 계산</h4>
                  <p className="text-xs md:text-sm text-slate-400">
                    입력하신 단어와 정답 단어 사이의 코사인 유사도를 연산하여, 단어가 얼마나 "비슷한 문맥에서 쓰이는지" 점수로 환산합니다.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-4 p-3 rounded-2xl bg-white/5 border border-white/5">
                <div className="p-2 rounded-xl bg-amber-500/10 text-amber-400 shrink-0">
                  <Flame className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="font-semibold text-slate-100 mb-0.5">점수 보정 (Thermochromic Score)</h4>
                  <p className="text-xs md:text-sm text-slate-400">
                    상위 1000위 단어에 진입하면 50~100점의 뜨거운 점수가 주어지며, 정답에 가까워질수록 글래스 카드 뒷면에서 강렬한 붉은 광원 효과가 피어오릅니다!
                  </p>
                </div>
              </div>
            </div>

            {/* 닫기 버튼 */}
            <div className="mt-8 flex justify-end">
              <button
                onClick={handleClose}
                className="liquid-glass liquid-glass-interactive px-6 py-2.5 rounded-2xl font-semibold text-slate-200 hover:text-white flex items-center gap-2 cursor-pointer shadow-lg active:scale-95"
              >
                <Check className="w-4 h-4" />
                알겠습니다, 게임 시작!
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
