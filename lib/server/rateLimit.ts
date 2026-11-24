import { createHash } from "node:crypto";
import { MAX_DAILY_ANALYSES, MAX_DAILY_ATTEMPTS, MAX_GLOBAL_DAILY_ATTEMPTS } from "../limits";
import { isRedisConfigured, redisEval } from "./redis";

// 이용 횟수를 세요 (AI 사용 비용 보호).
//  - 한 사람(접속 주소 기준)이 하루에 받을 수 있는 분석 횟수 (count)
//  - 실패해도 돌려받지 않는 하루 AI 호출 시도 횟수 (attempts)
//  - 서비스 전체가 하루에 쓸 수 있는 AI 호출 시도 횟수 (global)
// 공용 저장소(Redis)가 연결되어 있으면 거기에 세어서 서버가 여러 개여도, 재시작해도 유지돼요.
// 연결되어 있지 않거나 저장소에 문제가 생기면 서버 메모리로 세요(서버가 다시 시작되면 0으로 돌아가는 "최선의 보호").

export type SlotResult = "ok" | "user-limit" | "global-limit";

function today() {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });
}

/** 요청한 사람을 구분할 값(접속 주소)을 꺼내요 */
export function clientId(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  return (
    forwarded?.split(",")[0].trim() ||
    request.headers.get("x-real-ip") ||
    "local"
  );
}

// 공용 저장소에는 접속 주소를 그대로 두지 않고, 되돌릴 수 없는 값(해시)으로만 저장해요
function hashId(id: string): string {
  return createHash("sha256").update(id).digest("hex").slice(0, 24);
}

// 저장소 기록은 이틀 뒤 자동으로 사라져요 (하루 단위로만 쓰면 되니까요)
const TTL_SECONDS = 2 * 24 * 60 * 60;

// ───────── 서버 메모리 방식 (저장소가 없을 때) ─────────
const usage = new Map<string, { day: string; count: number; attempts: number }>();
const uploads = new Map<string, { day: string; count: number }>();
let globalUsage = { day: "", attempts: 0 };

function memoryTake(id: string): SlotResult {
  const day = today();

  // 지난 날짜 기록은 가끔 정리해요 (메모리가 계속 늘지 않게)
  if (usage.size > 5000) {
    for (const [key, value] of usage) {
      if (value.day !== day) usage.delete(key);
    }
  }

  const entry = usage.get(id);
  // 실패로 횟수를 돌려받아도 시도 횟수는 남아서, 일부러 실패시켜 AI를 계속 쓰는 것을 막아요
  if (entry && entry.day === day && (entry.count >= MAX_DAILY_ANALYSES || entry.attempts >= MAX_DAILY_ATTEMPTS)) {
    return "user-limit";
  }
  if (globalUsage.day !== day) globalUsage = { day, attempts: 0 };
  if (globalUsage.attempts >= MAX_GLOBAL_DAILY_ATTEMPTS) return "global-limit";

  globalUsage.attempts += 1;
  if (!entry || entry.day !== day) {
    usage.set(id, { day, count: 1, attempts: 1 });
  } else {
    entry.count += 1;
    entry.attempts += 1;
  }
  return "ok";
}

function memoryRelease(id: string): void {
  const entry = usage.get(id);
  if (entry && entry.day === today() && entry.count > 0) entry.count -= 1;
}

function memoryTakeUpload(id: string): boolean {
  const day = today();
  const entry = uploads.get(id);
  if (!entry || entry.day !== day) {
    uploads.set(id, { day, count: 1 });
    return true;
  }
  if (entry.count >= MAX_DAILY_ATTEMPTS) return false;
  entry.count += 1;
  return true;
}

