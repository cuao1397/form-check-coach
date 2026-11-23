# 스마트 폼 체크 코치 — 설계서 (Design)

> **한 줄 요약:** Next.js 하나로 화면과 서버 API를 만들고, 영상을 AI로 분석해 점수와 교정 카드(최대 3개)를 보여 주는 구조를 정한다.
>
> **프로젝트:** my-app (Next.js 16.4.6)
> **작성자:** 김윤식
> **작성일:** 2026-11-23
> **상태:** 초안 (Draft)
> **계획서:** [PLAN.md](PLAN.md) · **기획서:** [PRD.md](PRD.md)

---

## Context Anchor

> PLAN.md에서 가져왔다. 구현 단계에서도 "왜 만드는지"를 잊지 않기 위한 표다.

| Key | Value |
|-----|-------|
| **WHY** | 혼자 운동하는 사람이 필요한 순간에 자세 피드백을 받을 방법이 없다. |
| **WHO** | 개인 PT가 부담스럽거나 일정이 불규칙해 혼자 운동하는 실용주의자, 통증·부상 이력이 있는 러너·수영 선수 |
| **RISK** | 배포 환경의 업로드 용량 제한(50MB와 충돌 가능), AI 분석이 30초를 넘길 가능성 |
| **SUCCESS** | 30초 이내 분석 · 정확도 4/5 · 포인트 3개 이내 · 진단 표현 0건 |
| **SCOPE** | 영상 1개 업로드 → AI 분석 → 점수와 교정 카드. 로그인·기록·공유·사진·실시간 카메라는 제외 |

---

## 1. Overview

### 1.1 Design Goals

- 영상을 올리면 **30초 안에** 점수와 교정 카드가 나오는 흐름을 가장 단순하게 만든다.
- AI 키와 안전 규칙(진단 차단·통증 경고)은 **서버에서만** 다뤄, 화면에서 우회할 수 없게 한다.
- 규칙 로직을 화면과 떼어 놓아 **따로 시험**할 수 있게 한다.

### 1.2 Design Principles

- **서버가 최종 책임:** 화면의 검사(15초·형식)는 편의일 뿐, 용량·횟수·안전 규칙은 서버가 다시 확인한다.
- **추측하지 않는다:** 영상이 잘 안 보이면 점수를 내지 않고 다시 촬영을 안내한다.
- **모바일 먼저:** 작은 화면 기준으로 먼저 보기 좋게 만든다.
- **저장하지 않는다:** 영상은 분석에만 쓰고 남기지 않는다.

---

## 기술 선택

> 기본은 **Next.js**다. (PRD 8번에서 고정, Part 5에서 Vercel로 배포) 아래 "추가 제안"은 **아직 정해진 것이 아니라 제안**이며, 설치 전에 사용자의 결정을 받는다.

### 이미 쓰고 있는 기본 기술

| 기술 | 쉬운 설명 | 역할 |
|---|---|---|
| Next.js 16 (App Router) | 화면과 서버 코드를 한 프로젝트에서 만들게 해 주는 도구 | 화면 + 서버 API |
| TypeScript | 코드의 실수를 미리 잡아 주는 글쓰기 규칙 | 전체 코드 |
| Tailwind CSS | 클래스 이름만 적어 화면 모양을 꾸미는 도구 | 다크 모드 디자인 |
| Google Gemini API | 영상을 보고 자세를 분석해 주는 AI 서비스 | 서버에서만 호출 |

### 추가 제안 (선택)

