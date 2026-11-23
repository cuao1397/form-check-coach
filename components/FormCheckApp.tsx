"use client";

import { useEffect, useState } from "react";
import {
  MAX_VIDEO_BYTES,
  MAX_VIDEO_SECONDS,
  MESSAGES,
  isAllowedVideo,
} from "@/lib/limits";
import type { AnalysisResult } from "@/lib/types";
import AnalyzingLoader from "./AnalyzingLoader";
import ConsentCheck from "./ConsentCheck";
import ResultView from "./ResultView";
import UploadZone from "./UploadZone";

type Step =
  | { name: "idle" }
  | { name: "ready"; file: File; url: string }
  | { name: "analyzing"; url: string }
  | { name: "done"; result: AnalysisResult; url: string };

// 브라우저에서 영상 길이를 재요
function readDuration(url: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    video.preload = "metadata";
    video.onloadedmetadata = () => resolve(video.duration);
    video.onerror = () => reject(new Error("read"));
    video.src = url;
  });
}

export default function FormCheckApp() {
  const [step, setStep] = useState<Step>({ name: "idle" });
  const [error, setError] = useState<string | null>(null);
  const [consent, setConsent] = useState(false);

  // 미리보기 주소는 화면이 바뀔 때 정리해요
  const previewUrl = step.name === "idle" ? null : step.url;
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  // 형식·용량·길이를 올리는 즉시 검사해요 (PRD 4번 예외 처리)
  async function handleFile(file: File) {
    setError(null);
    if (!isAllowedVideo(file.name, file.type) || file.size > MAX_VIDEO_BYTES) {
      setError(MESSAGES.fileLimit);
      return;
    }
    const url = URL.createObjectURL(file);
    try {
      const seconds = await readDuration(url);
      if (seconds > MAX_VIDEO_SECONDS) {
        URL.revokeObjectURL(url);
        setError(MESSAGES.fileLimit);
        return;
      }
    } catch {
      URL.revokeObjectURL(url);
      setError(MESSAGES.fileLimit);
      return;
    }
    setConsent(false);
    setStep({ name: "ready", file, url });
  }

  async function analyze() {
    if (step.name !== "ready" || !consent) return;
    const { file, url } = step;
    setError(null);
    setStep({ name: "analyzing", url });
    try {
      const body = new FormData();
      body.append("video", file);
      const res = await fetch("/api/analyze", { method: "POST", body });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "분석에 실패했어요.");
      setStep({ name: "done", result: data as AnalysisResult, url });
    } catch (e) {
      setError(e instanceof Error ? e.message : "알 수 없는 오류가 났어요.");
      setStep({ name: "ready", file, url });
    }
  }

  function reset() {
    setError(null);
    setStep({ name: "idle" });
  }

  return (
    <div className="flex flex-col gap-5">
      {error && (
        <p
          role="alert"
          className="rounded-2xl border border-bad/50 bg-bad/10 px-5 py-4 text-sm text-bad"
        >
          {error}
        </p>
      )}

      {step.name === "idle" && (
        <>
          <UploadZone onFile={handleFile} />
          {/* 촬영 가이드 (PRD 4번) */}
          <p className="text-center text-sm text-muted">
            📷 전신이 나오도록 측면 또는 45도 각도에서 밝은 곳에서 촬영해 주세요
          </p>
        </>
      )}

      {(step.name === "ready" || step.name === "analyzing") && (
        <div className="flex flex-col gap-4">
          <video
            src={step.url}
            controls
            muted
            playsInline
            className="max-h-80 w-full rounded-3xl border border-line bg-black object-contain"
          />
          {step.name === "ready" ? (
            <>
              <ConsentCheck checked={consent} onChange={setConsent} />
              <div className="flex flex-wrap justify-center gap-3">
                <button
                  type="button"
                  onClick={analyze}
                  disabled={!consent}
                  className="rounded-full bg-accent px-8 py-3 font-bold text-white transition hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:brightness-100"
                >
                  자세 분석 시작
                </button>
                <button
                  type="button"
                  onClick={reset}
                  className="rounded-full border border-line px-6 py-3 text-muted transition hover:bg-surface-2"
                >
                  다른 영상 고르기
                </button>
              </div>
            </>
          ) : (
            <AnalyzingLoader />
          )}
        </div>
      )}

      {step.name === "done" &&
        (step.result.status === "ok" ? (
          <ResultView result={step.result} onReset={reset} />
        ) : (
          <div className="flex flex-col items-center gap-4 rounded-3xl border border-warn/50 bg-warn/10 px-6 py-10 text-center">
            <p className="text-lg font-bold text-warn">{step.result.message}</p>
            <button
              type="button"
              onClick={reset}
              className="rounded-full bg-accent px-8 py-3 font-bold text-white transition hover:brightness-110"
            >
              다시 올리기
            </button>
          </div>
        ))}
    </div>
  );
}
