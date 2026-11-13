// Code Dojo — learn this app's stack (React, TypeScript, Next.js) by
// running tiny snippets in a live preview beside the lesson.
//
// Audience: you already know HTML/CSS/JS and a backend language
// (Java/Python/Django/Spring). Every lesson maps the new idea onto one
// you own, then makes your hands do it. The preview (lib/dojo-run.ts)
// renders a component called App with full TSX support, so every lesson
// builds one. Checks are plain substring matches on the learner's code
// (same philosophy as roleplay goals: deterministic, offline, fast).
// "In our app" points each lesson at the real file it mirrors, so the
// dojo doubles as a guided tour of this codebase.
//
// Self-contained (no runtime cross-imports) so plain `node --test` covers it.

export interface DojoCheck {
  label: string;
  /** Lowercase substrings — ANY one completing the check. */
  patterns: string[];
}

export interface DojoLesson {
  id: string;
  title: string;
  icon: string;
  /** Language track: ts | react | next. */
  lang: "ts" | "react" | "next";
  /** Short teaching text (\n for line breaks). No HTML. */
  brief: string;
  starter: string;
  solution: string;
  checks: DojoCheck[];
  tip: string;
  /** Real file in this repo that uses the same idea. */
  inApp: string;
}

export const DOJO_LESSONS: DojoLesson[] = [
  {
    id: "views",
    title: "Views that return HTML",
    icon: "🧱",
    lang: "react",
    brief: [
      "A React component is a function that returns HTML (JSX). Think of it like a template that runs in the browser.",
      "{name} is a placeholder: we put a JavaScript value inside braces { } and React shows it on screen.",
      "YOUR TURN: replace ??? with your own name, then click ▶ Run.",
    ].join("\\n"),
    starter: [
      "const name = \"???\";",
      "",
      "function App() {",
      "  return <h1>Welcome, {name}!</h1>;",
      "}",
    ].join("\n"),
    solution: [
      "const name = \"Mina\";",
      "",
      "function App() {",
      "  return <h1>Welcome, {name}!</h1>;",
      "}",
    ].join("\n"),
    checks: [
      { label: "Renders {name}", patterns: ["{name}"] },
      { label: "A real value", patterns: ["mina", "jun", "sara", "minho", "jia", "alex", "love", "like", "my"] },
    ],
    tip: "JSX is JS with angle brackets: any expression works in braces — {user.name}, {count + 1}, even {Math.random()}.",
    inApp: "components/settings/AppearanceSection.tsx is one function returning the settings screen",
  },
  {
    id: "props",
    title: "Props are template context",
    icon: "📦",
    lang: "react",
    brief: [
      "Props are inputs to a component. You pass data from a parent to a child, like function arguments.",
      "<Card user={u} /> sends the 'user' object to Card. Inside Card, ({ user }) reads it.",
      "YOUR TURN: add a third <Card /> with your own name, then click ▶ Run.",
    ].join("\n"),
    starter: [
      "function Card({ user }) {",
      "  return <p>{user.name} — {user.coffees} coffees ☕</p>;",
      "}",
      "",
      "function App() {",
      "  return (",
      "    <div>",
      "      <Card user={{ name: \"Mina\", coffees: 3 }} />",
      "      <Card user={{ name: \"Jun\", coffees: 1 }} />",
      "    </div>",
      "  );",
      "}",
    ].join("\n"),
    solution: [
      "function Card({ user }) {",
      "  return <p>{user.name} — {user.coffees} coffees ☕</p>;",
      "}",
      "",
      "function App() {",
      "  return (",
      "    <div>",
      "      <Card user={{ name: \"Mina\", coffees: 3 }} />",
      "      <Card user={{ name: \"Jun\", coffees: 1 }} />",
      "      <Card user={{ name: \"Sara\", coffees: 5 }} />",
      "    </div>",
      "  );",
      "}",
    ].join("\n"),
    checks: [
      { label: "Unwraps { user }", patterns: ["{ user", "{user"] },
      { label: "Reads user.name", patterns: ["user.name"] },
      { label: "Passes user=", patterns: ["user="] },
    ],
    tip: "Props flow one way: parent → child. A child that needs to talk back gets a callback prop (a function) — same as passing a handler.",
    inApp: "components/chat/MessageList.tsx receives { messages, t, streaming } as props",
  },
  {
    id: "state",
    title: "Assignment lies; setters redraw",
    icon: "🔄",
    lang: "react",
    brief: [
      "In React, changing a variable does NOT update the screen. You must use a 'setter' function to tell React to redraw.",
      "The starter has a common bug: count = count + 1 changes the number, but the screen stays the same.",
      "YOUR TURN: replace the assignment with setCount(count + 1), then click ▶ Run and click the button.",
    ].join("\n"),
    starter: [
      "function App() {",
      "  const [count, setCount] = React.useState(0);",
      "  return (",
      "    <div>",
      "      <p>{count} coffees ordered.</p>",
      "      <button onClick={() => { count = count + 1; }}>",
      "        Order one more",
      "      </button>",
      "    </div>",
      "  );",
      "}",
    ].join("\n"),
    solution: [
      "function App() {",
      "  const [count, setCount] = React.useState(0);",
      "  return (",
      "    <div>",
      "      <p>{count} coffees ordered.</p>",
      "      <button onClick={() => setCount(count + 1)}>",
      "        Order one more",
      "      </button>",
      "    </div>",
      "  );",
      "}",
    ].join("\n"),
    checks: [
      { label: "Uses useState", patterns: ["usestate"] },
      { label: "Calls the setter", patterns: ["setcount("] },
      { label: "Wired to onClick", patterns: ["onclick"] },
    ],
    tip: "Rule of thumb: if the user can see it change without a reload, it's state — and state only changes via its setter.",
    inApp: "hooks/useTheme.ts: the theme dropdown you clicked is exactly this pattern",
  },
  {
    id: "lists",
    title: "Querysets become map()",
    icon: "📋",
    lang: "react",
    brief: [
      "To show a list, use .map() to turn each item into an HTML element.",
      "key={food} gives each row a unique name so React can update only what changed.",
      "YOUR TURN: add your own food to the array, then click ▶ Run.",
    ].join("\n"),
    starter: [
      "function App() {",
      "  const foods = [\"tteokbokki\", \"kimbap\", \"bibimbap\"];",
      "  return (",
      "    <ul>",
      "      {foods.map((food) => (",
      "        <li key={food}>{food}</li>",
      "      ))}",
      "    </ul>",
      "  );",
      "}",
    ].join("\n"),
    solution: [
      "function App() {",
      "  const foods = [\"tteokbokki\", \"kimbap\", \"bibimbap\", \"ramen\"];",
      "  return (",
      "    <ul>",
      "      {foods.map((food) => (",
      "        <li key={food}>{food}</li>",
      "      ))}",
      "    </ul>",
      "  );",
      "}",
    ].join("\n"),
    checks: [
      { label: "Maps the array", patterns: [".map("] },
      { label: "Renders <li> rows", patterns: ["<li"] },
      { label: "Each row has key=", patterns: ["key="] },
    ],
    tip: "key must be unique and stable — a name works here; array indexes rot the moment rows reorder or filter.",
    inApp: "components/chat/Composer.tsx maps SCENARIOS into the 🎭 quick-start chips",
  },
  {
    id: "effects",
    title: "Effects are lifecycle hooks",
    icon: "⚙️",
    lang: "react",
    brief: [
      "useEffect runs code after the component appears on screen. With [] it runs only once.",
      "The starter starts a timer but never stops it. That causes a memory leak.",
      "YOUR TURN: add 'return () => clearInterval(id);' to clean up, then click ▶ Run.",
    ].join("\n"),
    starter: [
      "function Clock() {",
      "  const [now, setNow] = React.useState(new Date());",
      "  React.useEffect(() => {",
      "    const id = setInterval(() => setNow(new Date()), 1000);",
      "    // TODO: stop the timer when Clock unmounts",
      "  }, []);",
      "  return <p>🕒 {now.toLocaleTimeString()}</p>;",
      "}",
      "",
      "function App() {",
      "  return <Clock />;",
      "}",
    ].join("\n"),
    solution: [
      "function Clock() {",
      "  const [now, setNow] = React.useState(new Date());",
      "  React.useEffect(() => {",
      "    const id = setInterval(() => setNow(new Date()), 1000);",
      "    return () => clearInterval(id);",
      "  }, []);",
      "  return <p>🕒 {now.toLocaleTimeString()}</p>;",
      "}",
      "",
      "function App() {",
      "  return <Clock />;",
      "}",
    ].join("\n"),
    checks: [
      { label: "Runs on mount", patterns: ["useeffect"] },
      { label: "Ticks on interval", patterns: ["setinterval"] },
      { label: "Cleans up", patterns: ["clearinterval"] },
    ],
    tip: "Empty [] = once. [count] = every time count changes. No array = every render (almost never what you want).",
    inApp: "hooks/useTheme.ts loads the saved theme in useEffect on mount",
  },
  {
    id: "types",
    title: "Interfaces are DTOs",
    icon: "🏷️",
    lang: "ts",
    brief: [
      "An interface describes the shape of data. TypeScript checks it while you code, then removes it when running.",
      "The starter says coffees is text, but Mina ordered 3 (a number). TypeScript would catch this error.",
      "YOUR TURN: change 'string' to 'number', then click ▶ Run.",
    ].join("\n"),
    starter: [
      "interface User {",
      "  name: string;",
      "  coffees: string;",
      "}",
      "",
      "function Card({ user }: { user: User }) {",
      "  return <p>{user.name} — {user.coffees} coffees ☕</p>;",
      "}",
      "",
      "function App() {",
      "  return <Card user={{ name: \"Mina\", coffees: 3 }} />;",
      "}",
    ].join("\n"),
    solution: [
      "interface User {",
      "  name: string;",
      "  coffees: number;",
      "}",
      "",
      "function Card({ user }: { user: User }) {",
      "  return <p>{user.name} — {user.coffees} coffees ☕</p>;",
      "}",
      "",
      "function App() {",
      "  return <Card user={{ name: \"Mina\", coffees: 3 }} />;",
      "}",
    ].join("\n"),
    checks: [
      { label: "Declares interface User", patterns: ["interface user"] },
      { label: "Labels coffees: number", patterns: ["coffees: number"] },
      { label: "Uses the User type", patterns: [": { user: user", "user: user"] },
    ],
    tip: "The preview runs the JS underneath (types erased) — that's why it renders either way. The label's job is stopping YOU, at build, via npm run typecheck.",
    inApp: "lib/learn-roleplay.ts: Scenario { id: string; goals: RoleGoal[]; … } labels every scene",
  },
  {
    id: "generics",
    title: "useState<T> and the null dance",
    icon: "🧬",
    lang: "ts",
    brief: [
      "useState<string | null> means this variable holds text OR nothing (null) at first.",
      "After 'if (user === null) return', TypeScript knows user is text below that line. This is called 'narrowing'.",
      "YOUR TURN: click ▶ Run, click Log in, then change the name to yours.",
    ].join("\n"),
    starter: [
      "function Profile() {",
      "  const [user, setUser] = React.useState<string | null>(null);",
      "  if (user === null) {",
      "    return <button onClick={() => setUser(\"???\")}>Log in</button>;",
      "  }",
      "  return <p>Welcome back, {user}!</p>;",
      "}",
      "",
      "function App() {",
      "  return <Profile />;",
      "}",
    ].join("\n"),
    solution: [
      "function Profile() {",
      "  const [user, setUser] = React.useState<string | null>(null);",
      "  if (user === null) {",
      "    return <button onClick={() => setUser(\"Mina\")}>Log in</button>;",
      "  }",
      "  return <p>Welcome back, {user}!</p>;",
      "}",
      "",
      "function App() {",
      "  return <Profile />;",
      "}",
    ].join("\n"),
    checks: [
      { label: "Generic state useState<…>", patterns: ["usestate<"] },
      { label: "A null union", patterns: ["| null"] },
      { label: "Narrows with === null", patterns: ["=== null"] },
    ],
    tip: "string | null + early return is THE React data pattern (loading → data). Narrowing means no casts, no '!' assertions.",
    inApp: "hooks/useTheme.ts: useState<Theme> labels the theme memory",
  },
  {
    id: "routing",
    title: "Files are URLs",
    icon: "🗂️",
    lang: "next",
    brief: [
      "In Next.js, the file path IS the URL. No route table needed.",
      "app/settings/page.tsx becomes /settings. app/api/hello/route.ts with POST() becomes POST /api/hello. Folders named [id] are path parameters.",
      "YOUR TURN: type both file paths below, then click ▶ Run.",
    ].join("\n"),
    starter: [
      "function App() {",
      "  return (",
      "    <div>",
      "      <p>/settings → ???</p>",
      "      <p>POST /api/hello → ???</p>",
      "    </div>",
      "  );",
      "}",
    ].join("\n"),
    solution: [
      "function App() {",
      "  return (",
      "    <div>",
      "      <p>/settings → app/settings/page.tsx</p>",
      "      <p>POST /api/hello → app/api/hello/route.ts</p>",
      "    </div>",
      "  );",
      "}",
    ].join("\n"),
    checks: [
      { label: "Page path", patterns: ["app/settings/page.tsx"] },
      { label: "API route path", patterns: ["app/api/hello/route.ts"] },
    ],
    tip: "This repo's full route map lives in PROJECT_GUIDE.md §4 — every URL traced to its file.",
    inApp: "app/api/trial-status/route.ts: 9 lines, one GET export, pure JsonResponse energy",
  },
  {
    id: "fetch",
    title: "useEffect + then() is fetch",
    icon: "🌐",
    lang: "react",
    brief: [
      "Fetching data in React has ONE shape: render a loading state first, kick off the request in useEffect, then store the result in state.",
      "Never fetch during render — it would re-fire on every redraw (and stale-cli queries would pile up).",
      "YOUR TURN: make fakeApi's result land in the foods list via setFoods, then click ▶ Run and wait a moment.",
    ].join("\n"),
    starter: [
      "function App() {",
      "  const [foods, setFoods] = React.useState([]);",
      "",
      "  React.useEffect(() => {",
      "    // TODO: resolve fakeApi() into the foods state — type it, don't paste it",
      "    fakeApi();",
      "  }, []);",
      "",
      "  return <ul>{foods.map((f) => <li key={f}>{f}</li>)}</ul>;",
      "}",
      "",
      "// Stands in for a real /api/* endpoint — no network needed.",
      "function fakeApi() {",
      "  return new Promise((res) =>",
      "    setTimeout(() => res([\"tteokbokki\", \"kimbap\", \"bibimbap\"]), 300),",
      "  );",
      "}",
    ].join("\n"),
    solution: [
      "function App() {",
      "  const [foods, setFoods] = React.useState([]);",
      "",
      "  React.useEffect(() => {",
      "    fakeApi().then((data) => setFoods(data));",
      "  }, []);",
      "",
      "  return <ul>{foods.map((f) => <li key={f}>{f}</li>)}</ul>;",
      "}",
      "",
      "function fakeApi() {",
      "  return new Promise((res) =>",
      "    setTimeout(() => res([\"tteokbokki\", \"kimbap\", \"bibimbap\"]), 300),",
      "  );",
      "}",
    ].join("\n"),
    checks: [
      { label: "useEffect on mount", patterns: ["useeffect"] },
      { label: "Resolves the promise", patterns: [".then("] },
      { label: "Stores it in state", patterns: ["setfoods"] },
    ],
    tip: "In this app the real fetch is against our own API routes (GET /api/learn-state, /api/quota). Same shape — useEffect on mount → .then → setState → render.",
    inApp: "hooks/useQuota.ts loads /api/quota on mount — the same useEffect + .then pattern",
  },
  {
    id: "forms",
    title: "Controlled inputs, no drift",
    icon: "⌨️",
    lang: "react",
    brief: [
      "A 'controlled' input gets its text from state via value={x}, and writes every keystroke back via onChange.",
      "State IS the field — they can never disagree. An uncontrolled input just… is a DOM node, and React is guessing.",
      "YOUR TURN: wire the textarea to a new msg state (value + onChange) so the ✍️ line echoes as you type.",
    ].join("\n"),
    starter: [
      "function App() {",
      "  return (",
      "    <div>",
      "      <textarea placeholder=\"Message…\" />",
      "      <button>Send</button>",
      "      <p>✍️ nothing yet</p>",
      "    </div>",
      "  );",
      "}",
    ].join("\n"),
    solution: [
      "function App() {",
      "  const [msg, setMsg] = React.useState(\"\");",
      "  return (",
      "    <div>",
      "      <textarea",
      "        placeholder=\"Message…\"",
      "        value={msg}",
      "        onChange={(e) => setMsg(e.target.value)}",
      "      />",
      "      <button>Send</button>",
      "      <p>✍️ {msg}</p>",
      "    </div>",
      "  );",
      "}",
    ].join("\n"),
    checks: [
      { label: "Creates msg state", patterns: ["usestate"] },
      { label: "Binds value", patterns: ["value="] },
      { label: "Reads e.target.value", patterns: ["target.value"] },
    ],
    tip: "value + onChange is ALL controlled means. Chat's composer — useState, bound value, one source of truth — is exactly this.",
    inApp: "components/chat/Composer.tsx: the chat box is a controlled useState field",
  },
  {
    id: "loading-error",
    title: "Load, fail, or show — never blank",
    icon: "⏳",
    lang: "react",
    brief: [
      "Async data has THREE phases: loading, error, ready. Rendering the list unconditionally crashes the moment state starts as null.",
      "The starter dies on foods.map with foods === null. That red error you'll see is a FEATURE — now render the loading phase instead.",
      "YOUR TURN: add an early return showing ⏳ Loading… while foods is null, then click ▶ Run — wait ~½s for the kimbap list.",
    ].join("\n"),
    starter: [
      "function App() {",
      "  const [foods, setFoods] = React.useState(null);",
      "",
      "  React.useEffect(() => {",
      "    fakeApi().then((data) => setFoods(data));",
      "  }, []);",
      "",
      "  return <ul>{foods.map((f) => <li key={f}>{f}</li>)}</ul>;",
      "}",
      "",
      "function fakeApi() {",
      "  return new Promise((res) =>",
      "    setTimeout(() => res([\"tteokbokki\", \"kimbap\"]), 500),",
      "  );",
      "}",
    ].join("\n"),
    solution: [
      "function App() {",
      "  const [foods, setFoods] = React.useState(null);",
      "",
      "  React.useEffect(() => {",
      "    fakeApi().then((data) => setFoods(data));",
      "  }, []);",
      "",
      "  if (foods === null) return <p>⏳ Loading…</p>;",
      "",
      "  return <ul>{foods.map((f) => <li key={f}>{f}</li>)}</ul>;",
      "}",
      "",
      "function fakeApi() {",
      "  return new Promise((res) =>",
      "    setTimeout(() => res([\"tteokbokki\", \"kimbap\"]), 500),",
      "  );",
      "}",
    ].join("\n"),
    checks: [
      { label: "Guards null first", patterns: ["foods === null", "foods??[]", "foods?.map"] },
      { label: "Shows loading text", patterns: ["loading", "⏳"] },
      { label: "Renders the list", patterns: ["<ul>"] },
    ],
    tip: "Every Canary screen obeys this: load → fail loudly → show data. Silent blanks hide bugs; a visible spinner points at them.",
    inApp: "components/Chat.tsx renders a turn-error card; anywhere data matters, there's a loading branch before the happy path",
  },
];

