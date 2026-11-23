// 분석 API가 화면으로 돌려주는 결과의 모양

export type FeedbackItem = {
  point: string; // 교정 포인트 (무엇이 문제인지)
  tip: string; // 구체적인 동작 개선 팁
};

export type AnalysisResult =
  | {
      status: "ok";
      exercise: string; // 운동 종류
      score: number; // 종합 자세 점수 (0~100)
      summary: string; // 한 줄 총평
      feedback: FeedbackItem[]; // 최대 3개
      painWarning: string | null; // 통증 관련 경고 문구 (없으면 null)
    }
  | {
      status: "unclear";
      message: string; // 다시 촬영을 안내하는 문구
    };
