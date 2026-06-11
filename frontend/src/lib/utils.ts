/**
 * 세션 완료 시각 포맷팅
 * 24시간 미만인 경우 상대적 표기(예: '3시간 전')를 제공하고, 24시간을 넘기면 절대 시각 포맷을 반환함
 */
export const formatSessionTime = (isoString: string): string => {
  try {
    const date = new Date(isoString);
    if (isNaN(date.getTime())) return "알 수 없는 시간";

    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffSec = Math.floor(diffMs / 1000);

    if (diffSec < 60) {
      return "방금 전";
    }

    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) {
      return `${diffMin}분 전`;
    }

    const diffHrs = Math.floor(diffMin / 60);
    if (diffHrs < 24) {
      return `${diffHrs}시간 전`;
    }

    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, "0");
    const dd = String(date.getDate()).padStart(2, "0");
    const hh = String(date.getHours()).padStart(2, "0");
    const min = String(date.getMinutes()).padStart(2, "0");

    return `${yyyy}. ${mm}. ${dd}. ${hh}:${min}`;
  } catch (e) {
    return "알 수 없는 시간";
  }
};

/**
 * 유사도 점수대별 카드 컴포넌트 CSS 클래스 반환
 * Apple Human Interface Guidelines 스타일 반영
 */
export const getScoreColor = (score: number): string => {
  if (score >= 90)
    return "text-red-650 dark:text-red-400 border-red-500/20 bg-red-500/5 dark:bg-red-500/10";
  if (score >= 75)
    return "text-orange-650 dark:text-orange-400 border-orange-500/20 bg-orange-500/5 dark:bg-orange-500/10";
  if (score >= 55)
    return "text-amber-650 dark:text-amber-400 border-amber-500/20 bg-amber-500/5 dark:bg-amber-500/10";
  if (score >= 35)
    return "text-blue-650 dark:text-blue-400 border-blue-500/20 bg-blue-500/5 dark:bg-blue-500/10";
  if (score >= 15)
    return "text-slate-600 dark:text-slate-400 border-slate-300 dark:border-slate-700/60 bg-slate-400/10 dark:bg-slate-500/10";
  return "text-slate-500 dark:text-slate-400 border-slate-200 dark:border-white/5";
};

/**
 * 유사도 점수대별 불꽃 아이콘 활성화 색상 클래스 반환
 */
export const getScoreIconColor = (score: number): string => {
  if (score >= 75) return "text-red-500 dark:text-red-400 fill-red-500/10 animate-pulse";
  if (score >= 55) return "text-orange-500 dark:text-orange-400";
  if (score >= 35) return "text-blue-500 dark:text-blue-400";
  return "text-slate-400 dark:text-slate-500";
};

/**
 * 유사도 점수대별 설명 가이드 텍스트 반환
 */
export const getScoreLabel = (score: number): string => {
  if (score >= 90) return "정답이 코앞에 있습니다!";
  if (score >= 75) return "매우 유사함 (근접 순위권)";
  if (score >= 55) return "따뜻함 (상위 1000위 이내)";
  if (score >= 35) return "약간 연관 있음";
  if (score >= 15) return "연관성 낮음";
  return "연관성 없음";
};