| 제안 | 쉬운 설명 (1줄) | 왜 필요한가 | 시점 |
|---|---|---|---|
| **Zod** | AI가 보낸 답이 약속한 모양인지 자동으로 검사해 주는 도구 | AI 답이 가끔 엉뚱한 모양일 때 앱이 깨지지 않게 함 | 선택 (직접 검사로 대체 가능) |
| **Vitest** | 안전 규칙이 잘 동작하는지 자동으로 시험해 주는 도구 | "진단 표현 0건"처럼 중요한 규칙을 영상 없이도 반복 시험 | 권장 |
| **Upstash Redis** (Vercel에서 연결) | 서버가 꺼져도 사라지지 않는 '출석부' | 하루 5회 제한을 **배포 후에도** 정확히 세기 위해 | 배포 단계에서 결정 |
| **Vercel Blob** | 큰 영상을 서버를 거치지 않고 임시 창고에 직접 올리는 방법 | Vercel의 업로드 용량 제한(확인 필요)과 50MB가 충돌할 때의 해결 후보 | 작업 14에서 결정 |

> 위 4개는 모두 **프레임워크 교체가 아니라 부품 추가**라서 CLAUDE.md의 "Next.js 고정" 규칙과 충돌하지 않는다.

---

## 2. Architecture Options

### 2.0 Architecture Comparison

| Criteria | Option A: Minimal | Option B: Clean | Option C: Pragmatic |
|----------|:-:|:-:|:-:|
| **Approach** | 지금 코드를 그대로 두고 고침 | 층으로 완전히 분리 | 구조 유지 + 서버 로직만 분리 |
| **New Files** | 약 3 | 약 12 | 약 6 |
| **Modified Files** | 약 8 | 약 10 | 약 5 |
| **Complexity** | Low | High | Medium |
| **Maintainability** | Medium | High | High |
| **Effort** | Low | High | Medium |
| **Recommendation** | 빠른 시연 | 장기 프로젝트 | **기본 선택** |

**Selected**: **Option C (균형형)** — **Rationale**: 이미 만든 구조(`app/`, `components/`, `lib/`)를 유지해 작업량이 적고, 안전 규칙·횟수 제한 같은 중요한 서버 로직만 `lib/server/`로 떼어 따로 시험할 수 있다.

### 2.1 Component Diagram

```
┌──────────────────┐   영상 + 동의    ┌────────────────────────┐   영상 + 지시문   ┌──────────────┐
│  브라우저(화면)   │ ───────────────▶ │  Next.js 서버           │ ───────────────▶ │ Gemini (AI)  │
│  components/      │ ◀─────────────── │  app/api/analyze        │ ◀─────────────── │              │
│  - 업로드·검사    │   결과 / 오류     │   └ lib/server/         │    분석 결과      └──────────────┘
│  - 로딩·결과 화면 │                   │      analyze · safety   │
└──────────────────┘                   │      rateLimit          │
                                       └────────────────────────┘
                                       키는 여기서만 .env로 읽음. 영상은 저장하지 않음
```

### 2.2 Data Flow

```
[브라우저]
 영상 선택 → ① 형식(MP4/MOV)·15초·50MB 검사 ─ 실패 → "15초 이내, 50MB 이하의 MP4/MOV…" 안내
          → ② 동의 체크 → [분석 시작]
          → ③ POST /api/analyze (영상) + 30초 타이머
[서버]
 ④ 키 확인 → ⑤ 하루 5회 확인 → ⑥ 형식·용량 재검사
 ⑦ AI 호출 (15MB 이하는 직접 전달 / 초과는 임시 업로드 후 삭제)
 ⑧ AI 답 읽기 → ⑨ 안전 처리(safety)
      · 진단 표현 있으면 결과 차단
      · 포인트 3개로 자르기
      · 통증 표현이면 경고 문구 붙이기
[브라우저]
 ⑩ 결과에 따라 화면 선택
      ok + 점수 낮음/중간 → 결과 화면(점수 + 교정 카드)
      ok + excellent      → "훌륭한 자세입니다! ✨" + 유지할 포인트
      unclear             → "1명의 전신이 밝게 나오도록 다시 촬영해 주세요"
      unsupported         → "스쿼트, 데드리프트, 벤치프레스 영상만 분석 가능합니다"
      오류 / 30초 초과    → 안내 문구 + [재시도]
```

