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
    // 환경변수 확인
    const hfApiUrl = process.env.HF_API_URL || "http://localhost:8000";
    const hfToken = process.env.HF_TOKEN;

    // 실제 백엔드로 요청할 최종 URL 구성
    const path = pathArray.join("/");
    const searchParams = request.nextUrl.searchParams.toString();
    const targetUrl = `${hfApiUrl.replace(/\/$/, "")}/api/${path}${searchParams ? `?${searchParams}` : ""}`;

    // 서버 로그 (Vercel Functions 로그에서 확인 가능)
    console.log(`[Proxy] ${request.method} ${path} -> ${targetUrl} (token: ${hfToken ? "있음" : "없음"})`);

    // 요청 헤더 복사 및 Authorization 헤더 추가
    const headers = new Headers(request.headers);
    headers.delete("host"); // host 헤더 충돌 방지
    
    if (hfToken) {
        headers.set("Authorization", `Bearer ${hfToken}`);
    }

    // Body 데이터 복사 (POST, PUT 등인 경우)
    let body = undefined;
    if (request.method !== "GET" && request.method !== "HEAD") {
        try {
            body = await request.text();
        } catch (e) {
            console.error("Failed to read request body", e);
        }
    }

    try {
        const response = await fetch(targetUrl, {
            method: request.method,
            headers,
            body,
            // Next.js fetch 캐싱 우회
            cache: 'no-store',
        });

        // 응답 Content-Type 확인
        const contentType = response.headers.get("content-type") || "";
        
        // 비-JSON 응답 감지 (HF Space의 404 HTML 페이지 등)
        if (!contentType.includes("application/json")) {
            const text = await response.text();
            console.error(`[Proxy] 비-JSON 응답 수신: status=${response.status}, content-type=${contentType}, body=${text.slice(0, 200)}`);
            
            // 적절한 JSON 에러 응답으로 변환
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
        
        // 정상 JSON 응답 → 그대로 전달
        const responseHeaders = new Headers(response.headers);
        
        return new NextResponse(response.body, {
            status: response.status,
            statusText: response.statusText,
            headers: responseHeaders,
        });

    } catch (error: any) {
        console.error("[Proxy] 네트워크 오류:", error.message);
        return NextResponse.json(
            { detail: "백엔드 서버에 연결할 수 없습니다. 서버가 실행 중인지 확인해 주세요." }, 
            { status: 502 }
        );
    }
}
