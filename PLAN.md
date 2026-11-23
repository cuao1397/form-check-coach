# 스마트 폼 체크 코치 — 계획서 (Plan)

> **한 줄 요약:** 운동 영상을 올리면 AI 트레이너가 자세의 틀린 점과 교정 포인트(최대 3개)를 알려 주는 웹 앱을 PRD 그대로 완성한다.
>
> **프로젝트:** my-app (Next.js 16.4.6)
> **작성자:** 김윤식
> **작성일:** 2026-11-23
> **상태:** 초안 (Draft)
> **기준 문서:** [PRD.md](PRD.md) (동결본)

---

## 이번 사이클 목표와 성공 기준

**이번 사이클 목표:** PRD에 정의된 기능 전체(영상 업로드·AI 자세 분석·3줄 교정 카드·안전 규칙·예외 처리·이용 제한)를 동작하는 MVP로 만든다. 배포(Part 5)는 이 사이클 다음 단계다.

**성공 기준** (PRD 3번 지표를 그대로 사용)

| 기준 | 목표 | 확인 방법 |
|---|---|---|
| 분석 시간 | 영상 업로드 후 **30초 이내**에 피드백 표시 | 버튼을 누른 시점부터 결과가 나올 때까지 직접 재기 |
| 자세 오류 지적 정확도 | 테스트 영상 5개 중 **4개(80%) 이상** | 영상 5개를 직접 눈으로 보고 AI 지적이 맞는지 확인 |
| 교정 포인트 개수 | 피드백 1건당 **3개 이내** | 결과 화면에서 개수 확인 |
| 의료 진단 표현 | **0건** | 테스트 결과의 모든 문장 확인 |
| 코드 품질 | `npm run lint`, `npm run build` 오류 **0건** | 두 명령 실행 |
| 기능 완성도 | 아래 "작업 순서" 14개가 모두 완료 | 체크 표시 확인 |

---

## Executive Summary

| 관점 | 내용 |
|---|---|
| **Problem** | 혼자 운동하는 사람은 자세가 맞는지 확인할 방법이 없어 불안하고, 자세가 틀리면 효과가 줄고 부상 위험이 커진다. |
| **Solution** | 운동 영상(15초·50MB 이내)을 올리면 AI가 자세와 움직임을 분석해 점수와 교정 포인트(최대 3개)를 바로 알려 준다. |
| **Function/UX Effect** | 운동 직후 30초 안에 결과를 받아 같은 날 남은 세트에서 자세를 고칠 수 있고, 통증 신호가 보이면 전문가 상담을 권한다. |
| **Core Value** | 필요한 순간에, 80% 정답률 검증을 거친 자세 피드백을, 의료 진단 없이 안전하게 받는다. |

---

## Context Anchor

| Key | Value |
|-----|-------|
| **WHY** | 혼자 운동하는 사람이 필요한 순간에 자세 피드백을 받을 방법이 없다. |
| **WHO** | 개인 PT가 부담스럽거나 일정이 불규칙해 혼자 운동하는 실용주의자, 통증·부상 이력이 있는 러너·수영 선수 |
| **RISK** | 배포 환경의 업로드 용량 제한(50MB와 충돌 가능), AI 분석이 30초를 넘길 가능성 |
| **SUCCESS** | 30초 이내 분석 · 정확도 4/5 · 포인트 3개 이내 · 진단 표현 0건 |
| **SCOPE** | 영상 1개 업로드 → AI 분석 → 점수와 교정 카드. 로그인·기록·공유·사진·실시간 카메라는 제외 |

---

## 작업 순서

> 먼저 되면 나머지가 쉬워지는 것부터 순서대로 적었다. 한 줄에 한 작업이다.
> `[부분]`은 이전에 만든 기본 코드가 있어 보완이 필요하다는 뜻이다.