### 2.3 Dependencies

| Component | Depends On | Purpose |
|-----------|-----------|---------|
| `components/FormCheckApp` | `lib/limits`, `lib/types`, 다른 화면 부품 | 전체 흐름 관리 |
| `app/api/analyze/route.ts` | `lib/server/*`, `lib/limits`, `lib/types` | 요청 받기 → 처리 → 응답 |
| `lib/server/analyze.ts` | Gemini API, `.env` | AI 호출 |
| `lib/server/safety.ts` | 없음 (순수 규칙) | 진단 차단·통증 경고·3개 제한 |
| `lib/server/rateLimit.ts` | 없음 | 하루 5회 세기 |

---

## 3. Data Model

DB를 쓰지 않는다. 영상과 결과는 저장하지 않고, 요청 한 번 안에서만 존재한다.

### 3.1 Entity Definition

```typescript
// 교정 포인트 하나 (자세가 완벽하면 "유지할 포인트")
type FeedbackItem = { point: string; tip: string };

// 분석 결과 (서버 → 화면)
type AnalysisResult =
  | {
      status: "ok";
      exercise: string;        // 스쿼트 / 데드리프트 / 벤치프레스
      score: number;           // 0~100
      summary: string;         // 한 줄 총평
      excellent: boolean;      // true면 feedback은 "유지할 포인트"
      feedback: FeedbackItem[]; // 최대 3개
      painWarning: string | null;
    }
  | { status: "unclear" | "unsupported"; message: string };

// 오류 (서버 → 화면)
type ApiError = { error: string; retryable?: boolean };
```

### 3.2 Entity Relationships

관계 없음 (저장하는 데이터가 없다).

### 3.3 하루 5회 카운터

| Field | Type | 설명 |
|---|---|---|
| 접속 주소 | string | 사람을 구분하는 기준 |
| 날짜 | string (한국 시간) | 날짜가 바뀌면 0으로 시작 |
| 횟수 | number | 5가 되면 막음 |

> 지금은 서버 메모리에 저장한다. 서버가 다시 시작되면 0으로 돌아가므로 배포 후에는 "추가 제안"의 Upstash Redis 같은 저장소가 필요할 수 있다.

---

## 4. API Specification

### 4.1 Endpoint List

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| POST | `/api/analyze` | 영상을 받아 분석 결과를 돌려준다 | 없음 (하루 5회 제한) |

### 4.2 Detailed Specification

#### `POST /api/analyze`

**Request:** `multipart/form-data`, 필드 `video` (MP4/MOV, 50MB 이하)

**Response 200 — 분석 성공:**
```json
{
  "status": "ok",
  "exercise": "스쿼트",
  "score": 78,
  "summary": "전반적으로 안정적이에요.",
  "excellent": false,
  "feedback": [{ "point": "무릎 방향", "tip": "발끝 방향으로 무릎을 밀어 보세요." }],
  "painWarning": null
}
```

**Response 200 — 분석 불가:**
```json
{ "status": "unclear", "message": "1명의 전신이 밝게 나오도록 다시 촬영해 주세요." }
```
`status`가 `"unsupported"`이면 "스쿼트, 데드리프트, 벤치프레스 영상만 분석 가능합니다."를 돌려준다.

**Error Responses** (`{ "error": "...", "retryable": true|false }`)

| 상태 | 원인 | retryable |
|---|---|:-:|
| 400 | 영상 없음·형식 아님·50MB 초과 | false |
| 429 | 하루 5회 초과 | false |
| 500 | 서버에 `GEMINI_API_KEY` 없음 | false |
| 502 | AI 서비스 오류·답 읽기 실패·진단 표현 차단 | true |
| 504 | AI 응답 지연(약 28초) | true |

---

## 5. UI/UX Design

### 5.1 Screen Layout (모바일 기준, 한 페이지)

