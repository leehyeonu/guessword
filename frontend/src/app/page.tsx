"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
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
  Loader2,
  Sun,
  Moon,
  Edit2
} from "lucide-react";

import TutorialModal from "@/components/TutorialModal";
import Toast from "@/components/Toast";
import Confetti from "@/components/Confetti";
import ClearTicker from "@/components/ClearTicker";
import AttemptTicker from "@/components/AttemptTicker";
import AuthModal from "@/components/AuthModal";
import LeaderboardModal from "@/components/LeaderboardModal";

interface AttemptItem {
  id: string;
  nickname: string;
  score: number;
  timestamp: Date;
}

interface ClearItem {
  id: string;
  gameId: string;
  attempts: number;
  timestamp: Date;
  nickname: string;
}

interface GameStatsData {
  global_best_score: number;
  recent_clears: Array<{
    id: string;
    gameId: string;
    attempts: number;
    timestamp: string;
    nickname: string;
  }>;
  recent_attempts: Array<{
    id: string;
    nickname: string;
    score: number;
    timestamp: string;
  }>;
}

interface GuessHistoryItem {
  word: string;
  similarity: number;
  score: number;
  timestamp: string;
}

interface PastSession {
  id: string;
  resetTime: string;
  gameId: string;
  bestScore: number;
  attemptsCount: number;
  guesses: GuessHistoryItem[];
}

const getApiUrl = () => {
  // 백엔드를 은닉하기 위해, 브라우저는 외부(HF)로 직접 요청하지 않고
  // Next.js 본인 서버 내부의 프록시(/api/...)로 요청하도록 빈 문자열 반환
  return "";
};

const fetchGameStats = async (currentGameId: string) => {
  const response = await fetch(`${getApiUrl()}/api/game_stats?game_id=${encodeURIComponent(currentGameId)}`);
  if (!response.ok) {
    throw new Error("Game stats fetch failed");
  }
  return response.json() as Promise<GameStatsData>;
};

