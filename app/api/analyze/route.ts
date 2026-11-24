import {
  MAX_VIDEO_BYTES,
  MAX_VIDEO_MB,
  MAX_VIDEO_SECONDS,
  MESSAGES,
  isAllowedVideo,
} from "@/lib/limits";
import { hasVideoSignature, readVideoSeconds } from "@/lib/server/video";
import { analyzeVideo } from "@/lib/server/analyze";
import {
  deleteBlobVideo,
  isBlobConfigured,
  isBlobVideoUrl,
  readBlobVideo,
} from "@/lib/server/blob";
import { clientId, releaseSlot, takeSlot } from "@/lib/server/rateLimit";
import { applySafetyRules } from "@/lib/server/safety";
import type { ApiError } from "@/lib/types";

// 이 파일은 "화면 뒤(서버)"에서만 실행돼요. 받기 → 검사 → 분석 → 안전 처리 → 응답만 맡아요.
// API 키는 .env에서 여기서만 읽고, 브라우저로는 절대 보내지 않아요.
// 영상은 두 가지 방법으로 받아요.
//  1) 양식(FormData)에 영상을 담아서: 내 컴퓨터 실행, 그리고 4MB 이하 영상
//  2) JSON으로 Vercel Blob 주소를 받아서: 배포 환경의 큰 영상 (분석이 끝나면 Blob의 영상을 바로 지워요)

export const maxDuration = 90;

function fail(error: string, status: number, retryable = false) {
  const body: ApiError = { error, retryable };
  return Response.json(body, { status });
}

/** 형식·용량·길이를 검사하고, 하루 횟수를 확인한 뒤 AI 분석 결과를 응답으로 만들어요 */
async function analyzeFile(request: Request, apiKey: string, file: File): Promise<Response> {
  if (file.size === 0) {
    return fail("분석할 영상을 올려 주세요.", 400);
  }
  // 화면에서도 검사하지만, 서버가 형식과 용량을 다시 확인해요
  if (!isAllowedVideo(file.name, file.type)) {
    return fail(MESSAGES.fileLimit, 400);
  }
  if (file.size > MAX_VIDEO_BYTES) {
    return fail(`영상 용량은 ${MAX_VIDEO_MB}MB 이하만 지원해요.`, 400);
  }

  // 이름·브라우저가 알려 준 형식은 속일 수 있어서, 파일 앞부분이 실제 MP4/MOV 모양인지 확인해요
  const head = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  if (!hasVideoSignature(head)) {
    return fail(MESSAGES.fileLimit, 400);
  }
  // 영상 길이도 파일 정보(mvhd)에서 직접 읽어요. 못 읽는 구조면 막지 않고 AI에게 15초까지만 보게 해요.
  // (약간의 오차를 감안해 1초 여유를 둬요)
  const seconds = await readVideoSeconds(file);
  if (seconds !== null && seconds > MAX_VIDEO_SECONDS + 1) {
    return fail(MESSAGES.fileLimit, 400);
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

  // request.signal: 화면이 먼저 연결을 끊으면(예: 시간 초과 안내) 분석도 바로 멈춰요
  const outcome = await analyzeVideo(apiKey, video, request.signal);
  if (!outcome.ok || request.signal.aborted) {
    releaseSlot(id); // 서버 오류·시간 초과·화면이 끊긴 경우는 횟수에 세지 않아요
    return outcome.ok
      ? fail(MESSAGES.timeout, 504, true)
      : fail(outcome.message, outcome.status, outcome.retryable);
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

export async function POST(request: Request) {
  // 환경 변수 값에 눈에 안 보이는 글자(BOM)나 공백·줄바꿈이 섞여 들어가는 경우가 있어서(복사·붙여넣기, 등록 도구),
  // 앞뒤를 정리해서 써요. 이런 글자가 있으면 HTTP 헤더로 보낼 수 없어 분석이 통째로 실패해요.
  const apiKey = process.env.GEMINI_API_KEY?.replace(/^﻿/, "").trim();
  if (!apiKey) {
    // 방문자에게는 내부 설정 이름을 알리지 않고, 원인은 서버 로그에만 남겨요
    console.error("[analyze] GEMINI_API_KEY가 설정되어 있지 않아요. .env를 확인하고 서버를 다시 켜 주세요.");
    return fail(MESSAGES.serviceError, 500);
  }

  // 다른 사이트에서 방문자의 브라우저로 이 API를 몰래 부르는 것을 막아요.
  // (브라우저는 요청한 사이트 주소를 Origin에 담아 보내요. 주소가 우리 서버와 다르면 거절해요.)
  const origin = request.headers.get("origin");
  const site = request.headers.get("sec-fetch-site");
  const host = request.headers.get("host");
  let crossSite = site !== null && site !== "same-origin" && site !== "none";
  if (origin) {
    try {
      crossSite = crossSite || new URL(origin).host !== host;
    } catch {
      crossSite = true;
    }
  }
  if (crossSite) {
    return fail("허용되지 않은 요청이에요.", 403);
  }

  // 2) 큰 영상: 브라우저가 Vercel Blob에 올린 뒤 주소만 JSON으로 보내요
  if ((request.headers.get("content-type") ?? "").includes("application/json")) {
    let body: { blobUrl?: unknown; consent?: unknown };
    try {
      body = await request.json();
    } catch {
      return fail("요청 형식이 올바르지 않아요.", 400);
    }
    // 우리 Blob 저장소 주소가 아니면 읽지도, 지우지도 않아요 (다른 서버를 몰래 호출하는 것을 막아요)
    if (!isBlobVideoUrl(body.blobUrl)) {
      return fail("요청 형식이 올바르지 않아요.", 400);
    }
    const blobUrl = body.blobUrl;
    // Blob 저장소가 설정되지 않은 서버(내 컴퓨터 등)에서는 이 방법을 쓸 수 없어요
    if (!isBlobConfigured()) {
      console.error("[analyze] BLOB_READ_WRITE_TOKEN이 없어서 Blob 영상을 읽을 수 없어요.");
      return fail(MESSAGES.serviceError, 503);
    }
    try {
      if (body.consent !== true) {
        return fail("영상 전송에 동의해야 분석할 수 있어요.", 400);
      }
      const read = await readBlobVideo(blobUrl, request.signal);
      if (!read.ok) {
        return read.reason === "too-big"
          ? fail(`영상 용량은 ${MAX_VIDEO_MB}MB 이하만 지원해요.`, 400)
          : read.reason === "type"
            ? fail(MESSAGES.fileLimit, 400)
            : fail("올린 영상을 찾지 못했어요. 다시 올려 주세요.", 400, true);
      }
      return await analyzeFile(request, apiKey, read.file);
    } finally {
      // 결과·오류와 상관없이, 올라간 영상은 바로 지워요 (보관하지 않아요)
      await deleteBlobVideo(blobUrl);
    }
  }

  // 1) 양식에 영상을 담아 받아요
  // 본문을 읽기 전에 헤더로 크기를 먼저 봐서, 너무 큰 요청은 읽지 않고 돌려보내요
  // (영상 50MB + 양식 여유 1MB. 헤더는 거짓일 수 있어서 아래 file.size 검사도 그대로 해요)
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_VIDEO_BYTES + 1024 * 1024) {
    return fail(`영상 용량은 ${MAX_VIDEO_MB}MB 이하만 지원해요.`, 413);
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
  if (!(file instanceof File)) {
    return fail("분석할 영상을 올려 주세요.", 400);
  }
  return analyzeFile(request, apiKey, file);
}