```
┌────────────────────────────────────┐
│  [AI 트레이너]                       │  헤더
│  스마트 폼 체크 코치 / 한 줄 설명     │
├────────────────────────────────────┤
│  ① 시작:  업로드 영역 (점선 상자)    │
│     └ 촬영 가이드 문구               │
│  ② 영상 고른 뒤: 미리보기            │
│     └ ☐ AI 전송 동의                │
│     └ [자세 분석 시작] [다른 영상]    │
│  ③ 분석 중: 관절 점 애니메이션       │
│  ④ 결과: 점수 게이지 + 교정 카드 3개  │
│     └ (통증 시 노란 경고 상자)       │
├────────────────────────────────────┤
│  푸터: 의료 서비스 아님 · AI 이용 안내│
└────────────────────────────────────┘
```
PC 화면에서는 가운데 정렬된 좁은 칸(최대 약 672px)으로 보여 준다. 색은 어두운 남색 계열이며 점수는 좋음(초록)·보통(노랑)·낮음(빨강)으로 구분한다.

### 5.2 User Flow

```
영상 올리기 → (조건 검사) → 동의 체크 → 분석 시작 → 로딩
  → 결과(점수·카드) → [다른 영상 분석하기]
  ↳ 안내 카드(다시 촬영 / 지원 외 운동) → [다시 올리기]
  ↳ 오류·지연 → [재시도]
```

### 5.3 Component List

| Component | Location | Responsibility |
|-----------|----------|----------------|
| `Home` | `app/page.tsx` | 헤더·푸터와 앱 배치 |
| `FormCheckApp` | `components/FormCheckApp.tsx` | 단계(올리기→분석→결과) 관리, 서버 호출, 타이머, 재시도 |
| `UploadZone` | `components/UploadZone.tsx` | 눌러서 고르기·끌어다 놓기 |
| `ConsentCheck` (새) | `components/ConsentCheck.tsx` | AI 전송 동의 체크박스 |
| `AnalyzingLoader` | `components/AnalyzingLoader.tsx` | 분석 중 애니메이션과 문구 |
| `ResultView` | `components/ResultView.tsx` | 점수 게이지·설명·카드·통증 경고·칭찬 화면 |
| `NoticeCard` (새) | `components/NoticeCard.tsx` | 다시 촬영/지원 외 운동 안내 카드 |

### 5.4 Page UI Checklist

#### 첫 화면 (업로드 단계)

- [ ] 제목 "스마트 폼 체크 코치"와 한 줄 설명
- [ ] 업로드 영역: 눌러서 고르기 + 끌어다 놓기, "15초 이내 · 50MB 이하 · MP4/MOV" 표시
- [ ] 업로드 영역 아래에 촬영 가이드 "전신이 나오도록 측면 또는 45도 각도에서 밝은 곳에서 촬영해 주세요"
- [ ] 푸터: "이 서비스는 의료 서비스가 아니며, 통증이 있으면 전문의/PT 상담을 권장합니다"
- [ ] 푸터: Google Gemini 사용 및 영상 비저장 안내

#### 영상 선택 후 (준비 단계)

- [ ] 영상 미리보기(재생 가능)
- [ ] 동의 체크박스 "영상이 AI 분석을 위해 외부 AI 서비스로 전송되는 것에 동의합니다"
- [ ] [자세 분석 시작] 버튼 — 동의하기 전에는 눌리지 않음
- [ ] [다른 영상 고르기] 버튼
- [ ] 조건 위반 시 "15초 이내, 50MB 이하의 MP4/MOV 영상을 업로드해 주세요" 알림

#### 분석 중

- [ ] 관절 점이 깜빡이는 사람 모양 애니메이션
- [ ] "AI가 관절 각도를 분석 중입니다..." 문구(돌아가며 바뀜)
- [ ] 화면을 닫지 말라는 안내

#### 결과 화면

