"use client";

import { useState } from "react";
import { MAX_VIDEO_MB, MAX_VIDEO_SECONDS } from "@/lib/limits";

// 운동 영상을 올리는 영역 (눌러서 고르기 + 끌어다 놓기)
export default function UploadZone({
  onFile,
  disabled,
}: {
  onFile: (file: File) => void;
  disabled?: boolean;
}) {
  const [dragging, setDragging] = useState(false);

  return (
    <label
      onDragOver={(e) => {
        e.preventDefault();
        if (!disabled) setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        const file = e.dataTransfer.files[0];
        if (!disabled && file) onFile(file);
      }}
      className={`flex cursor-pointer flex-col items-center gap-3 rounded-3xl border-2 border-dashed px-6 py-14 text-center transition ${
        dragging
          ? "border-accent bg-accent/10"
          : "border-line bg-surface hover:border-accent/60 hover:bg-surface-2"
      } ${disabled ? "pointer-events-none opacity-50" : ""}`}
    >
      <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-surface-2 text-accent">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-8 w-8" aria-hidden="true">
          <path d="M12 16V4" />
          <path d="m7 9 5-5 5 5" />
          <path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" />
        </svg>
      </span>
      <span className="text-lg font-bold">운동 영상을 올려 주세요</span>
      <span className="text-sm text-muted">
        여기를 눌러 고르거나, 영상을 끌어다 놓으세요
      </span>
      <span className="rounded-full bg-surface-2 px-3 py-1 text-xs text-muted">
        {MAX_VIDEO_SECONDS}초 이내 · {MAX_VIDEO_MB}MB 이하
      </span>
      <input
        type="file"
        accept="video/*"
        className="sr-only"
        disabled={disabled}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onFile(file);
          e.target.value = "";
        }}
      />
    </label>
  );
}
