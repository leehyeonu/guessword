import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest, { params }: { params: { path: string[] } }) {
    return handleProxy(request, params.path);
}

export async function POST(request: NextRequest, { params }: { params: { path: string[] } }) {
    return handleProxy(request, params.path);
}

export async function PUT(request: NextRequest, { params }: { params: { path: string[] } }) {
    return handleProxy(request, params.path);
}

export async function DELETE(request: NextRequest, { params }: { params: { path: string[] } }) {
    return handleProxy(request, params.path);
}

async function handleProxy(request: NextRequest, pathArray: string[]) {
    // 환경변수 확인
    const hfApiUrl = process.env.HF_API_URL || "http://localhost:8000";
    const hfToken = process.env.HF_TOKEN;

    // 실제 백엔드로 요청할 최종 URL 구성
    const path = pathArray.join("/");
    const searchParams = request.nextUrl.searchParams.toString();
    const targetUrl = `${hfApiUrl.replace(/\/$/, "")}/api/${path}${searchParams ? `?${searchParams}` : ""}`;

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

        // 응답 헤더 복사
        const responseHeaders = new Headers(response.headers);
        
        // 브라우저로 응답 반환
        return new NextResponse(response.body, {
            status: response.status,
            statusText: response.statusText,
            headers: responseHeaders,
        });

    } catch (error) {
        console.error("Proxy error:", error);
        return NextResponse.json({ error: "Proxy server error" }, { status: 500 });
    }
}
