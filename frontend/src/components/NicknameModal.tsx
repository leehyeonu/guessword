"use client";

import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Check } from "lucide-react";

interface NicknameModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentNickname: string;
  onSave: (newNickname: string) => void;
}

export default function NicknameModal({ isOpen, onClose, currentNickname, onSave }: NicknameModalProps) {
  const [inputValue, setInputValue] = useState("");

  useEffect(() => {
    if (isOpen) {
      setInputValue(currentNickname);
    }
  }, [isOpen, currentNickname]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = inputValue.trim();
    if (trimmed && trimmed.length <= 15) {
      onSave(trimmed);
      onClose();
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
            className="relative w-full max-w-sm bg-white dark:bg-zinc-900 rounded-2xl shadow-xl border border-slate-200 dark:border-zinc-800 overflow-hidden"
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-zinc-800">
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">닉네임 변경</h2>
              <button
                onClick={onClose}
                className="p-1.5 rounded-full hover:bg-slate-100 dark:hover:bg-zinc-800 text-slate-500 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <form onSubmit={handleSubmit} className="p-5">
              <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
                랭킹 보드에 표시될 이름을 입력해주세요. (최대 15자)
              </p>
              
              <input
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder="새 닉네임 입력"
                maxLength={15}
                autoFocus
                className="w-full px-4 py-3 rounded-xl bg-slate-100 dark:bg-zinc-800 border-none outline-none text-slate-900 dark:text-white mb-5 focus:ring-2 focus:ring-[var(--apple-blue)] transition-shadow"
              />
              
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 rounded-lg font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors"
                >
                  취소
                </button>
                <button
                  type="submit"
                  disabled={!inputValue.trim()}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg font-semibold bg-[var(--apple-blue)] text-white hover:bg-[var(--apple-blue-hover)] disabled:opacity-50 transition-colors"
                >
                  <Check className="w-4 h-4" />
                  저장
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
