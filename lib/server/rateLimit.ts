import { MAX_DAILY_ANALYSES, MAX_DAILY_ATTEMPTS } from "../limits";

// 한 사람(접속 주소 기준)이 하루에 분석할 수 있는 횟수를 세요.
// 참고: 서버 메모리에 세기 때문에 서버가 다시 시작되면 0으로 돌아가요.
// 배포 환경(여러 서버로 나뉘는 곳)에서는 완벽하지 않은 "최선의 보호"예요.
// count: 결과를 받은 횟수(실패하면 돌려받아요), attempts: AI를 부른 시도 횟수(돌려받지 않아요)
const usage = new Map<string, { day: string; count: number; attempts: number }>();

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

/** 분석이 결과를 내지 못했을 때(서버 오류·시간 초과 등) 쓴 1회를 돌려줘요 */
export function releaseSlot(id: string): void {
  const entry = usage.get(id);
  if (entry && entry.day === today() && entry.count > 0) entry.count -= 1;
}

/** 오늘 횟수가 남아 있으면 1회 쓰고 true, 다 썼으면 false */
export function takeSlot(id: string): boolean {
  // 내 컴퓨터의 개발 서버(npm run dev)에서는 시험을 마음껏 할 수 있게 횟수를 세지 않아요.
  // 배포한 서버(production)에서는 그대로 하루 5회를 지켜요.
  if (process.env.NODE_ENV === "development") return true;

  const day = today();

  // 지난 날짜 기록은 가끔 정리해요 (메모리가 계속 늘지 않게)
  if (usage.size > 5000) {
    for (const [key, value] of usage) {
      if (value.day !== day) usage.delete(key);
    }
  }

  const entry = usage.get(id);
  if (!entry || entry.day !== day) {
    usage.set(id, { day, count: 1, attempts: 1 });
    return true;
  }
  // 실패로 횟수를 돌려받아도 시도 횟수는 남아서, 일부러 실패시켜 AI를 계속 쓰는 것을 막아요
  if (entry.count >= MAX_DAILY_ANALYSES || entry.attempts >= MAX_DAILY_ATTEMPTS) return false;
  entry.count += 1;
  entry.attempts += 1;
  return true;
}
