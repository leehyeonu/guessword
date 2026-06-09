"use client";

import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Check, Loader2 } from "lucide-react";

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (token: string, nickname: string) => void;
}

export default function AuthModal({ isOpen, onClose, onSuccess }: AuthModalProps) {
  const [isLoginTab, setIsLoginTab] = useState(true);
  const [nickname, setNickname] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nickname.trim() || !password.trim()) return;
    if (!isLoginTab && password.length < 4) {
      setErrorMsg("비밀번호는 최소 4자 이상이어야 합니다.");
      return;
    }

    setIsLoading(true);
    setErrorMsg("");

    try {
      const endpoint = isLoginTab ? "/api/auth/login" : "/api/auth/signup";
      const res = await fetch(process.env.NEXT_PUBLIC_API_URL + endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nickname: nickname.trim(), password })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || "오류가 발생했습니다.");
      }

      onSuccess(data.token, data.nickname);
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setIsLoading(false);
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
            <div className="flex flex-col border-b border-slate-100 dark:border-zinc-800">
              <div className="flex items-center justify-between px-5 py-3">
                <div className="text-sm font-bold text-slate-400 dark:text-zinc-500 uppercase tracking-wider">
                  계정
                </div>
                <button
                  onClick={onClose}
                  className="p-1.5 rounded-full hover:bg-slate-100 dark:hover:bg-zinc-800 text-slate-500 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="flex">
                <button
                  onClick={() => { setIsLoginTab(true); setErrorMsg(""); }}
                  className={`flex-1 py-3 text-[15px] font-bold transition-colors ${
                    isLoginTab 
                      ? "text-[var(--apple-blue)] border-b-2 border-[var(--apple-blue)] bg-blue-50/50 dark:bg-blue-900/10" 
                      : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                  }`}
                >
                  로그인
                </button>
                <button
                  onClick={() => { setIsLoginTab(false); setErrorMsg(""); }}
                  className={`flex-1 py-3 text-[15px] font-bold transition-colors ${
                    !isLoginTab 
                      ? "text-[var(--apple-blue)] border-b-2 border-[var(--apple-blue)] bg-blue-50/50 dark:bg-blue-900/10" 
                      : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                  }`}
                >
                  회원가입
                </button>
              </div>
            </div>
            
            <form onSubmit={handleSubmit} className="p-5">
              <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
                {isLoginTab 
                  ? "기존 계정으로 로그인하여 랭킹에 도전하세요." 
                  : "간단히 닉네임과 비밀번호만으로 가입할 수 있습니다."}
              </p>
              
              <input
                type="text"
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                placeholder="닉네임 (최대 20자)"
                maxLength={20}
                autoFocus
                className="w-full px-4 py-3 rounded-xl bg-slate-100 dark:bg-zinc-800 border-none outline-none text-slate-900 dark:text-white mb-3 focus:ring-2 focus:ring-[var(--apple-blue)] transition-shadow"
              />
              
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="비밀번호"
                className="w-full px-4 py-3 rounded-xl bg-slate-100 dark:bg-zinc-800 border-none outline-none text-slate-900 dark:text-white mb-2 focus:ring-2 focus:ring-[var(--apple-blue)] transition-shadow"
              />

              <div className="h-6 mb-3">
                {errorMsg && (
                  <span className="text-sm text-red-500 font-medium">{errorMsg}</span>
                )}
              </div>
              
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
                  disabled={!nickname.trim() || !password.trim() || isLoading}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg font-semibold bg-[var(--apple-blue)] text-white hover:bg-[var(--apple-blue-hover)] disabled:opacity-50 transition-colors"
                >
                  {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  {isLoginTab ? "로그인" : "회원가입"}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
