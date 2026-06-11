"use client";

import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, AlertTriangle, Trash2 } from "lucide-react";

interface DeleteAccountModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: string;
  onConfirm: () => Promise<void>;
}

export default function DeleteAccountModal({ isOpen, onClose, currentUser, onConfirm }: DeleteAccountModalProps) {
  const [inputValue, setInputValue] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  // 모달 마운트/오픈 시 입력 폼 초기화
  useEffect(() => {
    if (isOpen) {
      setInputValue("");
      setErrorMsg("");
      setIsSubmitting(false);
    }
  }, [isOpen]);

  // 닉네임 일치 검증 및 회원탈퇴 API 콜백 트리거
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (inputValue !== currentUser) {
      setErrorMsg("닉네임이 일치하지 않습니다.");
      return;
    }
    
    setIsSubmitting(true);
    setErrorMsg("");
    try {
      await onConfirm();
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || "탈퇴 처리 중 오류가 발생했습니다.");
      setIsSubmitting(false);
    }
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
            className="relative w-full max-w-md bg-white dark:bg-zinc-900 rounded-2xl shadow-xl border border-slate-200 dark:border-zinc-800 overflow-hidden"
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-zinc-800">
              <div className="flex items-center gap-2 text-red-500">
                <AlertTriangle className="w-5 h-5" />
                <h2 className="text-lg font-bold">회원 탈퇴</h2>
              </div>
              <button
                onClick={onClose}
                disabled={isSubmitting}
                className="p-1.5 rounded-full hover:bg-slate-100 dark:hover:bg-zinc-800 text-slate-500 transition-colors disabled:opacity-50"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <form onSubmit={handleSubmit} className="p-5">
              <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/30 p-4 rounded-xl mb-4 text-xs sm:text-sm text-red-800 dark:text-red-300 space-y-2 leading-relaxed">
                <p className="font-bold">⚠️ 회원 탈퇴 시 아래의 처리가 실행되며 취소할 수 없습니다:</p>
                <ul className="list-disc list-inside space-y-1">
                  <li>사용자 계정 정보가 <span className="font-semibold text-red-600 dark:text-red-400">물리적으로 완전히 삭제</span>됩니다.</li>
                  <li>모든 게임 시도 기록 및 클리어 내역의 닉네임이 <span className="font-semibold text-red-600 dark:text-red-400">"탈퇴한 사용자"로 익명화</span> 처리되어 본인과 연동이 완전히 해제됩니다.</li>
                  <li>기록은 리더보드 순위 보존을 위해 남지만, 누구의 기록인지 역추적하는 것은 불가능해집니다.</li>
                </ul>
              </div>

              <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
                승인하려면 아래 입력창에 본인의 닉네임 <span className="font-bold text-slate-900 dark:text-white">"{currentUser}"</span>을(를) 정확하게 입력해주세요.
              </p>
              
              <input
                type="text"
                value={inputValue}
                onChange={(e) => {
                  setInputValue(e.target.value);
                  if (errorMsg) setErrorMsg("");
                }}
                disabled={isSubmitting}
                placeholder="본인의 닉네임 입력"
                className="w-full px-4 py-3 rounded-xl bg-slate-100 dark:bg-zinc-800 border-none outline-none text-slate-900 dark:text-white mb-2 focus:ring-2 focus:ring-red-500 transition-shadow disabled:opacity-60"
              />
              
              {errorMsg && (
                <p className="text-xs font-semibold text-red-500 mb-4 ml-1">{errorMsg}</p>
              )}
              
              <div className="flex justify-end gap-2 mt-4">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={isSubmitting}
                  className="px-4 py-2 rounded-lg font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors disabled:opacity-50"
                >
                  취소
                </button>
                {/* 이중 보안 장치: 입력값과 현재 로그인 유저명이 완전 일치해야만 최종 버튼이 활성화됨 */}
                <button
                  type="submit"
                  disabled={inputValue !== currentUser || isSubmitting}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg font-semibold bg-red-600 hover:bg-red-700 text-white disabled:opacity-40 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                  {isSubmitting ? "탈퇴 처리 중..." : "탈퇴 확정"}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
