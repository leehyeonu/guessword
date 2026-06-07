"use client";

import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Flame, 
  HelpCircle, 
  Send, 
  RotateCcw, 
  Sparkles, 
  Settings, 
  ListFilter,
  Volume2,
  VolumeX,
  Trophy,
  ArrowRight,
  Loader2
} from "lucide-react";

import { db } from "@/lib/firebase";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";

import TutorialModal from "@/components/TutorialModal";
import AdminPanel from "@/components/AdminPanel";
import Toast from "@/components/Toast";
import Confetti from "@/components/Confetti";
import ClearTicker from "@/components/ClearTicker";

interface GuessHistoryItem {
  word: string;
  similarity: number;
  score: number;
  timestamp: string;
}

// Random word list for Infinite Mode challenge pool
const RANDOM_WORDS = [
  "사랑", "행복", "학교", "가족", "친구", "바다", "하늘", "나무", "자동차", "컴퓨터",
  "스마트폰", "음악", "노래", "영화", "도서관", "겨울", "여름", "커피", "시간", "하루",
  "선물", "그림", "사진", "우주", "비행기", "자전거", "책상", "마우스", "호수", "바람",
  "구름", "기차", "가방", "과자", "피아노", "축구", "여행", "고양이", "강아지", "소나무"
];

