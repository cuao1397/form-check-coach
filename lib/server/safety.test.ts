import { describe, expect, it } from "vitest";
import { MESSAGES } from "../limits";
import { applySafetyRules } from "./safety";

// 안전 규칙(PRD 5번) 자동 시험: 진단 표현 0건, 피드백 3개 이내, 통증 경고, 지원 운동 3종

const base = {
  status: "ok",
  exercise: "스쿼트",
  score: 80,
  summary: "전반적으로 안정적인 자세예요.",
  excellent: false,
  painSignal: false,
  feedback: [{ point: "무릎 방향", tip: "발끝 방향으로 무릎을 밀어 보세요." }],
};

function run(patch: Record<string, unknown> = {}) {
  return applySafetyRules({ ...base, ...patch });
}

function okResult(patch: Record<string, unknown> = {}) {
  const out = run(patch);
  if (out.kind !== "result" || out.result.status !== "ok") throw new Error("ok 결과가 아니에요");
  return out.result;
}

describe("진단 표현 차단", () => {
  const bad = [
    "무릎 연골연화증이 의심됩니다",
    "허리 디스크가 있어 보여요",
    "어깨 회전근개 파열 가능성이 있어요",
    "관절염 초기로 보입니다",
    "반월판 손상 위험이 큽니다",
    "척추 협착이 걱정돼요",
    "진단됩니다",
    "ACL injury risk and tendinitis",
    "디 스 크가 튀어나왔어요", // 글자 사이 공백으로 피하려는 경우
    "염.증이 있어요",
  ];
  for (const text of bad) {
    it(`막는다: ${text}`, () => {
      const out = run({ feedback: [{ point: "자세", tip: text }] });
      expect(out).toEqual({ kind: "blocked", reason: "diagnosis" });
    });
  }

  const good = [
    "이 안내는 진단이 아닙니다",
    "손상 위험을 줄이려면 허리를 곧게 펴 보세요",
    "염려하지 말고 천천히 내려가 보세요",
    "무릎을 발끝 방향으로 밀어 보세요",
  ];
  for (const text of good) {
    it(`통과한다: ${text}`, () => {
      expect(run({ feedback: [{ point: "자세", tip: text }] }).kind).toBe("result");
    });
  }
});

describe("피드백 개수", () => {
  it("3개를 넘으면 3개로 자른다", () => {
    const feedback = Array.from({ length: 6 }, (_, i) => ({ point: `포인트${i}`, tip: "팁" }));
    expect(okResult({ feedback }).feedback).toHaveLength(3);
  });
  it("내용이 빈 카드뿐이면 incomplete", () => {
    expect(run({ feedback: [{ point: "", tip: "" }] })).toEqual({
      kind: "blocked",
      reason: "incomplete",
    });
  });
});

describe("지원 운동 3종", () => {
  it("스쿼트·데드리프트·벤치프레스는 통과", () => {
    for (const exercise of ["스쿼트", "데드 리프트", "벤치프레스", "Deadlift"]) {
      expect(okResult({ exercise }).exercise).toBe(exercise);
    }
  });
  it("런지는 unsupported", () => {
    expect(run({ exercise: "런지" })).toEqual({
      kind: "result",
      result: { status: "unsupported", message: MESSAGES.unsupported },
    });
  });
  it("status가 unclear면 다시 촬영 안내", () => {
    expect(applySafetyRules({ status: "unclear" })).toEqual({
      kind: "result",
      result: { status: "unclear", message: MESSAGES.unclear },
    });
  });
});

describe("점수·칭찬·통증", () => {
  it("점수는 0~100으로 맞춘다", () => {
    expect(okResult({ score: 250 }).score).toBe(100);
    expect(okResult({ score: -5 }).score).toBe(0);
  });
  it("숫자가 아닌 점수는 incomplete", () => {
    expect(run({ score: "abc" })).toEqual({ kind: "blocked", reason: "incomplete" });
  });
  it("칭찬 화면은 AI 판단 + 90점 이상일 때만", () => {
    expect(okResult({ excellent: true, score: 95 }).excellent).toBe(true);
    expect(okResult({ excellent: true, score: 85 }).excellent).toBe(false);
    expect(okResult({ excellent: false, score: 95 }).excellent).toBe(false);
  });
  it("통증 신호가 있으면 경고를 붙이고 칭찬 화면은 끈다", () => {
    const r = okResult({ excellent: true, score: 95, painSignal: true });
    expect(r.painWarning).toBe(MESSAGES.painWarning);
    expect(r.excellent).toBe(false);
  });
  it("피드백에 통증 표현이 있어도 경고를 붙인다", () => {
    const r = okResult({ feedback: [{ point: "허리", tip: "허리가 아프면 중단하세요" }] });
    expect(r.painWarning).toBe(MESSAGES.painWarning);
  });
  it("통증이 없으면 경고도 없다", () => {
    expect(okResult().painWarning).toBeNull();
  });
  it("통증 주의 모드: 무게를 올리라는 조언은 안전한 문장으로 바뀐다", () => {
    const r = okResult({
      painSignal: true,
      feedback: [{ point: "중량", tip: "다음엔 무게를 더 늘려서 도전해 보세요." }],
    });
    expect(r.feedback[0].tip).toContain("무리하지 말고");
  });
  it("통증이 없으면 조언을 그대로 둔다", () => {
    const tip = "다음엔 무게를 더 늘려서 도전해 보세요.";
    expect(okResult({ feedback: [{ point: "중량", tip }] }).feedback[0].tip).toBe(tip);
  });
});
