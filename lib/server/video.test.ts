import { describe, expect, it } from "vitest";
import { hasVideoSignature, parseMoovSeconds, readVideoSeconds } from "./video";

// 영상 파일 모양·길이 검사 자동 시험 (실제 영상 없이 만든 작은 가짜 파일 사용)

function u32(n: number) {
  const b = new Uint8Array(4);
  new DataView(b.buffer).setUint32(0, n);
  return b;
}
function ascii(s: string) {
  return new Uint8Array([...s].map((c) => c.charCodeAt(0)));
}
function concat(...parts: Uint8Array[]) {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}
function box(type: string, payload: Uint8Array) {
  return concat(u32(8 + payload.length), ascii(type), payload);
}
// mvhd 버전 0: 버전·플래그(4) + 만든 시각(4) + 고친 시각(4) + timescale(4) + duration(4) + ...
function mvhd(timescale: number, duration: number) {
  return box(
    "mvhd",
    concat(u32(0), u32(0), u32(0), u32(timescale), u32(duration), new Uint8Array(80)),
  );
}
const ftyp = box("ftyp", concat(ascii("isom"), u32(0), ascii("isom")));

describe("hasVideoSignature", () => {
  it("ftyp로 시작하면 영상 모양", () => {
    expect(hasVideoSignature(ftyp.slice(0, 12))).toBe(true);
  });
  it("글자 파일은 거절", () => {
    expect(hasVideoSignature(ascii("hello world, not a video"))).toBe(false);
  });
  it("너무 짧으면 거절", () => {
    expect(hasVideoSignature(new Uint8Array(4))).toBe(false);
  });
});

describe("영상 길이 읽기", () => {
  it("moov 안의 mvhd에서 초를 계산한다", () => {
    expect(parseMoovSeconds(mvhd(1000, 12_500))).toBeCloseTo(12.5);
  });
  it("moov가 파일 끝에 있어도 읽는다", async () => {
    const file = new Blob([concat(ftyp, box("mdat", new Uint8Array(100)), box("moov", mvhd(600, 6000)))]);
    expect(await readVideoSeconds(file)).toBeCloseTo(10);
  });
  it("긴 영상은 긴 값을 돌려준다", async () => {
    const file = new Blob([concat(ftyp, box("moov", mvhd(1000, 60_000)))]);
    expect(await readVideoSeconds(file)).toBeCloseTo(60);
  });
  it("moov가 없으면 null (막지 않고 AI 쪽 15초 제한에 맡긴다)", async () => {
    const file = new Blob([concat(ftyp, box("mdat", new Uint8Array(50)))]);
    expect(await readVideoSeconds(file)).toBeNull();
  });
  it("망가진 파일은 null", async () => {
    expect(await readVideoSeconds(new Blob([ascii("garbage data here")]))).toBeNull();
  });
});
