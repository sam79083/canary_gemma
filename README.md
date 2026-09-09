# Canary — private AI chat with a file agent (Next.js)

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
  api/
    files/route.ts    GET list directory (server fallback for old browsers)
    file/route.ts     GET/POST/DELETE single file
    mkdir/route.ts    POST create directory
    save|…sessions…   legacy server sessions (browser/workspace now default)
    search/route.ts   GET SerpAPI proxy (needs SERPAPI_KEY)
    quota/route.ts    GET SerpAPI quota (graceful when unconfigured)
components/
  Chat.tsx            <- chat + file-agent loop + upload + voice + share
  FileEditor.tsx      <- full-screen editor + AI Edit
  FileTree.tsx        <- folder tree + context menu
  Onboarding.tsx      <- 3-step first-run guide
  UsageBlock.tsx      <- cloud token usage vs limits
hooks/
  useLanguageModel.ts <- Gemma/Ollama/cloud sessions, one shared shape
  useLanguage.ts      <- UI language (localStorage, browser-detected)
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
- **`_legacy/`** — old Python server, unused.
