import type { Metadata } from "next";
import { Noto_Sans_KR } from "next/font/google";
import "./globals.css";

// 한글이 깨지지 않도록 한글 전용 글꼴(노토 산스 KR)을 사용해요
const notoSansKr = Noto_Sans_KR({
  variable: "--font-noto-sans-kr",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
});

export const metadata: Metadata = {
  title: "스마트 폼 체크 코치",
  description:
    "운동 영상을 올리면 AI 트레이너가 자세의 틀린 점을 알려 주고 교정 포인트를 정리해 줍니다.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko" className={`${notoSansKr.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
