# Tutorial: React + Next.js using YOUR project (start here, not PROJECT_GUIDE.md)

> That other file is a reference. **This** is the classroom. We will open
> small real files, read them line by line, and change things to see what
> happens. Each lesson takes ~10 minutes. Do them in order.

Setup for every lesson: run `npm run dev`, open http://localhost:3000.
Leave it running — when you save a file, the browser updates by itself
(this is called **hot reload**; Django has it too with `runserver`).

---

## Lesson 0 — What am I looking at?

Open the app in the browser. It has two pages:

- `/` — the chat (file `app/page.tsx`)
- `/settings` — the settings (file `app/settings/page.tsx`)

**The rule of Next.js routing:** the file's *location* is the URL. There is
no `urls.py`. `app/settings/page.tsx` automatically becomes `/settings`.
A folder named `[id]` (like `app/api/db-sessions/[id]/`) is a URL parameter,
like `<int:id>` in Django.

✅ **Try:** open `app/settings/page.tsx` (24 lines, read it all). You can see
the whole page: a back button, a title, and 4 sections. That's all a page is.

---

## Lesson 1 — A component is a function that returns HTML

Open `components/settings/AppearanceSection.tsx` (61 lines). Read it slowly:

- **Line 17:** `export default function AppearanceSection() {` — a plain
  function. A "component" is just this: a function returning screen content.
- **Lines 21–59 (`return (...)`)**: the HTML it draws. This mix of HTML
  inside JS is called **JSX**. Two new things vs HTML:
  - `{t("seAppearance")}` — curly braces = "run JS here" (like `{{ }}` in
    Django templates). `t(...)` looks up the translated text.
  - `className=` instead of `class=` (because `class` is a reserved word in
    JS). Same styling, different spelling.
- **Lines 18–19:** `const { lang, setLang, t } = useLanguage();` — this grabs
  shared tools (language + translator). Details in Lesson 3. For now: it gives
  us the letter `t` we use to print text.
- **Lines 26–40:** a dropdown. `value={theme}` = "show the current theme".
  `onChange={...}` = "when the user picks something, run this function".

✅ **Try:** on line 23, after `{t("seAppearance")}`, type ` + hello` inside
the `<h2>`, save, and look at `/settings` in the browser. Your text appears
instantly. **Undo it** after (Ctrl+Z, save). You just edited React.

---

## Lesson 2 — Clicking changes the screen (state)

Stay in `AppearanceSection.tsx`. When you pick "Dark" in the dropdown,
`setTheme(...)` runs (line 31). Where does it come from? Open
`hooks/useTheme.ts` (34 lines — read it all):

- **Line 8:** `const [theme, setThemeState] = useState<Theme>("light");`
  This is **state**: a variable the screen watches. It starts as `"light"`.
  You get two things: the current value (`theme`) and the only way to change
  it (`setThemeState`). **Calling the setter redraws the screen.** In Django
  terms: imagine if assigning a variable automatically re-rendered the
  template. That is all state is.
- **Lines 24–31 (`setTheme`):** changes the variable AND saves it to
  `localStorage` (a tiny key-value store inside the browser — like
  `request.session`, but it lives on the user's computer, not your server).
- Back in `AppearanceSection`, `value={theme}` (line 28) shows it, and picking
  an option calls `setTheme` → screen redraws → dropdown shows the new value.
  That loop — **show value, change on click, redraw** — is 90% of all React.

✅ **Try:** add `console.log("theme picked:", v);` inside the `onChange` on
line 29–32, save, pick a theme, and look at the browser console (F12 →
Console tab). You will see your message. **Undo it** after.

---

## Lesson 3 — Memory: `useEffect` and loading saved settings

Still in `hooks/useTheme.ts`:

- **Lines 10–17:** `useEffect(() => { ... }, [])`. Read it as:
  *"When this first appears on screen, run this code once."*
  It reads the saved theme from `localStorage` and applies it. Without this,
  every reload would reset to light mode. The empty `[]` means "only once".
- **Lines 19–22:** another `useEffect`, but ending with `[theme]`. Read it as:
  *"Run this every time `theme` changes."* It stamps the theme onto
  `<body data-theme="dark">`, and the CSS file recolors the whole app from
  that stamp (see `--bg`, `--text` variables in `app/globals.css`).

So the full story of the theme dropdown: **load once → show → user picks →
save + stamp → CSS recolors.** Every settings control in this project follows
this exact shape. Open `hooks/useLanguage.ts` (41 lines) and notice it is the
same story with different words.

---

## Lesson 4 — The backend is just functions returning JSON

Open `app/api/trial-status/route.ts` (9 lines, read it all):

```ts
export async function GET(req: Request) {
  const left = await trialPeek(req, (await getMember()) !== null);
  return NextResponse.json(left);
}
```

That is a Django view: `def get(request): ... return JsonResponse(...)`.
`GET`/`POST` are just exported function names. The frontend calls it with
`fetch("/api/trial-status")` — same as any AJAX call to a Django endpoint.

✅ **Try:** create file `app/api/hello/route.ts` with this inside:

```ts
import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({ message: "hello from my first endpoint" });
}
```

Save, then visit http://localhost:3000/api/hello in the browser. You built a
backend endpoint. **Delete the file** after (it was practice).

---

## Lesson 5 — Follow one chat message (the big picture)

Now the main flow. You don't need to read the big files fully — just visit
these checkpoints in order:

1. `components/chat/Composer.tsx` — the input box. Enter calls `handleSend`.
2. `components/Chat.tsx` → search `handleSend` — it adds your message to the
   `messages` list (state! the screen redraws showing your bubble), then asks
   the AI via `hooks/useLanguageModel.ts`.
3. `hooks/useLanguageModel.ts` — one connection, three flavors: `gemma`
   (Chrome's built-in AI, on-device), `ollama` (your PC), `cloud` (Gemini key).
   Like swapping database backends with one interface.
4. If the AI wants a file job, it writes a ` ```toolcall {"name":"writeFile"…}`
   block → `lib/agent.ts` parses it → the app runs it → the result goes back
   to the AI (up to 6 rounds). This is "function calling" built out of text,
   because the on-device model has no native tool API.
5. Every file change stops at `components/ReviewCard.tsx` (✓ Keep / ↩ Undo).
   Nothing is written silently — this is the app's most important screen.
6. `lib/session-store.ts` saves the chat (member → Supabase database; guest →
   folder or browser storage).

✅ **Try:** in `Chat.tsx`, find `pushMessage` and add one `console.log` before
it runs. Send a chat, watch the console. You are watching step 2 happen.

---

## Lesson 6 — What to learn next (in this order)

1. `components/chat/MessageList.tsx` — how answers render (markdown → HTML).
2. `lib/i18n.ts` + `npm run i18n:check` — every UI string, 5 languages.
3. `lib/cloud-model.ts` + `lib/local-model.ts` — the two API clients.
4. `lib/undo.ts` — how Keep/Undo never loses data.
5. `components/FileEditor.tsx` — the biggest component; save for last.

Commands you need: `npm run dev` (run), `npm run typecheck` (type errors),
`npm test` (87 tests), `npm run build` (production check before deploy).