- [ ] 점수 게이지(0~100)와 색상 구분, 운동 종류 표시
- [ ] "이 점수는 AI의 종합 판단입니다" 설명
- [ ] 교정 카드 최대 3개(번호, 포인트, 개선 팁)
- [ ] 통증 신호가 있으면 "통증 지속 시 운동을 중단하고 전문의/PT 전문가 상담을 권장합니다" 경고 상자
- [ ] [다른 영상 분석하기] 버튼

#### 자세가 완벽할 때

- [ ] "훌륭한 자세입니다! ✨"
- [ ] "유지해야 할 포인트" 1~3개 카드

#### 안내·오류 카드

- [ ] 다시 촬영 안내: "1명의 전신이 밝게 나오도록 다시 촬영해 주세요" + [다시 올리기]
- [ ] 지원 외 운동 안내: "스쿼트, 데드리프트, 벤치프레스 영상만 분석 가능합니다" + [다시 올리기]
- [ ] 지연: "분석 시간이 지연되고 있습니다. 잠시 후 다시 시도해 주세요" + [재시도]
- [ ] 하루 5회 초과: "하루 5회까지 분석할 수 있어요. 내일 다시 이용해 주세요"

---

## 6. Error Handling

### 6.1 Error Code Definition

| 상황 | 어디서 | 사용자에게 보이는 문구 | 처리 |
|---|---|---|---|
| 형식·길이·용량 초과 | 화면 | 15초 이내, 50MB 이하의 MP4/MOV 영상을 업로드해 주세요. | 올리기 취소 |
| 하루 5회 초과 | 서버 429 | 하루 5회까지 분석할 수 있어요. 내일 다시 이용해 주세요. | 재시도 버튼 없음 |
| 사람 여러 명·안 보임·어두움 | AI 판단 | 1명의 전신이 밝게 나오도록 다시 촬영해 주세요. | 안내 카드 |
| 지원 외 운동 | AI 판단 | 스쿼트, 데드리프트, 벤치프레스 영상만 분석 가능합니다. | 안내 카드 |
| 30초 초과 | 화면 타이머 / 서버 504 | 분석 시간이 지연되고 있습니다. 잠시 후 다시 시도해 주세요. | [재시도] |
| AI 서버 오류·한도 | 서버 502 | 상황에 맞는 쉬운 문구 | [재시도] |
| 진단 표현 감지 | 서버 502 | 의학적으로 들릴 수 있는 표현이 있어 보여 드리지 않았어요. 다시 시도해 주세요. | [재시도] |

### 6.2 Error Response Format

```json
{ "error": "사용자에게 보여 줄 쉬운 문구", "retryable": true }
```
비밀 키나 AI 서비스의 원문 오류는 화면에 절대 내보내지 않는다.

---

## 7. Security Considerations

- [ ] AI 키는 `.env`에만 두고 서버 코드에서만 읽는다. (빌드 결과의 브라우저 파일에 키가 없는지 확인)
- [ ] 올린 파일의 형식과 용량을 서버에서도 다시 검사한다.
- [ ] 영상은 저장하지 않는다. 큰 영상을 AI에 임시로 올렸다면 분석 직후 삭제한다.
- [ ] 동의 체크 없이는 분석을 시작할 수 없다.
- [ ] 진단 표현은 프롬프트 지시와 서버 검사, 두 겹으로 막는다.
- [ ] 하루 5회 제한으로 비용을 보호한다.
- [ ] AI 서비스의 학습 활용·보관 기간은 약관을 직접 확인한 뒤 안내 문구를 확정한다. (PRD 7번 [확인 필요])

---

## 8. Test Plan

> 이 프로젝트는 Playwright를 설치하지 않았다. 아래는 "무엇을 확인할지"이며, 영상이 필요한 항목은 사람이 직접 눈으로 확인한다. 안전 규칙은 Vitest(제안) 도입 시 자동 시험으로 바꾼다.

### 8.1 Test Scope

