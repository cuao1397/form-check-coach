import { MAX_VIDEO_BYTES, MAX_VIDEO_MB, MESSAGES, isAllowedVideo } from "@/lib/limits";
import { analyzeVideo } from "@/lib/server/analyze";
import { clientId, releaseSlot, takeSlot } from "@/lib/server/rateLimit";
import { applySafetyRules } from "@/lib/server/safety";
import type { ApiError } from "@/lib/types";

// 이 파일은 "화면 뒤(서버)"에서만 실행돼요. 받기 → 검사 → 분석 → 안전 처리 → 응답만 맡아요.
// API 키는 .env에서 여기서만 읽고, 브라우저로는 절대 보내지 않아요.

export const maxDuration = 60;

function fail(error: string, status: number, retryable = false) {
  const body: ApiError = { error, retryable };
  return Response.json(body, { status });
}

export async function POST(request: Request) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return fail(
      "서버에 GEMINI_API_KEY가 설정되어 있지 않아요. .env 파일에 키를 넣고 서버를 다시 켜 주세요.",
      500,
    );
  }

  let file: FormDataEntryValue | null;
  let consent: FormDataEntryValue | null;
  try {
    const form = await request.formData();
    file = form.get("video");
    consent = form.get("consent");
  } catch {
    return fail("요청 형식이 올바르지 않아요.", 400);
  }
  // 동의 없이는 분석하지 않아요 (화면에서도 막지만 서버가 다시 확인해요)
  if (consent !== "true") {
    return fail("영상 전송에 동의해야 분석할 수 있어요.", 400);
  }
  if (!(file instanceof File) || file.size === 0) {
    return fail("분석할 영상을 올려 주세요.", 400);
  }
  // 화면에서도 검사하지만, 서버가 형식과 용량을 다시 확인해요
  if (!isAllowedVideo(file.name, file.type)) {
    return fail(MESSAGES.fileLimit, 400);
  }
  if (file.size > MAX_VIDEO_BYTES) {
    return fail(`영상 용량은 ${MAX_VIDEO_MB}MB 이하만 지원해요.`, 400);
  }

  // 하루 5회 제한 (AI 사용 비용 보호). AI가 결과를 돌려준 경우만 1회로 세요.
  const id = clientId(request);
  if (!takeSlot(id)) {
    return fail(MESSAGES.dailyLimit, 429);
  }

  // 같은 영상 형식이라도 브라우저가 형식을 비워 보내면 확장자로 정해 줘요
  const typed =
    file.type || (file.name.toLowerCase().endsWith(".mov") ? "video/quicktime" : "video/mp4");
  const video = file.type ? file : new File([file], file.name, { type: typed });

  const outcome = await analyzeVideo(apiKey, video);
  if (!outcome.ok) {
    releaseSlot(id); // 서버 오류·시간 초과는 횟수에 세지 않아요
    return fail(outcome.message, outcome.status, outcome.retryable);
  }

  const safe = applySafetyRules(outcome.raw);
  if (safe.kind === "blocked") {
    releaseSlot(id); // 진단 표현 차단 등으로 결과를 못 보여 준 경우도 세지 않아요
    return fail(
      safe.reason === "diagnosis"
        ? "분석 결과에 의학적으로 들릴 수 있는 표현이 있어 보여 드리지 않았어요. 다시 시도해 주세요."
        : "AI가 충분한 분석을 만들지 못했어요. 다시 시도해 주세요.",
      502,
      true,
    );
  }

  return Response.json(safe.result);
}
