import type { AnalysisResult } from "@/lib/types";

type Ok = Extract<AnalysisResult, { status: "ok" }>;

function scoreColor(score: number) {
  if (score >= 80) return "var(--good)";
  if (score >= 60) return "var(--warn)";
  return "var(--bad)";
}

// 점수를 동그란 게이지로 보여 줘요
function ScoreGauge({ score }: { score: number }) {
  const radius = 52;
  const circumference = 2 * Math.PI * radius;
  const color = scoreColor(score);
  return (
    <div className="relative h-36 w-36 shrink-0">
      <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90" aria-hidden="true">
        <circle cx="60" cy="60" r={radius} fill="none" stroke="var(--line)" strokeWidth="10" />
        <circle
          cx="60"
          cy="60"
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - score / 100)}
          style={{ transition: "stroke-dashoffset 1s ease-out" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-4xl font-bold" style={{ color }}>
          {score}
        </span>
        <span className="text-xs text-muted">/ 100점</span>
      </div>
    </div>
  );
}

// 분석이 끝났을 때: 자세 점수 + 3줄 피드백 카드
export default function ResultView({
  result,
  onReset,
}: {
  result: Ok;
  onReset: () => void;
}) {
  return (
    <div className="flex flex-col gap-5">
      <section
        aria-label="자세 점수"
        className="flex flex-col items-center gap-5 rounded-3xl border border-line bg-surface p-6 text-center sm:flex-row sm:text-left"
      >
        <ScoreGauge score={result.score} />
        <div className="flex flex-col gap-2">
          <span className="w-fit self-center rounded-full bg-surface-2 px-3 py-1 text-xs text-muted sm:self-start">
            {result.exercise}
          </span>
          {/* 자세가 완벽하면 칭찬 문구를 보여 줘요 */}
          <h2 className="text-xl font-bold">
            {result.excellent ? "훌륭한 자세입니다! ✨" : "종합 자세 점수"}
          </h2>
          {result.summary && <p className="text-muted">{result.summary}</p>}
          <p className="text-xs text-muted">이 점수는 AI의 종합 판단입니다.</p>
        </div>
      </section>

      {result.painWarning && (
        <p
          role="alert"
          className="rounded-2xl border border-warn/50 bg-warn/10 px-5 py-4 text-sm font-medium text-warn"
        >
          ⚠️ {result.painWarning}
        </p>
      )}

      <section aria-label="교정 피드백" className="flex flex-col gap-3">
        <h2 className="font-bold">
          {result.excellent ? "유지해야 할 포인트" : "이렇게 개선해 보세요"}
        </h2>
        <ol className="flex flex-col gap-3">
          {result.feedback.map((item, i) => (
            <li
              key={i}
              className="flex gap-4 rounded-2xl border border-line bg-surface p-5"
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent/15 font-bold text-accent">
                {i + 1}
              </span>
              <div>
                <p className="font-bold">{item.point}</p>
                <p className="mt-1 text-sm text-muted">{item.tip}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <button
        type="button"
        onClick={onReset}
        className="self-center rounded-full bg-accent px-8 py-3 font-bold text-white transition hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        다른 영상 분석하기
      </button>
    </div>
  );
}