// ───────── 공용 저장소(Redis) 방식 ─────────
// 확인과 증가를 한 번에 해서, 동시에 여러 요청이 와도 횟수가 어긋나지 않아요.
// 반환: 1 = 허용, 0 = 한 사람 한도 초과, -1 = 서비스 전체 한도 초과
const TAKE_SCRIPT = `
local c = tonumber(redis.call('GET', KEYS[1]) or '0')
local a = tonumber(redis.call('GET', KEYS[2]) or '0')
local g = tonumber(redis.call('GET', KEYS[3]) or '0')
if c >= tonumber(ARGV[1]) or a >= tonumber(ARGV[2]) then return 0 end
if g >= tonumber(ARGV[3]) then return -1 end
redis.call('INCR', KEYS[1])
redis.call('INCR', KEYS[2])
redis.call('INCR', KEYS[3])
for i = 1, 3 do redis.call('EXPIRE', KEYS[i], tonumber(ARGV[4])) end
return 1
`;
const RELEASE_SCRIPT = `
local c = tonumber(redis.call('GET', KEYS[1]) or '0')
if c > 0 then redis.call('DECR', KEYS[1]) end
return 1
`;
const UPLOAD_SCRIPT = `
local u = tonumber(redis.call('GET', KEYS[1]) or '0')
if u >= tonumber(ARGV[1]) then return 0 end
redis.call('INCR', KEYS[1])
redis.call('EXPIRE', KEYS[1], tonumber(ARGV[2]))
return 1
`;

function keys(id: string) {
  const day = today();
  const h = hashId(id);
  return {
    count: `fc:${day}:${h}:count`,
    attempts: `fc:${day}:${h}:attempts`,
    global: `fc:${day}:global:attempts`,
    uploads: `fc:${day}:${h}:uploads`,
  };
}

/** 오늘 횟수가 남아 있으면 1회 쓰고 "ok", 다 썼으면 한도 종류를 알려 줘요 */
export async function takeSlot(id: string): Promise<SlotResult> {
  // 내 컴퓨터의 개발 서버(npm run dev)에서는 시험을 마음껏 할 수 있게 횟수를 세지 않아요.
  // 배포한 서버(production)에서는 그대로 지켜요.
  if (process.env.NODE_ENV === "development") return "ok";

  if (isRedisConfigured()) {
    try {
      const k = keys(id);
      const r = await redisEval(
        TAKE_SCRIPT,
        [k.count, k.attempts, k.global],
        [MAX_DAILY_ANALYSES, MAX_DAILY_ATTEMPTS, MAX_GLOBAL_DAILY_ATTEMPTS, TTL_SECONDS],
      );
      return r === 1 ? "ok" : r === -1 ? "global-limit" : "user-limit";
    } catch (e) {
      console.error("[rateLimit] 공용 저장소에 문제가 있어 서버 메모리로 셉니다:", e instanceof Error ? e.message : e);
    }
  }
  return memoryTake(id);
}

/** 분석이 결과를 내지 못했을 때(서버 오류·시간 초과 등) 쓴 1회를 돌려줘요 */
export async function releaseSlot(id: string): Promise<void> {
  if (process.env.NODE_ENV === "development") return;
  if (isRedisConfigured()) {
    try {
      await redisEval(RELEASE_SCRIPT, [keys(id).count], []);
      return;
    } catch (e) {
      console.error("[rateLimit] 횟수를 돌려주지 못했어요:", e instanceof Error ? e.message : e);
    }
  }
  memoryRelease(id);
}

/** Blob 업로드 허가를 받은 횟수 (분석을 안 하고 업로드만 반복해 저장 공간을 쓰는 것을 막아요) */
export async function takeUploadSlot(id: string): Promise<boolean> {
  if (process.env.NODE_ENV === "development") return true;
  if (isRedisConfigured()) {
    try {
      const r = await redisEval(UPLOAD_SCRIPT, [keys(id).uploads], [MAX_DAILY_ATTEMPTS, TTL_SECONDS]);
      return r === 1;
    } catch (e) {
      console.error("[rateLimit] 업로드 횟수를 확인하지 못했어요:", e instanceof Error ? e.message : e);
    }
  }
  return memoryTakeUpload(id);
}
