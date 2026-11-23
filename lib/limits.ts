// PRD 6번의 영상 제한 조건 (화면과 서버가 함께 사용해요)
export const MAX_VIDEO_SECONDS = 15; // 영상 길이는 최대 15초
export const MAX_VIDEO_BYTES = 50 * 1024 * 1024; // 파일 용량은 50MB 이하
export const MAX_VIDEO_MB = MAX_VIDEO_BYTES / (1024 * 1024);