1. [x] **공통 설정값과 타입 정리:** 15초·50MB·MP4/MOV·하루 5회·안내 문구·결과 타입을 한곳에 모은다. `[부분]`
2. [x] **기본 화면 틀:** 다크 모드 색상, 첫 화면 제목·안내, 의료 서비스 아님 문구, AI 서비스 이용 안내를 만든다. `[부분]`
3. [x] **분석 API 뼈대:** 서버가 영상을 받아 AI에 보내고 결과를 돌려준다(키는 서버에서만 사용). `[부분]`
4. [x] **서버 안전 규칙:** 진단 표현 차단, 통증 경고 자동 첨부, 포인트 3개 제한, 보이지 않음·지원 외 운동 분류를 처리한다. `[부분]`
5. [x] **이용 횟수 제한:** 한 사람당 하루 5회까지만 분석되게 한다.
6. [x] **영상 업로드 영역:** 눌러서 고르기·끌어다 놓기·미리보기와 촬영 가이드 문구를 만든다. `[부분]`
7. [x] **영상 조건 즉시 검사:** 15초·50MB·MP4/MOV를 넘으면 올리는 즉시 안내한다. `[부분]`
8. [x] **AI 전송 동의:** 체크박스에 동의해야 분석을 시작할 수 있게 한다.
9. [x] **분석 흐름 연결:** 올리기 → 분석 → 결과로 이어지고, 30초가 넘으면 지연 안내와 [재시도] 버튼을 보여 준다. `[부분]`
10. [x] **분석 중 로딩 화면:** "AI가 관절 각도를 분석 중입니다..." 애니메이션을 보여 준다. `[부분]`
11. [x] **결과 화면:** 점수 게이지, "AI의 종합 판단" 설명, 교정 카드(최대 3개), 통증 경고를 보여 준다. `[부분]`
12. [x] **예외 안내 카드:** 사람이 여러 명·안 보임·어두움, 지원하지 않는 운동일 때 안내 카드를 보여 준다. `[부분]`
13. [x] **자세가 완벽할 때 화면:** "훌륭한 자세입니다! ✨" 칭찬과 유지할 포인트 1~3개를 보여 준다.
14. [ ] **목표 지표 점검과 배포 전 확인:** 성공 기준 4가지를 확인하고, Vercel 업로드 용량 제한을 확인해 50MB 기준을 최종 결정한다.
    - 확인함: Vercel 서버 함수의 요청 크기 기본 한도는 4.5MB이며, 20MiB까지 늘리는 베타가 있지만 50MB에는 못 미친다. 50MB 기준을 쓰려면 영상을 서버 대신 Vercel Blob으로 직접 올리는 방식이 필요하다. **(결정 필요)**
    - 아직 못 함: 30초 이내·정확도 4/5는 실제 운동 영상 5개로 직접 확인해야 한다.

---

## 1. Overview

### 1.1 Purpose

운동 영상을 올리면 AI 트레이너가 자세의 틀린 점을 알려 주고 바로 해볼 수 있는 교정 포인트를 정리해 주는 서비스를 만든다.

### 1.2 Background

개인 PT는 비용과 시간이 부담스럽고, 유튜브·웨어러블은 "내 자세가 맞는지"를 알려 주지 못한다. 자세한 배경은 PRD 1~2번에 있다.

### 1.3 Related Documents

- 요구사항: [PRD.md](PRD.md)
- 프로젝트 규칙: [CLAUDE.md](CLAUDE.md)
- 다음 문서: [DESIGN.md](DESIGN.md)

---

## 2. Scope

### 2.1 In Scope

- [ ] 운동 영상 업로드 (1개씩, 15초·50MB·MP4/MOV)
- [ ] AI 자세 분석과 종합 자세 점수(0~100점)
- [ ] 교정 피드백 카드(최대 3개)와 통증 안전 경고
- [ ] 지원 운동 3종(스쿼트·데드리프트·벤치프레스)
- [ ] 예외 처리 5가지, 하루 5회 이용 제한, AI 전송 동의

### 2.2 Out of Scope

- 사진 업로드, 로그인·회원가입, 분석 기록(히스토리), 카드 이미지 저장·공유
- 실시간 카메라 분석, 영상의 서버 저장, 러닝·수영 등 3종 이외 운동
- 트레이너 연결·채팅, 결제, 모바일 앱
- 의료 진단, 치료법·약 추천 (앞으로도 만들지 않음)

---

## 3. Requirements

### 3.1 Functional Requirements

