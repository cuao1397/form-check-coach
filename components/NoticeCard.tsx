// 분석할 수 없을 때 보여 주는 안내 카드
// (사람이 여러 명·안 보임·어두움 / 지원하지 않는 운동)
export default function NoticeCard({
  message,
  onReset,
}: {
  message: string;
  onReset: () => void;
}) {
  return (
    <div
      role="alert"
      className="flex flex-col items-center gap-4 rounded-3xl border border-warn/50 bg-warn/10 px-6 py-10 text-center"
    >
      <span className="text-3xl" aria-hidden="true">
        📷
      </span>
      <p className="text-lg font-bold text-warn">{message}</p>
      <button
        type="button"
        onClick={onReset}
        className="rounded-full bg-accent px-8 py-3 font-bold text-white transition hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        다시 올리기
      </button>
    </div>
  );
}
