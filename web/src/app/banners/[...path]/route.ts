import type { NextRequest } from "next/server";

export const runtime = "nodejs";

type RouteContext = {
    params: Promise<{ path: string[] }>;
};

// 将 /banners/* 转发到 Go 后端的静态 banner 目录。
async function proxyBanner(request: NextRequest, context: RouteContext) {
    const { path } = await context.params;
    const apiBaseUrl = process.env.API_BASE_URL || "http://127.0.0.1:8080";
    const target = `${apiBaseUrl.replace(/\/$/, "")}/banners/${path.map(encodeURIComponent).join("/")}`;

    try {
        const response = await fetch(target, { cache: "no-store" });
        const headers = new Headers();
        const contentType = response.headers.get("content-type");
        if (contentType) headers.set("content-type", contentType);
        const etag = response.headers.get("etag");
        if (etag) headers.set("etag", etag);
        const lastModified = response.headers.get("last-modified");
        if (lastModified) headers.set("last-modified", lastModified);
        headers.set("cache-control", "public, max-age=3600");
        return new Response(response.body, {
            status: response.status,
            statusText: response.statusText,
            headers,
        });
    } catch (error) {
        console.error("Failed to proxy banner", target, error);
        return new Response("banner service unavailable", { status: 502 });
    }
}

export async function GET(request: NextRequest, context: RouteContext) {
    return proxyBanner(request, context);
}

export async function HEAD(request: NextRequest, context: RouteContext) {
    return proxyBanner(request, context);
}
