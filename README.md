# Canary — private AI chat with a file agent (Next.js)

[![ci](https://github.com/sam79083/canary_gemma/actions/workflows/ci/badge.svg)](https://github.com/sam79083/canary_gemma/actions/workflows/ci)

<!-- Replace the URL below with your Render URL from the dashboard (service "canary"). -->
**🌐 Live demo:** `https://YOUR-SERVICE.onrender.com` — opens straight into a working AI (trial mode, zero setup) — then try `?demo=cafe` for a pre-played English-roleplay tour, e.g. `https://YOUR-SERVICE.onrender.com?demo=cafe`

> **Hiring-manager tour (60 seconds):** open the demo link → scroll the Coco Cafe roleplay (correction → reply → one-tap answers → scorecard) → tap a 💬 chip to keep talking → hit **＋ New scene** to make your own. No keys, no downloads. (Note: Render's free tier sleeps when idle — first load after a while can take ~30s. Open the link a couple of minutes before showtime.)

<!-- TODO(record): 30s GIF of the ?demo=cafe scroll + tapping a 💬 chip. Spec: 1280px, fresh profile, trial mode. Place at docs/demo.gif and embed here. -->

## How it works (architecture in 30 seconds)

- **Three AI providers, one shape** (`hooks/useLanguageModel.ts`): on-device Gemma (Chrome Prompt API), local Ollama, cloud Gemini — interchangeable sessions, so chat/tools work unchanged. Fresh visitors without local AI auto-steer to trial cloud.
- **File agent without function calling** (`lib/agent.ts` + `components/Chat.tsx`): the model emits ` ```toolcall {"name":"writeFile",…} ` blocks, the app runs them in a ≤6-step loop. Every mutation stops at a human gate (`ReviewCard`: ✓ Keep / ↩ Undo, editable) backed by `lib/undo.ts` — nothing is written silently.
- **English roleplay engine** (`lib/learn-roleplay.ts`): 10 curated scenes + user-created ones (localStorage). One shared prompt template drives all scenes (identity-safe framing, 3 labeled reply layers); goals grade deterministically offline via keyword matching with negation guards; XP/streaks in `lib/learn-*.ts`. `?demo=<scene>` seeds a pre-played tour; clearing a scene offers a copyable scorecard.
- **Nearly stateless server** (`app/api/*/route.ts` are thin JSON/file proxies): keys, chats, and prefs live in the browser / workspace folder / Supabase Postgres.

Chat UI with a workspace file agent. Three interchangeable AI providers,
10 UI languages (Korean default), saved chats, and optional Google web
search via SerpAPI. Deployable to Render; files stay on your machine.

## What it does

- **Chat** with streaming replies and Markdown rendering (code blocks, lists).
- **File agent**: with a folder picked, ask in plain words — *"create notes/todo.txt with…"*,
  *"read X"*, *"update X"*, *"delete X"* — the AI lists/reads/writes/makes/deletes
  files itself, then shows a **review popup (Keep / Undo, editable)** before anything is saved.
- **Providers** (switch anytime, chat carries over):
  - ✨ **Gemma** — Chrome built-in on-device model (desktop Chrome only).
  - 🖥️ **Local (Ollama)** — any Ollama-compatible server (`http://localhost:11434`).
  - ☁️ **Cloud (API key)** — same Gemma 4 via Google's API; your free AI Studio key
    stays in your browser and goes straight to Google, never to our server.
- **Photo questions** (📎): Cloud and Ollama vision models can see attached photos.
- **File upload** (📎): text files go to the workspace; photos go to the model.
- **Voice input** (🎤): browser speech recognition in your language.
- **Languages**: Korean default (browser-detected first visit) + English, 日本語,
  简体中文, Español, Français, Deutsch, Português, Tiếng Việt, Bahasa Indonesia.
  The AI answers in the chosen language.
- **Past chats**: auto-saved (workspace `.canary/sessions/` or browser storage),
  auto-restored on open, rename/delete supported, one-click save-chat-as-file.
- **Web search** (🔍): works even with no AI (raw results); AI summary when a model is ready.
- **Privacy badge**: on-device work never leaves the computer; cloud mode says so explicitly.
- **Mobile**: responsive drawer layout; phones get search + cloud + upload (no folder
  picker or built-in AI exists on mobile browsers — Google's limitation, not ours).

## Requirements

| Need | Details |
|---|---|
| Node.js | 20+ (`node --version`) |
| Browser (full mode) | Desktop Chrome with built-in AI (Prompt API). Needs one click to start; flags on `chrome://flags` if the model is unavailable. |
| Browser (limited) | Anything else: web search, cloud provider, upload still work. |
| Ollama | Optional, for Local mode: https://ollama.com + `ollama pull qwen2.5:7b` + `OLLAMA_ORIGINS="*"` (restart Ollama after). |
| Google AI key | Optional, for Cloud mode: free at https://aistudio.google.com/apikey |
| SerpAPI key | Optional, for web search. https://serpapi.com |

## Run it

```cmd
npm install
copy .env.example .env.local   &:: put SERPAPI_KEY=... inside (search only)
npm run dev                    &:: http://localhost:3000
```

| Command | What it does |
|---|---|
| `npm run dev` | Dev server + hot reload |
| `npm run build` / `npm run start` | Production build / serve it |
| `npm test` | Regression tests (tool parser, SSE splits, markdown) |

Deploy: `render.yaml` builds with `npm install && npm run build`, starts with
`npm run start`. Set `SERPAPI_KEY` in the Render dashboard (it's `sync: false`).

## Project layout

```
app/
  page.tsx            <- main UI wiring (sidebar, chat, editor, modals)
  settings/page.tsx   <- settings (appearance, persona, models, account)
  api/
    files/route.ts    GET list directory (server fallback for old browsers)
    file/route.ts     GET/POST/DELETE single file
    mkdir/route.ts    POST create directory
    db-sessions/route.ts GET/POST/DELETE Supabase member sessions
    preferences/route.ts GET/PUT per-member AI instructions
    search/route.ts   GET SerpAPI proxy (needs SERPAPI_KEY)
    quota/route.ts    GET SerpAPI quota (graceful when unconfigured)
components/
  Chat.tsx            <- chat orchestration (send/search/plan/agent loop)
  chat/               <- MessageList, Composer, PlanCard, chat-text + hooks
                         (voice, clipboard, quota, focus, attachments, draw)
  FileEditor.tsx      <- full-screen editor + AI Edit
  FileTree.tsx        <- folder tree + context menu
  Onboarding.tsx      <- 3-step first-run guide
  UsageBlock.tsx      <- cloud token usage vs limits
  settings/           <- Appearance, Persona, Provider, Account sections
hooks/
  useLanguageModel.ts <- Gemma/Ollama/cloud sessions, one shared shape
  useLanguage.ts      <- UI language (localStorage, browser-detected)
  useTheme.ts         <- theme + body dataset (chat + settings share it)
  usePersonality.ts   <- reply-style persona (localStorage)
  useCustomInstructions.ts <- standing AI guidelines (local + Supabase sync)
  useWorkspace.ts     <- File System Access folder (local-only)
lib/
  agent.ts            <- tool definitions, prompt, toolcall parser
  cloud-model.ts      <- Gemini API adapter (streaming SSE, usage, vision)
  local-model.ts      <- Ollama adapter (streaming NDJSON, vision)
  i18n.ts             <- 10-language dictionary (ko default, en fallback)
  usage.ts            <- per-device token/request tracker
  markdown.ts         <- zero-dep chat markdown renderer
  capabilities.ts     <- folder-API diagnosis for the setup box
  sessions-*.ts       <- chat persistence (workspace files / localStorage)
test/app.test.mts     <- `npm test`
```

## Troubleshooting

- **No AI on phones** — expected: Chrome offers no Prompt API on Android/iOS.
  Use ☁️ Cloud mode with a free key instead.
- **Folder button fails on phones** — expected: no mobile browser has a folder
  picker. Attach files with 📎 instead.
- **Ollama: connection refused** — start Ollama; desktop only; set
  `OLLAMA_ORIGINS="*"` and restart it if the browser can't reach it.
- **"This API key doesn't work"** — re-copy from AI Studio; check the
  rate-limit dashboard if throttled (HTTP 429).
- **Search: "not configured"** — add `SERPAPI_KEY` to `.env.local` and restart;
  on Render, set it in the dashboard.
- **Hydration mismatch in dev** — `npm run build` and `npm run dev` share `.next/`;
  stop the server, delete `.next/`, restart.
- Sessions live in the browser, the workspace folder, or Supabase — no server session store.
