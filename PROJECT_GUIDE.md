# Canary Gemma — Project Guide (for Django / Spring developers)

> You know Django and Spring Boot. This guide maps everything in this
> project onto concepts you already have, then walks the code in reading
> order. No prior React/Next.js assumed.

**The app in one sentence:** a private AI chat app — the AI runs on the
user's own device (Chrome's built-in Gemma), on their PC (Ollama), or via
their own Gemini API key — and it can create/edit files on their computer.

---

## 1. Mental map: backend MVC → Next.js + React

| You know (Django / Spring) | Here (Next.js + React) | Note |
|---|---|---|
| `urls.py` / `@GetMapping` | **Files under `app/`** | Routing is by *file location*, not a route table (see §4) |
| View function returning HTML | **`page.tsx`** | A function that returns the page |
| `JsonResponse` / `@RestController` | **`app/api/*/route.ts`** | A function per HTTP method (`GET()`, `POST()`) |
| Template (`{% include %}`, `{{ var }}`) | **Component + JSX + props** | See §2 |
| `request.session` / `HttpSession` | **`localStorage`** (browser key-value store) + React state | Server here is nearly stateless |
| `settings.py` / `application.properties` | **`.env.local`** + `localStorage` keys (`canary-*`) | Secrets never committed (gitignored) |
| ORM model + migration | **`supabase/`** (hosted Postgres) + `lib/db-sessions.ts` | Only login/synced chats live here |
| `manage.py test` / JUnit | **`npm test`** (`test/*.test.mts`, plain `node --test`) | |
| `mypy` / compiler | **`npm run typecheck`** (`tsc --noEmit`) | TypeScript = Python with mandatory type hints |
| `pip install -r requirements.txt` | **`npm install`** (`package.json` = requirements + versions) | |
| `python manage.py runserver` | **`npm run dev`** | Hot-reloads on save |

**The single biggest shift:** in Django you render HTML *on the server per
request*. Here, most UI renders **in the browser** from JavaScript functions,
and the Next.js server mostly serves JSON APIs + static files. Think of the
React frontend as a rich client (like a desktop GUI) that calls your backend
for data.

`@/` in imports = "from the project root" (like absolute imports in Python,
e.g. `@/lib/i18n` ≡ `from lib.i18n import ...`).

---

## 2. The 5 React ideas (with Django analogies)

### 2a. Component ≈ template file that is also a function

```tsx
// components/settings/ProviderSection.tsx (simplified)
export default function ProviderSection() {
  const { t } = useLanguage();   // hook: shared logic (see 2d)
  return (
    <section className="settings-section">
      <h2>{t("seProviders")}</h2>   {/* {{ }} but with single braces */}
      <button onClick={() => ...}>...</button>
    </section>
  );
}
```

HTML-in-JS is called **JSX**. `{t("...")}` is exactly Django's `{{ ... }}` —
an expression slot. `onClick={...}` is like `onclick`, but takes a real
function instead of a string.

### 2b. Props ≈ template context for `{% include %}`

```tsx
<MessageList messages={messages} t={t} streaming={streaming} />
```

is Django's `{% include "msg_list.html" with messages=messages %}`. The
child declares what it needs:

```tsx
export default function MessageList({ messages, t, streaming }: {
  messages: ChatMessage[];   // ": Type" after a name = a type hint (always on)
  t: TFn;
  streaming: boolean;
}) { ... }
```

### 2c. State ≈ a variable that re-renders the page when it changes

```tsx
const [input, setInput] = useState("");  // getter + setter pair
```

Django has no equivalent (server re-renders per request anyway). Rule of
thumb: **if the user can see it change without a page reload, it's state.**
Typing in the chat box, opening a dialog, streaming AI text — all `useState`.
You never assign it directly (`input = "x"` does nothing visible); you call
`setInput("x")` and React re-runs your function with the new value.

### 2d. Hooks ≈ reusable "managers" (think custom middleware/services)

A hook is a function starting with `use` that packages state + logic so many
components can share it. This project puts one concern per file in `hooks/`:

| Hook | Django analogy |
|---|---|
| `useLanguage` (lang + `t()`) | `django.utils.translation.gettext` + session language |
| `useLanguageModel` (AI session, provider, status) | A service class owning one external connection |
| `useWorkspace` (chosen folder handle) | A mounted-media service |
| `useAuth` (Supabase login) | `request.user` provider |
| `useTheme`, `usePersonality`, `useCustomInstructions` | per-user preference loaders |

`useEffect(fn, [deps])` = "run `fn` when the component appears, and again
whenever `deps` change" (≈ `window.onload` + watchers; also where API calls
and timers live). Empty `[]` = run once on load.

### 2e. `"use client"` ≈ "this file runs in the browser"

Files **without** it render on the server (like a Django view). Files
**with** it run in the browser (they may touch `window`, `localStorage`,
microphone…). Rule: anything interactive has `"use client"` at the top.
Nearly every file here has it — this app is a browser-first client.

---

## 3. Folder tour

