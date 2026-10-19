# Canary

[한국어](README.md) · **English**

**English that leaves proof — not just streaks.**

Canary is a free, private English learning workspace for people who need results: developers preparing for English interviews, IELTS writing candidates, and office workers who want to speak with confidence. Korean-first, no signup to start, no ads.

[![ci](https://github.com/sam79083/canary_gemma/actions/workflows/ci/badge.svg)](https://github.com/sam79083/canary_gemma/actions/workflows/ci)
[Deploy your own on Render](https://render.com/deploy?repo=https://github.com/sam79083/canary_gemma) · [Run locally in 2 minutes](#quick-start) · [See the proof sheet](#the-proof-sheet)

<!-- TODO: replace with your deployed URL, e.g. https://canary.onrender.com/learn -->
**Live demo:** deploy with the Render link above (free tier sleeps when idle) and open `/learn`. Add `GEMINI_KEY` in Render to enable chat/trial; the deterministic drills work without any keys.

> **60-second tour:** open `/learn` → take the 18-question placement → do one daily lesson → read a real article → record a minimal pair → save an IELTS essay → export your proof sheet.

## Why Canary

- **Output first.** You speak, write, read, and answer interview questions — not just tap multiple choice. Chat replies, shadowing, pronunciation drills, essays, and mock interviews all produce something you can keep.
- **Proof, not streaks.** Every serious session can become a portfolio piece. Export a one-page proof sheet with level, streak, accuracy, pronunciation, and writing samples — honest enough to show a tutor or interviewer.
- **Real work, not generic lessons.** Software, marketing, support, hospitality, and office tracks. A Code Dojo for backend developers learning React, TypeScript, and Next.js with a live preview.
- **Real input.** Paste an article or give a public URL. Canary extracts it, flags study words at your level, makes every word tappable, and turns saved words into review cards.
- **Private by default.** Chats, progress, and cards live in your browser. No account is required. Optional Supabase sync for members; cloud AI is only used when you choose it.
- **Korean-first.** Korean UI and explanations, Korean-speaker pronunciation pairs, Korean career phrases — with 10 UI languages available.

## What you get

| Goal | What you do |
|---|---|
| Find your level | 18-question placement with a confidence check |
| Follow a path | 6 CEFR levels, 5 units per level, 3 lessons per unit, daily lesson picks |
| Make it stick | SM-2 spaced repetition, leeches, self-rated review grades |
| Read real English | URL/paste reader, level estimate, tappable words, study list |
| Sound clearer | Minimal-pair drills with speech scoring, shadowing with playback, voice chat loop |
| Pass the test | Mock IELTS Task 2 with a 40-minute timer and private band estimate |
| Get the job | Career phrase packs, STAR interview questions, mock-interview handoff to chat |
| Fix habits | Persistent error radar (articles, agreement, punctuation, third person) plus drills |
| Prove progress | Portfolio, weekly league, proof sheet (.md), peer-review card |

The IELTS band and error checks are **practice aids**, not official scores — the UI says so, and the proof sheet repeats it.

## The proof sheet

A single Markdown file you can copy, download, or send to anyone. Example:

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

## Who it's for

- **Korean developers** — practice interview English, code reviews, and standups, then keep the proof. Code Dojo teaches React/TS/Next in English.
- **IELTS writing candidates** — write Task 2 under a 40-minute timer and get an instant band estimate plus fixes. Free, no signup.
- **Office workers and self-directed learners** — rehearse meetings, email, phone calls, and travel English through roleplay, then watch the data add up.

## Start in 3 steps

1. **Open `/learn`** and take the placement (or jump straight into a daily lesson).
2. **Produce something today** — one article, one essay, one pronunciation drill, or one mock interview answer.
3. **Keep the proof** — save it to the portfolio, then export the proof sheet and share it for human feedback.

## Quick start

```bash
npm install
cp .env.example .env.local   # optional: GEMINI_KEY, SerpAPI, Supabase
npm run dev                  # http://localhost:3000/learn
```

Core practice (placement, lessons, SRS, reader paste mode, pronunciation, career, IELTS, proof sheet) works without an AI key. Chat and voice replies use one of three providers:

- **Gemma** — Chrome's built-in on-device model (desktop Chrome only).
- **Local (Ollama)** — any Ollama-compatible server.
- **Cloud** — Gemini with your own free AI Studio key, or the built-in trial.

No account is needed. Progress is stored locally and can sync to Supabase for members.

## Tests and CI

```bash
npm test           # ~290 regression tests: learn logic, trial, reader, IELTS, proof, sync
npm run typecheck
npm run build
npm run test:e2e   # Playwright (optional)
```

CI runs on Node 22 to match the type-stripping test runner.

<details>
<summary><strong>Architecture and project layout</strong></summary>

- **Learning hub** (`components/learn/TutorPanel.tsx`, `app/learn/page.tsx`) — 15 practice tabs backed by pure libraries: curriculum, bank, store, SRS, reader, pronunciation, career, IELTS, proof, errors, listening, flashcards, portfolio.
- **Deterministic first** — placement, grading, band estimates, streaks, and proof sheets run offline with no model calls. AI is reserved for conversation and open-ended coaching.
- **Three AI providers** (`hooks/useLanguageModel.ts`) — Gemma/Ollama/Gemini share one session shape.
- **File agent** (`lib/agent.ts`) — tool-call blocks run in a gated loop; every write stops at Keep/Undo (`lib/undo.ts`).
- **Reader API** (`app/api/read/route.ts`) — public URLs only: DNS re-check, manual redirects (max 3), 900 KB cap, 9 s timeout, 30 requests/hour per IP.
- **Trial budgets** (`lib/trial.ts`) — trustworthy client IP extraction, per-kind counters, global hourly valve.
- **Local-first storage** (`lib/learn-store.ts`, `lib/learn-sync.ts`) — additive cloud merge so one device never erases another; oversized states slim before upload.
- **Hardened rendering** — zero-dependency Markdown with escaped text and safe links.

```
app/
  learn/page.tsx          learning hub + deep-linkable tabs
  api/read/route.ts       URL reader (SSRF-guarded)
  api/learn-state/route.ts member sync endpoint
components/learn/         TutorPanel + ReadBox, PronounceBox, CareerBox, IeltsBox, ShadowBox…
lib/
  learn-curriculum.ts     units and daily path
  learn-bank.ts           placement, lessons, exam arena
  learn-store.ts          XP, streaks, SRS scheduling, merge
  learn-reader.ts         extraction, level estimate, word matching
  learn-pronounce.ts      minimal pairs + speech scoring
  learn-career.ts         job tracks + interview prompts
  learn-ielts.ts          Task 2 prompts + band heuristic
  learn-proof.ts          proof evidence + Markdown export
  learn-errors.ts         error radar + drills
  trial.ts                server-side free-tier budgets
scripts/build-bulk.mts    regenerates word/idiom pools
```

</details>

<details>
<summary><strong>Troubleshooting</strong></summary>

- **No AI on phones** — expected: Chrome's Prompt API is desktop-only. Use Cloud mode or the trial.
- **Folder picker fails on phones** — expected; attach files with the paperclip instead.
- **Ollama connection refused** — start Ollama, set `OLLAMA_ORIGINS="*"`, restart; desktop only.
- **Search says "not configured"** — add `SERPAPI_KEY` to `.env.local` and restart.
- **Reader rejects a URL** — private/internal hosts and huge pages are blocked on purpose.
- **Pronunciation scoring unavailable** — Web Speech API support varies (best in Chrome/Edge). Recording and playback still work.
- **Hydration mismatch in dev** — stop the server, delete `.next/`, restart.
- **Sessions** live in the browser, workspace folder, or Supabase — there is no server-side session store.

</details>

## Roadmap

- Public free tools: IELTS writing estimator and role-based interview question pages (SEO entry points).
- Share pages with preview images for proof sheets and scorecards.
- Payments and paid tiers — intentionally deferred until activation and retention are proven.

Feedback and bug reports: [open an issue](https://github.com/sam79083/canary_gemma/issues).
