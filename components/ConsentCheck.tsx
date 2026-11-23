"use client";

// 영상이 외부 AI 서비스로 전송되는 것에 동의하는 체크박스 (PRD 7번)
export default function ConsentCheck({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-line bg-surface p-4 text-sm">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-1 h-4 w-4 shrink-0 accent-accent"
      />
      <span>
        <span className="font-medium">영상이 AI 분석을 위해 외부 AI 서비스(Google Gemini)로 전송되는 것에 동의합니다.</span>
        <span className="mt-1 block text-xs text-muted">
          이 서비스는 영상을 저장하지 않습니다. 동의해야 분석을 시작할 수 있어요.
        </span>
      </span>
    </label>
  );
}
