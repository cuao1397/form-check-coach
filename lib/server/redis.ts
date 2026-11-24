// 공용 저장소(Upstash Redis)에 REST 방식으로 명령을 보내요. 서버에서만 실행돼요.
// Vercel Marketplace의 Upstash 연동은 KV_REST_API_URL / KV_REST_API_TOKEN을 넣어 줘요.
// (Upstash를 직접 만든 경우의 UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN도 지원해요)

// 환경 변수에 눈에 안 보이는 글자(BOM)·공백이 섞이는 일이 있어서 정리해서 써요
function clean(value: string | undefined): string | undefined {
  const v = value?.replace(/^﻿/, "").trim();
  return v ? v : undefined;
}

function config() {
  const url = clean(process.env.KV_REST_API_URL) ?? clean(process.env.UPSTASH_REDIS_REST_URL);
  const token = clean(process.env.KV_REST_API_TOKEN) ?? clean(process.env.UPSTASH_REDIS_REST_TOKEN);
  return url && token ? { url: url.replace(/\/+$/, ""), token } : null;
}

/** 공용 저장소가 설정되어 있는지 (없으면 서버 메모리를 써요) */
export function isRedisConfigured(): boolean {
  return config() !== null;
}

/**
 * Lua 스크립트를 한 번에(중간에 끼어들 틈 없이) 실행해요.
 * 횟수를 "확인하고 올리는" 일을 여러 서버가 동시에 해도 어긋나지 않게 하려는 거예요.
 */
export async function redisEval(
  script: string,
  keys: string[],
  args: (string | number)[],
): Promise<unknown> {
  const c = config();
  if (!c) throw new Error("redis-not-configured");
  const res = await fetch(c.url, {
    method: "POST",
    headers: { Authorization: `Bearer ${c.token}`, "Content-Type": "application/json" },
    body: JSON.stringify(["EVAL", script, String(keys.length), ...keys, ...args.map(String)]),
    // 저장소가 느리면 분석을 막지 않도록 짧게 기다리고 메모리 방식으로 넘어가요
    signal: AbortSignal.timeout(3000),
  });
  const data = (await res.json().catch(() => null)) as { result?: unknown; error?: string } | null;
  if (!res.ok || !data || data.error) {
    throw new Error(`redis-error:${res.status}`); // 오류 내용에 키가 섞일 수 있어 상태 코드만 남겨요
  }
  return data.result;
}
