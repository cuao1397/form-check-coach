import { MESSAGES } from "../limits";

// Gemini(AI)에 영상을 보내 자세 분석 결과를 받아 와요. 서버에서만 실행돼요.
// API 키는 여기로 전달받아 쓰기만 하고, 화면으로는 절대 내보내지 않아요.

const GEMINI = "https://generativelanguage.googleapis.com";
const MODEL = process.env.GEMINI_MODEL || "gemini-3.6-flash";
// 이 크기 이하는 요청에 직접 담아 보내고, 넘으면 임시 업로드(Files API)를 써요
const INLINE_LIMIT_BYTES = 15 * 1024 * 1024;
// 1차(기본 모델)가 실패하면 다른 모델로 한 번 더 분석해요. 비워 두면 대체 없이 1차만 써요.
const FALLBACK_MODEL = process.env.GEMINI_FALLBACK_MODEL ?? "gemini-3.5-flash-lite";
// 화면 제한(60초)보다 조금 먼저 끊어서 "지연" 안내를 보여 줘요
const TOTAL_TIMEOUT_MS = 55_000; // 1차+2차를 합친 AI 분석 시간
const PRIMARY_TIMEOUT_MS = 35_000; // 1차에 쓰는 시간 (남은 시간은 2차가 써요)

const SYSTEM_PROMPT = `당신은 운동 자세를 봐 주는 친절한 AI 트레이너입니다. 사용자가 올린 운동 영상만 근거로 자세를 분석합니다.

[지원하는 운동]
스쿼트, 데드리프트, 벤치프레스 3가지만 분석합니다.

[반드시 지킬 규칙]
1. 영상에서 직접 보이는 것만 말하세요. 사람이 여러 명이거나, 한 명도 보이지 않거나, 너무 어둡거나, 동작이 가려져 있으면 추측하지 말고 status를 "unclear"로 답하세요.
2. 위 3가지가 아닌 운동이거나 운동 영상이 아니면 status를 "unsupported"로 답하세요.
3. 절대 의학적 진단을 하지 마세요. 질환·부상 이름을 단정하는 문장("~증후군입니다", "~염증이 있습니다" 등)은 쓰지 마세요.
4. 교정 포인트(feedback)는 가장 시급한 것부터 최대 3개까지만 쓰세요.
5. 어조는 전문적이고 격려하는 존댓말 한국어입니다. 부정적인 평가 대신 "이렇게 개선해 보세요"처럼 바로 해볼 수 있는 행동 지침으로 쓰세요.
6. 영상에서 부상 위험이 보이거나(예: 무릎이 심하게 안쪽으로 무너짐, 허리가 크게 말림) 통증을 느끼는 듯한 모습이 보이면 painSignal을 true로 하세요. 이때도 진단은 하지 말고 조심할 점 위주로만 쓰세요.
7. score는 0~100의 정수로, 자세의 정확도를 종합해 매기세요.
8. 자세가 거의 완벽하면 excellent를 true로 하고, 이때 feedback에는 교정할 점이 아니라 "유지해야 할 포인트" 1~3개를 쓰세요.`;

const RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    status: { type: "STRING", enum: ["ok", "unclear", "unsupported"] },
    exercise: { type: "STRING" },
    score: { type: "INTEGER" },
    summary: { type: "STRING" },
    excellent: { type: "BOOLEAN" },
    painSignal: { type: "BOOLEAN" },
    feedback: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: { point: { type: "STRING" }, tip: { type: "STRING" } },
        required: ["point", "tip"],
      },
    },
  },
  required: ["status"],
};

export type AnalyzeOutcome =
  | { ok: true; raw: Record<string, unknown> }
  | { ok: false; status: number; message: string; retryable: boolean };

/** 큰 영상은 Gemini 임시 저장소에 올려요. 분석이 끝나면 바로 지워요. */
async function uploadToGemini(apiKey: string, file: File) {
  const start = await fetch(`${GEMINI}/upload/v1beta/files`, {
    method: "POST",
    headers: {
      "x-goog-api-key": apiKey,
      "X-Goog-Upload-Protocol": "resumable",
      "X-Goog-Upload-Command": "start",
      "X-Goog-Upload-Header-Content-Length": String(file.size),
      "X-Goog-Upload-Header-Content-Type": file.type,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ file: { display_name: "exercise-video" } }),
  });
  const uploadUrl = start.headers.get("x-goog-upload-url");
  if (!start.ok || !uploadUrl) throw new Error("upload-start");

  const done = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      "Content-Length": String(file.size),
      "X-Goog-Upload-Offset": "0",
      "X-Goog-Upload-Command": "upload, finalize",
    },
    body: Buffer.from(await file.arrayBuffer()),
  });
  const info = (await done.json().catch(() => null))?.file;
  if (!done.ok || !info?.uri || !info?.name) throw new Error("upload-finish");

  // 영상이 처리되어 사용할 수 있을 때까지 잠시 기다려요 (최대 약 20초)
  let state: string = info.state;
  for (let i = 0; i < 10 && state === "PROCESSING"; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    const res = await fetch(`${GEMINI}/v1beta/${info.name}`, {
      headers: { "x-goog-api-key": apiKey },
    });
    state = (await res.json().catch(() => null))?.state ?? state;
  }
  if (state !== "ACTIVE") throw new Error("upload-processing");

  return { uri: info.uri as string, name: info.name as string };
}

