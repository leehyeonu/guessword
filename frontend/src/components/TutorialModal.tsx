"use client";

import { motion, AnimatePresence } from "framer-motion";
import { BookOpen, CalendarClock, Check, Flame, HelpCircle, Target, UserPlus } from "lucide-react";

interface TutorialModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function TutorialModal({ isOpen, onClose }: TutorialModalProps) {
  const handleClose = () => {
    localStorage.setItem("malmatch_tutorial_seen", "true");
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
            initial={{ scale: 0.95, opacity: 0, y: 10 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0, y: 10 }}
            transition={{ type: "spring", duration: 0.4 }}
            className="liquid-glass w-[94%] max-w-md h-auto max-h-[85vh] overflow-y-auto rounded-2xl p-5 sm:p-7 relative text-slate-900 dark:text-white z-10"
          >
            {/* 모달 헤더 */}
            <div className="flex items-center gap-2.5 mb-4 sm:mb-5">
              <div className="p-2 rounded-lg bg-[var(--apple-gray-btn)] text-[var(--apple-blue)] border-none">
                <BookOpen className="w-5 h-5" />
              </div>
              <h2 className="text-base sm:text-lg font-bold tracking-normal text-slate-900 dark:text-white">
                말맞춤 플레이 가이드 🎮
              </h2>
            </div>

            {/* 게임 방법 가이드 */}
            <div className="space-y-3 sm:space-y-4 my-3 sm:my-4 text-xs sm:text-sm leading-relaxed text-slate-600 dark:text-slate-300">
              <div className="flex items-start gap-3 p-3 rounded-xl bg-[rgba(120,120,128,0.06)] dark:bg-[rgba(120,120,128,0.12)]">
                <div className="p-1.5 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400 shrink-0">
                  <Target className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="font-bold text-slate-900 dark:text-white text-xs sm:text-sm mb-0.5">1. 정답 단어 맞추기</h4>
                  <p className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400">
                    비밀 정답 단어를 유추해내는 게임입니다.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3 p-3 rounded-xl bg-[rgba(120,120,128,0.06)] dark:bg-[rgba(120,120,128,0.12)]">
                <div className="p-1.5 rounded-lg bg-pink-500/10 text-pink-600 dark:text-pink-400 shrink-0">
                  <HelpCircle className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="font-bold text-slate-900 dark:text-white text-xs sm:text-sm mb-0.5">2. 유사도 분석</h4>
                  <p className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400">
                    단어를 입력하면 정답과 얼마나 비슷한 맥락에서 자주 쓰이는지 유사도 점수(0~100점)로 변환해 알려줍니다.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3 p-3 rounded-xl bg-[rgba(120,120,128,0.06)] dark:bg-[rgba(120,120,128,0.12)]">
                <div className="p-1.5 rounded-lg bg-orange-500/10 text-orange-600 dark:text-orange-450 shrink-0">
                  <Flame className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="font-bold text-slate-900 dark:text-white text-xs sm:text-sm mb-0.5">3. 붉은 빛이 들어오면 찬스!</h4>
                  <p className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400">
                    정답과 가까운 단어일수록 점수가 올라갑니다. 상위 1,000개 유사어에 들면 50점 이상, 75점 이상이면 매우 근접한 단서입니다.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3 p-3 rounded-xl bg-[rgba(120,120,128,0.06)] dark:bg-[rgba(120,120,128,0.12)]">
                <div className="p-1.5 rounded-lg bg-violet-500/10 text-violet-600 dark:text-violet-400 shrink-0">
                  <CalendarClock className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="font-bold text-slate-900 dark:text-white text-xs sm:text-sm mb-0.5">4. 매일 새로운 단어</h4>
                  <p className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400">
                    정답 단어는 매일 자정(KST)에 자동으로 바뀝니다. 매일 새로운 도전에 참여하고, 적은 시도로 맞출수록 리더보드에서 높은 순위를 차지할 수 있습니다.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3 p-3 rounded-xl bg-[rgba(120,120,128,0.06)] dark:bg-[rgba(120,120,128,0.12)]">
                <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 shrink-0">
                  <UserPlus className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="font-bold text-slate-900 dark:text-white text-xs sm:text-sm mb-0.5">5. 계정 없이도 OK</h4>
                  <p className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400">
                    로그인 없이 바로 플레이할 수 있습니다. 나중에 회원가입하면 익명 시절의 기록도 자동으로 계정에 연동됩니다.
                  </p>
                </div>
              </div>
            </div>

            <div className="mt-6 flex justify-center">
              <a
                href="https://instagram.com/0x.hw_81"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 rounded-full border border-[var(--apple-blue)] bg-[var(--apple-blue)]/10 px-4 py-2 text-[11px] sm:text-xs font-semibold text-[var(--apple-blue)] transition hover:bg-[var(--apple-blue)]/20"
              >
                <svg
                  aria-hidden="true"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="w-4 h-4"
                >
                  <rect x="2.5" y="2.5" width="19" height="19" rx="5" />
                  <path d="M16 11.37a4 4 0 1 1-7.99.001A4 4 0 0 1 16 11.37z" />
                  <path d="M17.5 6.5h.01" />
                </svg>
                @0x.hw_81
              </a>
            </div>

            {/* 확인 버튼 */}
            <div className="mt-5 sm:mt-6 flex justify-end">
              <button
                onClick={handleClose}
                className="px-5 py-2.5 rounded-lg text-xs font-semibold bg-[var(--apple-blue)] hover:bg-[var(--apple-blue-hover)] text-white cursor-pointer active:scale-95 transition-all duration-150 flex items-center gap-1.5 border-none shadow-sm"
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
