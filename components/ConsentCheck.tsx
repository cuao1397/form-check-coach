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
          이 서비스는 영상을 보관하지 않아요. 용량이 큰 영상은 분석하는 동안 비공개 임시 저장소(Vercel Blob)에 올렸다가 분석이 끝나면 바로 삭제해요. 다만 무료 AI 이용 구간에서는 Google이 전송된 영상을 서비스 개선에 사용하고 사람이 검토할 수 있어요. 영상은 해외(미국 등)에 있는 Google 서버로 전송될 수 있어요. 또 하루 이용 횟수를 세려고 접속 주소(IP)를 서버 메모리에 잠시 사용하며, 따로 저장하거나 다른 곳에 쓰지 않아요. 동의해야 분석을 시작할 수 있어요.
        </span>
      </span>
    </label>
  );
}