| ID | Requirement | Priority | 작업 번호 | Status |
|----|-------------|----------|:---:|--------|
| FR-01 | 운동 영상을 끌어다 놓거나 눌러서 올릴 수 있다 | High | 6 | Pending |
| FR-02 | 15초·50MB·MP4/MOV를 넘으면 올리는 즉시 안내한다 | High | 7 | Pending |
| FR-03 | 영상을 AI로 분석해 종합 점수(0~100)를 낸다 | High | 3 | Pending |
| FR-04 | 교정 포인트를 3개 이내로 카드로 보여 준다 | High | 4, 11 | Pending |
| FR-05 | 의료 진단 표현을 내보내지 않고 통증 시 전문가 상담 문구를 붙인다 | High | 4 | Pending |
| FR-06 | 사람 여러 명·안 보임·어두움이면 다시 촬영을 안내한다 | High | 12 | Pending |
| FR-07 | 지원하지 않는 운동이면 3종만 가능하다고 안내한다 | Medium | 12 | Pending |
| FR-08 | 자세가 완벽하면 칭찬과 유지할 포인트를 보여 준다 | Medium | 13 | Pending |
| FR-09 | 30초가 넘으면 지연 안내와 [재시도] 버튼을 보여 준다 | High | 9 | Pending |
| FR-10 | 하루 5회까지만 분석할 수 있다 | Medium | 5 | Pending |
| FR-11 | 동의 체크박스를 눌러야 분석이 시작된다 | High | 8 | Pending |
| FR-12 | 촬영 가이드와 AI 이용 안내 문구를 표시한다 | Medium | 2, 6 | Pending |

### 3.2 Non-Functional Requirements

| Category | Criteria | Measurement Method |
|----------|----------|-------------------|
| Performance | 분석 결과 표시까지 30초 이내 | 직접 시간 재기 |
| Security | AI 키는 서버에서만 사용, 영상은 저장하지 않음 | 브라우저 파일에 키가 없는지 검사, 코드 확인 |
| Privacy | 동의 후에만 외부 AI로 전송 | 동의 전 분석 버튼이 막히는지 확인 |
| Usability | 모바일 화면 기준으로 먼저 보기 좋게 | 모바일 크기로 직접 확인 |
| Accessibility | 키보드로 조작 가능, 에러는 화면 읽기 도구가 읽을 수 있게 | 직접 확인 |

---

## 4. Success Criteria

### 4.1 Definition of Done

- [ ] 작업 순서 14개가 모두 완료됨
- [ ] 성공 기준(위쪽 표)의 4가지 지표를 확인함
- [ ] 예외 상황 5가지가 각각 안내 문구대로 동작함

### 4.2 Quality Criteria

- [ ] `npm run lint` 오류 0건
- [ ] `npm run build` 성공
- [ ] 화면이 바뀐 작업은 `npm run dev`로 실제로 확인함

---

## 5. Risks and Mitigation

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| 배포 환경(Vercel)이 큰 영상 업로드를 막음 (50MB와 충돌) | High | High | 작업 14에서 확인 후 용량 기준 또는 업로드 방식을 결정 |
| AI 분석이 30초를 넘김 | High | Medium | 지연 안내와 [재시도] 버튼 제공, 영상 15초 제한 유지 |
| AI가 틀린 지적을 하거나 점수가 들쭉날쭉함 | High | Medium | 정확도 4/5 검증, 점수는 "AI의 종합 판단"으로 표시 |
| AI가 진단처럼 들리는 표현을 씀 | High | Low | 프롬프트 지시 + 서버에서 표현 차단 |
| 영상의 개인정보를 외부 AI로 보내는 문제 | High | Medium | 동의 체크박스, 영상 비저장, AI 서비스 약관 확인(PRD 7번 [확인 필요]) |
| 하루 5회 제한이 서버 재시작·배포 환경에서 풀림 | Medium | High | 서버 메모리 기준의 임시 보호임을 인지하고, 필요하면 DESIGN에서 대안 제안 |
| 영상 길이(15초)를 서버에서 읽지 못함 | Low | High | 화면(브라우저)에서 검사, 서버는 용량만 확인 |
| AI 서비스가 바쁘거나 한도 초과 | Medium | Medium | 사람이 이해할 오류 문구와 [재시도] 제공 |

---

## 6. Impact Analysis

### 6.1 Changed Resources