export function lessonById(id: string | null | undefined): DojoLesson | null {
  if (!id) return null;
  return DOJO_LESSONS.find((l) => l.id === id) ?? null;
}

/** Which checks does the learner's code satisfy? ANY pattern completes a check. */
export function checkDojo(code: string, checks: DojoCheck[]): boolean[] {
  const hay = (code || "").toLowerCase();
  if (!hay.trim()) return checks.map(() => false);
  return checks.map((c) => c.patterns.some((p) => hay.includes(p.toLowerCase())));
}

const DOJO_DONE_KEY = "canary-dojo-done";

/** Per-lesson checkmarks (survive reload via localStorage). */
export function loadDojoDone(id: string | null | undefined, n: number): boolean[] {
  const blank = Array<boolean>(n).fill(false);
  try {
    if (typeof localStorage === "undefined" || !id) return blank;
    const raw = localStorage.getItem(DOJO_DONE_KEY);
    if (!raw) return blank;
    const arr = (JSON.parse(raw) as Record<string, unknown>)?.[id];
    if (!Array.isArray(arr)) return blank;
    return blank.map((_, i) => arr[i] === true);
  } catch {
    return blank;
  }
}

export function saveDojoDone(id: string | null | undefined, done: boolean[]): void {
  try {
    if (typeof localStorage === "undefined" || !id) return;
    const raw = localStorage.getItem(DOJO_DONE_KEY);
    let obj: Record<string, boolean[]> = {};
    try {
      const parsed = raw ? (JSON.parse(raw) as unknown) : null;
      if (parsed && typeof parsed === "object") obj = parsed as Record<string, boolean[]>;
    } catch {
      obj = {};
    }
    obj[id] = done.map((d) => d === true);
    localStorage.setItem(DOJO_DONE_KEY, JSON.stringify(obj));
  } catch {
    // best-effort
  }
}

