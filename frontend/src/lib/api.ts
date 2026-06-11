/**
 * 백엔드 API 호스트 주소 반환
 * 브라우저에서는 외부 백엔드로 직접 쏘지 않고, Next.js 자체 API 프록시(/api/...)를 타도록 빈 문자열을 리턴함
 */
export const getApiUrl = (): string => {
  return "";
};

interface FetchWithTimeoutOptions extends RequestInit {
  timeout?: number;
}

/**
 * 네트워크 무한 대기 상태(프리징)를 막기 위한 타임아웃 지원 fetch 래퍼
 * 지정된 시간(기본 10초) 경과 시 AbortSignal을 통해 요청을 강제 드롭하고 초과 예외 던짐
 */
export async function fetchWithTimeout(
  input: RequestInfo | URL,
  init?: FetchWithTimeoutOptions
): Promise<Response> {
  const { timeout = 10000, ...options } = init || {};

  // 최신 브라우저의 AbortSignal.timeout 지원 사양 대응
  if (typeof AbortSignal !== "undefined" && "timeout" in AbortSignal) {
    try {
      return await fetch(input, {
        ...options,
        signal: AbortSignal.timeout(timeout),
      });
    } catch (err: any) {
      if (err.name === "TimeoutError") {
        throw new Error(`요청 시간이 초과되었습니다 (${timeout / 1000}초).`);
      }
      throw err;
    }
  }

  // 구형 브라우저/환경 대응을 위한 AbortController 폴백
  const controller = new AbortController();
  const timerId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(input, {
      ...options,
      signal: controller.signal,
    });
    clearTimeout(timerId);
    return response;
  } catch (err: any) {
    clearTimeout(timerId);
    if (err.name === "AbortError") {
      throw new Error(`요청 시간이 초과되었습니다 (${timeout / 1000}초).`);
    }
    throw err;
  }
}