export default function GamePage() {
  // 상태 변수들
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [gameId, setGameId] = useState("");
  const [targetWord, setTargetWord] = useState("");
  const [guessInput, setGuessInput] = useState("");
  const [history, setHistory] = useState<GuessHistoryItem[]>([]);
  const [currentGuess, setCurrentGuess] = useState<GuessHistoryItem | null>(null);
  
  // 인증 상태
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<string | null>(null);
  const [anonNickname, setAnonNickname] = useState<string>("익명");

  // 이전 초기화된 세션 목록 상태
  const [pastSessions, setPastSessions] = useState<PastSession[]>([]);
  
  // 최고 기록
  const [localBestScore, setLocalBestScore] = useState(0);
  const [globalBestScore, setGlobalBestScore] = useState(0);

  // 전체 통계 데이터 공유 상태
  const [attempts, setAttempts] = useState<AttemptItem[]>([]);
  const [clears, setClears] = useState<ClearItem[]>([]);
  const [isStatsLoading, setIsStatsLoading] = useState(true);
  const [isStatsRefreshing, setIsStatsRefreshing] = useState(false);
  const [statsError, setStatsError] = useState("");

  // 통계 통합 로드 콜백 함수
  const loadAllStats = useCallback(async (isManualRefresh = false) => {
    if (!gameId) return;
    if (isManualRefresh) {
      setIsStatsRefreshing(true);
    } else {
      setIsStatsLoading(true);
    }
    setStatsError("");

    try {
      const data = await fetchGameStats(gameId);
      setGlobalBestScore(data.global_best_score || 0);

      const parsedAttempts = (data.recent_attempts || []).map((a) => ({
        id: a.id || `attempt-${Math.random()}`,
        nickname: a.nickname || "누군가",
        score: typeof a.score === "number" ? Math.max(0, Math.min(100, a.score)) : 0,
        timestamp: a.timestamp && !isNaN(new Date(a.timestamp).getTime())
          ? new Date(a.timestamp)
          : new Date(),
      }));
      setAttempts(parsedAttempts);

      const parsedClears = (data.recent_clears || []).map((clear) => ({
        id: clear.id || `clear-${Math.random()}`,
        gameId: clear.gameId || "",
        attempts: Math.max(1, clear.attempts || 1),
        timestamp: clear.timestamp && !isNaN(new Date(clear.timestamp).getTime())
          ? new Date(clear.timestamp)
          : new Date(),
        nickname: clear.nickname || "누군가",
      }));
      setClears(parsedClears);
    } catch (err) {
      console.error("랭킹 통계 로드 실패:", err);
      setStatsError("통계 기록을 불러오는 데 실패했습니다.");
    } finally {
      setIsStatsLoading(false);
      setIsStatsRefreshing(false);
    }
  }, [gameId]);

  // 정렬 순서 (score = 점수높은순, time = 최신순)
  const [historySortOrder, setHistorySortOrder] = useState<"score" | "time">("score");
  const [isPastSessionsExpanded, setIsPastSessionsExpanded] = useState(false);
  const [pastAnswers, setPastAnswers] = useState<Record<string, string>>({});

  // UI 토글
  const [isTutorialOpen, setIsTutorialOpen] = useState(false);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [isLeaderboardModalOpen, setIsLeaderboardModalOpen] = useState(false);
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

  // 테마 초기 설정 및 시스템 설정 변화 감지
  useEffect(() => {
    // 1. 초기 테마 상태 동기화
    const isDark = document.documentElement.classList.contains("dark");
    setTheme(isDark ? "dark" : "light");

    // 2. 시스템 테마 변경 실시간 반영 (수동 테마 지정이 없을 때만)
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handleChange = (e: MediaQueryListEvent) => {
      const hasSavedTheme = localStorage.getItem("guessword_theme");
      if (!hasSavedTheme) {
        const newTheme = e.matches ? "dark" : "light";
        setTheme(newTheme);
        if (newTheme === "dark") {
          document.documentElement.classList.add("dark");
        } else {
          document.documentElement.classList.remove("dark");
        }
      }
    };

    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, []);

  // 수동 테마 전환
  const toggleTheme = () => {
    const newTheme = theme === "light" ? "dark" : "light";
    setTheme(newTheme);
    if (newTheme === "dark") {
      document.documentElement.classList.add("dark");
      localStorage.setItem("guessword_theme", "dark");
    } else {
      document.documentElement.classList.remove("dark");
      localStorage.setItem("guessword_theme", "light");
    }
  };

  // 최초 로드 시 설정 복구 및 서버 세션 체크
  useEffect(() => {
    // 인증 토큰 복구
    const savedToken = localStorage.getItem("guessword_auth_token");
    const savedUser = localStorage.getItem("guessword_nickname");
    if (savedToken && savedUser) {
      setAuthToken(savedToken);
      setCurrentUser(savedUser);
    }

    // 익명 닉네임 생성 및 복구
    let savedAnon = localStorage.getItem("guessword_anon_nickname");
    if (!savedAnon) {
      savedAnon = `익명#${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
      localStorage.setItem("guessword_anon_nickname", savedAnon);
    }
    setAnonNickname(savedAnon);

    // 이전 초기화된 세션 복구
    const savedPast = localStorage.getItem("guessword_past_sessions");
    if (savedPast) {
      try {
        setPastSessions(JSON.parse(savedPast));
      } catch (e) {
        console.error("이전 세션 파싱 에러:", e);
      }
    }

    // 튜토리얼 아직 안 봤으면 띄워주기
    const seenTutorial = localStorage.getItem("guessword_tutorial_seen");
    if (!seenTutorial) {
      setIsTutorialOpen(true);
    }

    // 서버에서 현재 활성화된 게임 세션 ID 가져오기
    const fetchGameInfo = async () => {
      const coldStartTimer = setTimeout(() => {
        triggerToast("서버를 깨우는 중입니다. 잠시만 기다려주세요 (최대 1~2분 소요)");
      }, 10000);
      
      try {
        const response = await fetch(`${getApiUrl()}/api/game_info`);
        if (response.ok) {
          const data = await response.json();
          if (data.game_id) {
            setGameId(data.game_id);
          }
          if (data.past_answers) {
            setPastAnswers(data.past_answers);
          }
        } else {
          throw new Error("Game info fetch failed");
        }
      } catch (error) {
        console.error("게임 세션 로드 실패:", error);
        // 서버 연결 실패 시 로컬 백업 세션 유지
        const savedGameId = localStorage.getItem("guessword_game_id") || "default-game-id";
        setGameId(savedGameId);
      } finally {
        clearTimeout(coldStartTimer);
      }
    };

    fetchGameInfo();
  }, []);

  // 게임 세션 ID가 바뀔 때 상태 초기화 및 로컬 기록 매핑
  useEffect(() => {
    if (!gameId) return;

    let isMounted = true;
    let statsTimer: ReturnType<typeof setInterval> | null = null;

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
      // 새로운 게임 세션 시작 시 기존 기록이 존재한다면 이전 세션 목록에 백업
      if (savedHistory) {
        try {
          const prevHistory = JSON.parse(savedHistory) as GuessHistoryItem[];
          if (prevHistory.length > 0) {
            const savedBest = localStorage.getItem(`guessword_best_score_${savedGameId}`) || "0";
            const newSession: PastSession = {
              id: Date.now().toString(),
              resetTime: new Date().toISOString(),
              gameId: savedGameId || "unknown",
              bestScore: Number(savedBest),
              attemptsCount: prevHistory.length,
              guesses: prevHistory,
            };
            
            // 기존 pastSessions 상태와 로컬스토리지 업데이트
            const savedPastStr = localStorage.getItem("guessword_past_sessions");
            let currentPast: PastSession[] = [];
            if (savedPastStr) {
              currentPast = JSON.parse(savedPastStr);
            }
            const updatedPast = [newSession, ...currentPast].slice(0, 10); // 기기 용량 및 모바일 UI를 위해 최근 10개까지만 보관
            setPastSessions(updatedPast);
            localStorage.setItem("guessword_past_sessions", JSON.stringify(updatedPast));
          }
        } catch (e) {
          console.error("이전 세션 백업 에러:", e);
        }
      }

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

    loadAllStats();
    // 자동 폴링 제거 - Firestore 무료 한도 절감

    return () => {
      isMounted = false;
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

  // Auth 핸들러
  const handleAuthSuccess = async (token: string, nickname: string) => {
    setAuthToken(token);
    setCurrentUser(nickname);
    localStorage.setItem("guessword_auth_token", token);
    localStorage.setItem("guessword_nickname", nickname);
    
    // 마이그레이션 호출
    const savedPastStr = localStorage.getItem("guessword_past_sessions");
    if (savedPastStr) {
      try {
        const pastSessions = JSON.parse(savedPastStr);
        if (pastSessions.length > 0) {
          await fetch(`${process.env.NEXT_PUBLIC_API_URL || ""}/api/auth/migrate?token=${token}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ past_sessions: pastSessions })
          });
          triggerToast("과거 플레이 기록이 안전하게 연동되었습니다!");
        }
      } catch(e) {}
    }
  };
  
  const handleLogout = () => {
    setAuthToken(null);
    setCurrentUser(null);
    localStorage.removeItem("guessword_auth_token");
    localStorage.removeItem("guessword_nickname");
    triggerToast("로그아웃 되었습니다.");
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
    
    const coldStartTimer = setTimeout(() => {
      triggerToast("서버를 깨우는 중입니다. 잠시만 기다려주세요 (최대 1~2분 소요)");
    }, 10000);

    try {
      const response = await fetch(`${getApiUrl()}/api/guess`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          guess_word: cleanGuess,
          nickname: currentUser || anonNickname,
          attempt_count: history.length + 1,
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
        
        // 정답을 맞췄을 때 /api/score 호출
        if (authToken && gameId) {
          fetch(`${process.env.NEXT_PUBLIC_API_URL || ""}/api/leaderboard/score?token=${authToken}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ game_id: gameId, attempts: updatedHistory.length })
          }).catch(console.error);
        }
        
        // 정답 성공 시 스마트폰 진동 피드백
        if (typeof navigator !== "undefined" && navigator.vibrate) {
          navigator.vibrate([100, 50, 100]);
        }
      } else {
        const score = data.score;
        if (score >= 10 && score > localBestScore) {
          setLocalBestScore(score);
          localStorage.setItem(`guessword_best_score_${gameId}`, score.toString());
          if (score > globalBestScore) {
            setGlobalBestScore(score);
          }
        }
      }

      loadAllStats();
    } catch (err) {
      triggerError("서버 통신 에러가 발생했습니다. 백엔드가 작동 중인지 확인하세요.");
      console.error(err);
    } finally {
      clearTimeout(coldStartTimer);
      setIsLoading(false);
      setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
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

  // 점수대별 CSS 스타일링 지정 (Apple System Color 가이드 준수)
  const getScoreColor = (score: number) => {
    if (score >= 90) return "text-red-650 dark:text-red-400 border-red-500/20 bg-red-500/5 dark:bg-red-500/10";
    if (score >= 75) return "text-orange-650 dark:text-orange-400 border-orange-500/20 bg-orange-500/5 dark:bg-orange-500/10";
    if (score >= 55) return "text-amber-650 dark:text-amber-400 border-amber-500/20 bg-amber-500/5 dark:bg-amber-500/10";
    if (score >= 35) return "text-blue-650 dark:text-blue-400 border-blue-500/20 bg-blue-500/5 dark:bg-blue-500/10";
    if (score >= 15) return "text-slate-600 dark:text-slate-400 border-slate-300 dark:border-slate-700/60 bg-slate-400/10 dark:bg-slate-500/10";
    return "text-slate-500 dark:text-slate-400 border-slate-200 dark:border-white/5";
  };

  // 점수대별 불꽃 아이콘 활성화
  const getScoreIconColor = (score: number) => {
    if (score >= 75) return "text-red-500 dark:text-red-400 fill-red-500/10 animate-pulse";
    if (score >= 55) return "text-orange-500 dark:text-orange-400";
    if (score >= 35) return "text-blue-500 dark:text-blue-400";
    return "text-slate-400 dark:text-slate-500";
  };

  const getScoreLabel = (score: number) => {
    if (score >= 90) return "정답이 코앞에 있습니다!";
    if (score >= 75) return "매우 유사함 (근접 순위권)";
    if (score >= 55) return "따뜻함 (상위 1000위 이내)";
    if (score >= 35) return "약간 연관 있음";
    if (score >= 15) return "연관성 낮음";
    return "연관성 없음";
  };

  const activeScore = currentGuess ? currentGuess.score : 0;

  return (
    <main className="min-h-dvh w-full max-w-5xl mx-auto flex flex-col items-center justify-start px-3 py-3 sm:px-4 md:px-8 md:py-6 z-10 relative overflow-x-hidden">
      
      {/* 정답 축하 콘페티 */}
      {isGameWon && <Confetti />}

      {/* 상단 알림 토스트 */}
      <Toast 
        isOpen={isToastOpen} 
        message={toastMessage} 
        onClose={() => setIsToastOpen(false)} 
      />

      <AuthModal 
        isOpen={isAuthModalOpen} 
        onClose={() => setIsAuthModalOpen(false)} 
        onSuccess={handleAuthSuccess} 
      />
      
      <LeaderboardModal 
        isOpen={isLeaderboardModalOpen} 
        onClose={() => setIsLeaderboardModalOpen(false)} 
        currentUser={currentUser} 
      />

      {/* 헤더 (Apple-style Clean Header) */}
      <header className="w-full flex flex-col sm:flex-row sm:items-center sm:justify-between py-3 gap-3 border-b border-slate-200/60 dark:border-zinc-800/80 mb-4 md:mb-6">
        <div className="flex min-w-0 items-center justify-between gap-2 sm:justify-start">
          <h1 className="min-w-0 truncate font-bold text-lg md:text-xl tracking-normal text-slate-900 dark:text-white">
            GUESSKOREAN
          </h1>
        </div>

        {/* 설정 및 보조 기능 */}
        <div className="flex w-full items-center gap-2 sm:w-auto sm:justify-end">
          {currentUser ? (
            <div className="flex items-center gap-1.5 px-3 h-10 rounded-lg bg-[var(--apple-gray-btn)]">
              <span className="text-xs font-bold text-slate-700 dark:text-slate-200 max-w-[80px] truncate">{currentUser}</span>
              <button 
                onClick={handleLogout} 
                className="text-[10px] font-semibold text-slate-400 hover:text-red-500 transition-colors"
                title="로그아웃"
              >
                로그아웃
              </button>
            </div>
          ) : (
            <button
              onClick={() => setIsAuthModalOpen(true)}
              className="px-3 h-10 rounded-lg font-bold text-[11px] bg-[var(--apple-blue)] text-white hover:bg-[var(--apple-blue-hover)] transition-colors shrink-0"
            >
              로그인 / 가입
            </button>
          )}
          {globalBestScore > 0 && (
            <div 
              className="min-w-0 flex-1 sm:flex-none flex items-center justify-center gap-1 px-2.5 py-2 sm:py-1.5 rounded-lg bg-red-500/10 dark:bg-red-500/15 text-red-650 dark:text-red-400 text-[11px] font-semibold"
              title="전체 최고 근접 점수"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-red-500 dark:bg-red-400 animate-pulse shrink-0"></span>
              <span className="truncate">최고 근접: {globalBestScore}점</span>
            </div>
          )}

          <button
            onClick={toggleTheme}
            className="h-10 w-10 shrink-0 rounded-lg bg-[var(--apple-gray-btn)] hover:bg-[var(--apple-gray-btn-hover)] text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 cursor-pointer transition active:scale-95 border-none shadow-none flex items-center justify-center"
            title={theme === "light" ? "다크 모드로 전환" : "라이트 모드로 전환"}
          >
            {theme === "light" ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
          </button>

          <button
            onClick={() => setSoundEnabled(!soundEnabled)}
            className="h-10 w-10 shrink-0 rounded-lg bg-[var(--apple-gray-btn)] hover:bg-[var(--apple-gray-btn-hover)] text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 cursor-pointer transition active:scale-95 border-none shadow-none flex items-center justify-center"
            title="소리 토글"
          >
            {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
          </button>

          <button
            onClick={() => setIsTutorialOpen(true)}
            className="h-10 w-10 shrink-0 rounded-lg bg-[var(--apple-gray-btn)] hover:bg-[var(--apple-gray-btn-hover)] text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 cursor-pointer transition active:scale-95 border-none shadow-none flex items-center justify-center"
            title="도움말"
          >
            <HelpCircle className="w-4 h-4" />
          </button>
          <button
            onClick={() => setIsLeaderboardModalOpen(true)}
            className="h-10 w-10 shrink-0 rounded-lg bg-yellow-500/10 hover:bg-yellow-500/20 text-yellow-600 dark:text-yellow-500 cursor-pointer transition active:scale-95 border-none shadow-none flex items-center justify-center"
            title="리더보드"
          >
            <Trophy className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* 메인 화면 배치 */}
      <div className="w-full flex-1 grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6 items-start py-1 sm:py-2">
        
        {/* 플레이어 조작 보드 */}
        <div className="lg:col-span-2 flex flex-col items-center relative w-full min-w-0">
          
          {/* 메인 조작 패널 */}
          <div className="liquid-glass w-full max-w-xl lg:max-w-none rounded-2xl p-4 sm:p-6 md:p-8 flex flex-col items-center relative overflow-hidden mb-5 md:mb-6">
            
            {/* 승리 팝업 오버레이 (Apple Modal Style) */}
            <AnimatePresence>
              {isGameWon && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="absolute inset-0 z-20 flex flex-col items-center justify-center p-6 text-center"
                  style={{ backgroundColor: theme === "dark" ? "#000000" : "#ffffff" }}
                >
                  <motion.div
                    initial={{ scale: 0.8, y: -10 }}
                    animate={{ scale: 1, y: 0 }}
                    transition={{ type: "spring", delay: 0.1 }}
                    className="p-4 rounded-full bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 mb-4"
                  >
                    <Trophy className="w-10 h-10 animate-bounce" />
                  </motion.div>
                  <h3 className="font-bold text-xl md:text-2xl text-slate-900 dark:text-white mb-2">정답을 맞췄습니다!</h3>
                  <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mb-6">
                    총 <span className="font-semibold text-[var(--apple-blue)]">{history.length}</span>회 만에 정답 단어인 <span className="font-extrabold text-orange-500 dark:text-orange-450">"{targetWord}"</span>을(를) 맞췄습니다.
                  </p>
                  
                  <div className="flex flex-col items-center gap-4">
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 bg-[var(--apple-gray-btn)] px-4 py-2 rounded-lg">
                      💡 다음 새로운 단어가 활성화될 때까지 잠시 기다려주세요.
                    </p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* 현재 추측 결과 렌더링 */}
            <div className="w-full flex flex-col items-center mb-5 sm:mb-6 text-center">
              {currentGuess ? (
                <motion.div
                  key={currentGuess.word}
                  initial={{ scale: 0.95, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className="w-full"
                >
                  <span className="text-[10px] text-slate-500 dark:text-slate-450 tracking-normal font-semibold uppercase">최근 입력 단어</span>
                  <div className="flex max-w-full items-center justify-center gap-2 my-1.5">
                    <h2 className="min-w-0 max-w-full truncate text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white tracking-normal">{currentGuess.word}</h2>
                    <Flame className={`w-5 h-5 ${getScoreIconColor(currentGuess.score)}`} />
                  </div>
                  
                  <div className="mt-3 flex flex-col items-center justify-center">
                    <span className="text-[9px] text-slate-500 dark:text-slate-450 font-bold uppercase tracking-normal">유사도 점수</span>
                    <div className="text-4xl sm:text-5xl font-extrabold font-mono tracking-normal text-slate-900 dark:text-white my-0.5 leading-none">
                      {currentGuess.score}
                      <span className="text-base sm:text-lg font-bold ml-0.5 text-slate-500 dark:text-slate-450 font-mono">/ 100</span>
                    </div>
                    
                    <div className="mt-2.5 flex flex-col items-center gap-3">
                      <span className="px-3 py-1 rounded-lg text-[10px] font-bold uppercase tracking-normal"
                        style={{
                          backgroundColor:
                            currentGuess.score >= 90 ? "rgba(239,68,68,0.1)" :
                            currentGuess.score >= 75 ? "rgba(249,115,22,0.1)" :
                            currentGuess.score >= 55 ? "rgba(245,158,11,0.1)" :
                            currentGuess.score >= 35 ? "rgba(59,130,246,0.1)" :
                            currentGuess.score >= 15 ? "rgba(148,163,184,0.12)" :
                            "rgba(148,163,184,0.08)",
                          color:
                            currentGuess.score >= 90 ? "#b91c1c" :
                            currentGuess.score >= 75 ? "#c2410c" :
                            currentGuess.score >= 55 ? "#b45309" :
                            currentGuess.score >= 35 ? "#2563eb" :
                            currentGuess.score >= 15 ? "#475569" :
                            "#475569",
                        }}
                      >
                        {getScoreLabel(currentGuess.score)}
                      </span>
                      
                      <div className="w-full max-w-[320px] flex flex-col sm:flex-row sm:items-center sm:justify-center gap-1.5 sm:gap-3 text-[10px] text-slate-650 dark:text-slate-350 font-semibold bg-[var(--apple-gray-btn)] px-3 py-2 sm:py-1.5 rounded-lg">
                        <div className="flex items-center justify-center gap-1 whitespace-nowrap">
                          <span className="w-1.5 h-1.5 rounded-full bg-[var(--apple-blue)]"></span>
                          <span>내 최고: <strong className="text-slate-900 dark:text-white font-bold">{localBestScore}점</strong></span>
                        </div>
                        <div className="hidden sm:block w-[1px] h-3 bg-slate-300 dark:bg-zinc-700" />
                        <div className="flex items-center justify-center gap-1 whitespace-nowrap">
                          <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse"></span>
                          <span>전체 최고: <strong className="text-slate-900 dark:text-white font-bold">{globalBestScore}점</strong></span>
                        </div>
                      </div>
                    </div>
                  </div>
                </motion.div>
              ) : (
                <div className="py-6 flex flex-col items-center">
                  <Sparkles className="w-8 h-8 text-[var(--apple-blue)]/60 mb-3 animate-pulse" />
                  <h3 className="text-slate-900 dark:text-slate-200 font-bold text-sm md:text-base">어떤 단어일지 유추해보세요!</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-450 mt-1.5 max-w-[280px] leading-relaxed mb-4">
                    정답과 가장 가까운 단어를 적어보세요. 유사도가 높을수록 점수가 올라갑니다.
                  </p>
                  {globalBestScore > 0 && (
                    <div className="flex items-center gap-1 text-[10px] text-red-650 dark:text-red-400 font-semibold bg-red-500/5 dark:bg-red-500/10 px-3 py-1.5 rounded-lg border border-red-500/10 dark:border-red-500/15">
                      <span className="w-1.5 h-1.5 rounded-full bg-red-500 dark:bg-red-400 animate-pulse shrink-0"></span>
                      <span>전체 최고 근접 점수: <strong className="font-bold">{globalBestScore}점</strong></span>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* 추측 입력 폼 (Apple Messages Style Input) */}
            <form onSubmit={handleGuessSubmit} className="w-full relative mt-3 sm:mt-4">
              <div className="relative flex items-center">
                <input
                  ref={inputRef}
                  type="text"
                  placeholder={isGameWon ? "정답을 맞췄습니다." : "추측 단어 입력..."}
                  value={guessInput}
                  onChange={(e) => setGuessInput(e.target.value)}
                  disabled={isLoading || isGameWon}
                  className={`w-full pl-4 pr-14 py-3 rounded-xl text-slate-900 dark:text-white bg-[rgba(120,120,128,0.06)] dark:bg-[rgba(120,120,128,0.14)] placeholder-slate-400 dark:placeholder-slate-500 focus:placeholder-slate-300 dark:focus:placeholder-slate-600 outline-none text-sm md:text-base disabled:opacity-50 transition-all border-none focus:ring-1.5 focus:ring-[var(--apple-blue)] ${shouldShakeInput ? "shake-element" : ""}`}
                />
                <button
                  type="submit"
                  disabled={isLoading || isGameWon || !guessInput.trim()}
                  className="absolute right-1.5 top-1/2 h-9 w-9 -translate-y-1/2 rounded-lg bg-[var(--apple-blue)] hover:bg-[var(--apple-blue-hover)] text-white cursor-pointer disabled:opacity-20 transition-all duration-150 active:scale-95 border-none shadow-sm flex items-center justify-center"
                >
                  {isLoading ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Send className="w-3.5 h-3.5" />
                  )}
                </button>
              </div>
            </form>
          </div>

          {/* 시도 기록 리스트 */}
          <div className="w-full max-w-xl lg:max-w-none flex flex-col mb-4 min-h-[220px]">
            <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between border-b border-slate-200 dark:border-zinc-800 pb-2.5 mb-3">
              <div className="flex min-w-0 flex-wrap items-center gap-2 sm:gap-3">
                <div className="flex min-w-0 items-center gap-1.5">
                  <ListFilter className="w-4 h-4 text-slate-500" />
                  <h3 className="text-xs md:text-sm font-semibold uppercase tracking-normal text-slate-500 dark:text-slate-450 whitespace-nowrap">내 시도 목록</h3>
                </div>
                
                {/* 정렬 전환 탭 (Apple Segmented Control Style) */}
                <div className="flex shrink-0 items-center rounded-lg bg-[rgba(120,120,128,0.08)] dark:bg-[rgba(120,120,128,0.2)] p-0.5 text-[10px] font-medium text-slate-650 dark:text-slate-350">
                  <button
                    onClick={() => setHistorySortOrder("score")}
                    className={`px-2.5 py-1 rounded-md cursor-pointer transition-all duration-150 text-[10px] ${
                      historySortOrder === "score" 
                        ? "bg-white dark:bg-[#636366] text-slate-900 dark:text-white shadow-sm font-bold" 
                        : "text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
                    }`}
                  >
                    점수순
                  </button>
                  <button
                    onClick={() => setHistorySortOrder("time")}
                    className={`px-2.5 py-1 rounded-md cursor-pointer transition-all duration-150 text-[10px] ${
                      historySortOrder === "time" 
                        ? "bg-white dark:bg-[#636366] text-slate-900 dark:text-white shadow-sm font-bold" 
                        : "text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
                    }`}
                  >
                    최신순
                  </button>
                </div>
              </div>
              
              <span className="text-[10px] text-slate-500 font-bold flex min-w-0 items-center gap-2 sm:justify-end">
                <span className="max-w-[110px] truncate text-[9px] px-1.5 py-0.5 rounded bg-[var(--apple-gray-btn)] text-slate-650 dark:text-slate-350 font-semibold">
                  {currentUser || anonNickname}
                </span>
                <span className="whitespace-nowrap">시도 횟수: <strong className="text-slate-800 dark:text-white font-bold">{history.length}</strong></span>
              </span>
            </div>

            {history.length > 0 ? (
              <div className="w-full max-h-none overflow-visible pr-0 space-y-2.5 sm:max-h-[360px] sm:overflow-y-auto sm:pr-1">
                <AnimatePresence initial={false}>
                  {getSortedHistory().map((item) => {
                    const tryNumber = history.findIndex((h) => h.word === item.word) + 1;
                    return (
                      <motion.div
                        key={item.word}
                        initial={{ opacity: 0, x: -5 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 5 }}
                        className={`liquid-glass p-3 sm:p-3.5 rounded-xl flex items-center justify-between gap-3 border transition-all min-w-0 ${getScoreColor(
                          item.score
                        )}`}
                      >
                        <div className="flex min-w-0 flex-1 items-center gap-3">
                          <span className="text-[10px] text-slate-500 dark:text-slate-400 font-bold font-mono bg-[var(--apple-gray-btn)] border-none w-7 h-7 sm:w-6 sm:h-6 rounded-md flex items-center justify-center shrink-0">
                            #{tryNumber}
                          </span>
                          <span className="min-w-0 font-semibold text-slate-900 dark:text-white text-sm md:text-base tracking-normal truncate">
                            {item.word}
                          </span>
                        </div>

                        <div className="flex shrink-0 items-center gap-3 sm:gap-4">
                          <div className="hidden sm:flex flex-col items-end text-[9px] leading-tight">
                            <span className="text-slate-500">코사인 유사도</span>
                            <span className="font-mono text-slate-600 dark:text-slate-400 font-semibold">
                              {item.similarity.toFixed(4)}
                            </span>
                          </div>
                          
                          <div className="flex flex-col items-end shrink-0 min-w-[52px]">
                            <span className="text-[9px] text-slate-500 font-bold uppercase tracking-normal">점수</span>
                            <span className="font-bold font-mono text-sm md:text-base text-slate-900 dark:text-slate-100">
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

            {/* 이전 초기화된 시도 기록 (모아보기) */}
            {pastSessions.length > 0 && (
              <div className="mt-6 pt-5 border-t border-slate-200 dark:border-zinc-800 w-full">
                <h4 className="text-[11px] font-bold uppercase tracking-normal text-slate-500 dark:text-slate-450 mb-3 flex items-center justify-between">
                  <span>이전 시도 기록 ({pastSessions.length}개 세션)</span>
                  <button 
                    onClick={() => {
                      if (confirm("이전 시도 기록 목록을 완전히 지우시겠습니까?")) {
                        setPastSessions([]);
                        localStorage.removeItem("guessword_past_sessions");
                      }
                    }}
                    className="text-[9px] text-red-500 hover:text-red-600 bg-transparent border-none cursor-pointer p-0 font-semibold uppercase tracking-normal"
                  >
                    목록 전체 삭제
                  </button>
                </h4>
                <div className={`space-y-3 pr-1 ${isPastSessionsExpanded ? "max-h-[300px] overflow-y-auto" : ""}`}>
                  {(isPastSessionsExpanded ? pastSessions : pastSessions.slice(0, 2)).map((session, index) => (
                    <div 
                      key={session.id} 
                      className="liquid-glass p-3 rounded-xl border border-slate-200/50 dark:border-white/5 text-[11px] sm:text-xs"
                    >
                      <div className="flex items-center justify-between font-bold text-slate-700 dark:text-slate-350 mb-2 pb-1.5 border-b border-slate-200/40 dark:border-zinc-800/40">
                        <span>라운드 #{pastSessions.length - index} (시도 {session.attemptsCount}회)</span>
                        <div className="flex flex-col items-end gap-1">
                          <span className="text-[10px] text-slate-500 font-mono">
                            최고 {session.bestScore}점 · {new Date(session.resetTime).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                          </span>
                          {pastAnswers[session.id] && (
                            <span className="text-[10px] bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 px-1.5 py-0.5 rounded font-semibold tracking-wide shadow-sm">
                              정답: {pastAnswers[session.id]}
                            </span>
                          )}
                        </div>
                      </div>
                      
                      {/* 이 세션의 단어들 나열 */}
                      <div className="flex flex-wrap gap-1.5 max-h-[120px] overflow-y-auto pr-1">
                        {session.guesses.map((g, gi) => (
                          <span 
                            key={gi} 
                            className="px-2 py-0.5 rounded bg-[rgba(120,120,128,0.06)] dark:bg-[rgba(120,120,128,0.12)] text-slate-900 dark:text-white font-medium"
                            title={`점수: ${g.score}점 / 유사도: ${g.similarity.toFixed(4)}`}
                          >
                            {g.word} <strong className="text-[9px] text-[var(--apple-blue)] font-bold font-mono ml-0.5">{g.score}</strong>
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
                {pastSessions.length > 2 && (
                  <button
                    onClick={() => setIsPastSessionsExpanded(!isPastSessionsExpanded)}
                    className="w-full mt-3 py-2 text-[11px] font-semibold text-slate-500 hover:bg-[var(--apple-gray-btn-hover)] bg-[var(--apple-gray-btn)] rounded-lg transition-colors border-none cursor-pointer"
                  >
                    {isPastSessionsExpanded ? "접기" : `나머지 ${pastSessions.length - 2}개 더 보기`}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* 우측 실시간 피드 전광판 */}
        <div className="lg:col-span-1 w-full space-y-4">
          <AttemptTicker
            userNickname={currentUser || anonNickname}
            attempts={attempts}
            isLoading={isStatsLoading}
            isRefreshing={isStatsRefreshing}
            onRefresh={() => loadAllStats(true)}
            errorMsg={statsError}
          />
          <ClearTicker
            userNickname={currentUser || anonNickname}
            clears={clears}
            isLoading={isStatsLoading}
            isRefreshing={isStatsRefreshing}
            onRefresh={() => loadAllStats(true)}
            errorMsg={statsError}
          />
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