| Resource | Type | Change Description |
|----------|------|--------------------|
| `lib/limits.ts`, `lib/types.ts` | 공통 설정 | 형식·횟수·문구·결과 타입 추가 |
| `app/api/analyze/route.ts` | API | 지원 운동·예외 분류·타임아웃·횟수 제한 추가 |
| `components/*`, `app/page.tsx` | 화면 | 동의·가이드·예외 카드·완벽 화면·재시도 추가 |
| `app/globals.css`, `app/layout.tsx` | 스타일 | 변경 없음(필요 시 소폭) |

### 6.2 Current Consumers

| Resource | Operation | Code Path | Impact |
|----------|-----------|-----------|--------|
| `lib/limits.ts` | READ | 화면 컴포넌트, `app/api/analyze/route.ts` | 값을 바꾸면 양쪽에 영향 — 확인 필요 |
| `lib/types.ts` | READ | `components/ResultView.tsx`, `components/FormCheckApp.tsx`, API | 결과 모양을 바꾸면 화면도 함께 수정 필요 |
| `app/api/analyze/route.ts` | CALL | `components/FormCheckApp.tsx`의 `fetch("/api/analyze")` | 응답 모양을 바꾸면 화면 영향 |

### 6.3 Verification

- [ ] 위 사용처가 모두 새 모양과 맞게 동작하는지 확인
- [ ] 결과 타입을 바꾼 뒤 `npm run build`로 타입 오류가 없는지 확인

---

## 7. Architecture Considerations

### 7.1 Project Level Selection

| Level | Selected |
|-------|:--------:|
| Starter | ☑ (구조: `components/`, `lib/`) + 서버 API 1개 |
| Dynamic | ☐ (BaaS 사용 안 함) |
| Enterprise | ☐ |

### 7.2 Key Architectural Decisions

| Decision | Options | Selected | Rationale |
|----------|---------|----------|-----------|
| Framework | Next.js | **Next.js 16 (App Router)** | PRD 8번에서 고정, Vercel 배포 예정 |
| Styling | Tailwind / CSS Modules | Tailwind CSS | 이미 설치됨 |
| State Management | Context / 컴포넌트 내부 상태 | 컴포넌트 내부 상태 | 화면이 1개라 충분 |
| API Client | fetch | fetch | 추가 설치 불필요 |
| Backend | Serverless | Next.js 서버 API(route handler) | 키를 서버에만 두기 위해 |
| AI | Google Gemini API | Gemini | 이미 키가 `.env`에 있음 |

### 7.3 Clean Architecture Approach

```
Selected Level: Starter + 서버 API
my-app/
├── app/            화면 첫 페이지, 서버 API(app/api/analyze)
├── components/     화면 부품
└── lib/            공통 설정값, 타입, (서버 규칙 도우미)
```

---

## 8. Convention Prerequisites

### 8.1 Existing Project Conventions

- [x] `CLAUDE.md`에 규칙 있음 (한국어, 검증 루프, 커밋 규칙)
- [ ] `docs/01-plan/conventions.md` 없음 (이번에는 만들지 않음)
- [x] ESLint 설정 있음 (`eslint.config.mjs`)
- [ ] Prettier 설정 없음
- [x] TypeScript 설정 있음 (`tsconfig.json`)

### 8.2 Conventions to Define/Verify

| Category | Current State | To Define | Priority |
|----------|---------------|-----------|:--------:|
| Naming | 컴포넌트 PascalCase, 나머지 camelCase | 유지 | High |
| Folder structure | `app/`, `components/`, `lib/` | 유지 | High |
| Environment variables | `.env`에 키 보관 | 아래 8.3 | High |
| Error handling | API가 `{ error, retryable }` 반환 | DESIGN에서 확정 | Medium |

### 8.3 Environment Variables Needed

| Variable | Purpose | Scope | To Be Created |
|----------|---------|-------|:-------------:|
| `GEMINI_API_KEY` | AI 분석 키 | 서버만 | ☑ (이미 있음) |
| `GEMINI_MODEL` | 분석 모델 이름(선택) | 서버만 | ☐ (없으면 기본값 사용) |

---

## 9. Next Steps

1. [ ] [DESIGN.md](DESIGN.md) 작성 (이 계획서 기준)
2. [ ] 설계 확인 후 작업 순서대로 구현 (CLAUDE.md의 검증 루프 사용)
3. [ ] 목표 지표 점검 후 배포(Part 5)

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.1 | 2026-11-23 | 최초 작성 | 김윤식 |
