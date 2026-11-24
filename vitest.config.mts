import { defineConfig } from "vitest/config";

// 자동 시험 설정: lib/ 아래의 *.test.ts 파일만 실행해요
export default defineConfig({
  test: {
    include: ["lib/**/*.test.ts"],
    environment: "node",
  },
});
