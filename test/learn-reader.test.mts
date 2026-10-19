import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  articleFromText,
  cleanReadUrl,
  countWords,
  decodeEntities,
  estimateReadLevel,
  extractArticle,
  isPrivateHost,
  lemmaCandidates,
  matchStudyWords,
  paragraphsFromText,
  tokenizeParagraph,
  type DictEntry,
} from "../lib/learn-reader.ts";

describe("reader URL safety", () => {
  it("rejects private, unusual and unsafe URLs", () => {
    for (const bad of [
      "http://localhost:3000/a",
      "http://127.0.0.1/",
      "http://10.1.2.3/",
      "http://192.168.0.1/",
      "http://172.20.1.1/",
      "http://169.254.169.254/latest/meta-data",
      "http://100.64.0.1/",
      "http://[::1]/",
      "http://[::ffff:10.0.0.1]/",
      "http://[fc00::1]/",
      "http://printer.local/",
      "ftp://example.com/file",
      "javascript:alert(1)",
      "https://user:pass@example.com/",
      "https://example.com:8080/",
      "",
      "not a url",
    ]) {
      assert.equal(cleanReadUrl(bad), null, bad);
    }
  });
  it("accepts ordinary public article URLs", () => {
    const u = cleanReadUrl(" https://www.example.com/news/story?id=2 ");
    assert.ok(u);
    assert.equal(u.hostname, "www.example.com");
    assert.ok(cleanReadUrl("http://example.com"));
  });
  it("flags IP-literal private ranges directly", () => {
    assert.equal(isPrivateHost("127.0.0.1"), true);
    assert.equal(isPrivateHost("172.31.255.255"), true);
    assert.equal(isPrivateHost("172.32.0.1"), false);
    assert.equal(isPrivateHost("example.com"), false);
  });
});

describe("reader extraction", () => {
  const html = `<!doctype html><html><head>
    <title>Fallback title</title>
    <meta property="og:title" content="Real &amp; Better Title">
    <style>.x{color:red}</style><script>alert("no")</script>
    </head><body>
    <header>Site menu</header>
    <article>
      <h1>Heading</h1>
      <p>  The <b>quiet</b> town woke up slowly &amp; the bakery opened at six.  </p>
      <p>It&rsquo;s a small place, but the bread is famous across the valley.</p>
      <p>Subscribe</p>
      <p>Locals say the recipe has not changed in a hundred years, which is why visitors keep coming back.</p>
      <script>steal()</script>
    </article>
    <footer>© 2026 Example</footer>
  </body></html>`;

  it("pulls title, paragraphs and stats from an article", () => {
    const a = extractArticle(html, "https://www.example.com/story");
    assert.equal(a.title, "Real & Better Title");
    assert.equal(a.site, "example.com");
    assert.equal(a.paragraphs.length, 3, JSON.stringify(a.paragraphs));
    assert.match(a.paragraphs[0], /quiet town woke up slowly & the bakery/);
    assert.match(a.paragraphs[1], /It’s a small place/);
    assert.ok(!a.text.includes("alert"), "scripts dropped");
    assert.ok(!a.text.includes("Site menu"), "header dropped");
    assert.ok(!a.text.includes("Subscribe"), "junk paragraph dropped");
    assert.equal(a.wordCount, countWords(a.text));
    assert.ok(a.minutes >= 1);
    assert.ok(Number.isFinite(a.minutes));
    assert.ok(["A1", "A2", "B1", "B2", "C1", "C2"].includes(a.level));
  });

  it("falls back to block text when there are no <p> tags", () => {
    const a = extractArticle(
      `<html><head><title>Divs</title></head><body><div>First block of real content that is long enough to keep around.</div><div>Second block of real content that also gets kept by the reader.</div></body></html>`,
      "https://example.com",
    );
    assert.equal(a.title, "Divs");
    assert.ok(a.paragraphs.length >= 1);
    assert.match(a.text, /First block/);
    assert.match(a.text, /Second block/);
  });

  it("decodes named, decimal and hex entities", () => {
    assert.equal(decodeEntities("a &amp; b &#39;c&#39; &#x1F600; &nbsp;&bogus;"), "a & b 'c' \u{1f600}  &bogus;");
  });

  it("splits prose and re-chunks one giant paragraph", () => {
    const parts = paragraphsFromText("One line.\n\nAnother line.");
    assert.deepEqual(parts, ["One line.", "Another line."]);
    const sentences = Array.from({ length: 30 }, (_, i) => `Sentence number ${i + 1} is here.`).join(" ");
    const chunks = paragraphsFromText(sentences);
    assert.ok(chunks.length >= 2, "long blob split");
    assert.ok(chunks.every((c) => c.length < 700));
    assert.equal(paragraphsFromText("same\n\nsame").length, 1, "consecutive dupes merged");
  });

  it("builds an article from pasted text", () => {
    const a = articleFromText("The market opens early. Bring cash.\n\nIt closes at noon.", "My notes");
    assert.equal(a.title, "My notes");
    assert.equal(a.site, "Pasted");
    assert.equal(a.paragraphs.length, 2);
    assert.ok(a.wordCount >= 9);
    assert.equal(a.minutes, 1);
  });
});

