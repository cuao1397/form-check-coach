import { MAX_VIDEO_BYTES, MAX_VIDEO_MB } from "@/lib/limits";
import type { AnalysisResult, FeedbackItem } from "@/lib/types";

// 이 파일은 "화면 뒤(서버)"에서만 실행돼요.
// API 키는 여기서만 .env 에서 읽고, 브라우저로는 절대 보내지 않아요.

export const maxDuration = 60;

const GEMINI = "https://generativelanguage.googleapis.com";
const MODEL = process.env.GEMINI_MODEL || "gemini-3.6-flash";
// 이 크기 이하는 요청에 직접 담아 보내고, 넘으면 임시 업로드(Files API)를 써요
const INLINE_LIMIT_BYTES = 15 * 1024 * 1024;

const PAIN_WARNING =
  "통증 지속 시 운동을 중단하고 전문의/PT 전문가 상담을 권장합니다.";
const UNCLEAR_MESSAGE = "영상이 잘 보이도록 다시 촬영해 주세요.";

// 의학적 진단처럼 읽히는 표현이 나오면 결과를 화면에 내보내지 않아요 (PRD: 진단 표현 0건)
const DIAGNOSIS_PATTERN =
  /증후군|염증|파열|탈구|디스크|관절염|건염|힘줄염|인대\s*손상|골절|진단/;
const PAIN_PATTERN = /통증|아프|아픔|시큰|저림|부상/;

const SYSTEM_PROMPT = `당신은 운동 자세를 봐 주는 친절한 AI 트레이너입니다. 사용자가 올린 운동 영상만 근거로 자세를 분석합니다.

[반드시 지킬 규칙]
1. 영상에서 직접 보이는 것만 말하세요. 사람이 잘 보이지 않거나, 동작이 가려져 있거나, 운동 종류를 알아볼 수 없으면 추측하지 말고 status를 "unclear"로 답하세요.
2. 절대 의학적 진단을 하지 마세요. 질환·부상 이름을 단정하는 문장("~증후군입니다", "~염증이 있습니다" 등)은 쓰지 마세요.
3. 교정 포인트(feedback)는 가장 시급한 것부터 최대 3개까지만 쓰세요.
4. 어조는 전문적이고 격려하는 존댓말 한국어입니다. 부정적인 평가 대신 "이렇게 개선해 보세요"처럼 바로 해볼 수 있는 행동 지침으로 쓰세요.
5. 영상에서 무릎이 심하게 안쪽으로 무너지거나 허리가 크게 말리는 등 부상 위험이 보이거나, 통증을 느끼는 듯한 모습이 보이면 painSignal을 true로 하세요. 이때도 진단은 하지 말고 조심할 점 위주로만 쓰세요.
6. score는 0~100의 정수로, 자세의 정확도를 종합해 매기세요.`;

const RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    status: { type: "STRING", enum: ["ok", "unclear"] },
    exercise: { type: "STRING" },
    score: { type: "INTEGER" },
    summary: { type: "STRING" },
    painSignal: { type: "BOOLEAN" },
    feedback: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          point: { type: "STRING" },
          tip: { type: "STRING" },
        },
        required: ["point", "tip"],
      },
    },
  },
  required: ["status"],
};

