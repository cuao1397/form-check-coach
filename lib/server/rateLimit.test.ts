import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  MAX_DAILY_ANALYSES,
  MAX_DAILY_ATTEMPTS,
  MAX_GLOBAL_DAILY_ATTEMPTS,
} from "../limits";

// 이용 횟수 제한 자동 시험. 모듈 안의 기록(Map)이 시험끼리 섞이지 않도록 매번 새로 불러와요.

async function load() {
  vi.resetModules();
  return import("./rateLimit");
}

beforeEach(() => {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("KV_REST_API_URL", "");
  vi.stubEnv("KV_REST_API_TOKEN", "");
  vi.stubEnv("UPSTASH_REDIS_REST_URL", "");
  vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("서버 메모리 방식(공용 저장소 없음)", () => {
  it("하루 5회까지만 허용한다", async () => {
    const { takeSlot } = await load();
    for (let i = 0; i < MAX_DAILY_ANALYSES; i++) expect(await takeSlot("a")).toBe("ok");
    expect(await takeSlot("a")).toBe("user-limit");
  });
  it("사람마다 따로 센다", async () => {
    const { takeSlot } = await load();
    for (let i = 0; i < MAX_DAILY_ANALYSES; i++) await takeSlot("a");
    expect(await takeSlot("b")).toBe("ok");
  });
  it("실패해서 돌려받으면 다시 쓸 수 있다", async () => {
    const { takeSlot, releaseSlot } = await load();
    for (let i = 0; i < MAX_DAILY_ANALYSES; i++) await takeSlot("a");
    await releaseSlot("a");
    expect(await takeSlot("a")).toBe("ok");
  });
  it("돌려받기를 반복해도 하루 시도 10회를 넘지 못한다", async () => {
    const { takeSlot, releaseSlot } = await load();
    for (let i = 0; i < MAX_DAILY_ATTEMPTS; i++) {
      expect(await takeSlot("a")).toBe("ok");
      await releaseSlot("a");
    }
    expect(await takeSlot("a")).toBe("user-limit");
  });
  it("서비스 전체 하루 상한을 넘으면 막는다", async () => {
    const { takeSlot } = await load();
    for (let i = 0; i < MAX_GLOBAL_DAILY_ATTEMPTS; i++) expect(await takeSlot(`user-${i}`)).toBe("ok");
    expect(await takeSlot("새로운 사람")).toBe("global-limit");
  });
  it("개발 서버에서는 세지 않는다", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const { takeSlot } = await load();
    for (let i = 0; i < 50; i++) expect(await takeSlot("a")).toBe("ok");
  });
  it("업로드 허가도 하루 10회까지", async () => {
    const { takeUploadSlot } = await load();
    for (let i = 0; i < MAX_DAILY_ATTEMPTS; i++) expect(await takeUploadSlot("a")).toBe(true);
    expect(await takeUploadSlot("a")).toBe(false);
  });
});

describe("공용 저장소(Redis) 방식", () => {
  function connect(result: unknown) {
    vi.stubEnv("KV_REST_API_URL", "https://example.upstash.io/");
    vi.stubEnv("KV_REST_API_TOKEN", "﻿secret-token \n"); // BOM·공백이 섞여도 정리해서 써요
    const fetchMock = vi.fn(async () => Response.json({ result }));
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }

  it("저장소의 답을 그대로 따른다 (1=허용, 0=개인 한도, -1=전체 한도)", async () => {
    const { takeSlot } = await load();
    connect(1);
    expect(await takeSlot("a")).toBe("ok");
    connect(0);
    expect(await takeSlot("a")).toBe("user-limit");
    connect(-1);
    expect(await takeSlot("a")).toBe("global-limit");
  });
  it("접속 주소를 그대로 보내지 않고 해시로만 보낸다", async () => {
    const { takeSlot } = await load();
    const fetchMock = connect(1);
    await takeSlot("203.0.113.7");
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://example.upstash.io");
    expect(String(init.body)).not.toContain("203.0.113.7");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer secret-token");
    const body = JSON.parse(String(init.body)) as string[];
    expect(body[0]).toBe("EVAL");
    expect(body[2]).toBe("3"); // 키 3개
    expect(body[3]).toMatch(/^fc:\d{4}-\d{2}-\d{2}:[0-9a-f]{24}:count$/);
  });
  it("저장소가 응답하지 않으면 서버 메모리로 넘어가서 서비스는 계속된다", async () => {
    const { takeSlot } = await load();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.stubEnv("KV_REST_API_URL", "https://example.upstash.io");
    vi.stubEnv("KV_REST_API_TOKEN", "t");
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("network down"); }));
    for (let i = 0; i < MAX_DAILY_ANALYSES; i++) expect(await takeSlot("a")).toBe("ok");
    expect(await takeSlot("a")).toBe("user-limit");
  });
  it("저장소가 오류를 돌려줘도 메모리로 넘어간다", async () => {
    const { takeSlot } = await load();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.stubEnv("KV_REST_API_URL", "https://example.upstash.io");
    vi.stubEnv("KV_REST_API_TOKEN", "t");
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ error: "ERR" }, { status: 400 })));
    expect(await takeSlot("a")).toBe("ok");
  });
});
