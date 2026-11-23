import { MESSAGES } from "../limits";
import type { AnalysisResult, FeedbackItem } from "../types";

// AI가 보낸 답을 화면에 내보내기 전에 안전 규칙(PRD 5번)을 적용해요.
// 이 파일은 순수한 규칙만 담고 있어서 따로 시험하기 쉬워요.

// 의학적 진단처럼 읽히는 표현이 나오면 결과를 내보내지 않아요 (진단 표현 0건)
const DIAGNOSIS_PATTERN =
  /증후군|염증|파열|탈구|디스크|관절염|건염|힘줄염|인대\s*손상|골절|진단/;
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
  const summary = cleanText(raw.summary, 200);

  const allText = [exercise, summary, ...feedback.flatMap((f) => [f.point, f.tip])].join(" ");
  if (DIAGNOSIS_PATTERN.test(allText)) {
    return { kind: "blocked", reason: "diagnosis" };
  }

  return {
    kind: "result",
    result: {
      status: "ok",
      exercise,
      score: Math.min(100, Math.max(0, score)),
      summary,
      // 자세 "완벽"은 AI가 그렇게 판단하고 점수가 90점 이상일 때만 인정해요
      excellent: raw.excellent === true && score >= EXCELLENT_MIN_SCORE,
      feedback,
      painWarning:
        raw.painSignal === true || PAIN_PATTERN.test(allText) ? MESSAGES.painWarning : null,
    },
  };
}
