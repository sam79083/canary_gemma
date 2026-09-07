# Canary — Gemma 4 On-Device Chat (Next.js)

On-device chat UI powered by Chrome's built-in **Gemma 4 Prompt API** (`LanguageModel`),
with a file workspace, AI-assisted file editing, saved sessions, and optional
Google web search via SerpAPI. The Next.js server only handles files/sessions/search —
the chat model itself runs **in your browser**, not on the server.

## Requirements

| Need | Details |
|---|---|
| OS | Windows 10/11 (these instructions + `start.bat`) |
| Node.js | 20+ (check with `node --version`; you want the LTS from https://nodejs.org) |
| Browser | **Chrome 148+** or **Chrome Canary** with the built-in AI flags on (see below). Other browsers show "Not supported". |
| SerpAPI key | Optional. Only needed for web search (`/api/search`). App runs fine without it. Get one at https://serpapi.com |

## First-time setup (do once)

1. **Install Node.js LTS** from https://nodejs.org, then reopen your terminal.
   Verify: `node --version` and `npm --version`.
2. **Set up the API key (optional, for web search):**
   ```cmd
   copy .env.example .env.local
   ```
   Then edit `.env.local` and put your key after `SERPAPI_KEY=`.
   Without this, search returns "SERPAPI_KEY not configured" but everything else works.
3. **Install dependencies** (only needed once, `start.bat` does it for you if you skip):
   ```cmd
   npm install
   ```
4. **Enable the on-device model in Chrome** (once per Chrome profile):
   - Use Chrome 148+ or Chrome Canary.
   - Open `chrome://flags` and enable the Prompt API / on-device model flags
     (names vary by version, e.g. *Prompt API for Gemini Nano* and
     *Enables optimization guide on device*), then relaunch Chrome.
   - Keep an internet connection on first run — Chrome downloads the Gemma model
     (you'll see a "Downloading Gemma 4… %" overlay in the app).

## How to start (every day, from a cold boot)

### Option A — double-click (easiest)

1. Double-click **`start.bat`**.
   It automatically: checks Node, runs `npm install` if `node_modules/` is missing,
   copies `.env.example` → `.env.local` if needed, creates `sessions/` if missing,
   frees port 3000 if something old is on it, opens http://localhost:3000,
   and starts the dev server.
2. Wait for `✓ Ready` in the window, then use the browser tab that opened.
3. To stop: press `Ctrl+C` in that window, then close it.

For a production-mode run (built, faster, no hot-reload) instead:

```cmd
start.bat prod
```

This runs `npm run build` + `npm run start` instead of `npm run dev`.

### Option B — manual commands

```cmd
cd /d C:\Users\오광민\Desktop\canary
npm install        &:: only first time, or when package.json changes
npm run dev        &:: dev server with hot-reload at http://localhost:3000
```

Production equivalent:

```cmd
npm run build
npm run start      &:: serves the optimized build at http://localhost:3000
```

Then open http://localhost:3000 in Chrome 148+/Canary.

## How to use the app

- **Chat:** type in the prompt box. The green dot + "Ready — Gemma 4 on-device"
  status in the sidebar means the model is loaded. First load shows a download
  progress overlay — don't close the tab while it downloads/extracts.
- **New chat:** `+ New chat` button (destroys the model session, clears local history).
- **Restore:** on startup the app offers to restore the previous conversation from
  `localStorage`. Server-side copies live under `sessions/` (auto-saved after each reply).
- **Load session:** the `💬 Load session…` dropdown reads from `sessions/*.json`.
- **Files:** the sidebar file tree browses the **project folder itself**
  (blocked: `node_modules/`, `.next/`, `.git/`, `.env*`). Click a file to open the
  editor; the editor can ask Gemma to rewrite the file.
- **Web search:** needs `SERPAPI_KEY` in `.env.local`, otherwise it errors gracefully.
- **Theme:** 🌙/☀️ button toggles dark mode (saved in `localStorage`).

## Project layout

```
canary/
  start.bat          <- one-click starter (dev; `start.bat prod` = production)
  app/
    page.tsx         <- main UI (chat + sidebar + editor wiring)
    api/
      files/route.ts      GET list directory
      file/route.ts       GET/POST/DELETE single file
      mkdir/route.ts      POST create directory
      save/route.ts       POST save chat session
      sessions/route.ts   GET list sessions
      session/[filename]/route.ts  GET one session
      search/route.ts     GET SerpAPI proxy (needs SERPAPI_KEY)
      quota/route.ts      GET disk/quota info
  components/  Chat.tsx, FileEditor.tsx, FileTree.tsx
  hooks/useLanguageModel.ts  <- Chrome LanguageModel session handling
  lib/  api.ts, files.ts (workspace ROOT = project dir), types.ts
  sessions/  saved chats (git-ignored, auto-created)
  sam/  sample workspace files
  _legacy/  old Python server (server.py + start_server.*) — not used anymore
```

## Scripts & config

| Command | What it does |
|---|---|
| `npm run dev` | Dev server + hot reload, http://localhost:3000 |
| `npm run build` | Production build into `.next/` |
| `npm run start` | Serve the production build, http://localhost:3000 |
| `start.bat` | Automated `npm run dev` (+ setup checks + open browser) |
| `start.bat prod` | Automated `npm run build` + `npm run start` |

| Env var | File | Required? |
|---|---|---|
| `SERPAPI_KEY` | `.env.local` (copy from `.env.example`) | Only for `/api/search` |
| `PORT` | env / command line (`set PORT=3001 && npm run dev`) | No (default 3000) |

## Troubleshooting

- **`'node' is not recognized` / `'npm' is not recognized`** — Node isn't installed
  or the terminal was opened before install. Install LTS from nodejs.org, close and
  reopen the terminal, retry.
- **Port 3000 in use** — `start.bat` kills it automatically. Manually:
  `netstat -ano | findstr :3000` then `taskkill /F /PID <pid>`,
  or run on another port: `set PORT=3001 && npm run dev`.
- **"Not supported — use Chrome 148+ / Canary"** — you're not in a Prompt-API-capable
  Chrome, or the flags aren't enabled. Switch to Chrome 148+/Canary and enable the
  flags at `chrome://flags`, then reload.
- **Stuck on "Downloading Gemma 4…"** — first run downloads gigabytes; keep the tab
  open and the network on. Corporate network/GPO may block the on-device model.
- **Search: "SERPAPI_KEY not configured"** — create `.env.local` with your key and
  **restart** the server (env is read at startup).
- **"Backend returned HTML, not JSON"** — the dev server isn't running or you hit the
  wrong port. Start it and use exactly the URL it prints.
- **`npm install` fails** — delete `node_modules/` and `package-lock.json`, run
  `npm install` again; make sure Node is 20+.
- **Sessions not saving** — server auto-creates `sessions/`. If it can't write
  (permissions/AV lock), create the folder by hand and restart.

## Stopping & data

- Stop the server with `Ctrl+C` in its window.
- Chats persist in two places: browser `localStorage` (instant restore prompt) and
  `sessions/session_*.json` on disk (dropdown). `sessions/` is git-ignored.
