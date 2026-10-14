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
    brief: [
      "Django view: takes a request, returns HTML. React component: takes props, returns JSX. Same job, no server round-trip.",
      "{name} is Django's {{ name }} — an expression slot. const is just a local variable.",
      "YOUR TURN: give name your own value, then ▶ Run.",
    ].join("\n"),
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
    icon: "🎁",
    brief: [
      "Django: {% include \"card.html\" with user=u %}. React: <Card user={u} />. Props are the context object, per use.",
      "Destructuring ({ user }) unwraps it on arrival — like **kwargs with names you choose.",
      "YOUR TURN: add yourself as a third card, then ▶ Run.",
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
    icon: "🔘",
    brief: [
      "Django re-renders per request, so assignment is enough. React renders once — then only a setter call redraws.",
      "The starter has THE classic backend-brain bug: count = count + 1 runs, but the screen never changes.",
      "YOUR TURN: replace the assignment with the setter, then ▶ Run and click.",
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
    icon: "📝",
    brief: [
      "Backend: loop a queryset in the template. React: map() the array into elements — JS, not template tags.",
      "key={food} is the primary key: a stable identity so React updates rows cheaply instead of re-rendering all.",
      "YOUR TURN: add your own food to the array, then ▶ Run.",
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
    icon: "⏱️",
    brief: [
      "useEffect(fn, []) = 'run once on mount' (think @PostConstruct / ready()). The returned function is the destructor.",
      "The starter's clock ticks but never cleans up — remount it and two timers fight. Classic leak.",
      "YOUR TURN: add the cleanup line, then ▶ Run.",
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
    brief: [
      "Java DTO: shape of data, enforced by compiler. TS interface: same thing, erased at build — zero runtime cost.",
      "The starter's label lies: coffees is a string, but Mina ordered 3 (a number). tsc would refuse to compile this app.",
      "YOUR TURN: fix the label to number, then ▶ Run.",
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
    icon: "🎭",
    brief: [
      "Java generics: List<String>. TS: useState<string | null> — memory holding text, or nothing yet.",
      "After if (user === null) return …, TypeScript NARROWS the type: below that line user is string. Like instanceof, but flow-based.",
      "YOUR TURN: press ▶ Run, click Log in, then change the starter name to yours.",
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
    icon: "🗺️",
    brief: [
      "Django/Spring: URLs live in a route table. Next.js: the FILE PATH is the URL — there is no urls.py.",
      "app/settings/page.tsx → /settings. app/api/hello/route.ts exporting POST() → POST /api/hello. [id] folders are path params.",
      "YOUR TURN: type both file paths into the answers below, then ▶ Run to echo them.",
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

/** Handoff text posting the learner's code into main chat for AI feedback. */
export function buildDojoHandoff(lesson: DojoLesson, code: string): string {
  const snippet = code.trim().slice(0, 1200);
  return [
    `I'm learning ${lesson.title} in the Code Dojo. Here's my code:`,
    "```tsx",
    snippet,
    "```",
    "Please give quick feedback: 1) does it work, 2) one fix if needed, 3) one tiny challenge to try next. Under 120 words.",
  ].join("\n");
}
