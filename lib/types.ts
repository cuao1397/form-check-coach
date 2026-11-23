// 분석 API가 화면으로 돌려주는 결과의 모양

export type FeedbackItem = {
  point: string; // 교정 포인트 (자세가 완벽하면 "유지할 포인트")
  tip: string; // 구체적인 동작 개선 팁
};

export type AnalysisResult =
  | {
      status: "ok";
      exercise: string; // 운동 종류
      score: number; // 종합 자세 점수 (0~100)
      summary: string; // 한 줄 총평
      excellent: boolean; // 자세가 완벽한가 (true면 feedback은 "유지할 포인트")
      feedback: FeedbackItem[]; // 최대 3개
      painWarning: string | null; // 통증 관련 경고 문구 (없으면 null)
    }
  | {
      status: "unclear" | "unsupported";
      message: string; // 다시 촬영 / 지원하지 않는 운동 안내 문구
    };

// 분석이 실패했을 때 서버가 돌려주는 모양
export type ApiError = {
  error: string;
  retryable?: boolean; // true면 [재시도] 버튼을 보여 줘요
};
