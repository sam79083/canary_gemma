// English-first definitions — "learn English, not Korean".
//
// The generator's KO-choice questions train translation; B1+ learners do
// better with EN-definition choices (TOEFL-style: "closest meaning").
// This module owns:
//   ENDEF_SEED — 100 hand-written learner definitions (def + example).
//     B1 fully covered (the KO→EN transition level), plus A2/B2/C1 samples.
//   loadEnDef() — merges /data/endef.json (written by scripts/build-wordlist)
//     over the seed at runtime, then injects into learn-gen. Cached.
//   Choice-mode preference ("auto" | "en" | "ko", localStorage):
//     auto = KO choices at A1/A2, EN choices at B1+ (when data covers the
//     item, else graceful KO fallback per item).
// Self-contained (no cross-imports) so plain `node --test` covers it.

export interface EnDef {
  def: string;
  ex: string;
}

export type ChoiceMode = "auto" | "en" | "ko";

// B1: full coverage. A2/B2/C1: 10 samples each (script fills the rest).
export const ENDEF_SEED: Record<string, EnDef> = {
  abroad: { def: "in or to another country", ex: "She lives abroad." },
  absent: { def: "not present; away", ex: "He was absent from class." },
  accept: { def: "to take what is offered", ex: "She accepted the gift." },
  accident: { def: "something bad that happens unexpectedly", ex: "A car accident blocked the road." },
  activity: { def: "something you do for fun or work", ex: "The school plans many activities." },
  admire: { def: "to respect and like someone", ex: "I admire her courage." },
  admit: { def: "to say that something is true", ex: "He admitted his mistake." },
  adopt: { def: "to take a child or pet into your family", ex: "They adopted a baby." },
  advice: { def: "ideas about what to do", ex: "She gave me good advice." },
  afford: { def: "to have enough money for something", ex: "I can't afford a new car." },
  agency: { def: "an office that does a service", ex: "A travel agency planned our trip." },
  agenda: { def: "a list of things to discuss", ex: "The meeting has a long agenda." },
  aim: { def: "to try to reach a goal", ex: "We aim to finish by Friday." },
  alarm: { def: "a loud sound that warns you", ex: "The alarm woke me up." },
  alike: { def: "very similar", ex: "The twins look alike." },
  alive: { def: "living; not dead", ex: "The fish is still alive." },
  alley: { def: "a narrow street", ex: "A cat ran down the alley." },
  alliance: { def: "an agreement to work together", ex: "Two teams formed an alliance." },
  allowance: { def: "money given regularly", ex: "He gets a weekly allowance." },
  alphabet: { def: "the set of letters", ex: "Kids learn the alphabet first." },
  alter: { def: "to change something", ex: "They altered the plan." },
  altitude: { def: "height above sea level", ex: "The plane flew at high altitude." },
  amaze: { def: "to surprise greatly", ex: "The view amazed us." },
  ambition: { def: "a strong wish to succeed", ex: "Her ambition is to be a doctor." },
  amount: { def: "how much there is", ex: "A large amount of rain fell." },
  amuse: { def: "to make someone laugh", ex: "The clown amused the kids." },
  analyze: { def: "to study something closely", ex: "We analyzed the data." },
  ancestor: { def: "a family member from long ago", ex: "My ancestors came from Busan." },
  anger: { def: "a strong feeling of being mad", ex: "He shook with anger." },
  angle: { def: "the space between two lines", ex: "The photo was taken at an angle." },
  ankle: { def: "the joint above your foot", ex: "She hurt her ankle." },
  announce: { def: "to tell people officially", ex: "They announced the winner." },
  annoy: { def: "to make someone a little angry", ex: "The noise annoyed me." },
  annual: { def: "happening once a year", ex: "Our annual trip is in May." },
  antique: { def: "very old and valuable", ex: "The shop sells antiques." },
  anxiety: { def: "a feeling of worry", ex: "Exams give him anxiety." },
  apologize: { def: "to say sorry", ex: "She apologized for being late." },
  appeal: { def: "to ask for help or support", ex: "They appealed for donations." },
  appear: { def: "to come into sight", ex: "A ship appeared on the sea." },
  appetite: { def: "wanting to eat", ex: "Running gives me an appetite." },
  applaud: { def: "to clap your hands", ex: "The crowd applauded loudly." },
  applicant: { def: "someone who applies for a job", ex: "Ten applicants came today." },
  appoint: { def: "to choose someone for a job", ex: "They appointed a new manager." },
  appreciate: { def: "to be thankful for", ex: "I appreciate your help." },
  approach: { def: "to come near", ex: "Winter is approaching." },
  approve: { def: "to agree officially", ex: "The boss approved my plan." },
  approximate: { def: "almost exact, not perfect", ex: "The cost is approximately ten dollars." },
  archive: { def: "a place where old records are kept", ex: "The letter is in the archive." },
  arise: { def: "to happen or appear", ex: "Problems arose during the trip." },
  aroma: { def: "a nice smell", ex: "The coffee has a rich aroma." },
  arrange: { def: "to put things in order", ex: "She arranged the flowers." },
  arrest: { def: "for police to catch someone", ex: "Police arrested the thief." },
  arrival: { def: "coming to a place", ex: "We waited for his arrival." },
  arrogant: { def: "thinking you are better than others", ex: "His arrogant words hurt us." },
  arrow: { def: "a thin stick shot from a bow", ex: "The arrow hit the target." },
  article: { def: "a piece of writing in a newspaper", ex: "I read an article about space." },
  artificial: { def: "made by people, not natural", ex: "The flowers are artificial." },
  artist: { def: "someone who makes art", ex: "The artist painted the sea." },
  ash: { def: "grey powder after fire", ex: "Ash covered the ground." },
  aside: { def: "to one side", ex: "She put her bag aside." },
  aspect: { def: "one part of something", ex: "Price is one aspect of the plan." },
  aspire: { def: "to want something strongly", ex: "He aspires to be a pilot." },
  assembly: { def: "a group meeting together", ex: "The school held an assembly." },
  assert: { def: "to say firmly", ex: "He asserted his innocence." },
  assign: { def: "to give work to someone", ex: "The teacher assigned homework." },
  assist: { def: "to help", ex: "She assisted the doctor." },
  associate: { def: "to connect in your mind", ex: "I associate rain with Seoul." },
  assume: { def: "to think something is true", ex: "I assumed you were busy." },
  assure: { def: "to promise to remove doubt", ex: "She assured me it was safe." },
  astonish: { def: "to surprise greatly", ex: "The news astonished everyone." },
  lend: { def: "to give something for a short time", ex: "Can you lend me your pen?" },
  menu: { def: "a list of food at a restaurant", ex: "The menu has many dishes." },
  price: { def: "how much something costs", ex: "The price is too high." },
  neighbor: { def: "someone living near you", ex: "Our neighbors are kind." },
  village: { def: "a very small town", ex: "She grew up in a village." },
  brave: { def: "not afraid of danger", ex: "The brave boy saved the dog." },
  polite: { def: "having good manners", ex: "Be polite to guests." },
  busy: { def: "having a lot to do", ex: "She is busy today." },
  tired: { def: "needing rest", ex: "I am tired after work." },
  carry: { def: "to hold and take somewhere", ex: "He carried the heavy box." },
  abolish: { def: "to officially end a law", ex: "They abolished the tax." },
  absorb: { def: "to take in liquid or ideas", ex: "Plants absorb water." },
  adapt: { def: "to change to fit better", ex: "She adapted to city life." },
  affect: { def: "to change or influence", ex: "Rain affected our trip." },
  agile: { def: "quick and graceful", ex: "Cats are agile animals." },
  agree: { def: "to think the same way", ex: "I agree with you." },
  alert: { def: "watchful and ready", ex: "Stay alert while driving." },
  align: { def: "to line things up", ex: "Align the pictures on the wall." },
  almost: { def: "very nearly", ex: "Dinner is almost ready." },
  ample: { def: "more than enough", ex: "We have ample time." },
  abandon: { def: "to leave behind", ex: "They abandoned the old house." },
  absolute: { def: "total and complete", ex: "The room was in absolute silence." },
  absurd: { def: "wildly silly", ex: "The idea sounds absurd." },
  abundant: { def: "existing in large amounts", ex: "Fish are abundant here." },
  academic: { def: "about school or study", ex: "She reads academic books." },
  acknowledge: { def: "to accept that something is true", ex: "He acknowledged his error." },
  abound: { def: "to exist in large numbers", ex: "Berries abound in summer." },
  abort: { def: "to stop before finishing", ex: "They aborted the flight." },
  abruptly: { def: "suddenly", ex: "The car stopped abruptly." },
  ache: { def: "a dull, steady pain", ex: "My legs ache after running." },
};

