import { MESSAGES } from "../limits";
import type { AnalysisResult, FeedbackItem } from "../types";

// AI가 보낸 답을 화면에 내보내기 전에 안전 규칙(PRD 5번)을 적용해요.
// 이 파일은 순수한 규칙만 담고 있어서 따로 시험하기 쉬워요.

// 의학적 진단처럼 읽히는 표현이 나오면 결과를 내보내지 않아요 (진단 표현 0건)
const DIAGNOSIS_PATTERN = new RegExp(
  [
    "증후군|염증|파열|탈구|디스크|골절|질환|협착|측만|추간판|탈출증|신경통|염좌|퇴행성|회전근개|오십견|연골연화",
    // "~염"으로 끝나는 병명(관절염·건염·족저근막염 등). "염려·염두·염색"은 제외해요.
    "[가-힣]염(?![려두색])",
    // 몸 부위 + 손상 (인대 손상, 반월판 손상 등). 그냥 "손상 위험"은 조언이라 막지 않아요.
    "(?:인대|연골|근육|힘줄|건|반월판|반월상|관절)\\s*손상",
    // 단정·의심하는 진단 표현. "진단이 아닙니다" 같은 안내 문장은 막지 않아요.
    "진단(?=\\s*(?:됩|됐|돼|입|이에|이라|받))|의심(?:됩|돼|스럽)",
  ].join("|"),
);
// 영어로 쓴 병명·진단 표현
const DIAGNOSIS_PATTERN_EN =
  /\b(?:ACL|MCL|PCL|tendinitis|tendonitis|herniat\w*|sprain|strain|fracture|syndrome|diagnos\w*)\b/i;
// 공백·기호를 지운 글에서는 오탐이 없는 병명만 검사해요 ("~염" 같은 넓은 규칙은 쓰지 않아요)
const DIAGNOSIS_PATTERN_SQUASHED =
  /증후군|염증|파열|탈구|디스크|골절|협착|측만|추간판|탈출증|신경통|염좌|퇴행성|회전근개|오십견|연골연화|인대손상|연골손상|반월판손상|근육손상|힘줄손상|관절손상/;
// 통증이 의심될 때 하면 안 되는 조언 (무게·강도를 올리라는 말, 참고 계속하라는 말)
const PUSH_PATTERN = /증량|무게를\s*(?:더\s*)?(?:늘|올|높)|더\s*무겁|무겁게|한계까지|참고\s*(?:계속|끝까지)|이를\s*악물/;
const SAFE_TIP = "통증이나 불편함이 있다면 무리하지 말고, 가벼운 무게로 자세부터 천천히 점검해 보세요.";
// 분석을 허용하는 운동 3종 (이 밖의 운동은 지원하지 않는 운동으로 안내해요)
const SUPPORTED_EXERCISE = /스쿼트|데드\s*리프트|벤치\s*프레스|squat|deadlift|bench\s*press/i;
// 통증·부상을 말하는 표현이 나오면 전문가 상담 경고를 자동으로 붙여요
const PAIN_PATTERN = /통증|아프|아픔|시큰|저림|부상/;

const MAX_FEEDBACK = 3; // 피드백은 반드시 3개 이내
const EXCELLENT_MIN_SCORE = 90; // "훌륭한 자세" 화면을 보여 주는 최소 점수

export type SafetyOutcome =
  | { kind: "result"; result: AnalysisResult }
  | { kind: "blocked"; reason: "diagnosis" | "incomplete" };

function cleanText(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export function applySafetyRules(raw: Record<string, unknown>): SafetyOutcome {
  // 영상이 잘 안 보이면 추측하지 않고 다시 촬영을 안내해요
  if (raw.status === "unclear") {
    return { kind: "result", result: { status: "unclear", message: MESSAGES.unclear } };
  }
  // 지원하지 않는 운동이면 3종만 가능하다고 안내해요
  if (raw.status === "unsupported") {
    return {
      kind: "result",
      result: { status: "unsupported", message: MESSAGES.unsupported },
    };
  }

  const feedback: FeedbackItem[] = (Array.isArray(raw.feedback) ? raw.feedback : [])
    .map((f) => ({
      point: cleanText((f as FeedbackItem)?.point, 120),
      tip: cleanText((f as FeedbackItem)?.tip, 300),
    }))
    .filter((f) => f.point && f.tip)
    .slice(0, MAX_FEEDBACK);

  const score = Math.round(Number(raw.score));
  if (feedback.length === 0 || !Number.isFinite(score)) {
    return { kind: "blocked", reason: "incomplete" };
  }

  const exercise = cleanText(raw.exercise, 40) || "운동";
  // AI가 3종이 아닌 운동(예: 런지)을 "ok"로 답해도 지원하지 않는 운동으로 안내해요
  if (!SUPPORTED_EXERCISE.test(exercise)) {
    return {
      kind: "result",
      result: { status: "unsupported", message: MESSAGES.unsupported },
    };
  }
  const summary = cleanText(raw.summary, 200);

  const allText = [exercise, summary, ...feedback.flatMap((f) => [f.point, f.tip])].join(" ");
  // 글자 사이에 공백·기호를 끼워 넣어 필터를 피하는 경우("디 스 크")도 잡도록, 한글·영문·숫자만 남긴 글도 검사해요
  const squashed = allText.replace(/[^가-힣a-zA-Z0-9]/g, "");
  if (
    DIAGNOSIS_PATTERN.test(allText) ||
    DIAGNOSIS_PATTERN_EN.test(allText) ||
    DIAGNOSIS_PATTERN_SQUASHED.test(squashed)
  ) {
    return { kind: "blocked", reason: "diagnosis" };
  }

  const painWarning =
    raw.painSignal === true || PAIN_PATTERN.test(allText) ? MESSAGES.painWarning : null;
  // 통증 "주의 모드": 통증이 보이는데 무게·강도를 올리라는 조언이 섞이면 안전한 문장으로 바꿔요
  if (painWarning) {
    for (const f of feedback) {
      if (PUSH_PATTERN.test(f.tip)) f.tip = SAFE_TIP;
    }
  }

  return {
    kind: "result",
    result: {
      status: "ok",
      exercise,
      score: Math.min(100, Math.max(0, score)),
      summary,
      // 자세 "완벽"은 AI가 그렇게 판단하고 점수가 90점 이상일 때만 인정해요.
      // 통증 경고가 함께 있으면 칭찬 화면과 모순되므로 칭찬 화면은 보여 주지 않아요.
      excellent: raw.excellent === true && score >= EXCELLENT_MIN_SCORE && !painWarning,
      feedback,
      painWarning,
    },
  };
}