export default function GamePage() {
  // Game States
  const [targetWord, setTargetWord] = useState("사과");
  const [guessInput, setGuessInput] = useState("");
  const [history, setHistory] = useState<GuessHistoryItem[]>([]);
  const [currentGuess, setCurrentGuess] = useState<GuessHistoryItem | null>(null);
  
  // UI & Overlay States
  const [isTutorialOpen, setIsTutorialOpen] = useState(false);
  const [isAdminOpen, setIsAdminOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [isGameWon, setIsGameWon] = useState(false);

  // Toast States
  const [toastMessage, setToastMessage] = useState("");
  const [isToastOpen, setIsToastOpen] = useState(false);

  const historyEndRef = useRef<HTMLDivElement>(null);

  // Initialize from LocalStorage
  useEffect(() => {
    // 1. Tutorial state check
    const seenTutorial = localStorage.getItem("guessword_tutorial_seen");
    if (!seenTutorial) {
      setIsTutorialOpen(true);
    }

    // 2. Load target word
    const savedTarget = localStorage.getItem("guessword_target_word");
    let activeTarget = "사과";
    if (savedTarget) {
      setTargetWord(savedTarget);
      activeTarget = savedTarget;
    } else {
      localStorage.setItem("guessword_target_word", "사과");
    }

    // 3. Load guess history
    const savedHistory = localStorage.getItem("guessword_history");
    const savedHistoryTarget = localStorage.getItem("guessword_history_target");

    if (savedHistory && savedHistoryTarget === activeTarget) {
      try {
        const parsed = JSON.parse(savedHistory) as GuessHistoryItem[];
        setHistory(parsed);
        if (parsed.length > 0) {
          const sortedByTime = [...parsed].sort(
            (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
          );
          setCurrentGuess(sortedByTime[0]);
          
          if (sortedByTime.some(item => item.word === activeTarget)) {
            setIsGameWon(true);
          }
        }
      } catch (e) {
        console.error("Failed to parse history from localStorage", e);
      }
    }
  }, []);

  const saveGameState = (newHistory: GuessHistoryItem[], newTarget: string) => {
    localStorage.setItem("guessword_history", JSON.stringify(newHistory));
    localStorage.setItem("guessword_history_target", newTarget);
  };

  const handleSetTargetWord = (newWord: string) => {
    setTargetWord(newWord);
    localStorage.setItem("guessword_target_word", newWord);
    
    // Reset state
    setHistory([]);
    setCurrentGuess(null);
    setIsGameWon(false);
    saveGameState([], newWord);
  };

  // Toast alert trigger helper
  const triggerToast = (msg: string) => {
    setToastMessage(msg);
    setIsToastOpen(true);
  };

  const playChime = (score: number) => {
    if (!soundEnabled) return;
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const oscillator = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(audioCtx.destination);
      
      const baseFreq = 220;
      const targetFreq = baseFreq + (score * 4.5);
      
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(targetFreq, audioCtx.currentTime);
      
      gainNode.gain.setValueAtTime(0.12, audioCtx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.6);
      
      oscillator.start();
      oscillator.stop(audioCtx.currentTime + 0.6);
    } catch (e) {
      console.warn("Audio Context blocked", e);
    }
  };

  const logClearToFirestore = async (word: string, totalAttempts: number) => {
    try {
      // Save data [attempts, word, timestamp] into clears collection
      await addDoc(collection(db, "clears"), {
        word: word,
        attempts: totalAttempts,
        timestamp: serverTimestamp(),
      });
      console.log("Victory log successfully written to Firestore clears.");
    } catch (err) {
      console.warn(
        "Could not log victory to Firestore (app is running in offline mode or config is missing):",
        err
      );
    }
  };

  const handleGuessSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanGuess = guessInput.trim();
    if (!cleanGuess) return;
    
    if (isGameWon) {
      triggerToast("이미 정답을 맞추셨습니다! 다음 도전을 누르거나 설정을 바꿔보세요.");
      return;
    }

    if (history.some((item) => item.word === cleanGuess)) {
      triggerToast("이미 입력했던 단어입니다.");
      setGuessInput("");
      return;
    }

    setIsLoading(true);

    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
      const response = await fetch(`${apiUrl}/api/guess`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          target_word: targetWord,
          guess_word: cleanGuess,
        }),
      });

      if (response.status === 429) {
        triggerToast("요청 속도가 너무 빠릅니다. 잠시 후 다시 전송해 주세요.");
        return;
      }

      const data = await response.json();

      if (!response.ok) {
        // Handle OOV or general api errors dynamically via liquid glass toast alerts
        triggerToast(data.detail || "사전에 없는 단어입니다.");
        return;
      }

      const newGuess: GuessHistoryItem = {
        word: data.guess_word,
        similarity: data.similarity,
        score: data.score,
        timestamp: new Date().toISOString(),
      };

      const updatedHistory = [...history, newGuess];
      setHistory(updatedHistory);
      setCurrentGuess(newGuess);
      setGuessInput("");
      saveGameState(updatedHistory, targetWord);

      playChime(newGuess.score);

      if (cleanGuess === targetWord) {
        setIsGameWon(true);
        // Write attempts metadata synchronously to Firebase Firestore clears collection
        await logClearToFirestore(targetWord, updatedHistory.length);
      }
    } catch (err) {
      triggerToast("서버 통신 에러가 발생했습니다. 백엔드가 켜져 있는지 확인하세요.");
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  // Infinite Mode challenge reset
  const handleNextChallenge = async () => {
    setIsResetting(true);
    
    let verifiedWord = "";
    const maxRetries = 6;
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

    // Randomize word pool search and validate OOV dynamically via backend before loading
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      const randomIndex = Math.floor(Math.random() * RANDOM_WORDS.length);
      const chosenWord = RANDOM_WORDS[randomIndex];
      
      // Make sure the chosen word is not the current target
      if (chosenWord === targetWord) continue;

      try {
        const response = await fetch(`${apiUrl}/api/validate_target`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ target_word: chosenWord }),
        });
        
        if (response.ok) {
          const data = await response.json();
          if (data.valid) {
            verifiedWord = chosenWord;
            break;
          }
        }
      } catch (err) {
        console.warn("Verification connection failed during challenge reset. Falling back to raw word.", err);
        // If backend is unreachable, accept the local pool word as fallback to keep game running
        verifiedWord = chosenWord;
        break;
      }
    }

    if (!verifiedWord) {
      // Absolute fallback if loops failed
      verifiedWord = RANDOM_WORDS[Math.floor(Math.random() * RANDOM_WORDS.length)];
    }

    handleSetTargetWord(verifiedWord);
    setIsResetting(false);
  };

  const handleResetGame = () => {
    if (confirm("현재 게임 기록을 초기화하시겠습니까?")) {
      setHistory([]);
      setCurrentGuess(null);
      setIsGameWon(false);
      saveGameState([], targetWord);
    }
  };

  const sortedHistory = [...history].sort((a, b) => b.score - a.score);

  const getScoreColor = (score: number) => {
    if (score >= 90) return "text-red-400 border-red-500/30 bg-red-950/20";
    if (score >= 70) return "text-orange-400 border-orange-500/20 bg-orange-950/10";
    if (score >= 50) return "text-amber-400 border-amber-500/20 bg-amber-950/5";
    if (score >= 30) return "text-yellow-400 border-yellow-500/10";
    if (score >= 10) return "text-indigo-300 border-indigo-500/10";
    return "text-slate-400 border-white/5";
  };

  const getScoreIconColor = (score: number) => {
    if (score >= 70) return "text-red-500 fill-red-500/20 animate-pulse";
    if (score >= 50) return "text-orange-400";
    if (score >= 30) return "text-amber-400";
    return "text-indigo-400/60";
  };

  const activeScore = currentGuess ? currentGuess.score : 0;

  return (
    <main className="min-h-screen flex flex-col items-center justify-between p-4 md:p-8 max-w-5xl mx-auto z-10 relative">
      
      {/* Absolute Victory Confetti Overlay */}
      {isGameWon && <Confetti />}

      {/* Glass Top Toast Alert Panel */}
      <Toast 
        isOpen={isToastOpen} 
        message={toastMessage} 
        onClose={() => setIsToastOpen(false)} 
      />

      {/* Top Header Section */}
      <header className="w-full flex items-center justify-between py-4 border-b border-white/5 mb-6">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-2xl bg-white/5 border border-white/10 text-indigo-400 shadow-inner">
            <Flame className="w-6 h-6 animate-pulse text-indigo-400" />
          </div>
          <div>
            <h1 className="font-black text-xl md:text-2xl tracking-wider bg-clip-text text-transparent bg-gradient-to-r from-slate-100 via-indigo-200 to-indigo-400">
              K-SEMANTLE
            </h1>
            <p className="text-[10px] text-slate-500 uppercase tracking-widest font-semibold">Korean Semantic Guessing Game</p>
          </div>
        </div>

        {/* Header Controls */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setSoundEnabled(!soundEnabled)}
            className="p-2.5 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 text-slate-400 hover:text-slate-200 cursor-pointer transition shadow-md active:scale-95"
            title="소리 토글"
          >
            {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
          </button>

          <button
            onClick={handleResetGame}
            className="p-2.5 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 text-slate-400 hover:text-red-400 cursor-pointer transition shadow-md active:scale-95"
            title="기록 초기화"
          >
            <RotateCcw className="w-4 h-4" />
          </button>

          <button
            onClick={() => setIsTutorialOpen(true)}
            className="p-2.5 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 text-slate-400 hover:text-slate-200 cursor-pointer transition shadow-md active:scale-95"
            title="도움말"
          >
            <HelpCircle className="w-4 h-4" />
          </button>

          {/* Secret Settings Dot */}
          <button
            onClick={() => setIsAdminOpen(true)}
            className="w-2.5 h-2.5 rounded-full bg-slate-800 hover:bg-slate-500 transition cursor-pointer mx-1.5 self-center opacity-40 hover:opacity-100"
            title="정답 설정"
          />
        </div>
      </header>

      {/* Layout Grid: 2 columns on desktop for game and real-time scoreboard clears */}
      <div className="w-full flex-1 grid grid-cols-1 lg:grid-cols-3 gap-6 items-start my-auto py-2">
        
        {/* Left/Center Columns: Game Body */}
        <div className="lg:col-span-2 flex flex-col items-center justify-center relative w-full">
          
          {/* Back Glowing light */}
          <motion.div
            className="absolute -inset-6 rounded-3xl blur-3xl -z-10 transition-colors duration-700 pointer-events-none"
            animate={{
              scale: activeScore > 0 ? 1.05 + (activeScore / 250) : 0.95,
              opacity: activeScore > 0 ? 0.15 + (activeScore / 130) : 0.08,
              background: 
                activeScore >= 70
                  ? "radial-gradient(circle, rgba(239, 68, 68, 0.8) 0%, rgba(249, 115, 22, 0.4) 50%, transparent 100%)"
                  : activeScore >= 30
                  ? "radial-gradient(circle, rgba(245, 158, 11, 0.6) 0%, rgba(234, 179, 8, 0.3) 50%, transparent 100%)"
                  : "radial-gradient(circle, rgba(99, 102, 241, 0.4) 0%, rgba(168, 85, 247, 0.2) 50%, transparent 100%)",
            }}
            transition={{ type: "spring", stiffness: 85, damping: 22 }}
          />

          {/* Liquid Glass Main Panel */}
          <div className="liquid-glass w-full rounded-3xl p-6 md:p-8 flex flex-col items-center relative overflow-hidden mb-6">
            
            {/* Victory Layer */}
            <AnimatePresence>
              {isGameWon && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="absolute inset-0 bg-slate-950/95 backdrop-blur-xl z-20 flex flex-col items-center justify-center p-6 text-center"
                >
                  <motion.div
                    initial={{ scale: 0.5, y: -20 }}
                    animate={{ scale: 1, y: 0 }}
                    transition={{ type: "spring", delay: 0.15 }}
                    className="p-4.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 mb-4 shadow-[0_0_50px_rgba(245,158,11,0.35)]"
                  >
                    <Trophy className="w-12 h-12 animate-bounce" />
                  </motion.div>
                  <h3 className="font-black text-2xl md:text-3xl text-slate-100 mb-2">정답을 맞췄습니다!</h3>
                  <p className="text-sm text-slate-400 mb-6">
                    총 <span className="font-bold text-indigo-400">{history.length}</span>회 만에 정답 단어인 <span className="font-black text-amber-400">"{targetWord}"</span>을(를) 맞췄습니다.
                  </p>
                  
                  <div className="flex gap-2.5">
                    <button
                      onClick={handleResetGame}
                      className="liquid-glass liquid-glass-interactive px-5 py-2.5 rounded-2xl text-xs font-semibold text-slate-300 cursor-pointer active:scale-95"
                    >
                      기록 초기화
                    </button>
                    
                    <button
                      onClick={handleNextChallenge}
                      disabled={isResetting}
                      className="liquid-glass liquid-glass-interactive px-6 py-2.5 rounded-2xl text-xs font-bold text-indigo-300 hover:text-indigo-200 cursor-pointer active:scale-95 flex items-center gap-1.5"
                    >
                      {isResetting ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          다음 단어 검증 중...
                        </>
                      ) : (
                        <>
                          다음 단어 도전하기
                          <ArrowRight className="w-3.5 h-3.5" />
                        </>
                      )}
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Current Score Display */}
            <div className="w-full flex flex-col items-center mb-6 text-center">
              {currentGuess ? (
                <motion.div
                  key={currentGuess.word}
                  initial={{ scale: 0.9, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className="w-full"
                >
                  <span className="text-[10px] text-slate-500 tracking-wider font-extrabold uppercase">최근 입력 단어</span>
                  <div className="flex items-center justify-center gap-2 my-1.5">
                    <h2 className="text-3xl font-black text-slate-100 tracking-tight">{currentGuess.word}</h2>
                    <Flame className={`w-6 h-6 ${getScoreIconColor(currentGuess.score)}`} />
                  </div>
                  
                  <div className="mt-3 flex flex-col items-center justify-center">
                    <span className="text-[9px] text-slate-500 font-bold uppercase tracking-widest">유사도 점수</span>
                    <div className="text-5xl font-black font-mono tracking-tighter bg-clip-text text-transparent bg-gradient-to-b from-slate-100 to-slate-400 my-0.5">
                      {currentGuess.score}
                      <span className="text-lg font-bold ml-0.5 text-slate-400">/ 100</span>
                    </div>
                    
                    <div className="mt-1">
                      {currentGuess.score >= 90 ? (
                        <span className="px-3 py-1 rounded-full text-[9px] font-extrabold bg-red-950/40 border border-red-500/30 text-red-400 uppercase tracking-wider animate-pulse">
                          정답 바로 코앞! (극도로 유사)
                        </span>
                      ) : currentGuess.score >= 70 ? (
                        <span className="px-3 py-1 rounded-full text-[9px] font-extrabold bg-orange-950/30 border border-orange-500/20 text-orange-400 uppercase tracking-wider">
                          매우 뜨거움 (상위 순위권)
                        </span>
                      ) : currentGuess.score >= 50 ? (
                        <span className="px-3 py-1 rounded-full text-[9px] font-semibold bg-amber-950/20 border border-amber-500/20 text-amber-400 uppercase tracking-wider">
                          따뜻함 (상위 1000위 진입)
                        </span>
                      ) : currentGuess.score >= 30 ? (
                        <span className="px-3 py-1 rounded-full text-[9px] font-semibold bg-yellow-950/10 border border-yellow-500/10 text-yellow-400 uppercase tracking-wider">
                          미지근함 (연관 단어)
                        </span>
                      ) : (
                        <span className="px-3 py-1 rounded-full text-[9px] font-medium bg-white/5 border border-white/5 text-slate-500 uppercase tracking-wider">
                          차가움 (연관 없음)
                        </span>
                      )}
                    </div>
                  </div>
                </motion.div>
              ) : (
                <div className="py-6 flex flex-col items-center">
                  <Sparkles className="w-8 h-8 text-indigo-400/50 mb-3 animate-pulse" />
                  <h3 className="text-slate-300 font-extrabold text-sm md:text-base">정답 단어를 유추해 보세요!</h3>
                  <p className="text-xs text-slate-500 mt-1.5 max-w-[280px] leading-relaxed">
                    하단 입력창에 어울리는 한국어 단어를 입력하고 유사도를 체크해 보세요.
                  </p>
                </div>
              )}
            </div>

            {/* Guess Input Form */}
            <form onSubmit={handleGuessSubmit} className="w-full relative mt-4">
              <div className="relative flex items-center">
                <input
                  type="text"
                  placeholder={isGameWon ? "축하합니다! 정답입니다." : "추측 단어 입력..."}
                  value={guessInput}
                  onChange={(e) => setGuessInput(e.target.value)}
                  disabled={isLoading || isGameWon}
                  className="liquid-glass liquid-glass-interactive w-full pl-5 pr-14 py-3.5 rounded-2xl text-slate-100 placeholder-slate-500 focus:placeholder-slate-400 outline-none text-sm md:text-base disabled:opacity-50"
                />
                <button
                  type="submit"
                  disabled={isLoading || isGameWon || !guessInput.trim()}
                  className="absolute right-2 px-3 py-2 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 text-indigo-400 hover:text-indigo-300 cursor-pointer disabled:opacity-30 disabled:hover:text-indigo-400 transition active:scale-95"
                >
                  {isLoading ? (
                    <Loader2 className="w-4 h-4 md:w-5 h-5 animate-spin" />
                  ) : (
                    <Send className="w-4 h-4 md:w-5 h-5" />
                  )}
                </button>
              </div>
            </form>
          </div>

          {/* Bottom History List */}
          <div className="w-full flex flex-col mb-4 min-h-[220px]">
            <div className="flex items-center justify-between border-b border-white/5 pb-2 mb-3">
              <div className="flex items-center gap-1.5">
                <ListFilter className="w-4 h-4 text-slate-500" />
                <h3 className="text-xs md:text-sm font-extrabold uppercase tracking-wider text-slate-400">시도 목록</h3>
              </div>
              <span className="text-[10px] text-slate-500 font-bold">
                총 시도 횟수: <span className="text-slate-300 font-bold">{history.length}</span>
              </span>
            </div>

            {history.length > 0 ? (
              <div className="w-full max-h-[260px] overflow-y-auto pr-1 space-y-2.5">
                <AnimatePresence initial={false}>
                  {sortedHistory.map((item) => {
                    const tryNumber = history.findIndex((h) => h.word === item.word) + 1;
                    return (
                      <motion.div
                        key={item.word}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 10 }}
                        className={`liquid-glass p-3 rounded-2xl flex items-center justify-between border transition-all ${getScoreColor(
                          item.score
                        )}`}
                      >
                        <div className="flex items-center gap-3">
                          <span className="text-[10px] text-slate-500 font-bold font-mono bg-white/5 border border-white/5 w-6 h-6 rounded-lg flex items-center justify-center">
                            #{tryNumber}
                          </span>
                          <span className="font-bold text-slate-100 text-sm md:text-base tracking-wide">
                            {item.word}
                          </span>
                        </div>

                        <div className="flex items-center gap-4">
                          <div className="hidden sm:flex flex-col items-end text-[9px] leading-tight">
                            <span className="text-slate-500">코사인 유사도</span>
                            <span className="font-mono text-slate-400 font-semibold">
                              {item.similarity.toFixed(4)}
                            </span>
                          </div>
                          
                          <div className="flex flex-col items-end shrink-0">
                            <span className="text-[9px] text-slate-500 font-bold uppercase tracking-wider">점수</span>
                            <span className="font-bold font-mono text-sm md:text-base">
                              {item.score}
                            </span>
                          </div>
                        </div>
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
                <div ref={historyEndRef} />
              </div>
            ) : (
              <div className="liquid-glass w-full rounded-2xl p-6 text-center text-xs text-slate-500 leading-relaxed">
                아직 추측한 단어가 없습니다. <br />
                첫 번째 추측 단어를 전송하여 게임을 개시하세요!
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Live Ticker (Sidebar style) */}
        <div className="lg:col-span-1 w-full space-y-4">
          <ClearTicker />
        </div>

      </div>

      {/* Modals & Overlays */}
      <TutorialModal
        isOpen={isTutorialOpen}
        onClose={() => setIsTutorialOpen(false)}
      />

      <AdminPanel
        isOpen={isAdminOpen}
        onClose={() => setIsAdminOpen(false)}
        currentTargetWord={targetWord}
        onSetTargetWord={handleSetTargetWord}
      />
    </main>
  );
}
