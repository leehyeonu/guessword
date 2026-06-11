"use client";

import React, { useState, useRef, useEffect } from "react";
import { Send, Loader2 } from "lucide-react";

interface GuessFormProps {
  onSubmit: (word: string) => Promise<void>;
  isLoading: boolean;
  isGameWon: boolean;
}

export default function GuessForm({ onSubmit, isLoading, isGameWon }: GuessFormProps) {
  const [guessInput, setGuessInput] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [shouldShake, setShouldShake] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // 초/중/종성 완성형 한글 정규식
  const koreanRegex = /^[가-힣]+$/;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setGuessInput(value);

    if (value === "") {
      setErrorMessage("");
      return;
    }

    // 자/모음 단독 입력 또는 영문/숫자 예외 가드
    if (!koreanRegex.test(value)) {
      setErrorMessage("올바른 완성형 한국어 단어만 입력할 수 있습니다. (영문, 숫자, 자/모음 단독 입력 제외)");
    } else {
      setErrorMessage("");
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanWord = guessInput.trim();

    if (!cleanWord) {
      setErrorMessage("단어를 입력해 주세요.");
      triggerShake();
      return;
    }

    if (!koreanRegex.test(cleanWord)) {
      setErrorMessage("올바른 완성형 한국어 단어만 입력해 주세요.");
      triggerShake();
      return;
    }

    setErrorMessage("");
    try {
      await onSubmit(cleanWord);
      setGuessInput(""); // 서버 검증 통과 시 필드 리셋
    } catch (err) {
      triggerShake();
    }
  };

  const triggerShake = () => {
    setShouldShake(true);
    setTimeout(() => setShouldShake(false), 500);
    inputRef.current?.focus();
  };

  useEffect(() => {
    if (!isGameWon && !isLoading) {
      inputRef.current?.focus();
    }
  }, [isGameWon, isLoading]);

  return (
    <form onSubmit={handleSubmit} className="w-full relative mt-3 sm:mt-4">
      <div className="relative flex flex-col w-full">
        <div className="relative flex items-center w-full">
          <input
            ref={inputRef}
            type="text"
            placeholder={isGameWon ? "정답을 맞췄습니다." : "추측 단어 입력..."}
            value={guessInput}
            onChange={handleChange}
            disabled={isLoading || isGameWon}
            aria-invalid={errorMessage ? "true" : "false"}
            aria-describedby={errorMessage ? "guess-error-msg" : undefined}
            className={`w-full pl-4 pr-14 py-3 rounded-xl text-slate-900 dark:text-white bg-[rgba(120,120,128,0.06)] dark:bg-[rgba(120,120,128,0.14)] placeholder-slate-400 dark:placeholder-slate-500 focus:placeholder-slate-300 dark:focus:placeholder-slate-600 outline-none text-base disabled:opacity-50 transition-all border ${
              errorMessage 
                ? "border-red-500/80 focus:ring-1.5 focus:ring-red-500" 
                : "border-transparent focus:ring-1.5 focus:ring-[var(--apple-blue)]"
            } ${shouldShake ? "shake-element" : ""}`}
          />
          <button
            type="submit"
            disabled={isLoading || isGameWon || !guessInput.trim() || !!errorMessage}
            aria-label="단어 추측 전송"
            className="absolute right-1.5 top-1/2 h-9 w-9 -translate-y-1/2 rounded-lg bg-[var(--apple-blue)] hover:bg-[var(--apple-blue-hover)] text-white cursor-pointer disabled:opacity-20 transition-all duration-150 active:scale-95 border-none shadow-sm flex items-center justify-center"
          >
            {isLoading ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Send className="w-3.5 h-3.5" />
            )}
          </button>
        </div>

        {/* ARIA 호환 접근성 에러 헬퍼 영역 */}
        {errorMessage && (
          <span 
            id="guess-error-msg" 
            role="alert" 
            className="text-[11px] text-red-650 dark:text-red-400 font-semibold mt-1.5 ml-1 animate-fadeIn"
          >
            {errorMessage}
          </span>
        )}
      </div>
    </form>
  );
}