async function deleteFromGemini(apiKey: string, name: string) {
  await fetch(`${GEMINI}/v1beta/${name}`, {
    method: "DELETE",
    headers: { "x-goog-api-key": apiKey },
  }).catch(() => undefined);
}

function isTimeout(e: unknown) {
  return e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");
}

/** 지정한 모델에 영상 분석을 요청해요 (한 번의 호출) */
function callModel(apiKey: string, model: string, videoPart: Record<string, unknown>, timeoutMs: number) {
  return fetch(`${GEMINI}/v1beta/models/${model}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
    signal: AbortSignal.timeout(timeoutMs),
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: [
        { role: "user", parts: [videoPart, { text: "이 운동 영상의 자세를 분석해 주세요." }] },
      ],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: RESPONSE_SCHEMA,
      },
    }),
  });
}

function failure(status: number, message: string, retryable = true): AnalyzeOutcome {
  return { ok: false, status, message, retryable };
}

export async function analyzeVideo(apiKey: string, file: File): Promise<AnalyzeOutcome> {
  let uploaded: { uri: string; name: string } | null = null;

  try {
    // 영상을 모델에 전달하는 방법을 고르는 부분
    let videoPart: Record<string, unknown>;
    if (file.size <= INLINE_LIMIT_BYTES) {
      const data = Buffer.from(await file.arrayBuffer()).toString("base64");
      videoPart = { inline_data: { mime_type: file.type, data } };
    } else {
      uploaded = await uploadToGemini(apiKey, file);
      videoPart = { file_data: { mime_type: file.type, file_uri: uploaded.uri } };
    }

    // 1차: 기본 모델로 분석해요
    const startedAt = Date.now();
    let model = MODEL;
    let upstream: Response | null = null;
    let data: { error?: { message?: string }; candidates?: { content?: { parts?: unknown } }[] } | null = null;
    try {
      upstream = await callModel(apiKey, model, videoPart, PRIMARY_TIMEOUT_MS);
      data = await upstream.json().catch(() => null);
    } catch (e) {
      // 시간 초과·연결 실패는 아래에서 대체 모델로 다시 시도해요
      if (!isTimeout(e) && !(e instanceof TypeError)) throw e;
    }

    // 2차: 1차가 서버 사정(한도·바쁨·시간 초과)으로 실패하면 다른 모델로 한 번 더 시도해요
    const needFallback = !upstream || upstream.status === 429 || upstream.status >= 500;
    if (needFallback && FALLBACK_MODEL && FALLBACK_MODEL !== MODEL) {
      const remaining = TOTAL_TIMEOUT_MS - (Date.now() - startedAt);
      if (remaining > 5_000) {
        model = FALLBACK_MODEL;
        upstream = await callModel(apiKey, model, videoPart, remaining);
        data = await upstream.json().catch(() => null);
      }
    }
    if (!upstream) return failure(504, MESSAGES.timeout);

    if (!upstream.ok) {
      // 키가 담길 수 있는 원문 오류는 돌려주지 않고, 원인만 쉬운 말로 알려줘요
      const code = upstream.status;
      if (code === 401 || code === 403 || /API key/i.test(data?.error?.message ?? ""))
        return failure(502, "Gemini 키가 올바르지 않아요. .env의 GEMINI_API_KEY 값을 확인해 주세요.", false);
      if (code === 404)
        return failure(502, `분석 모델(${model})을 사용할 수 없어요. 다른 모델로 바꿔 주세요.`, false);
      if (code === 429)
        return failure(502, "요청이 너무 많거나 사용 한도를 넘었어요. 잠시 후 다시 시도해 주세요.");
      if (code === 503) return failure(502, "AI 서버가 바빠요. 잠시 후 다시 시도해 주세요.");
      return failure(502, "AI 분석을 가져오지 못했어요. 잠시 후 다시 시도해 주세요.");
    }

    const parts: unknown = data?.candidates?.[0]?.content?.parts;
    const text = Array.isArray(parts)
      ? parts.map((p) => (typeof p?.text === "string" ? p.text : "")).join("")
      : "";

    try {
      return { ok: true, raw: JSON.parse(text) };
    } catch {
      return failure(502, "AI 답변을 읽지 못했어요. 다시 시도해 주세요.");
    }
  } catch (e) {
    // 시간이 너무 오래 걸려 끊긴 경우
    if (isTimeout(e)) {
      return failure(504, MESSAGES.timeout);
    }
    return failure(502, "영상을 분석하는 중에 문제가 생겼어요. 잠시 후 다시 시도해 주세요.");
  } finally {
    // 영상은 저장하지 않아요 (PRD 7번): 임시로 올린 파일은 바로 지워요
    if (uploaded) await deleteFromGemini(apiKey, uploaded.name);
  }
}