const DOJO_DRAFT_KEY = "canary-dojo-drafts";

/** Per-lesson drafts so switching lessons or reloading never eats typed code. */
export function loadDojoDraft(id: string | null | undefined, fallback: string): string {
  try {
    if (typeof localStorage === "undefined" || !id) return fallback;
    const raw = localStorage.getItem(DOJO_DRAFT_KEY);
    if (!raw) return fallback;
    const code = (JSON.parse(raw) as Record<string, unknown>)?.[id];
    return typeof code === "string" && code.length > 0 ? code : fallback;
  } catch {
    return fallback;
  }
}

export function saveDojoDraft(id: string | null | undefined, code: string): void {
  try {
    if (typeof localStorage === "undefined" || !id) return;
    const raw = localStorage.getItem(DOJO_DRAFT_KEY);
    let obj: Record<string, string> = {};
    try {
      const parsed = raw ? (JSON.parse(raw) as unknown) : null;
      if (parsed && typeof parsed === "object") obj = parsed as Record<string, string>;
    } catch {
      obj = {};
    }
    obj[id] = code.slice(0, 20000);
    localStorage.setItem(DOJO_DRAFT_KEY, JSON.stringify(obj));
  } catch {
    // best-effort
  }
}

/** Handoff text posting the learner's code into main chat for AI feedback.
 * Includes which checks pass/fail so the reply can be targeted. */
export function buildDojoHandoff(lesson: DojoLesson, code: string): string {
  const snippet = code.trim().slice(0, 1200);
  const hits = checkDojo(code, lesson.checks);
  const passing = hits.filter(Boolean).length;
  const checkLines = lesson.checks.map((c, i) => `${hits[i] ? "✓" : "✗"} ${c.label}`);
  return [
    `I'm learning "${lesson.title}" in the Code Dojo (${passing}/${lesson.checks.length} checks passing). Here's my code:`,
    "```tsx",
    snippet,
    "```",
    "Checks:",
    ...checkLines,
    "Please give quick feedback: 1) does it work, 2) one fix if needed, 3) one tiny challenge to try next. Under 120 words.",
  ].join("\n");
}