| Type | Target | Tool | Phase |
|------|--------|------|-------|
| L0: 빌드 | 오류 없음 | `npm run lint`, `npm run build` | 매 작업 |
| L1: API | `/api/analyze` 응답 | 수동 요청(curl 등) | Do |
| L2: 화면 동작 | 5.4 체크리스트 | `npm run dev`로 눈 확인 | Do |
| L3: 흐름 | 올리기→결과 전체 | 테스트 영상 5개 | Check |
| 규칙 시험 | `lib/server/safety.ts` | Vitest (제안) | Do |

### 8.2 L1: API Test Scenarios

| # | 요청 | 기대 결과 |
|---|---|---|
| 1 | 영상 없이 요청 | 400 |
| 2 | MP4/MOV가 아닌 파일 | 400 |
| 3 | 50MB 초과 파일 | 400 |
| 4 | 하루 6번째 요청 | 429 |
| 5 | 정상 영상 | 200, `feedback` 3개 이하, 브라우저로 키 노출 없음 |
| 6 | 진단 표현이 담긴 가짜 AI 답(규칙 시험) | 결과 차단 |

### 8.3 L2: 화면 동작 시나리오

| # | 화면 | 동작 | 기대 결과 |
|---|---|---|---|
| 1 | 첫 화면 | 열기 | 5.4의 모든 항목이 보임 |
| 2 | 업로드 | 16초 영상 올리기 | 조건 안내 알림 |
| 3 | 업로드 | `.avi` 올리기 | 조건 안내 알림 |
| 4 | 준비 | 동의 체크 전 | [분석 시작] 눌리지 않음 |
| 5 | 분석 | 30초 초과 | 지연 안내 + [재시도] |

### 8.4 L3: 테스트 영상 5개

| # | 영상 | 확인할 것 |
|---|---|---|
| 1 | 자세가 틀린 스쿼트 | 틀린 부분을 맞게 짚는가 |
| 2 | 자세가 좋은 스쿼트 | 칭찬 화면이 나오는가 |
| 3 | 사람이 여러 명 | 다시 촬영 안내가 나오는가 |
| 4 | 운동이 아닌 영상 | 지원 외 운동 안내가 나오는가 |
| 5 | 어두운 영상 | 다시 촬영 안내가 나오는가 |

> 정확도 지표(5개 중 4개)는 위 영상들의 결과를 눈으로 확인해 계산한다.

---

## 9. 구조와 계층

### 9.1 Layer Structure

| Layer | Responsibility | Location |
|-------|---------------|----------|
| **화면** | 보이는 것과 사용자 동작 | `components/`, `app/page.tsx` |
| **서버 입구** | 요청 받기·검사·응답 | `app/api/analyze/route.ts` |
| **서버 규칙** | 안전 규칙·횟수 제한·AI 호출 | `lib/server/` |
| **공통** | 설정값·타입 (화면과 서버가 함께 씀) | `lib/limits.ts`, `lib/types.ts` |

### 9.2 Dependency Rules

화면은 `lib/server/`를 직접 부르지 않는다(서버 전용 코드가 브라우저로 새는 것을 막기 위해). 화면은 `/api/analyze`만 호출한다.

### 9.3 This Feature's Layer Assignment

| Component | Layer | Location |
|-----------|-------|----------|
| FormCheckApp, UploadZone, ConsentCheck, NoticeCard, ResultView, AnalyzingLoader | 화면 | `components/` |
| route handler | 서버 입구 | `app/api/analyze/route.ts` |
| analyze, safety, rateLimit | 서버 규칙 | `lib/server/` |
| limits, types | 공통 | `lib/` |

---

## 10. Coding Convention Reference

### 10.1 Naming Conventions

| Target | Rule | Example |
|--------|------|---------|
| 컴포넌트 | PascalCase | `ResultView` |
| 함수·변수 | camelCase | `takeSlot` |
| 상수 | UPPER_SNAKE_CASE | `MAX_VIDEO_SECONDS` |
| 컴포넌트 파일 | PascalCase.tsx | `UploadZone.tsx` |
| 그 외 파일 | camelCase.ts | `rateLimit.ts` |