describe("reader level heuristic", () => {
  it("rates short simple text easy and dense long text hard", () => {
    assert.equal(estimateReadLevel("The cat sat on the mat. It was happy."), "A1");
    const dense =
      "Notwithstanding the aforementioned considerations, the implementation of comprehensive regulatory frameworks necessitates meticulous examination of interdisciplinary methodologies. " +
      "Consequently, institutional stakeholders frequently encounter substantial impediments when attempting to reconcile divergent perspectives concerning socioeconomic infrastructure development. " +
      "Furthermore, the unprecedented proliferation of technological innovations has fundamentally transformed conventional paradigms of organizational behavior and administrative accountability. " +
      "Nevertheless, contemporary scholarship continues to emphasize the importance of equitable resource allocation and transparent governance mechanisms within democratic societies.";
    assert.ok(["C1", "C2"].includes(estimateReadLevel(dense)), estimateReadLevel(dense));
  });
});

describe("reader study aids", () => {
  const entries: DictEntry[] = [
    { term: "celebrate", level: "B1", meaning: "to do something enjoyable for a special day" },
    { term: "apple", level: "A1", meaning: "a round fruit" },
    { term: "run", level: "A1", meaning: "to move quickly" },
    { term: "enormous", level: "B2", meaning: "very big" },
    { term: "celebrate", level: "B1", meaning: "duplicate" },
  ];
  it("matches at-level and one-above words only, deduped and capped", () => {
    const text = "We celebrate with an apple and run past an enormous sign.";
    const got = matchStudyWords(text, entries, "A2");
    assert.deepEqual(got.map((e) => e.term), ["celebrate"], "A1 too easy, B2 too hard, dupe dropped");
    const more = matchStudyWords(text, entries, "B1");
    assert.deepEqual(more.map((e) => e.term).sort(), ["celebrate", "enormous"]);
    assert.equal(matchStudyWords(text, entries, "A2", 0).length, 0);
  });
  it("suggests dictionary keys for inflections", () => {
    assert.ok(lemmaCandidates("studies").includes("study"));
    assert.ok(lemmaCandidates("cities").includes("city"));
    assert.ok(lemmaCandidates("running").includes("run"));
    assert.ok(lemmaCandidates("watched").includes("watch"));
    assert.ok(lemmaCandidates("boxes").includes("box"));
    assert.ok(lemmaCandidates("cat's").includes("cat"));
    assert.deepEqual(lemmaCandidates("..."), []);
  });
  it("tokenizes without losing a character", () => {
    const text = "Hello, world! It's fine — 3 times.";
    const tokens = tokenizeParagraph(text);
    assert.equal(tokens.map((t) => t.text).join(""), text);
    assert.deepEqual(
      tokens.filter((t) => t.word).map((t) => t.text),
      ["Hello", "world", "It's", "fine", "times"],
    );
  });
});
