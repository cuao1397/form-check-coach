import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { MAX_VIDEO_BYTES, MESSAGES } from "@/lib/limits";
import {
  BLOB_UPLOAD_PREFIX,
  isBlobConfigured,
} from "@/lib/server/blob";
import { clientId, takeUploadSlot } from "@/lib/server/rateLimit";
import type { ApiError } from "@/lib/types";

// 큰 영상을 브라우저가 Vercel Blob에 직접 올릴 수 있게 "업로드 허가증(토큰)"을 만들어 줘요.
// 영상 자체는 이 서버를 지나가지 않아요. 키(BLOB_READ_WRITE_TOKEN)는 서버에서만 읽어요.

function fail(error: string, status: number) {
  const body: ApiError = { error, retryable: false };
  return Response.json(body, { status });
}

// 화면이 "Blob 업로드를 쓸 수 있는지" 미리 물어볼 때 답해요 (못 쓰면 예전 방식으로 올려요)
export async function GET() {
  return Response.json({ enabled: isBlobConfigured() });
}

export async function POST(request: Request) {
  if (!isBlobConfigured()) return fail(MESSAGES.serviceError, 503);

  // 다른 사이트에서 이 업로드 허가를 몰래 받아 가는 것을 막아요 (분석 API와 같은 규칙)
  const origin = request.headers.get("origin");
  const site = request.headers.get("sec-fetch-site");
  let crossSite = site !== null && site !== "same-origin" && site !== "none";
  if (origin) {
    try {
      crossSite = crossSite || new URL(origin).host !== request.headers.get("host");
    } catch {
      crossSite = true;
    }
  }
  if (crossSite) return fail("허용되지 않은 요청이에요.", 403);

  let body: HandleUploadBody;
  try {
    body = (await request.json()) as HandleUploadBody;
  } catch {
    return fail("요청 형식이 올바르지 않아요.", 400);
  }

  const id = clientId(request);
  try {
    const json = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname) => {
        // 정해진 폴더 밖으로는 올리지 못하게 해요
        if (!pathname.startsWith(BLOB_UPLOAD_PREFIX) || pathname.includes("..")) {
          throw new Error("허용되지 않은 경로예요.");
        }
        if (!(await takeUploadSlot(id))) throw new Error(MESSAGES.dailyLimit);
        return {
          allowedContentTypes: ["video/mp4", "video/quicktime"],
          maximumSizeInBytes: MAX_VIDEO_BYTES,
          addRandomSuffix: true, // 파일 이름을 서버가 맞춰 줘서 추측할 수 없게 해요
          validUntil: Date.now() + 10 * 60 * 1000, // 허가증은 10분만 써요
        };
      },
    });
    return Response.json(json);
  } catch (e) {
    console.error("[blob] 업로드 허가를 만들지 못했어요:", e instanceof Error ? e.message : e);
    const message = e instanceof Error && e.message === MESSAGES.dailyLimit ? e.message : MESSAGES.serviceError;
    return fail(message, message === MESSAGES.dailyLimit ? 429 : 400);
  }
}
