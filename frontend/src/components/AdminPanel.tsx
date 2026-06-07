"use client";

import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Settings, X, ShieldAlert, Loader2, Save } from "lucide-react";

interface AdminPanelProps {
  isOpen: boolean;
  onClose: () => void;
  currentTargetWord: string;
  onSetTargetWord: (word: string) => void;
}

export default function AdminPanel({
  isOpen,
  onClose,
  currentTargetWord,
  onSetTargetWord,
}: AdminPanelProps) {
  const [newTarget, setNewTarget] = useState("");
  const [isValidating, setIsValidating] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const handleValidateAndSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanWord = newTarget.trim();
    if (!cleanWord) {
      setError("정답 단어를 입력해 주세요.");
      return;
    }

    setIsValidating(true);
    setError("");
    setSuccess("");

    try {
      const rawApiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
      const apiUrl = rawApiUrl.replace(/\/$/, "");
      const response = await fetch(`${apiUrl}/api/validate_target`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ target_word: cleanWord }),
      });

      if (!response.ok) {
        throw new Error("서버 응답 에러가 발생했습니다.");
      }

      const data = await response.json();

      if (data.valid) {
        onSetTargetWord(cleanWord);
        setSuccess(`정답 단어가 '${cleanWord}'(으)로 변경되었습니다!`);
        setNewTarget("");
        setTimeout(() => {
          setSuccess("");
          onClose();
        }, 1500);
      } else {
        setError(`'${cleanWord}'은(는) FastText 어휘 사전에 없는 단어입니다.`);
      }
    } catch (err) {
      console.error(err);
      setError("서버와의 통신에 실패했습니다. 백엔드가 실행 중인지 확인하세요.");
    } finally {
      setIsValidating(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Glass Overlay backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/60 backdrop-blur-md"
          />

          {/* Modal Container */}
          <motion.div
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 20 }}
            transition={{ type: "spring", duration: 0.5 }}
            className="liquid-glass w-full max-w-md rounded-3xl p-6 relative overflow-hidden text-slate-100 z-10"
          >
            {/* Header */}
            <div className="flex items-center justify-between mb-6 border-b border-white/10 pb-4">
              <div className="flex items-center gap-2">
                <Settings className="w-5 h-5 text-indigo-400 animate-spin-slow" />
                <h3 className="font-bold text-lg text-slate-100">비밀 설정 (관리자)</h3>
              </div>
              <button
                onClick={onClose}
                className="p-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-slate-400 hover:text-slate-200 cursor-pointer transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Current Target Word Info Card */}
            <div className="p-4 rounded-2xl bg-white/5 border border-white/5 mb-5 text-sm">
              <div className="text-slate-400 mb-1">현재 정답 단어</div>
              <div className="font-bold text-lg text-indigo-400 tracking-wide">
                {currentTargetWord}
              </div>
              <div className="text-xs text-slate-500 mt-1.5 leading-relaxed">
                * 로컬 메모리 내에서만 유지되며, 브라우저 세션 초기화 시 또는 변경 시 백엔드의 사전에서 실시간으로 이웃 단어가 계산됩니다.
              </div>
            </div>

            {/* Change Form */}
            <form onSubmit={handleValidateAndSave} className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-semibold text-slate-300">새로운 정답 단어 설정</label>
                <input
                  type="text"
                  placeholder="예: 자동차, 학교, 여름"
                  value={newTarget}
                  onChange={(e) => setNewTarget(e.target.value)}
                  disabled={isValidating}
                  className="liquid-glass liquid-glass-interactive w-full px-4 py-2.5 rounded-2xl text-slate-100 placeholder-slate-500 outline-none text-sm"
                />
              </div>

              {/* Status Alert Messages */}
              {error && (
                <div className="flex items-start gap-2.5 p-3 rounded-2xl bg-red-950/40 border border-red-500/20 text-xs text-red-300">
                  <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5 text-red-400" />
                  <span>{error}</span>
                </div>
              )}
              {success && (
                <div className="flex items-start gap-2.5 p-3 rounded-2xl bg-emerald-950/40 border border-emerald-500/20 text-xs text-emerald-300">
                  <div className="w-4 h-4 shrink-0 rounded-full bg-emerald-500/10 text-emerald-400 flex items-center justify-center font-bold text-[10px]">✓</div>
                  <span>{success}</span>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={isValidating}
                  className="px-4 py-2.5 rounded-xl text-slate-400 hover:text-slate-200 cursor-pointer text-xs font-semibold"
                >
                  취소
                </button>
                <button
                  type="submit"
                  disabled={isValidating}
                  className="liquid-glass liquid-glass-interactive px-5 py-2.5 rounded-2xl text-indigo-300 hover:text-indigo-200 font-semibold cursor-pointer shadow-lg active:scale-95 text-xs flex items-center gap-1.5"
                >
                  {isValidating ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      단어 검증 중...
                    </>
                  ) : (
                    <>
                      <Save className="w-3.5 h-3.5" />
                      저장 및 검증
                    </>
                  )}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
