import { NextRequest, NextResponse } from "next/server";

type RouteParams = { params: Promise<{ path: string[] }> };

export async function GET(request: NextRequest, { params }: RouteParams) {
    const { path } = await params;
    return handleProxy(request, path);
}

export async function POST(request: NextRequest, { params }: RouteParams) {
    const { path } = await params;
    return handleProxy(request, path);
}

export async function PUT(request: NextRequest, { params }: RouteParams) {
    const { path } = await params;
    return handleProxy(request, path);
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
    const { path } = await params;
    return handleProxy(request, path);
}

async function handleProxy(request: NextRequest, pathArray: string[]) {
    // 1. 백엔드 타겟 URL 설정을 위한 환경변수 검증
    // HF Space (Hugging Face Spaces) 등의 Private 배포 환경이나 localhost 등 타겟 API 서버 주소 구성
    const hfApiUrl = process.env.HF_API_URL || "http://localhost:8000";
    const hfToken = process.env.HF_TOKEN;

    // 2. 실제 백엔드로 요청을 포워딩하기 위한 최종 URL 조립
    const path = pathArray.join("/");
    const searchParams = request.nextUrl.searchParams.toString();
    const targetUrl = `${hfApiUrl.replace(/\/$/, "")}/api/${path}${searchParams ? `?${searchParams}` : ""}`;

    // 3. 분산 시스템 관측성(Observability) 및 에러 추적성 확보를 위한 Request ID 식별
    // 게이트웨이나 클라이언트 헤더에 없을 경우 UUID 형식의 고유 식별자를 생성하여 전파
    const requestId = request.headers.get("x-request-id") || 
                      request.headers.get("x-correlation-id") || 
                      (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2, 15));

    // 4. 개인정보(PII) 및 민감정보 로깅 보안 가이드라인 준수
    // 쿼리 매개변수 내 JWT 인증 토큰(token)이 평문으로 Vercel/Node.js 서버 로그에 노출되지 않도록 마스킹 처리
    const logSearchParams = new URLSearchParams(searchParams);
    if (logSearchParams.has("token")) {
        logSearchParams.set("token", "MASKED_TOKEN");
    }
    const logTargetUrl = `${hfApiUrl.replace(/\/$/, "")}/api/${path}${logSearchParams.toString() ? `?${logSearchParams.toString()}` : ""}`;

    // 보안이 안전하게 보장된 마스킹 처리된 URL 및 Request ID를 로깅
    console.log(`[Proxy] [RequestID: ${requestId}] ${request.method} ${path} -> ${logTargetUrl} (token: ${hfToken ? "있음" : "없음"})`);

    // 5. 프록시 헤더 구성 및 Authorization Bearer 토큰 연동
    const headers = new Headers(request.headers);
    headers.delete("host"); // host 헤더 오버라이드로 인한 라우팅 충돌 방지
    headers.set("X-Request-ID", requestId); // 백엔드 로깅 시스템과의 추적성 유지를 위해 Request ID 주입
    
    if (hfToken) {
        headers.set("Authorization", `Bearer ${hfToken}`);
    }

    // 6. POST, PUT 요청 시 페이로드 버디 데이터를 복사하여 전달
    let body = undefined;
    if (request.method !== "GET" && request.method !== "HEAD") {
        try {
            body = await request.text();
        } catch (e) {
            console.error("Failed to read request body", e);
        }
    }

    try {
        // 백엔드 API 서버 호출 실행 (Next.js 빌트인 캐시 레이어를 우회하고 실시간 패치를 보장하기 위해 cache: 'no-store' 명시)
        const response = await fetch(targetUrl, {
            method: request.method,
            headers,
            body,
            cache: 'no-store',
        });

        // 7. 응답 Content-Type 유효성 검증
        const contentType = response.headers.get("content-type") || "";
        
        // 백엔드가 비정상적으로 종료되었거나 게이트웨이 에러(502/404 HTML 페이지)를 반환하는 경우,
        // 클라이언트에서 JSON.parse 에러로 인한 화이트 스크린 크래시가 유발되는 것을 방지하기 위해 예외적 HTML 응답 필터링 처리
        if (!contentType.includes("application/json")) {
            const text = await response.text();
            console.error(`[Proxy] 비-JSON 응답 수신: status=${response.status}, content-type=${contentType}, body=${text.slice(0, 200)}`);
            
            return NextResponse.json(
                { 
                    detail: response.status === 404 
                        ? "백엔드 API 경로를 찾을 수 없습니다." 
                        : response.status === 401 || response.status === 403
                        ? "백엔드 인증에 실패했습니다. 토큰을 확인해 주세요."
                        : `백엔드 서버 오류 (${response.status})` 
                }, 
                { status: response.status }
            );
        }
        
        // 정상적인 JSON 포맷 응답의 경우 클라이언트로 고대로 응답 바디 및 헤더 전송
        const responseHeaders = new Headers(response.headers);
        responseHeaders.set("X-Request-ID", requestId); // 클라이언트 디버깅 유용성을 위한 응답 헤더 추가
        
        return new NextResponse(response.body, {
            status: response.status,
            statusText: response.statusText,
            headers: responseHeaders,
        });

    } catch (error: any) {
        // 백엔드 API 인스턴스 미기동 또는 오프라인 장애 상황 대응을 위한 502 Bad Gateway 폴백 뷰 반환
        console.error("[Proxy] 네트워크 오류:", error.message);
        return NextResponse.json(
            { detail: "백엔드 서버에 연결할 수 없습니다. 서버가 실행 중인지 확인해 주세요." }, 
            { status: 502 }
        );
    }
}
