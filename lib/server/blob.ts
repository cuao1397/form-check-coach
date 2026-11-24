import { del, get } from "@vercel/blob";
import { MAX_VIDEO_BYTES, isAllowedVideo } from "../limits";

// 배포 환경에서 큰 영상을 "브라우저 → Vercel Blob → 서버"로 받는 부분이에요.
// 영상은 분석이 끝나면 바로 지워요 (PRD 7번: 영상은 보관하지 않아요).

// 비공개(private)로 올려서, 주소를 알아도 이 서버의 토큰 없이는 볼 수 없게 해요.
// (Vercel에서 Blob 저장소를 만들 때도 Private으로 만들어야 해요)
export const BLOB_ACCESS = "private" as const;
export const BLOB_UPLOAD_PREFIX = "uploads/";

/** Blob 저장소를 쓸 수 있게 설정되어 있는지 (토큰이 없으면 예전 방식으로 올려요) */
export function isBlobConfigured(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

/**
 * 화면에서 받은 영상 주소가 우리 Blob 저장소의 업로드 폴더를 가리키는지 확인해요.
 * 아무 주소나 서버가 읽으면 다른 서버를 몰래 호출하게 만들 수 있어서(SSRF) 꼭 확인해요.
 */
export function isBlobVideoUrl(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 2000) return false;
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      !url.port &&
      url.hostname.endsWith(".blob.vercel-storage.com") &&
      url.pathname.startsWith(`/${BLOB_UPLOAD_PREFIX}`) &&
      !url.pathname.includes("..")
    );
  } catch {
    return false;
  }
}

export type BlobRead = { ok: true; file: File } | { ok: false; reason: "missing" | "too-big" | "type" };

/** Blob에 올라간 영상을 읽어 File로 돌려줘요. 50MB를 넘으면 읽지 않고 멈춰요. */
export async function readBlobVideo(url: string, signal: AbortSignal): Promise<BlobRead> {
  const res = await get(url, { access: BLOB_ACCESS, abortSignal: signal });
  if (!res || res.statusCode !== 200) return { ok: false, reason: "missing" };
  if (res.blob.size > MAX_VIDEO_BYTES) return { ok: false, reason: "too-big" };

  const name = res.blob.pathname.split("/").pop() ?? "video.mp4";
  if (!isAllowedVideo(name, res.blob.contentType)) return { ok: false, reason: "type" };

  const chunks: Uint8Array[] = [];
  let total = 0;
  const reader = res.stream.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > MAX_VIDEO_BYTES) {
      await reader.cancel();
      return { ok: false, reason: "too-big" };
    }
    chunks.push(value);
  }
  return { ok: true, file: new File(chunks as BlobPart[], name, { type: res.blob.contentType }) };
}

/** 분석이 끝나면(성공·실패 모두) 올라간 영상을 지워요. 지우기에 실패해도 분석 결과는 그대로 돌려줘요. */
export async function deleteBlobVideo(url: string): Promise<void> {
  try {
    await del(url);
  } catch (e) {
    console.error("[blob] 임시 영상 삭제에 실패했어요:", e instanceof Error ? e.message : e);
  }
}