### 10.2 Environment Variables

| 이름 | 용도 | 범위 |
|---|---|---|
| `GEMINI_API_KEY` | AI 분석 키 | 서버만 (`NEXT_PUBLIC_` 붙이지 않음) |
| `GEMINI_MODEL` | 분석 모델 이름(선택) | 서버만 |

### 10.3 This Feature's Conventions

| Item | Convention Applied |
|------|-------------------|
| 주석·설명 | 한국어 (CLAUDE.md) |
| 안내 문구 | `lib/limits.ts`의 `MESSAGES`에 모아 한 곳에서 관리 |
| 상태 관리 | 컴포넌트 내부 상태(`useState`) |
| 오류 처리 | 서버는 `{ error, retryable }`, 화면은 문구와 [재시도] 표시 |

---

## 11. Implementation Guide

### 11.1 File Structure

```
my-app/
├── app/
│   ├── page.tsx                    (수정: 푸터 안내)
│   └── api/analyze/route.ts        (수정: 얇게 — 받기→호출→응답)
├── components/
│   ├── FormCheckApp.tsx            (수정: 동의·타이머·재시도·분기)
│   ├── UploadZone.tsx              (수정: MP4/MOV·가이드)
│   ├── ResultView.tsx              (수정: 설명·칭찬 화면)
│   ├── ConsentCheck.tsx            (새)
│   └── NoticeCard.tsx              (새)
└── lib/
    ├── limits.ts                   (수정: 형식·횟수·문구)
    ├── types.ts                    (수정: excellent·unsupported)
    └── server/
        ├── analyze.ts              (새: AI 호출)
        ├── safety.ts               (새: 진단 차단·경고·3개 제한)
        └── rateLimit.ts            (새: 하루 5회)
```

### 11.2 Implementation Order (PLAN.md 작업 번호와 같음)

1. [ ] 작업 1 공통 설정·타입 → 2. [ ] 기본 화면 틀 → 3. [ ] 분석 API 뼈대 → 4. [ ] 서버 안전 규칙
5. [ ] 이용 횟수 제한 → 6. [ ] 업로드 영역 → 7. [ ] 조건 즉시 검사 → 8. [ ] AI 전송 동의
9. [ ] 분석 흐름·재시도 → 10. [ ] 로딩 화면 → 11. [ ] 결과 화면 → 12. [ ] 예외 안내 카드
13. [ ] 완벽한 자세 화면 → 14. [ ] 지표 점검·배포 전 확인

각 작업은 CLAUDE.md의 검증 루프(변경 → lint·build → 화면 확인 → 커밋 → 한 줄 보고)를 따른다.

### 11.3 Session Guide

#### Module Map

| Module | Scope Key | 작업 번호 | Description |
|--------|-----------|:---:|-------------|
| 서버 기반 | `module-1` | 1, 3, 4, 5 | 설정·타입, AI 호출, 안전 규칙, 횟수 제한 |
| 업로드 | `module-2` | 2, 6, 7, 8 | 기본 화면, 업로드 영역, 조건 검사, 동의 |
| 흐름과 결과 | `module-3` | 9~13 | 분석 흐름·재시도, 로딩, 결과, 예외 카드, 칭찬 화면 |
| 점검 | `module-4` | 14 | 지표 점검, 배포 전 확인 |

#### Recommended Session Plan

| Session | Phase | Scope |
|---------|-------|-------|
| 1 | Plan + Design | 완료 (이 문서) |
| 2 | Do | `module-1` |
| 3 | Do | `module-2` |
| 4 | Do | `module-3` |
| 5 | Check + Report | `module-4` |

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.1 | 2026-11-23 | 최초 작성 (Option C 균형형) | 김윤식 |