const MODE_KEY = "canary-endef-mode";

export function loadChoiceMode(): ChoiceMode {
  try {
    if (typeof localStorage === "undefined") return "auto";
    const raw = localStorage.getItem(MODE_KEY);
    if (raw === "en" || raw === "ko" || raw === "auto") return raw;
    return "auto";
  } catch {
    return "auto";
  }
}

export function saveChoiceMode(m: ChoiceMode): void {
  try {
    if (typeof localStorage !== "undefined") localStorage.setItem(MODE_KEY, m);
  } catch {
    // best-effort
  }
}

/** Merge fetched data over the seed (fetched wins). Pure — test-covered. */
export function mergeEnDef(
  seed: Record<string, EnDef>,
  fetched: Record<string, EnDef>,
): Record<string, EnDef> {
  const out: Record<string, EnDef> = { ...seed };
  for (const [k, v] of Object.entries(fetched)) {
    if (typeof k !== "string" || !k) continue;
    if (!v || typeof v.def !== "string" || !v.def.trim()) continue;
    out[k.toLowerCase()] = {
      def: v.def.trim().slice(0, 160),
      ex: typeof v.ex === "string" ? v.ex.trim().slice(0, 160) : "",
    };
  }
  return out;
}

let loaded: Record<string, EnDef> | null = null;

/** Fetch /data/endef.json (build-script output), merge over seed. Cached.
 * Never throws; offline/404 simply keeps the seed. */
export async function loadEnDef(): Promise<Record<string, EnDef>> {
  if (loaded) return loaded;
  loaded = { ...ENDEF_SEED };
  try {
    if (typeof fetch === "undefined") return loaded;
    const res = await fetch("/data/endef.json", { cache: "force-cache" });
    if (!res.ok) return loaded;
    const data = (await res.json()) as unknown;
    if (data && typeof data === "object" && !Array.isArray(data))
      loaded = mergeEnDef(ENDEF_SEED, data as Record<string, EnDef>);
  } catch {
    // offline or missing file — seed stands alone
  }
  return loaded;
}

/** Synchronous read of whatever is loaded (seed minimum). */
export function enDefSync(): Record<string, EnDef> {
  return loaded ?? ENDEF_SEED;
}