```text
app/                  Pages + backend APIs (file-based routing, §4)
  page.tsx            ← THE chat page (sidebar + <Chat/>). ~1900 lines; don't
                        read top-to-bottom, use §7 trace instead
  layout.tsx          <html> shell + title + CSS import (≈ base.html)
  globals.css         All styling + 5 themes via CSS variables (--bg, --text…)
  settings/page.tsx   Settings page (4 sections, §4)
  api/*/route.ts      Backend endpoints (each folder = one URL, §4)
components/           UI pieces (each = one template+logic unit)
  Chat.tsx            Chat area: messages + composer + send logic (~1260 lines)
  chat/MessageList.tsx  Message bubbles + right-click menu
  chat/Composer.tsx     Input box + send/stop/attach/voice buttons
  chat/CanvasPanel.tsx  (branch exp/canvas only) artifact side panel prototype
  FileTree.tsx / FileEditor.tsx / ReviewCard.tsx  Folder view, editor, Keep/Undo
  settings/*.tsx      One file per settings section (Appearance/Persona/…)
  CommandPalette.tsx  Ctrl+K quick switch
hooks/                Shared stateful logic, one concern per file (§2d)
lib/                  Plain logic (no UI) — the "services/utils" layer
  agent.ts            File-tool loop: parse ```toolcall JSON → run → repeat
  i18n.ts             All UI strings, 5 languages (ko/en/ja/zh/es)
  cloud-model.ts / local-model.ts  Gemini API + Ollama clients
  session-store.ts    Chat save/load over 3 backends (db/workspace/browser)
  usage.ts / trial.ts / trial-limits.ts   Token + free-trial accounting
  markdown.ts / sanitize.ts  Zero-dependency markdown renderer + XSS guard
  undo.ts / diff.ts / files.ts / streak.ts / achievements.ts / …
supabase/             Hosted Postgres: client.ts, server.ts, migrations/
scripts/i18n-tool.mts Build-time translator: `npm run i18n:check` / `i18n:fill`
test/*.test.mts       87 tests, plain Node (no framework to learn)
start.bat / render.yaml  Local prod run + Render deploy config
```

---

## 4. URL map (there is no `urls.py` — the folders ARE the routes)

| File | URL | Django equivalent |
|---|---|---|
| `app/page.tsx` | `/` | `views.chat` |
| `app/settings/page.tsx` | `/settings` | `views.settings` |
| `app/api/search/route.ts` | `POST /api/search` | web-search view |
| `app/api/gemini-chat/route.ts` | `POST /api/gemini-chat` | free-trial chat proxy (server key) |
| `app/api/hf-draw/route.ts` | `POST /api/hf-draw` | cloud image proxy |
| `app/api/db-sessions/route.ts` + `[id]/route.ts` | CRUD `/api/db-sessions` | DRF viewset for synced chats |
| `app/api/file/route.ts`, `mkdir`, `fetch-url`, `quota`, `storage`, `trial-status`, `downloads`, `download/[filename]`, `preferences` | various `/api/*` | small JSON/file views |

`[id]` in a folder name = a path parameter (like `<int:id>` in Django).

---

## 5. A message's journey (the "request lifecycle" — read this trace)

1. **Type + Enter** → `Composer` calls `handleSend` in `components/Chat.tsx`.
2. **Provider pick** → `hooks/useLanguageModel.ts` owns one session of three
   kinds (strategy pattern, like swapping DB backends):
   - `gemma` — Chrome's built-in on-device model (`LanguageModel.create()`)
   - `ollama` — local server at a URL (`lib/local-model.ts`)
   - `cloud` — your Gemini key, or the server key in trial mode
     (`lib/cloud-model.ts`, `app/api/gemini-chat`)
3. **Agent loop** (up to 6 steps, `lib/agent.ts`): the model may answer with
   a ` ```toolcall {"name":"writeFile", ...} ` block instead of words → Chat
   runs the file tool → feeds back `TOOL RESULT` → model continues. This is
   "function calling" hand-rolled in prompts, because the on-device model has
   no native tool API.
4. **Human gate** → every file change lands in `ReviewCard` (✓ Keep / ↩ Undo),
   backed by `lib/undo.ts` backups. Nothing is written silently.
5. **Persist** → `lib/session-store.ts` saves to Supabase (member) /
   workspace folder / browser `localStorage`, picked once per session.
6. **Extras in parallel** → web search (`/api/search`), drawing, voice input,
   achievements/streaks, token usage — all independent modules around the core.

---

## 6. Where data lives (the server is nearly stateless)

| Data | Where | Key / file |
|---|---|---|
| API keys, language, theme, provider | Browser `localStorage` | `canary-gemini-key`, `canary-lang`, … |
| Chats (guest) | Workspace folder or browser storage | via `session-store.ts` |
| Chats (member) | Supabase Postgres | `db-sessions` API |
| Uploads (no folder chosen) | Server `uploads/`, auto-pruned | `lib/uploads-prune.ts` |
| Secrets (Supabase, SerpAPI, HF) | `.env.local` (gitignored!) / Render env vars | never in code |

---

## 7. Cookbook (copy these patterns)

- **Change UI text:** edit `lib/i18n.ts` (`ko` + `en` by hand; other langs via
  `npm run i18n:fill`), use with `t("myKey")` / `t("x", { n })`.
- **Check translation gaps:** `npm run i18n:check`.
- **Add a settings toggle:** new `useState` + `localStorage` key, following
  `hooks/useTheme.ts` (smallest example).
- **Add a backend endpoint:** new folder `app/api/thing/route.ts` exporting
  `export async function POST(req: Request)`, return `Response.json(...)`.
- **Add an AI file tool:** extend `ToolName` + `parseToolCall` in `lib/agent.ts`,
  handle it where tools execute in `Chat.tsx`.
- **Verify everything:** `npm run typecheck` (types) → `npm test` (87 tests) →
  `npm run build` (production compile).

---

## 8. Glossary (one-liners)

- **JSX** — HTML written inside JS; `{x}` slots are Django `{{ }}`.
- **Props** — arguments passed to a component (template context).
- **State** — screen-visible variables; change via setter to re-render.
- **Hook** — shared stateful logic (`use*`); custom ones live in `hooks/`.
- **SSR/CSR** — render on server vs in browser; `"use client"` opts into browser.
- **`useEffect`** — side-effect runner (fetch on load, timers, subscriptions).
- **Tailwind-style classes** here are custom CSS (`globals.css`), not Tailwind.
- **`motion`** — animation library (`motion.div` = div that animates in).
