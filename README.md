# Canary

**한국어** · [English](README.en.md)

Canary is a free, private English learning workspace for Korean learners preparing for interviews and IELTS. [Read the English README](README.en.md).

**스트릭이 아니라, 증명을 남기는 영어.**

Canary는 결과가 필요한 사람을 위한 무료·프라이버시 우선 영어 학습 공간입니다. 영어 면접을 준비하는 개발자, IELTS 라이팅 준비생, 자신 있게 말하고 싶은 직장인을 위해 만들었습니다. 한국어 우선, 가입 없이 시작, 광고 없음.

영어 면접 · IELTS 라이팅 · 개발자 영어 · 발음 교정 · 영어 독학

[![ci](https://github.com/sam79083/canary_gemma/actions/workflows/ci/badge.svg)](https://github.com/sam79083/canary_gemma/actions/workflows/ci)
[Render로 직접 배포하기](https://render.com/deploy?repo=https://github.com/sam79083/canary_gemma) · [2분 만에 로컬 실행](#빠른-시작) · [증명서 예시 보기](#증명서)

<!-- TODO: replace with your deployed URL, e.g. https://canary.onrender.com/learn -->
**라이브 데모:** 위 Render 링크로 배포한 뒤 `/learn`을 여세요(무료 플랜은 유휴 상태에서 잠들 수 있습니다). 채팅·체험 모드를 쓰려면 Render에 `GEMINI_KEY`를 추가하세요. 규칙 기반 훈련은 키 없이도 동작합니다.

> **60초 투어:** `/learn` 열기 → 18문항 배치고사 → 오늘의 레슨 하나 → 실제 기사 읽기 → 최소대립쌍 발음 녹음 → IELTS 에세이 저장 → 증명서 내보내기.

## 왜 Canary인가

- **말하고 쓰는 훈련이 먼저.** 객관식만 누르는 공부가 아니라 직접 말하고, 쓰고, 읽고, 면접 질문에 답합니다. 채팅, 섀도잉, 발음 훈련, 에세이, 모의 면접은 모두 남길 수 있는 결과물을 만듭니다.
- **스트릭이 아니라 증명.** 의미 있는 세션은 포트폴리오가 됩니다. 레벨, 스트릭, 정확도, 발음, 글 샘플을 담은 한 장짜리 증명서를 내보내 튜터나 면접관에게 보여주세요. 과장하지 않고, 공부한 만큼만 말합니다.
- **일과 직업에 맞춘 콘텐츠.** 소프트웨어, 마케팅, 고객지원, 호텔·서비스, 오피스 트랙. 백엔드 개발자를 위한 Code Dojo에서는 React, TypeScript, Next.js를 영어로 배우고 라이브 프리뷰로 바로 확인합니다.
- **진짜 영어를 입력으로.** 기사를 붙여넣거나 공개 URL을 넣으세요. Canary가 본문을 추출하고 내 레벨에 맞는 학습 단어를 표시합니다. 모든 단어를 탭해 뜻을 보고, 카드로 저장해 복습할 수 있습니다.
- **기본은 프라이빗.** 채팅, 학습 기록, 카드는 브라우저에 저장됩니다. 가입은 필요 없습니다. 멤버는 Supabase 동기화를 선택할 수 있고, 클라우드 AI는 직접 선택할 때만 사용합니다.
- **한국어 우선.** 한국어 UI와 설명, 한국어 화자를 위한 최소대립쌍, 한국어 직무 표현을 제공합니다. UI 언어는 10개입니다.

## 할 수 있는 것

| 목표 | 하는 일 |
|---|---|
| 내 레벨 찾기 | 18문항 배치고사 + 신뢰도 확인 |
| 경로 따라가기 | CEFR 6단계, 단계별 5유닛, 유닛당 3레슨, 오늘의 레슨 |
| 오래 기억하기 | SM-2 간격 반복, 계속 틀리는 단어(리치), 셀프 평가 복습 |
| 실제 영어 읽기 | URL·붙여넣기 리더, 레벨 추정, 단어 탭, 학습 목록 |
| 더 선명하게 말하기 | 발음 채점 최소대립쌍, 섀도잉 녹음·재생, 음성 채팅 루프 |
| 시험 대비 | 40분 타이머 IELTS Task 2 모의 작성 + 개인 밴드 추정 |
| 취업 준비 | 직무별 표현, STAR 면접 질문, 채팅으로 모의 면접 |
| 습관 교정 | 오류 레이더(관사, 일치, 구두점, 3인칭) + 드릴 |
| 성장 증명 | 포트폴리오, 주간 리그, 증명서(.md), 피어 리뷰 카드 |

IELTS 밴드와 오류 검사는 **연습용 보조 도구**이지 공식 점수가 아닙니다. UI와 증명서 모두에 이 점을 명시합니다.

## 증명서

복사하거나 다운로드해 누구에게나 보낼 수 있는 한 장짜리 Markdown 파일입니다. 실제 내보내기 파일은 영어로 생성됩니다. 예시:

```markdown
# English Proof Sheet
Generated: 2026-10-19 · Canary self-study snapshot

> Not an official certificate — ask the learner to write or speak on the spot to verify.

## Level & practice
- Level: CEFR B1 (self-placed)
- XP: 1,234 · Lessons: 12
- Streak: 6 days current · best 12
- Quiz accuracy: 84% over 250 answers

## Skill profile
- Vocabulary: 90% (90/100)
- Grammar: 78% (39/50)
- Listening: 82% (41/50)

## Speaking
- Pronunciation: 74% word-level accuracy over 60 attempts (12 minimal pairs)

## Portfolio (7 pieces)
- IELTS practice — Free university education (2026-10-19)
- Essay — My first month in Seoul (2026-10-17)
- Milestone — B1 placed (2026-10-10)
- …and 4 more
```

## 이런 분께

- **한국 개발자** — 면접 영어, 코드 리뷰, 스탠드업을 실제로 연습하고 증명서로 남기세요. Code Dojo는 React/TS/Next를 영어로 가르칩니다.
- **IELTS 라이팅 준비생** — 40분 타이머로 Task 2를 쓰고 밴드 추정과 고칠 점을 바로 확인하세요. 가입 없이 무료입니다.
- **직장인·자기주도 학습자** — 회의, 이메일, 전화, 출장 영어를 역할극으로 연습하고 매일의 학습을 데이터로 확인하세요.

## 3단계로 시작하기

1. **`/learn`을 여세요.** 배치고사를 보거나 바로 오늘의 레슨으로 들어가세요.
2. **오늘 하나를 만들어 보세요.** 기사 하나, 에세이 하나, 발음 드릴 하나, 모의 면접 답변 하나면 충분합니다.
3. **증명을 남기세요.** 포트폴리오에 저장하고 증명서를 내보내 사람에게 피드백을 받으세요.

## 빠른 시작

```bash
npm install
cp .env.example .env.local   # 선택: GEMINI_KEY, SerpAPI, Supabase
npm run dev                  # http://localhost:3000/learn
```

핵심 훈련(배치고사, 레슨, SRS, 리더 붙여넣기, 발음, 직무, IELTS, 증명서)은 AI 키 없이 동작합니다. 채팅과 음성 답변은 다음 세 가지 중 하나를 사용합니다:

- **Gemma** — Chrome 내장 온디바이스 모델(데스크톱 Chrome 전용).
- **로컬(Ollama)** — Ollama 호환 서버.
- **클라우드** — 내 AI Studio 무료 키로 쓰는 Gemini, 또는 내장 체험 모드.

계정은 필요 없습니다. 학습 기록은 로컬에 저장되며, 멤버는 Supabase로 동기화할 수 있습니다.

## 테스트와 CI

```bash
npm test           # 약 290개 회귀 테스트: 학습 로직, 트라이얼, 리더, IELTS, 증명서, 동기화
npm run typecheck
npm run build
npm run test:e2e   # Playwright (선택)
```

CI는 타입 스트리핑 테스트 러너에 맞춰 Node 22에서 실행됩니다.

<details>
<summary><strong>아키텍처와 프로젝트 구조</strong></summary>

- **학습 허브** (`components/learn/TutorPanel.tsx`, `app/learn/page.tsx`) — 15개 연습 탭. 커리큘럼, 문제은행, 저장소, SRS, 리더, 발음, 직무, IELTS, 증명서, 오류, 듣기, 플래시카드, 포트폴리오를 순수 라이브러리로 구성했습니다.
- **결정론적 로직 우선** — 배치고사, 채점, 밴드 추정, 스트릭, 증명서는 모델 호출 없이 오프라인으로 실행됩니다. AI는 대화와 열린 코칭에만 사용합니다.
- **세 가지 AI 제공자** (`hooks/useLanguageModel.ts`) — Gemma/Ollama/Gemini가 하나의 세션 형태를 공유합니다.
- **파일 에이전트** (`lib/agent.ts`) — 도구 호출 블록이 게이트 루프에서 실행되고, 모든 쓰기는 Keep/Undo에서 멈춥니다 (`lib/undo.ts`).
- **리더 API** (`app/api/read/route.ts`) — 공개 URL만 허용: DNS 재확인, 수동 리다이렉트(최대 3회), 900KB 제한, 9초 타임아웃, IP당 시간당 30회.
- **체험 예산** (`lib/trial.ts`) — 신뢰할 수 있는 클라이언트 IP 추출, 종류별 카운터, 전역 시간당 밸브.
- **로컬 우선 저장** (`lib/learn-store.ts`, `lib/learn-sync.ts`) — 기기 간 덮어쓰기를 막는 가산적 병합. 큰 상태는 업로드 전에 축소합니다.
- **안전한 렌더링** — 텍스트 이스케이프와 안전한 링크를 적용한 무의존성 Markdown.

```
app/
  learn/page.tsx          학습 허브 + 탭 딥링크
  api/read/route.ts       URL 리더 (SSRF 방어)
  api/learn-state/route.ts 멤버 동기화 엔드포인트
components/learn/         TutorPanel + ReadBox, PronounceBox, CareerBox, IeltsBox, ShadowBox…
lib/
  learn-curriculum.ts     유닛과 오늘의 경로
  learn-bank.ts           배치고사, 레슨, 시험 아레나
  learn-store.ts          XP, 스트릭, SRS 스케줄링, 병합
  learn-reader.ts         본문 추출, 레벨 추정, 단어 매칭
  learn-pronounce.ts      최소대립쌍 + 음성 채점
  learn-career.ts         직무 트랙 + 면접 프롬프트
  learn-ielts.ts          Task 2 프롬프트 + 밴드 휴리스틱
  learn-proof.ts          증명 데이터 + Markdown 내보내기
  learn-errors.ts         오류 레이더 + 드릴
  trial.ts                서버 체험 예산
scripts/build-bulk.mts    단어·관용구 풀 재생성
```

</details>

<details>
<summary><strong>문제 해결</strong></summary>

- **휴대폰에서 AI가 안 됨** — 정상입니다. Chrome Prompt API는 데스크톱 전용입니다. 클라우드 모드나 체험 모드를 쓰세요.
- **휴대폰에서 폴더 선택 실패** — 정상입니다. 대신 클립으로 파일을 첨부하세요.
- **Ollama 연결 거부** — Ollama를 실행하고 `OLLAMA_ORIGINS="*"` 설정 후 재시작하세요. 데스크톱 전용입니다.
- **검색이 "설정되지 않음"** — `.env.local`에 `SERPAPI_KEY`를 추가하고 재시작하세요.
- **리더가 URL을 거부함** — 사설·내부 호스트와 너무 큰 페이지는 의도적으로 차단합니다.
- **발음 채점이 안 됨** — Web Speech API 지원은 브라우저마다 다릅니다(Chrome/Edge 권장). 녹음과 재생은 계속 사용할 수 있습니다.
- **개발 중 하이드레이션 불일치** — 서버를 멈추고 `.next/`를 삭제한 뒤 재시작하세요.
- **세션**은 브라우저, 워크스페이스 폴더, Supabase에 저장됩니다. 서버 세션 저장소는 없습니다.

</details>

## 로드맵

- 공개 무료 도구: IELTS 라이팅 추정기, 직무별 면접 질문 페이지(SEO 유입).
- 증명서와 스코어카드용 미리보기 이미지가 있는 공유 페이지.
- 결제와 유료 티어 — 활성화와 리텐션이 검증될 때까지 의도적으로 보류.

피드백과 버그 제보: [이슈 열기](https://github.com/sam79083/canary_gemma/issues).
