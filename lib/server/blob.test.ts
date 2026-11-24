import { describe, expect, it } from "vitest";
import { isBlobVideoUrl } from "./blob";

// 서버가 읽어도 되는 Blob 주소인지 가려내는 규칙 시험 (다른 서버를 몰래 호출하는 것을 막아요)

describe("isBlobVideoUrl", () => {
  const ok = [
    "https://abc123.private.blob.vercel-storage.com/uploads/1234-video.mp4",
    "https://abc123.public.blob.vercel-storage.com/uploads/x.mov",
  ];
  for (const url of ok) {
    it(`허용: ${url}`, () => expect(isBlobVideoUrl(url)).toBe(true));
  }

  const bad: [string, unknown][] = [
    ["http(암호화 없음)", "http://abc.private.blob.vercel-storage.com/uploads/a.mp4"],
    ["다른 사이트", "https://evil.example.com/uploads/a.mp4"],
    ["닮은 주소(뒤에 붙임)", "https://abc.blob.vercel-storage.com.evil.com/uploads/a.mp4"],
    ["닮은 주소(점 없이 붙임)", "https://evilblob.vercel-storage.com/uploads/a.mp4"],
    ["아이디 끼워 넣기", "https://x@evil.com.blob.vercel-storage.com@evil.com/uploads/a.mp4"],
    ["포트 지정", "https://abc.blob.vercel-storage.com:8443/uploads/a.mp4"],
    ["업로드 폴더 밖", "https://abc.private.blob.vercel-storage.com/secret/a.mp4"],
    ["경로 거슬러 오르기", "https://abc.private.blob.vercel-storage.com/uploads/../secret/a.mp4"],
    ["내 컴퓨터 주소", "https://localhost/uploads/a.mp4"],
    ["문자열이 아님", { url: "x" }],
    ["빈 값", ""],
    ["너무 긴 주소", "https://a.blob.vercel-storage.com/uploads/" + "a".repeat(3000)],
  ];
  for (const [name, value] of bad) {
    it(`거절: ${name}`, () => expect(isBlobVideoUrl(value)).toBe(false));
  }
});
