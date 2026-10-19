// Career tracks — practical English for the job you want, not generic textbook
// phrases. Five tracks, each with on-the-job phrases + interview questions and
// STAR-style answer skeletons. Zero-token data; drills happen in Chat.

import type { CEFR } from "./learn-bank";

export interface CareerPhrase {
  en: string;
  ko: string;
  /** When to use it, in English. */
  when: string;
  level: CEFR;
}

export interface InterviewQ {
  q: string;
  ko: string;
  /** STAR-ish bullet skeleton the learner fills in. */
  skeleton: string[];
  level: CEFR;
}

export interface CareerTrack {
  id: string;
  name: string;
  ko: string;
  icon: string;
  blurb: string;
  tip: string;
  phrases: CareerPhrase[];
  questions: InterviewQ[];
}

export const CAREER_TRACKS: CareerTrack[] = [
  {
    id: "software",
    name: "Software / IT",
    ko: "소프트웨어·IT",
    icon: "💻",
    blurb: "Stand-ups, code review, bugs, releases — say it clearly and kindly.",
    tip: "In engineering interviews, name the trade-off out loud. 'It's faster, but harder to maintain' sounds senior.",
    phrases: [
      {
        en: "I'll take a look and get back to you by end of day.",
        ko: "제가 확인하고 오늘 퇴근 전까지 알려드릴게요.",
        when: "Promising a fix or an answer",
        level: "A2",
      },
      {
        en: "Could you share the steps to reproduce the bug?",
        ko: "버그를 재현하는 단계를 공유해 주시겠어요?",
        when: "Bug triage",
        level: "A2",
      },
      {
        en: "It works on my machine — can you send the logs?",
        ko: "제 환경에서는 되는데요. 로그를 보내주실 수 있나요?",
        when: "Debugging together",
        level: "B1",
      },
      {
        en: "Let's align on scope before we estimate.",
        ko: "추정하기 전에 범위를 먼저 맞춰요.",
        when: "Sprint planning",
        level: "B1",
      },
      {
        en: "This is a blocker for the release.",
        ko: "이건 릴리스 차단 요인입니다.",
        when: "Raising priority",
        level: "B1",
      },
      {
        en: "I'll open a follow-up ticket so it doesn't get lost.",
        ko: "묻히지 않게 후속 티켓을 만들겠습니다.",
        when: "Parking an issue",
        level: "B1",
      },
    ],
    questions: [
      {
        q: "Walk me through a bug you fixed recently.",
        ko: "최근에 고친 버그를 설명해 주세요.",
        skeleton: [
          "Situation: what broke, who was affected",
          "Your role: what you owned",
          "Action: how you debugged it and which tools",
          "Result: fix + how you prevented a repeat",
        ],
        level: "B1",
      },
      {
        q: "How do you handle disagreements in code review?",
        ko: "코드 리뷰에서 의견이 다를 때 어떻게 하나요?",
        skeleton: [
          "Assume good intent; restate the other view",
          "Separate facts (perf, readability) from taste",
          "Propose a small experiment or a third option",
          "Disagree and commit if needed",
        ],
        level: "B2",
      },
      {
        q: "Tell me about a time you shipped under a tight deadline.",
        ko: "촉박한 마감에 출시한 경험을 말해 주세요.",
        skeleton: [
          "The deadline and why it mattered",
          "What you cut and what you protected",
          "How you communicated risk",
          "What you would do differently",
        ],
        level: "B1",
      },
      {
        q: "How do you prioritize when everything feels urgent?",
        ko: "모든 일이 급해 보일 때 우선순위를 어떻게 정하나요?",
        skeleton: [
          "Impact × effort, not volume",
          "What breaks if this slips?",
          "Make the trade-off explicit to stakeholders",
          "Review the queue weekly",
        ],
        level: "B2",
      },
      {
        q: "Why do you want to work here?",
        ko: "왜 우리 회사에서 일하고 싶나요?",
        skeleton: [
          "One specific thing about the product or team",
          "A skill of yours that fits it",
          "What you want to learn next",
          "Keep it under 45 seconds",
        ],
        level: "A2",
      },
    ],
  },
  {
    id: "marketing",
    name: "Marketing / Content",
    ko: "마케팅·콘텐츠",
    icon: "📣",
    blurb: "Briefs, campaigns, metrics and brand voice — pitch it like a marketer.",
    tip: "Always attach a number to a result: 'lift', 'conversion', 'sign-ups'. Vague praise sounds junior.",
    phrases: [
      {
        en: "Who exactly is the target audience?",
        ko: "타깃 오디언스가 정확히 누구인가요?",
        when: "Kicking off a campaign brief",
        level: "A2",
      },
      {
        en: "The campaign drove a 12% lift in sign-ups.",
        ko: "캠페인으로 가입이 12% 늘었습니다.",
        when: "Reporting results",
        level: "B1",
      },
      {
        en: "Let's run an A/B test on the subject line.",
        ko: "제목 문구로 A/B 테스트를 돌려 봐요.",
        when: "Email optimization",
        level: "B1",
      },
      {
        en: "The copy needs to match our brand voice.",
        ko: "카피가 브랜드 톤과 맞아야 해요.",
        when: "Reviewing content",
        level: "B1",
      },
      {
        en: "We should double down on what's already working.",
        ko: "효과가 나는 채널에 더 집중하죠.",
        when: "Budget or channel talk",
        level: "B2",
      },
      {
        en: "What's the north-star metric for this launch?",
        ko: "이번 출시의 핵심 지표는 무엇인가요?",
        when: "Goal setting",
        level: "B2",
      },
    ],
    questions: [
      {
        q: "Tell me about a campaign you're proud of.",
        ko: "자랑스러운 캠페인을 말해 주세요.",
        skeleton: [
          "Goal and audience in one line",
          "The idea and why it fit",
          "What you executed yourself",
          "The measured result (number + timeframe)",
        ],
        level: "B1",
      },
      {
        q: "How do you decide which channels to invest in?",
        ko: "어떤 채널에 투자할지 어떻게 정하나요?",
        skeleton: [
          "Start from the audience, not the channel",
          "Compare cost per result, not just reach",
          "Test small, then scale what wins",
          "Kill channels without a clear lift",
        ],
        level: "B2",
      },
      {
        q: "Describe a time a campaign underperformed. What did you do?",
        ko: "성과가 나빴던 캠페인 경험과 대처를 말해 주세요.",
        skeleton: [
          "The target vs. the actual result",
          "What you diagnosed (copy, audience, timing)",
          "The change you made mid-flight or after",
          "The lesson you now apply",
        ],
        level: "B2",
      },
      {
        q: "How do you write for an audience you don't belong to?",
        ko: "내가 속하지 않은 오디언스를 위해 어떻게 쓰나요?",
        skeleton: [
          "Interview 3–5 real customers",
          "Steal their words, not your assumptions",
          "Check tone with a native speaker in that group",
          "Test one message before scaling",
        ],
        level: "B2",
      },
      {
        q: "Pitch me an idea in 60 seconds.",
        ko: "아이디어를 60초 안에 피치해 보세요.",
        skeleton: [
          "One-sentence idea",
          "Who it helps and why now",
          "The channel and the ask",
          "How you'll measure success",
        ],
        level: "B2",
      },
    ],
  },
  {
    id: "support",
    name: "Customer Support",
    ko: "고객 지원",
    icon: "🎧",
    blurb: "Calm, clear, and kind — turn frustrated tickets into five-star reviews.",
    tip: "Acknowledge the feeling before the fix: 'I understand why that's frustrating.' Then give the next step.",
    phrases: [
      {
        en: "Thanks for your patience — I'm looking into it now.",
        ko: "기다려 주셔서 감사합니다. 지금 확인 중입니다.",
        when: "Acknowledging a ticket",
        level: "A2",
      },
      {
        en: "Could you send me a screenshot of the error?",
        ko: "오류 스크린샷을 보내주시겠어요?",
        when: "Troubleshooting",
        level: "A2",
      },
      {
        en: "I'll escalate this to our engineering team.",
        ko: "이 문제를 엔지니어링 팀으로 에스컬레이션하겠습니다.",
        when: "A complex issue",
        level: "B1",
      },
      {
        en: "I've issued a refund — it should appear in 3–5 business days.",
        ko: "환불 처리했습니다. 영업일 기준 3–5일 안에 표시됩니다.",
        when: "Resolving billing",
        level: "B1",
      },
      {
        en: "Let me walk you through the steps.",
        ko: "단계별로 안내해 드릴게요.",
        when: "Guiding a user",
        level: "A2",
      },
      {
        en: "I'll follow up tomorrow to make sure it's resolved.",
        ko: "해결됐는지 내일 다시 연락드리겠습니다.",
        when: "Closing the loop",
        level: "B1",
      },
    ],
    questions: [
      {
        q: "Tell me about a difficult customer you handled.",
        ko: "까다로운 고객을 응대한 경험을 말해 주세요.",
        skeleton: [
          "The customer's goal and emotion",
          "What you said first (acknowledge)",
          "The concrete action you took",
          "The outcome and what you changed",
        ],
        level: "B2",
      },
      {
        q: "How do you stay calm when a customer is angry?",
        ko: "화난 고객 앞에서 어떻게 침착함을 유지하나요?",
        skeleton: [
          "Don't take it personally",
          "Lower your pace and volume",
          "Repeat the problem back to them",
          "Move to one clear next step",
        ],
        level: "B1",
      },
      {
        q: "What do you do when you don't know the answer?",
        ko: "답을 모를 때 어떻게 하나요?",
        skeleton: [
          "Say what you do know",
          "Give a realistic time to find out",
          "Ask the right internal expert",
          "Close the loop with the customer",
        ],
        level: "A2",
      },
      {
        q: "How do you prioritize a full ticket queue?",
        ko: "티켓이 밀렸을 때 우선순위를 어떻게 정하나요?",
        skeleton: [
          "Revenue or safety impact first",
          "One ticket per customer until resolved",
          "Batch the quick wins",
          "Flag systemic issues, not just replies",
        ],
        level: "B1",
      },
      {
        q: "Describe a time you turned a complaint into a good experience.",
        ko: "불만을 좋은 경험으로 바꾼 적을 말해 주세요.",
        skeleton: [
          "The complaint, in the customer's words",
          "What you fixed and how fast",
          "The small extra you added",
          "What they said afterwards",
        ],
        level: "B2",
      },
    ],
  },
  {
    id: "hospitality",
    name: "Hospitality / Service",
    ko: "호텔·서비스",
    icon: "🛎️",
    blurb: "Check-ins, tables, requests and apologies — warm and precise.",
    tip: "Use 'I can' more than 'I can't'. Offer the alternative before the refusal.",
    phrases: [
      {
        en: "Do you have a reservation under that name?",
        ko: "그 이름으로 예약되어 있나요?",
        when: "Check-in",
        level: "A2",
      },
      {
        en: "May I see your ID and a credit card, please?",
        ko: "신분증과 신용카드를 확인해 주시겠어요?",
        when: "Check-in",
        level: "A2",
      },
      {
        en: "We have a table available at 7 or 7:30.",
        ko: "7시나 7시 30분에 자리가 있습니다.",
        when: "Seating a guest",
        level: "A2",
      },
      {
        en: "Are there any dietary restrictions I should know about?",
        ko: "알레르기나 식이 제한이 있으신가요?",
        when: "Taking an order",
        level: "B1",
      },
      {
        en: "I'm sorry for the wait — your room is being prepared.",
        ko: "기다리게 해서 죄송합니다. 객실을 준비하고 있습니다.",
        when: "Apologizing",
        level: "B1",
      },
      {
        en: "Is there anything else I can help you with?",
        ko: "더 도와드릴 일이 있을까요?",
        when: "Closing service",
        level: "A2",
      },
    ],
    questions: [
      {
        q: "Tell me about a time you went above and beyond for a guest.",
        ko: "고객을 위해 특별히 노력한 경험을 말해 주세요.",
        skeleton: [
          "The guest's need (and why it was hard)",
          "What you did without being asked",
          "The result for the guest",
          "What the team learned",
        ],
        level: "B2",
      },
      {
        q: "How do you handle a double-booking?",
        ko: "이중 예약이 발생하면 어떻게 하나요?",
        skeleton: [
          "Own the mistake quickly",
          "Offer two concrete options",
          "Cover the cost or the upgrade",
          "Follow up so it doesn't repeat",
        ],
        level: "B1",
      },
      {
        q: "A guest is upset about a noisy room. What do you say?",
        ko: "시끄러운 방에 화난 고객에게 뭐라고 하나요?",
        skeleton: [
          "Acknowledge: 'I understand — that's not the stay you paid for.'",
          "Offer: move rooms or a quieter floor",
          "Act now: send someone to check",
          "Follow up at checkout",
        ],
        level: "B1",
      },
      {
        q: "How do you remember regulars' preferences?",
        ko: "단골의 취향을 어떻게 기억하나요?",
        skeleton: [
          "Use the booking notes consistently",
          "Repeat the detail back at check-in",
          "Brief the team before the shift",
          "Small surprises beat big gestures",
        ],
        level: "B1",
      },
      {
        q: "Why do you want to work in hospitality?",
        ko: "왜 호텔·서비스 업에서 일하고 싶나요?",
        skeleton: [
          "One real moment that made you like it",
          "A strength you use daily",
          "A skill you want to grow here",
          "Keep it warm, not rehearsed",
        ],
        level: "A2",
      },
    ],
  },
  {
    id: "office",
    name: "Office / Business",
    ko: "사무·비즈니스",
    icon: "🏢",
    blurb: "Meetings, deadlines, stakeholders — sound reliable in any team.",
    tip: "Say the deadline, the owner, and the risk in one breath. That's what 'professional' sounds like.",
    phrases: [
      {
        en: "Can we circle back to this after lunch?",
        ko: "점심 후에 이 얘기를 다시 할 수 있을까요?",
        when: "Parking a topic",
        level: "B1",
      },
      {
        en: "I'll take ownership of that action item.",
        ko: "그 액션 아이템은 제가 맡겠습니다.",
        when: "Ending a meeting",
        level: "B1",
      },
      {
        en: "Just to make sure I understand — you mean…?",
        ko: "확인차 말씀드리면, …라는 뜻인가요?",
        when: "Clarifying",
        level: "A2",
      },
      {
        en: "What's the deadline, and who signs off?",
        ko: "마감과 최종 승인권자는 누구인가요?",
        when: "Scoping work",
        level: "B1",
      },
      {
        en: "I don't have the bandwidth for that this week.",
        ko: "이번 주에는 그 일을 할 여력이 없습니다.",
        when: "Saying no politely",
        level: "B1",
      },
      {
        en: "Let's keep this between us for now.",
        ko: "일단 이 이야기는 우리끼리만 알고 있죠.",
        when: "Confidentiality",
        level: "B1",
      },
    ],
    questions: [
      {
        q: "Tell me about yourself in 60 seconds.",
        ko: "60초 안에 자기소개를 해 보세요.",
        skeleton: [
          "Who you are + one headline strength",
          "One proof point (project or number)",
          "Why this role, why now",
          "End with what you want to learn",
        ],
        level: "A2",
      },
      {
        q: "Describe a time you missed a deadline. What happened?",
        ko: "마감을 놓친 경험과 이후 어떻게 했는지 말해 주세요.",
        skeleton: [
          "The deadline and the honest reason",
          "When and how you flagged it",
          "The recovery plan you led",
          "The system you built to prevent it",
        ],
        level: "B2",
      },
      {
        q: "How do you handle competing priorities?",
        ko: "경쟁하는 우선순위를 어떻게 처리하나요?",
        skeleton: [
          "List the real constraint (time, people)",
          "Ask the owner to rank, in writing",
          "Protect one 'must' and park the rest",
          "Check the ranking weekly",
        ],
        level: "B1",
      },
      {
        q: "Tell me about a time you disagreed with your manager.",
        ko: "상사와 의견이 달랐던 경험을 말해 주세요.",
        skeleton: [
          "The decision and your concern",
          "How you raised it privately",
          "What evidence you brought",
          "How you supported the final call",
        ],
        level: "B2",
      },
      {
        q: "Where do you see yourself in three years?",
        ko: "3년 뒤 어떤 모습이길 바라나요?",
        skeleton: [
          "A skill you want to master",
          "A scope you want to own",
          "How this company fits that path",
          "Avoid naming someone else's job",
        ],
        level: "B1",
      },
    ],
  },
];

