"use client";

import { useEffect, useRef, useState } from "react";

const MESSAGES = [
  "AI가 관절 각도를 분석 중입니다...",
  "움직임의 흐름을 살펴보는 중입니다...",
  "교정 포인트를 정리하는 중입니다...",
];

// 관절 위치 (사람 모양의 점들)
const JOINTS = [
  { x: 60, y: 22 }, // 머리
  { x: 60, y: 44 }, // 목
  { x: 40, y: 54 }, // 왼쪽 어깨
  { x: 80, y: 54 }, // 오른쪽 어깨
  { x: 30, y: 80 }, // 왼쪽 팔꿈치
  { x: 90, y: 80 }, // 오른쪽 팔꿈치
  { x: 60, y: 84 }, // 허리
  { x: 46, y: 104 }, // 왼쪽 무릎
  { x: 74, y: 104 }, // 오른쪽 무릎
  { x: 42, y: 134 }, // 왼쪽 발
  { x: 78, y: 134 }, // 오른쪽 발
];
const BONES: [number, number][] = [
  [0, 1], [1, 2], [1, 3], [2, 4], [3, 5], [1, 6], [6, 7], [6, 8], [7, 9], [8, 10],
];

// 분석하는 동안 보여 주는 로딩 화면
export default function AnalyzingLoader() {
  const [index, setIndex] = useState(0);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // [분석 시작] 버튼이 사라지면 키보드 포커스가 없어지므로, 로딩 화면으로 옮겨요
    box.current?.focus();
    const timer = setInterval(() => setIndex((i) => (i + 1) % MESSAGES.length), 2500);
    return () => clearInterval(timer);
  }, []);

  return (
    <div
      ref={box}
      tabIndex={-1}
      role="status"
      className="flex flex-col items-center gap-6 rounded-3xl border border-line bg-surface px-6 py-14 text-center outline-none"
    >
      {/* 화면 낭독기에는 처음 한 번만 알려 줘요 (아래 문구는 계속 바뀌어서 읽지 않게 숨겨요) */}
      <span className="sr-only">AI가 영상을 분석하고 있어요. 보통 1분 안에 끝나요.</span>
      <svg viewBox="0 0 120 150" className="h-44 w-36" aria-hidden="true">
        {BONES.map(([a, b], i) => (
          <line
            key={i}
            x1={JOINTS[a].x}
            y1={JOINTS[a].y}
            x2={JOINTS[b].x}
            y2={JOINTS[b].y}
            stroke="var(--accent)"
            strokeOpacity="0.45"
            strokeWidth="2.5"
            strokeLinecap="round"
          />
        ))}
        {JOINTS.map((j, i) => (
          <circle
            key={i}
            cx={j.x}
            cy={j.y}
            r="4.5"
            fill="var(--accent)"
            className="animate-pulse"
            style={{ animationDelay: `${i * 140}ms`, animationDuration: "1.4s" }}
          />
        ))}
      </svg>
      <p aria-hidden="true" className="text-lg font-bold">
        {MESSAGES[index]}
      </p>
      <p aria-hidden="true" className="text-sm text-muted">
        보통 1분 안에 끝나요. 이 화면을 닫지 말아 주세요.
      </p>
    </div>
  );
}
