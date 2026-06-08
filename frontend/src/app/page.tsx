"use client";

import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Flame, 
  HelpCircle, 
  Send, 
  RotateCcw, 
  Sparkles, 
  ListFilter,
  Volume2,
  VolumeX,
  Trophy,
  Loader2
} from "lucide-react";

import { db } from "@/lib/firebase";
import { collection, addDoc, serverTimestamp, onSnapshot, query, where } from "firebase/firestore";

import TutorialModal from "@/components/TutorialModal";
import Toast from "@/components/Toast";
import Confetti from "@/components/Confetti";
import ClearTicker from "@/components/ClearTicker";

interface GuessHistoryItem {
  word: string;
  similarity: number;
  score: number;
  timestamp: string;
}

export default function GamePage() {
  // 상태 변수들
  const [gameId, setGameId] = useState("");
  const [targetWord, setTargetWord] = useState("");
  const [guessInput, setGuessInput] = useState("");
  const [history, setHistory] = useState<GuessHistoryItem[]>([]);
  const [currentGuess, setCurrentGuess] = useState<GuessHistoryItem | null>(null);
  
  // 최고 기록
  const [localBestScore, setLocalBestScore] = useState(0);
  const [globalBestScore, setGlobalBestScore] = useState(0);

  // 정렬 순서 (score = 점수높은순, time = 최신순)
  const [historySortOrder, setHistorySortOrder] = useState<"score" | "time">("score");

  // UI 토글
  const [isTutorialOpen, setIsTutorialOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [isGameWon, setIsGameWon] = useState(false);

  // 토스트 메시지
  const [toastMessage, setToastMessage] = useState("");
  const [isToastOpen, setIsToastOpen] = useState(false);

  const historyEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // 입력창 흔들림 효과 트리거용
  const [shouldShakeInput, setShouldShakeInput] = useState(false);

  // 최초 로드 시 설정 복구 및 서버 세션 체크
  useEffect(() => {
    // 튜토리얼 아직 안 봤으면 띄워주기
    const seenTutorial = localStorage.getItem("guessword_tutorial_seen");
    if (!seenTutorial) {
      setIsTutorialOpen(true);
    }

    // 서버에서 현재 활성화된 게임 세션 ID 가져오기
    const fetchGameInfo = async () => {
      try {
        const rawApiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
        const apiUrl = rawApiUrl.replace(/\/$/, "");
        const response = await fetch(`${apiUrl}/api/game_info`);
        if (response.ok) {
          const data = await response.json();
          if (data.game_id) {
            setGameId(data.game_id);
          }
        } else {
          throw new Error("Game info fetch failed");
        }
      } catch (error) {
        console.error("게임 세션 로드 실패:", error);
        // 서버 연결 실패 시 로컬 백업 세션 유지
        const savedGameId = localStorage.getItem("guessword_game_id") || "default-game-id";
        setGameId(savedGameId);
      }
    };

    fetchGameInfo();
  }, []);

  // 게임 세션 ID가 바뀔 때 상태 초기화 및 로컬 기록 매핑
  useEffect(() => {
    if (!gameId) return;

    let unsubscribeGuesses = () => {};

    const savedGameId = localStorage.getItem("guessword_game_id");
    const savedHistory = localStorage.getItem("guessword_history");

    if (savedGameId === gameId && savedHistory) {
      try {
        const parsed = JSON.parse(savedHistory) as GuessHistoryItem[];
        setHistory(parsed);
        if (parsed.length > 0) {
          const sortedByTime = [...parsed].sort(
            (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
          );
          setCurrentGuess(sortedByTime[0]);
          
          const savedTarget = localStorage.getItem("guessword_target_word") || "";
          
          if (savedTarget && sortedByTime.some(item => item.word === savedTarget)) {
            setTargetWord(savedTarget);
            setIsGameWon(true);
          } else {
            setTargetWord("");
            setIsGameWon(false);
          }
        } else {
          setCurrentGuess(null);
          setTargetWord("");
          setIsGameWon(false);
        }

        // 로컬 최고 점수 복구
        const savedBest = localStorage.getItem(`guessword_best_score_${gameId}`);
        setLocalBestScore(savedBest ? Number(savedBest) : 0);
      } catch (e) {
        console.error("로컬 기록 파싱 에러:", e);
        setHistory([]);
        setCurrentGuess(null);
        setTargetWord("");
        setIsGameWon(false);
        setLocalBestScore(0);
      }
    } else {
      // 새로운 게임 세션 시작 시 로컬 기록 날리고 초기화
      setHistory([]);
      setCurrentGuess(null);
      setTargetWord("");
      setIsGameWon(false);
      setLocalBestScore(0);
      localStorage.setItem("guessword_game_id", gameId);
      localStorage.setItem("guessword_history", JSON.stringify([]));
      localStorage.removeItem("guessword_target_word");
      if (savedGameId) {
        localStorage.removeItem(`guessword_best_score_${savedGameId}`);
      }
    }

    // Firestore에서 실시간 최고 점수 구독
    try {
      const q = query(
        collection(db, "closest_guesses"),
        where("gameId", "==", gameId)
      );

      unsubscribeGuesses = onSnapshot(q, (snapshot) => {
        let maxScore = 0;
        snapshot.forEach((doc) => {
          const data = doc.data();
          if (data.score > maxScore) {
            maxScore = data.score;
          }
        });
        setGlobalBestScore(maxScore);
      }, (err) => {
        console.error("실시간 랭킹 로드 실패:", err);
      });
    } catch (e) {
      console.error("최고 점수 실시간 리스너 에러:", e);
    }

    return () => {
      unsubscribeGuesses();
    };
  }, [gameId]);

  // 기본 토스트 알림
  const triggerToast = (msg: string) => {
    setToastMessage(msg);
    setIsToastOpen(true);
  };

  // 입력 에러 트리거 (흔들기 + 진동 + 토스트)
  const triggerError = (msg: string) => {
    triggerToast(msg);
    setShouldShakeInput(true);
    if (typeof navigator !== "undefined" && navigator.vibrate) {
      navigator.vibrate(50);
    }
    setTimeout(() => {
      setShouldShakeInput(false);
    }, 400);
  };

  // 유사도에 따른 효과음 재생
  const playChime = (score: number) => {
    if (!soundEnabled) return;
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      
      if (score === 100) {
        // 정답 시 도-미-솔-도 아르페지오 화음 스케줄링
        const notes = [261.63, 329.63, 392.00, 523.25];
        notes.forEach((freq, index) => {
          const osc = audioCtx.createOscillator();
          const gain = audioCtx.createGain();
          osc.connect(gain);
          gain.connect(audioCtx.destination);
          
          osc.type = "sine";
          osc.frequency.setValueAtTime(freq, audioCtx.currentTime + index * 0.12);
          
          gain.gain.setValueAtTime(0.08, audioCtx.currentTime + index * 0.12);
          gain.gain.exponentialRampToValueAtTime(0.005, audioCtx.currentTime + index * 0.12 + 0.5);
          
          osc.start(audioCtx.currentTime + index * 0.12);
          osc.stop(audioCtx.currentTime + index * 0.12 + 0.5);
        });
      } else {
        // 평소 입력 시 단일 효과음
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
      }
    } catch (e) {
      console.warn("오디오 재생 실패:", e);
    }
  };

  // 최고 근접 기록 저장
  const logClosestGuessToFirestore = async (currentGameId: string, currentScore: number) => {
    try {
      await addDoc(collection(db, "closest_guesses"), {
        gameId: currentGameId,
        score: currentScore,
        timestamp: serverTimestamp(),
      });
    } catch (err) {
      console.warn("기록 저장 실패 (네트워크 혹은 파이어베이스 키 확인 필요):", err);
    }
  };

  // 게임 클리어 기록 저장
  const logClearToFirestore = async (currentGameId: string, totalAttempts: number) => {
    try {
      await addDoc(collection(db, "clears"), {
        gameId: currentGameId,
        attempts: totalAttempts,
        timestamp: serverTimestamp(),
      });
    } catch (err) {
      console.warn("클리어 로그 저장 실패:", err);
    }
  };

  // 단어 제출 이벤트 핸들러
  const handleGuessSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // 맥/iOS 등 자모 분리 방지를 위해 NFC 표준형으로 정규화
    const cleanGuess = guessInput.normalize("NFC").trim();
    if (!cleanGuess) return;

    // 한글 단어 이외의 부적절한 입력 차단 (완전한 가-힣 글자만 허용)
    const koreanRegex = /^[가-힣]+$/;
    if (!koreanRegex.test(cleanGuess)) {
      triggerError("올바른 한국어 단어만 입력해 주세요. (자/모음 단독, 숫자, 영어, 기호 제외)");
      setGuessInput("");
      setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
      return;
    }
    
    if (isGameWon) {
      triggerError("이미 정답을 맞추셨습니다! 다음 도전을 기다려주세요.");
      return;
    }

    if (history.some((item) => item.word === cleanGuess)) {
      triggerError("이미 입력했던 단어입니다.");
      setGuessInput("");
      return;
    }

    setIsLoading(true);

    try {
      const rawApiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
      const apiUrl = rawApiUrl.replace(/\/$/, "");
      const response = await fetch(`${apiUrl}/api/guess`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          guess_word: cleanGuess,
        }),
      });

      if (response.status === 429) {
        triggerError("요청 속도가 너무 빠릅니다. 잠시 후 다시 전송해 주세요.");
        return;
      }

      const data = await response.json();

      if (!response.ok) {
        triggerError(data.detail || "사전에 없는 단어입니다.");
        return;
      }

      // 백엔드 정답이 도중에 변경되었을 경우 리로드 유도
      if (data.game_id && data.game_id !== gameId) {
        triggerToast("정답 단어가 변경되어 새로운 게임이 시작됩니다!");
        setGameId(data.game_id);
        setHistory([]);
        setCurrentGuess(null);
        setTargetWord("");
        setIsGameWon(false);
        setGuessInput("");
        localStorage.setItem("guessword_game_id", data.game_id);
        localStorage.setItem("guessword_history", JSON.stringify([]));
        localStorage.removeItem("guessword_target_word");
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
      
      localStorage.setItem("guessword_history", JSON.stringify(updatedHistory));

      playChime(newGuess.score);

      if (data.is_correct) {
        setIsGameWon(true);
        setTargetWord(data.target_word);
        localStorage.setItem("guessword_target_word", data.target_word);
        
        // 정답 성공 시 스마트폰 진동 피드백
        if (typeof navigator !== "undefined" && navigator.vibrate) {
          navigator.vibrate([100, 50, 100]);
        }

        await logClearToFirestore(data.game_id, updatedHistory.length);
      } else {
        const score = data.score;
        if (score >= 10 && score > localBestScore) {
          setLocalBestScore(score);
          localStorage.setItem(`guessword_best_score_${gameId}`, score.toString());
          await logClosestGuessToFirestore(data.game_id, score);
          if (score > globalBestScore) {
            setGlobalBestScore(score);
          }
        }
      }
    } catch (err) {
      triggerError("서버 통신 에러가 발생했습니다. 백엔드가 작동 중인지 확인하세요.");
      console.error(err);
    } finally {
      setIsLoading(false);
      setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
    }
  };

  // 게임 진행 내역 수동 리셋
  const handleResetGame = () => {
    if (confirm("현재 게임 기록을 초기화하시겠습니까?")) {
      setHistory([]);
      setCurrentGuess(null);
      setIsGameWon(false);
      setLocalBestScore(0);
      localStorage.setItem("guessword_history", JSON.stringify([]));
      localStorage.removeItem(`guessword_best_score_${gameId}`);
    }
  };

  // 선택 정렬 옵션에 따라 기록 목록 가공
  const getSortedHistory = () => {
    if (historySortOrder === "score") {
      return [...history].sort((a, b) => b.score - a.score);
    }
    return [...history].sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
  };

  // 점수대별 CSS 스타일링 지정
  const getScoreColor = (score: number) => {
    if (score >= 90) return "text-red-400 border-red-500/30 bg-red-950/20";
    if (score >= 70) return "text-orange-400 border-orange-500/20 bg-orange-950/10";
    if (score >= 50) return "text-amber-400 border-amber-500/20 bg-amber-950/5";
    if (score >= 30) return "text-yellow-400 border-yellow-500/10";
    if (score >= 10) return "text-indigo-300 border-indigo-500/10";
    return "text-slate-400 border-white/5";
  };

  // 점수대별 불꽃 아이콘 활성화
  const getScoreIconColor = (score: number) => {
    if (score >= 70) return "text-red-500 fill-red-500/20 animate-pulse";
    if (score >= 50) return "text-orange-400";
    if (score >= 30) return "text-amber-400";
    return "text-indigo-400/60";
  };

  const activeScore = currentGuess ? currentGuess.score : 0;

  return (
    <main className="min-h-screen flex flex-col items-center justify-between p-4 md:p-8 max-w-5xl mx-auto z-10 relative">
      
      {/* 모바일 가로 스크롤 방지용 백그라운드 레이어 */}
      <div className="bg-glow-container">
        <div className="bg-glow-1" />
        <div className="bg-glow-2" />
      </div>

      {/* 정답 축하 콘페티 */}
      {isGameWon && <Confetti />}

      {/* 상단 알림 토스트 */}
      <Toast 
        isOpen={isToastOpen} 
        message={toastMessage} 
        onClose={() => setIsToastOpen(false)} 
      />

      {/* 헤더 */}
      <header className="w-full flex flex-col sm:flex-row items-center justify-between py-4 gap-4 sm:gap-2 border-b border-white/5 mb-6">
        <div className="flex items-center gap-2 self-start sm:self-auto">
          <div className="p-2 rounded-2xl bg-white/5 border border-white/10 text-indigo-400 shadow-inner">
            <Flame className="w-6 h-6 animate-pulse text-indigo-400" />
          </div>
          <div>
            <h1 className="font-black text-xl md:text-2xl tracking-wider bg-clip-text text-transparent bg-gradient-to-r from-slate-800 via-indigo-600 to-indigo-800 dark:from-slate-100 dark:via-indigo-200 dark:to-indigo-400">
              GUESSKOREAN
            </h1>
            <p className="text-[10px] text-slate-600 dark:text-slate-400 uppercase tracking-widest font-semibold">단어 맞추기 게임</p>
          </div>
        </div>

        {/* 설정 및 보조 기능 */}
        <div className="flex items-center gap-2 self-end sm:self-auto w-full sm:w-auto justify-end">
          {globalBestScore > 0 && (
            <div 
              className="flex items-center gap-1 px-2.5 py-2 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-[11px] font-bold text-rose-300 shadow-inner"
              title="전체 최고 근접 점수"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-rose-400 animate-pulse shrink-0"></span>
              <span>최고 근접: {globalBestScore}점</span>
            </div>
          )}

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
        </div>
      </header>

      {/* 메인 화면 배치 */}
      <div className="w-full flex-1 grid grid-cols-1 lg:grid-cols-3 gap-6 items-start my-auto py-2">
        
        {/* 플레이어 조작 보드 */}
        <div className="lg:col-span-2 flex flex-col items-center justify-center relative w-full">
          
          {/* 분위기 연출용 네온 백그라운드 필터 */}
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

          {/* 메인 조작 패널 */}
          <div className="liquid-glass w-full rounded-2xl sm:rounded-3xl p-4 sm:p-6 md:p-8 flex flex-col items-center relative overflow-hidden mb-6">
            
            {/* 승리 팝업 오버레이 */}
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
                  
                  <div className="flex flex-col items-center gap-4">
                    <p className="text-xs text-indigo-300/80 bg-indigo-950/20 border border-indigo-500/10 px-4 py-2 rounded-2xl">
                      💡 다음 새로운 단어가 활성화될 때까지 잠시 기다려주세요.
                    </p>
                    
                    <div className="flex gap-2.5">
                      <button
                        onClick={handleResetGame}
                        className="liquid-glass liquid-glass-interactive px-5 py-2.5 rounded-2xl text-xs font-semibold text-slate-300 cursor-pointer active:scale-95"
                      >
                        내 기록 초기화
                      </button>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* 현재 추측 결과 렌더링 */}
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
                    <h2 className="text-2xl sm:text-3xl font-black text-slate-800 dark:text-slate-100 tracking-tight truncate max-w-[200px] sm:max-w-none">{currentGuess.word}</h2>
                    <Flame className={`w-6 h-6 ${getScoreIconColor(currentGuess.score)}`} />
                  </div>
                  
                  <div className="mt-3 flex flex-col items-center justify-center">
                    <span className="text-[9px] text-slate-500 font-bold uppercase tracking-widest">유사도 점수</span>
                    <div className="text-4xl sm:text-5xl font-black font-mono tracking-tighter bg-clip-text text-transparent bg-gradient-to-b from-slate-800 to-slate-600 dark:from-slate-100 dark:to-slate-400 my-0.5">
                      {currentGuess.score}
                      <span className="text-base sm:text-lg font-bold ml-0.5 text-slate-500 dark:text-slate-400">/ 100</span>
                    </div>
                    
                    <div className="mt-1 flex flex-col items-center gap-3.5">
                      {currentGuess.score >= 90 ? (
                        <span className="px-3 py-1 rounded-full text-[9px] font-extrabold bg-red-950/40 border border-red-500/30 text-red-400 uppercase tracking-wider animate-pulse">
                          정답이 코앞에 있습니다!
                        </span>
                      ) : currentGuess.score >= 70 ? (
                        <span className="px-3 py-1 rounded-full text-[9px] font-extrabold bg-orange-950/30 border border-orange-500/20 text-orange-400 uppercase tracking-wider">
                          매우 유사함 (근접 순위권)
                        </span>
                      ) : currentGuess.score >= 50 ? (
                        <span className="px-3 py-1 rounded-full text-[9px] font-semibold bg-amber-950/20 border border-amber-500/20 text-amber-400 uppercase tracking-wider">
                          따뜻함 (상위 1000위 이내)
                        </span>
                      ) : currentGuess.score >= 30 ? (
                        <span className="px-3 py-1 rounded-full text-[9px] font-semibold bg-yellow-950/10 border border-yellow-500/10 text-yellow-400 uppercase tracking-wider">
                          약간 연관 있음
                        </span>
                      ) : (
                        <span className="px-3 py-1 rounded-full text-[9px] font-medium bg-white/5 border border-white/5 text-slate-500 uppercase tracking-wider">
                          연관성 없음
                        </span>
                      )}
                      
                      <div className="flex items-center gap-3 text-[10px] text-slate-600 dark:text-slate-400 font-semibold bg-slate-200/50 dark:bg-white/5 px-3 py-1.5 rounded-2xl border border-slate-300/20 dark:border-white/5">
                        <div className="flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-indigo-400"></span>
                          <span>내 최고: <strong className="text-indigo-600 dark:text-indigo-300 font-bold">{localBestScore}점</strong></span>
                        </div>
                        <div className="w-[1px] h-3 bg-slate-300 dark:bg-white/10" />
                        <div className="flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-rose-400 animate-pulse"></span>
                          <span>전체 최고: <strong className="text-rose-600 dark:text-rose-300 font-bold">{globalBestScore}점</strong></span>
                        </div>
                      </div>
                    </div>
                  </div>
                </motion.div>
              ) : (
                <div className="py-6 flex flex-col items-center">
                  <Sparkles className="w-8 h-8 text-indigo-400/50 mb-3 animate-pulse" />
                  <h3 className="text-slate-300 font-extrabold text-sm md:text-base">어떤 단어일지 유추해보세요!</h3>
                  <p className="text-xs text-slate-500 mt-1.5 max-w-[280px] leading-relaxed mb-4">
                    정답과 가장 가까운 단어를 적어보세요. 유사도가 높을수록 점수가 올라갑니다.
                  </p>
                  {globalBestScore > 0 && (
                    <div className="flex items-center gap-1 text-[10px] text-slate-400 font-semibold bg-rose-500/5 px-3 py-1.5 rounded-2xl border border-rose-500/10 text-rose-300">
                      <span className="w-1.5 h-1.5 rounded-full bg-rose-400 animate-pulse shrink-0"></span>
                      <span>전체 최고 근접 점수: <strong className="font-bold">{globalBestScore}점</strong></span>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* 추측 입력 폼 */}
            <form onSubmit={handleGuessSubmit} className="w-full relative mt-4">
              <div className="relative flex items-center">
                <input
                  ref={inputRef}
                  type="text"
                  placeholder={isGameWon ? "정답을 맞췄습니다." : "추측 단어 입력..."}
                  value={guessInput}
                  onChange={(e) => setGuessInput(e.target.value)}
                  disabled={isLoading || isGameWon}
                  className={`liquid-glass liquid-glass-interactive w-full pl-4 sm:pl-5 pr-12 sm:pr-14 py-3 sm:py-3.5 rounded-xl sm:rounded-2xl text-slate-100 placeholder-slate-500 focus:placeholder-slate-400 outline-none text-xs sm:text-sm md:text-base disabled:opacity-50 ${shouldShakeInput ? "shake-element" : ""}`}
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

          {/* 시도 기록 리스트 */}
          <div className="w-full flex flex-col mb-4 min-h-[220px]">
            <div className="flex items-center justify-between border-b border-white/5 pb-2 mb-3">
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5">
                  <ListFilter className="w-4 h-4 text-slate-500" />
                  <h3 className="text-xs md:text-sm font-extrabold uppercase tracking-wider text-slate-400">내 시도 목록</h3>
                </div>
                
                {/* 정렬 전환 탭 */}
                <div className="flex items-center rounded-xl bg-white/5 border border-white/5 p-0.5 text-[10px] font-bold text-slate-400">
                  <button
                    onClick={() => setHistorySortOrder("score")}
                    className={`px-2 py-1 rounded-lg cursor-pointer transition ${
                      historySortOrder === "score" 
                        ? "bg-indigo-500/20 text-indigo-300 border border-indigo-500/10" 
                        : "hover:text-slate-200"
                    }`}
                  >
                    점수순
                  </button>
                  <button
                    onClick={() => setHistorySortOrder("time")}
                    className={`px-2 py-1 rounded-lg cursor-pointer transition ${
                      historySortOrder === "time" 
                        ? "bg-indigo-500/20 text-indigo-300 border border-indigo-500/10" 
                        : "hover:text-slate-200"
                    }`}
                  >
                    최신순
                  </button>
                </div>
              </div>
              
              <span className="text-[10px] text-slate-500 font-bold">
                시도 횟수: <span className="text-slate-300 font-bold">{history.length}</span>
              </span>
            </div>

            {history.length > 0 ? (
              <div className="w-full max-h-[260px] overflow-y-auto pr-1 space-y-2.5">
                <AnimatePresence initial={false}>
                  {getSortedHistory().map((item) => {
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
                          <span className="text-[10px] text-slate-500 font-bold font-mono bg-slate-200/50 dark:bg-white/5 border border-slate-300/10 dark:border-white/5 w-6 h-6 rounded-lg flex items-center justify-center">
                            #{tryNumber}
                          </span>
                          <span className="font-bold text-slate-800 dark:text-slate-100 text-xs sm:text-sm md:text-base tracking-wide truncate max-w-[100px] sm:max-w-none">
                            {item.word}
                          </span>
                        </div>

                        <div className="flex items-center gap-4">
                          <div className="hidden sm:flex flex-col items-end text-[9px] leading-tight">
                            <span className="text-slate-500">코사인 유사도</span>
                            <span className="font-mono text-slate-600 dark:text-slate-400 font-semibold">
                              {item.similarity.toFixed(4)}
                            </span>
                          </div>
                          
                          <div className="flex flex-col items-end shrink-0">
                            <span className="text-[9px] text-slate-500 font-bold uppercase tracking-wider">점수</span>
                            <span className="font-bold font-mono text-sm md:text-base text-slate-850 dark:text-slate-100">
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
                시도 기록이 없습니다. <br />
                첫 단어를 입력하고 게임을 시작해보세요!
              </div>
            )}
          </div>
        </div>

        {/* 우측 실시간 피드 전광판 */}
        <div className="lg:col-span-1 w-full space-y-4">
          <ClearTicker />
        </div>

      </div>

      {/* 설명서 오버레이 모달 */}
      <TutorialModal
        isOpen={isTutorialOpen}
        onClose={() => setIsTutorialOpen(false)}
      />
    </main>
  );
}