export function careerById(id: string | null | undefined): CareerTrack | null {
  return CAREER_TRACKS.find((t) => t.id === id) ?? null;
}

function levelRank(level: CEFR | null | undefined): number {
  const order: CEFR[] = ["A1", "A2", "B1", "B2", "C1", "C2"];
  const i = order.indexOf(level ?? "A1");
  return i < 0 ? 0 : i;
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Level-appropriate interview questions, deterministically dealt per seed. */
export function pickCareerQuestions(
  track: CareerTrack,
  level: CEFR | null,
  seed: string | number,
  n = 3,
): InterviewQ[] {
  if (n <= 0 || track.questions.length === 0) return [];
  const max = levelRank(level) + 1;
  const pool = track.questions.filter((q) => levelRank(q.level) <= max);
  const source = pool.length > 0 ? pool : track.questions;
  const take = Math.min(n, source.length);
  const start = hash(`${seed}|${track.id}`) % source.length;
  return Array.from({ length: take }, (_, i) => source[(start + i) % source.length]);
}

/** Chat handoff: the model runs the mock interview, not a new persona. */
export function buildCareerChatPrompt(track: CareerTrack, question: InterviewQ): string {
  return [
    `Let's practice a job interview for a ${track.name} (${track.ko}) role.`,
    `Ask me this question first: "${question.q}"`,
    "Wait for my answer, then give one concrete improvement and a stronger version of my answer.",
    "Keep it in English with short Korean hints, and ask only one question at a time.",
  ].join(" ");
}
