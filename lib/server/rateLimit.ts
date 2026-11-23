import { MAX_DAILY_ANALYSES } from "../limits";

// 한 사람(접속 주소 기준)이 하루에 분석할 수 있는 횟수를 세요.
// 참고: 서버 메모리에 세기 때문에 서버가 다시 시작되면 0으로 돌아가요.
// 배포 환경(여러 서버로 나뉘는 곳)에서는 완벽하지 않은 "최선의 보호"예요.
const usage = new Map<string, { day: string; count: number }>();

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
  const day = today();

  // 지난 날짜 기록은 가끔 정리해요 (메모리가 계속 늘지 않게)
  if (usage.size > 5000) {
    for (const [key, value] of usage) {
      if (value.day !== day) usage.delete(key);
    }
  }

  const entry = usage.get(id);
  if (!entry || entry.day !== day) {
    usage.set(id, { day, count: 1 });
    return true;
  }
  if (entry.count >= MAX_DAILY_ANALYSES) return false;
  entry.count += 1;
  return true;
}
