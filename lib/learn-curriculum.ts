// CEFR curriculum spine — an ordered path through each level, so daily
// practice stops being a random slice and becomes "Unit 3 of 5".
//
// Zero new state: the unit is DERIVED from the monotonic lessons counter
// (one unit per ~3 finished sessions), so it works offline, syncs for free,
// and never desyncs. The unit's skill emphasis is fed into buildDailyLesson
// as a preferSkill hint — a nudge, never a filter.
//
// Self-contained (type-only cross-imports) so plain `node --test` covers it.

import type { CEFR, Skill } from "./learn-bank";

export interface Unit {
  id: string;
  level: CEFR;
  /** 1-based position within the level. */
  n: number;
  title: string;
  /** Korean gloss (this course is built for Korean learners). */
  ko: string;
  /** One-line teaching focus. */
  focus: string;
  /** Skill the daily mix leans toward while this unit is active. */
  skill: Skill;
  /** Can-do statement: what finishing the unit means. */
  canDo: string;
}

export const UNITS: Unit[] = [
  // A1
  { id: "a1-1", level: "A1", n: 1, title: "Hello, world", ko: "인사와 자기소개", focus: "be동사 + 이름/나이/사는 곳", skill: "vocab", canDo: "I can greet someone and introduce myself." },
  { id: "a1-2", level: "A1", n: 2, title: "Numbers & orders", ko: "숫자와 주문", focus: "a/an, 복수형, 가격 묻기", skill: "grammar", canDo: "I can order and ask how much it costs." },
  { id: "a1-3", level: "A1", n: 3, title: "My day", ko: "하루 일과", focus: "현재시제 루틴 문장", skill: "grammar", canDo: "I can describe my daily routine." },
  { id: "a1-4", level: "A1", n: 4, title: "Here & now", ko: "위치와 존재", focus: "this/that, there is/are, 장소 전치사", skill: "grammar", canDo: "I can say where things are." },
  { id: "a1-5", level: "A1", n: 5, title: "Everyday things", ko: "생활 단어", focus: "집·음식·색깔 핵심 단어", skill: "vocab", canDo: "I can name everyday objects and foods." },
  // A2
  { id: "a2-1", level: "A2", n: 1, title: "Yesterday", ko: "과거 이야기", focus: "과거시제 규칙/불규칙 동사", skill: "grammar", canDo: "I can talk about what I did yesterday." },
  { id: "a2-2", level: "A2", n: 2, title: "Plans & promises", ko: "계획과 약속", focus: "be going to / will", skill: "grammar", canDo: "I can make plans and promises." },
  { id: "a2-3", level: "A2", n: 3, title: "Getting around", ko: "길 찾기", focus: "여행 단어 + 길 안내 표현", skill: "vocab", canDo: "I can ask for and follow directions." },
  { id: "a2-4", level: "A2", n: 4, title: "Bigger, better", ko: "비교하기", focus: "비교급·최상급", skill: "grammar", canDo: "I can compare two things or people." },
  { id: "a2-5", level: "A2", n: 5, title: "Feelings & opinions", ko: "감정과 의견", focus: "감정 형용사 + because로 이유 말하기", skill: "vocab", canDo: "I can say how I feel and why." },
  // B1
  { id: "b1-1", level: "B1", n: 1, title: "Past vs perfect", ko: "경험 말하기", focus: "현재완료 + ever/never", skill: "grammar", canDo: "I can talk about life experiences." },
  { id: "b1-2", level: "B1", n: 2, title: "If & when", ko: "조건과 미래", focus: "1차 조건문, 시간 접속사", skill: "grammar", canDo: "I can talk about real future conditions." },
  { id: "b1-3", level: "B1", n: 3, title: "Work & study", ko: "일과 공부", focus: "직업·교육 연어(collocation)", skill: "vocab", canDo: "I can describe my job or studies." },
  { id: "b1-4", level: "B1", n: 4, title: "Stories in the past", ko: "이야기 구성", focus: "과거진행 + 연결어 (while, when)", skill: "grammar", canDo: "I can tell a short story about the past." },
  { id: "b1-5", level: "B1", n: 5, title: "Say it politely", ko: "정중한 표현", focus: "could/would/should로 공손하게", skill: "grammar", canDo: "I can make polite requests and suggestions." },
  // B2
  { id: "b2-1", level: "B2", n: 1, title: "The perfect pair", ko: "시제 뉘앙스", focus: "현재완료 vs 과거시제 미묘한 차이", skill: "grammar", canDo: "I can choose the right tense for nuance." },
  { id: "b2-2", level: "B2", n: 2, title: "Hypotheticals", ko: "가정하기", focus: "2차 조건문 + wish", skill: "grammar", canDo: "I can discuss imaginary situations." },
  { id: "b2-3", level: "B2", n: 3, title: "Argue & persuade", ko: "주장하기", focus: "의견 연결어와 완곡 표현", skill: "writing", canDo: "I can argue a position in writing." },
  { id: "b2-4", level: "B2", n: 4, title: "News & society", ko: "시사 어휘", focus: "추상명사 연어 (raise concerns, face pressure)", skill: "vocab", canDo: "I can discuss news topics with precise nouns." },
  { id: "b2-5", level: "B2", n: 5, title: "Reported speech", ko: "전달하기", focus: "간접화법 문장·의문문", skill: "grammar", canDo: "I can report what someone said." },
  // C1
  { id: "c1-1", level: "C1", n: 1, title: "Inversion & emphasis", ko: "강조 도치", focus: "부정어 도치, it-cleft", skill: "grammar", canDo: "I can emphasise with inversion and clefts." },
  { id: "c1-2", level: "C1", n: 2, title: "Nuanced modals", ko: "과거 추측", focus: "must have / might have / needn't have", skill: "grammar", canDo: "I can speculate about the past." },
  { id: "c1-3", level: "C1", n: 3, title: "Academic tone", ko: "학술 문체", focus: "명사화와 헤징 (may suggest, tends to)", skill: "writing", canDo: "I can write in a measured academic tone." },
  { id: "c1-4", level: "C1", n: 4, title: "Idiomatic precision", ko: "관용 표현", focus: "문맥 속 idioms, register 주의", skill: "vocab", canDo: "I can use idioms naturally." },
  { id: "c1-5", level: "C1", n: 5, title: "Mixed conditionals", ko: "복합 가정", focus: "3차·혼합 조건문", skill: "grammar", canDo: "I can blend time frames in conditionals." },
  // C2
  { id: "c2-1", level: "C2", n: 1, title: "Register shifting", ko: "문체 전환", focus: "격식 ↔ 비격식 재작성", skill: "writing", canDo: "I can shift register to fit the reader." },
  { id: "c2-2", level: "C2", n: 2, title: "Irony & subtext", ko: "아이러니 읽기", focus: "어조, 반어, 절제된 표현", skill: "reading", canDo: "I can catch irony and understatement." },
  { id: "c2-3", level: "C2", n: 3, title: "Rare precision", ko: "정밀 어휘", focus: "저빈도 정확 어휘", skill: "vocab", canDo: "I can pick the single precise word." },
  { id: "c2-4", level: "C2", n: 4, title: "Argument architecture", ko: "논증 구조", focus: "양보와 반박 (concede, rebut)", skill: "writing", canDo: "I can concede and rebut elegantly." },
  { id: "c2-5", level: "C2", n: 5, title: "Native rhythm", ko: "원어민 리듬", focus: "고정 연어와 문장 리듬", skill: "vocab", canDo: "I can sound idiomatic without effort." },
];

export function unitsForLevel(level: CEFR | null): Unit[] {
  const lv: CEFR = level ?? "A1";
  return UNITS.filter((u) => u.level === lv);
}

/** Lessons a learner spends on one unit before the spine advances. */
export const LESSONS_PER_UNIT = 3;

/**
 * The unit the learner is "in" right now, derived from the monotonic lessons
 * counter so it can never desync from synced progress. Cycles after the last
 * unit (recycled at a harder mix via the daily generator, not the spine).
 */
export function currentUnit(
  lessons: number,
  level: CEFR | null,
): { unit: Unit; index: number; total: number } | null {
  const pool = unitsForLevel(level);
  if (pool.length === 0) return null;
  const done = Math.max(0, Math.floor(lessons));
  const index = Math.floor(done / LESSONS_PER_UNIT) % pool.length;
  return { unit: pool[index], index, total: pool.length };
}
