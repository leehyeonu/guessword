"use client";

import React, { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AlertCircle, X } from "lucide-react";

// 토스트 알림 컴포넌트의 Props 인터페이스
interface ToastProps {
  message: string; // 출력할 에러/경고 메시지
  isOpen: boolean; // 토스트 표시 제어 상태 플래그
  onClose: () => void; // 자동 닫힘 및 닫기 버튼 액션 핸들러
  duration?: number; // 토스트 유지 시간 (기본값: 3000ms)
}

export default function Toast({ message, isOpen, onClose, duration = 3000 }: ToastProps) {
  // 토스트 컴포넌트 마운트 및 오픈 시 자동 페이드아웃 타이머 라이프사이클 처리
  useEffect(() => {
    if (isOpen) {
      // 지정한 duration 후 자동 onClose 트리거
      const timer = setTimeout(() => {
        onClose();
      }, duration);
      
      // 언마운트 또는 재활성화 시 클린업을 통한 메모리 누수(Memory Leak) 방지
      return () => clearTimeout(timer);
    }
  }, [isOpen, duration, onClose]);

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-50 w-full max-w-sm px-4">
          <motion.div
            initial={{ opacity: 0, y: -40, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            transition={{ type: "spring", stiffness: 130, damping: 15 }}
            className="liquid-glass flex items-center justify-between gap-3 px-4 py-3.5 rounded-xl border border-red-500/20 shadow-lg text-red-600 dark:text-red-400"
          >
            <div className="flex items-center gap-2.5">
              <AlertCircle className="w-5 h-5 text-red-500 dark:text-red-400 shrink-0" />
              <span className="text-xs md:text-sm font-semibold tracking-normal leading-tight">
                {message}
              </span>
            </div>
            
            <button
              onClick={onClose}
              className="p-1 rounded-md hover:bg-slate-200/50 dark:hover:bg-white/5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition cursor-pointer border-none"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
