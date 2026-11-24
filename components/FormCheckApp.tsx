"use client";

import { upload } from "@vercel/blob/client";
import { useEffect, useState } from "react";
import {
  BLOB_THRESHOLD_BYTES,
  CLIENT_TIMEOUT_MS,
  UPLOAD_TIMEOUT_MS,
  MAX_VIDEO_BYTES,
  MAX_VIDEO_SECONDS,
  MESSAGES,
  isAllowedVideo,
} from "@/lib/limits";
import type { AnalysisResult, ApiError } from "@/lib/types";
import AnalyzingLoader from "./AnalyzingLoader";
import ConsentCheck from "./ConsentCheck";
import NoticeCard from "./NoticeCard";
import ResultView from "./ResultView";
import UploadZone from "./UploadZone";

type Step =
  | { name: "idle" }
  | { name: "ready"; file: File; url: string }
  | { name: "analyzing"; url: string }
  | { name: "done"; result: AnalysisResult; url: string };

type ErrorState = { message: string; retryable: boolean };

// 이 환경에서 Blob 직접 업로드를 쓸 수 있는지 서버에 물어봐요 (한 번만 물어보고 기억해요)
let blobEnabledCache: boolean | null = null;
async function isBlobEnabled(): Promise<boolean> {
  if (blobEnabledCache !== null) return blobEnabledCache;
  try {
    const res = await fetch("/api/blob");
    blobEnabledCache = res.ok && (await res.json()).enabled === true;
  } catch {
    return false; // 물어보지 못했으면 기억하지 않고 이번에는 예전 방식으로 보내요
  }
  return blobEnabledCache;
}

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
  const [error, setError] = useState<ErrorState | null>(null);
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
      setError({ message: MESSAGES.fileLimit, retryable: false });
      return;
    }
    const url = URL.createObjectURL(file);
    try {
      const seconds = await readDuration(url);
      if (seconds > MAX_VIDEO_SECONDS) {
        URL.revokeObjectURL(url);
        setError({ message: MESSAGES.fileLimit, retryable: false });
        return;
      }
    } catch {
      // 길이를 못 읽는 건 조건 위반이 아니라 브라우저가 영상을 못 여는 경우예요
      URL.revokeObjectURL(url);
      setError({ message: MESSAGES.unreadable, retryable: false });
      return;
    }
    setConsent(false);
    setStep({ name: "ready", file, url });
  }

  // 서버에 영상을 보내 분석해요. 60초가 넘으면 지연 안내와 [재시도]를 보여 줘요.
  async function analyze() {
    if (step.name !== "ready" || !consent) return;
    const { file, url } = step;
    setError(null);
    setStep({ name: "analyzing", url });

    // 큰 영상은 서버를 거치지 않고 Vercel Blob에 직접 올려요 (배포 환경의 4.5MB 제한 때문에).
    // Blob을 쓸 수 없는 환경(내 컴퓨터 등)이면 예전처럼 영상을 서버로 바로 보내요.
    let blobUrl: string | null = null;
    if (file.size > BLOB_THRESHOLD_BYTES && (await isBlobEnabled())) {
      const uploadController = new AbortController();
      const uploadTimer = setTimeout(() => uploadController.abort(), UPLOAD_TIMEOUT_MS);
      try {
        const ext = file.name.toLowerCase().endsWith(".mov") ? ".mov" : ".mp4";
        const uploaded = await upload(`uploads/${crypto.randomUUID()}${ext}`, file, {
          access: "private",
          handleUploadUrl: "/api/blob",
          contentType: file.type || (ext === ".mov" ? "video/quicktime" : "video/mp4"),
          abortSignal: uploadController.signal,
        });
        blobUrl = uploaded.url;
      } catch {
        setError({ message: MESSAGES.uploadFailed, retryable: true });
        setStep({ name: "ready", file, url });
        return;
      } finally {
        clearTimeout(uploadTimer);
      }
    }

    // 분석 대기 시간(60초)은 업로드가 끝난 뒤부터 세요
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), CLIENT_TIMEOUT_MS);
    try {
      let init: RequestInit;
      if (blobUrl) {
        init = {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ blobUrl, consent: true }), // 동의 체크가 된 경우에만 여기까지 와요
        };
      } else {
        const body = new FormData();
        body.append("video", file);
        body.append("consent", "true");
        init = { method: "POST", body };
      }
      const res = await fetch("/api/analyze", { ...init, signal: controller.signal });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        // 서버(Vercel 등)가 JSON이 아닌 응답을 보내면 상태 코드로 원인을 알려 줘요
        const e = (data ?? {}) as Partial<ApiError>;
        let message = e.error;
        let retryable = e.retryable;
        if (!message) {
          if (res.status === 413) {
            message = "영상 용량이 서버가 받을 수 있는 한도를 넘었어요. 더 짧거나 작은 영상으로 올려 주세요.";
            retryable = false;
          } else if (res.status === 504 || res.status === 502 || res.status === 503) {
            message = MESSAGES.timeout;
            retryable = true;
          } else {
            message = "분석에 실패했어요. 잠시 후 다시 시도해 주세요.";
            retryable = true;
          }
        }
        setError({ message, retryable: retryable ?? false });
        setStep({ name: "ready", file, url });
        return;
      }
      if (!data) throw new Error("empty");
      setStep({ name: "done", result: data as AnalysisResult, url });
    } catch (e) {
      const timedOut = e instanceof DOMException && e.name === "AbortError";
      setError({
        message: timedOut ? MESSAGES.timeout : "알 수 없는 오류가 났어요. 다시 시도해 주세요.",
        retryable: true,
      });
      setStep({ name: "ready", file, url });
    } finally {
      clearTimeout(timer);
    }
  }

  function reset() {
    setError(null);
    setStep({ name: "idle" });
  }

  return (
    <div className="flex flex-col gap-5">
      {error && (
        <div
          role="alert"
          className="flex flex-col items-center gap-3 rounded-2xl border border-bad/50 bg-bad/10 px-5 py-4 text-center text-sm text-bad"
        >
          <p>{error.message}</p>
          {/* 다시 시도하면 되는 오류일 때만 [재시도] 버튼을 보여 줘요 */}
          {error.retryable && step.name === "ready" && (
            <button
              type="button"
              onClick={analyze}
              className="rounded-full bg-bad px-5 py-2 font-bold text-white transition hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bad"
            >
              재시도
            </button>
          )}
        </div>
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
                  className="rounded-full border border-line px-6 py-3 text-muted transition hover:bg-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
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
          <NoticeCard message={step.result.message} onReset={reset} />
        ))}
    </div>
  );
}