function fail(message: string, status = 400) {
  return Response.json({ error: message }, { status });
}

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

  // 영상이 처리되어 사용할 수 있을 때까지 잠시 기다려요 (최대 약 30초)
  let state: string = info.state;
  for (let i = 0; i < 15 && state === "PROCESSING"; i++) {
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

function cleanText(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
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
  try {
    file = (await request.formData()).get("video");
  } catch {
    return fail("요청 형식이 올바르지 않아요.");
  }
  if (!(file instanceof File) || file.size === 0) {
    return fail("분석할 영상을 올려 주세요.");
  }
  if (!file.type.startsWith("video/")) {
    return fail("영상 파일만 올릴 수 있어요.");
  }
  if (file.size > MAX_VIDEO_BYTES) {
    return fail(`영상 용량은 ${MAX_VIDEO_MB}MB 이하만 지원해요.`);
  }

  let uploaded: { uri: string; name: string } | null = null;

  try {
    // 영상을 모델에 전달하는 부분
    let videoPart: Record<string, unknown>;
    if (file.size <= INLINE_LIMIT_BYTES) {
      const data = Buffer.from(await file.arrayBuffer()).toString("base64");
      videoPart = { inline_data: { mime_type: file.type, data } };
    } else {
      uploaded = await uploadToGemini(apiKey, file);
      videoPart = { file_data: { mime_type: file.type, file_uri: uploaded.uri } };
    }

    const upstream = await fetch(
      `${GEMINI}/v1beta/models/${MODEL}:generateContent`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
          contents: [
            {
              role: "user",
              parts: [
                videoPart,
                { text: "이 운동 영상의 자세를 분석해 주세요." },
              ],
            },
          ],
          generationConfig: {
            responseMimeType: "application/json",
            responseSchema: RESPONSE_SCHEMA,
          },
        }),
      },
    );

    const data = await upstream.json().catch(() => null);

    if (!upstream.ok) {
      const code = upstream.status;
      let message = "AI 분석을 가져오지 못했어요. 잠시 후 다시 시도해 주세요.";
      if (code === 401 || code === 403 || /API key/i.test(data?.error?.message ?? ""))
        message = "Gemini 키가 올바르지 않아요. .env의 GEMINI_API_KEY 값을 확인해 주세요.";
      else if (code === 404)
        message = `분석 모델(${MODEL})을 사용할 수 없어요. 다른 모델로 바꿔 주세요.`;
      else if (code === 429)
        message = "요청이 너무 많거나 사용 한도를 넘었어요. 잠시 후 다시 시도해 주세요.";
      else if (code === 503)
        message = "AI 서버가 바빠요. 잠시 후 다시 시도해 주세요.";
      return fail(message, 502);
    }

    const parts: unknown = data?.candidates?.[0]?.content?.parts;
    const text = Array.isArray(parts)
      ? parts.map((p) => (typeof p?.text === "string" ? p.text : "")).join("")
      : "";

    let raw: Record<string, unknown>;
    try {
      raw = JSON.parse(text);
    } catch {
      return fail("AI 답변을 읽지 못했어요. 다시 시도해 주세요.", 502);
    }

    // 영상이 잘 안 보이면 추측하지 않고 다시 촬영을 안내해요
    if (raw.status === "unclear") {
      const result: AnalysisResult = { status: "unclear", message: UNCLEAR_MESSAGE };
      return Response.json(result);
    }

    const feedback: FeedbackItem[] = (Array.isArray(raw.feedback) ? raw.feedback : [])
      .map((f) => ({
        point: cleanText((f as FeedbackItem)?.point, 120),
        tip: cleanText((f as FeedbackItem)?.tip, 300),
      }))
      .filter((f) => f.point && f.tip)
      .slice(0, 3); // 피드백은 반드시 3개 이내

    const score = Math.round(Number(raw.score));
    if (feedback.length === 0 || !Number.isFinite(score)) {
      return fail("AI가 충분한 분석을 만들지 못했어요. 다시 시도해 주세요.", 502);
    }

    const exercise = cleanText(raw.exercise, 40) || "운동";
    const summary = cleanText(raw.summary, 200);

    const allText = [exercise, summary, ...feedback.flatMap((f) => [f.point, f.tip])].join(" ");
    if (DIAGNOSIS_PATTERN.test(allText)) {
      return fail(
        "분석 결과에 의학적으로 들릴 수 있는 표현이 있어 보여 드리지 않았어요. 다시 시도해 주세요.",
        502,
      );
    }

    const result: AnalysisResult = {
      status: "ok",
      exercise,
      score: Math.min(100, Math.max(0, score)),
      summary,
      feedback,
      // 통증 신호가 있거나 통증 관련 표현이 나오면 경고 문구를 자동으로 붙여요
      painWarning: raw.painSignal === true || PAIN_PATTERN.test(allText) ? PAIN_WARNING : null,
    };
    return Response.json(result);
  } catch {
    return fail("영상을 분석하는 중에 문제가 생겼어요. 잠시 후 다시 시도해 주세요.", 502);
  } finally {
    // 영상은 저장하지 않아요 (PRD 7번): 임시로 올린 파일은 바로 지워요
    if (uploaded) await deleteFromGemini(apiKey, uploaded.name);
  }
}
