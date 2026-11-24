// PRD 6번의 영상 제한 조건 (화면과 서버가 함께 사용해요)
export const MAX_VIDEO_SECONDS = 15; // 영상 길이는 최대 15초
export const MAX_VIDEO_BYTES = 50 * 1024 * 1024; // 파일 용량은 50MB 이하
export const MAX_VIDEO_MB = MAX_VIDEO_BYTES / (1024 * 1024);

// 지원하는 영상 형식: MP4, MOV
export const ALLOWED_VIDEO_TYPES = ["video/mp4", "video/quicktime"];
export const ALLOWED_VIDEO_EXTENSIONS = [".mp4", ".mov"];

// 한 사람당 하루 분석 횟수 (AI 사용 비용 보호)
export const MAX_DAILY_ANALYSES = 5;
// 실패해서 횟수를 돌려받은 시도까지 포함한 하루 AI 호출 상한 (일부러 실패시켜 비용을 쓰는 것을 막아요)
export const MAX_DAILY_ATTEMPTS = 10;

// AI 응답을 기다리는 최대 시간 (밀리초)
export const CLIENT_TIMEOUT_MS = 60_000;

// PRD 4번 "예외 상황과 화면 처리"에 적힌 안내 문구
export const MESSAGES = {
  fileLimit: `${MAX_VIDEO_SECONDS}초 이내, ${MAX_VIDEO_MB}MB 이하의 MP4/MOV 영상을 업로드해 주세요.`,
  // 영상 파일은 맞지만 이 브라우저가 열지 못할 때 (예: 아이폰 HEVC 영상을 PC 크롬에서 올린 경우)
  unreadable:
    "이 브라우저에서 영상을 열지 못했어요. 아이폰이라면 카메라 설정의 '호환성 우선(H.264)'으로 다시 촬영하거나, MP4로 변환해서 올려 주세요.",
  // 서버 설정·키 문제처럼 방문자가 고칠 수 없는 오류 (원인은 서버 로그에만 남겨요)
  serviceError: "서비스에 일시적인 문제가 있어요. 잠시 후 다시 시도해 주세요.",
  unclear: "1명의 전신이 밝게 나오도록 다시 촬영해 주세요.",
  unsupported: "스쿼트, 데드리프트, 벤치프레스 영상만 분석 가능합니다.",
  timeout: "분석 시간이 지연되고 있습니다. 잠시 후 다시 시도해 주세요.",
  dailyLimit: `하루 ${MAX_DAILY_ANALYSES}회까지 분석할 수 있어요. 내일 다시 이용해 주세요.`,
  painWarning:
    "통증 지속 시 운동을 중단하고 전문의/PT 전문가 상담을 권장합니다.",
};

/** 파일이 MP4/MOV인지 확인해요 (브라우저가 형식을 비워 보내는 경우는 확장자로 확인) */
export function isAllowedVideo(name: string, type: string): boolean {
  if (ALLOWED_VIDEO_TYPES.includes(type)) return true;
  const lower = name.toLowerCase();
  return !type && ALLOWED_VIDEO_EXTENSIONS.some((ext) => lower.endsWith(ext));
}
