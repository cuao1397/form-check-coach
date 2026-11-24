import type { NextConfig } from "next";

// 개발 서버(npm run dev)는 화면 갱신에 eval과 웹소켓을 쓰므로 그때만 조금 풀어 줘요
const isDev = process.env.NODE_ENV === "development";

// 브라우저가 지켜 줄 보안 규칙 (다른 사이트 삽입 금지, 허용한 곳의 코드만 실행 등)
const CSP = [
  "default-src 'self'",
  // Next.js가 화면에 넣는 인라인 스크립트 때문에 'unsafe-inline'이 필요해요
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "media-src 'self' blob:", // 올린 영상 미리보기(blob:)
  "font-src 'self' data:",
  `connect-src 'self'${isDev ? " ws: wss:" : ""}`,
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const SECURITY_HEADERS = [
  { key: "Content-Security-Policy", value: CSP },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [{ source: "/:path*", headers: SECURITY_HEADERS }];
  },
};

export default nextConfig;
