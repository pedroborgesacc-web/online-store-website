// Printable study summary: the core of every lesson (why it matters, explanation, rules and
// numbers, exam traps, memory sheet) plus the numbers table, formulas, Portugal traps, tactics
// and glossary, rendered to PDF with the globally installed Playwright. Two passes: the second
// fills in the page numbers of the contents and the reading plan.
//
//   node scripts/print_guide.mjs [--format A4|Letter|both]   (run node scripts/build.mjs first)
//
// Writes dist/print/summary.html and dist/print/florida-summary-<format>.pdf.
import { createRequire } from "node:module";
import { execFileSync, execSync, spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "dist", "print");
const require = createRequire(import.meta.url);
const { chromium } = require(join(execSync("npm root -g").toString().trim(), "playwright"));
const arg = (n, d) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : d; };
const formats = { both: ["A4", "Letter"], A4: ["A4"], Letter: ["Letter"] }[arg("--format", "both")];
if (!formats) { console.error("--format must be A4, Letter or both"); process.exit(1); }

const data = JSON.parse(readFileSync(join(ROOT, "dist", "data.json"), "utf8"));
const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const words = (html) => html.replace(/<[^>]+>/g, " ").split(/\s+/).filter(Boolean).length;
const DAYS = 7; // reading days before the practice days
const TITLE = "Florida Sales Associate Exam · Complete Summary";

// Lesson parts printed, in order, with their print headings. Sections 4 (key terms, collected
// in the glossary), 5 (practical example), 6 (Portugal, collected in its own table) and
// 8 (visual explanation) stay in the app.
const PARTS = { 2: "Why it matters on the exam", 3: "Explanation", 7: "Rules, numbers and deadlines", 9: "Exam traps", 10: "Memory sheet" };

function lessonBody(html) {
  const out = [];
  for (const part of html.split(/(?=<h2 )/)) {
    const m = part.match(/^<h2 id="(\d+)-[^"]*">[^<]*<\/h2>/);
    if (!m || !PARTS[m[1]]) continue;
    let body = part.slice(m[0].length)
      .replace(/<h3 id="[^"]*">/g, "<h4>").replace(/<\/h3>/g, "</h4>")
      .replace(/<details>\s*<summary>[^<]*<\/summary>/g, '<div class="answer">').replace(/<\/details>/g, "</div>");
    const cls = { 9: "traps", 10: "memory" }[m[1]] || "";
    out.push(`<div class="part ${cls}"><h3 class="part-h">${PARTS[m[1]]}</h3>${body}</div>`);
  }
  return out.join("\n");
}

const lessonNum = (id) => id.slice(1).split("-").map((x) => parseInt(x, 10));
const byLesson = (a, b) => { const [x1, y1] = lessonNum(a), [x2, y2] = lessonNum(b); return x1 - x2 || y1 - y2; };
const chapters = data.chapters.map((c) => ({
  ...c,
  lessons: data.lessons.filter((l) => l.ch === c.id).sort((a, b) => byLesson(a.id, b.id)).map((l) => ({ ...l, body: lessonBody(l.html) })),
}));
const flat = chapters.flatMap((c) => c.lessons.map((l) => ({ ...l, chN: c.n })));

// Reading plan: DAYS contiguous runs of lessons with about the same number of words.
function readingPlan() {
  const w = flat.map((l) => words(l.body));
  const total = w.reduce((a, b) => a + b, 0);
  const cuts = [0]; let acc = 0;
  w.forEach((x, i) => {
    const target = (total * cuts.length) / DAYS;
    if (cuts.length < DAYS && acc + x >= target) cuts.push(target - acc < acc + x - target && i > cuts.at(-1) ? i : i + 1); // nearer boundary
    acc += x;
  });
  cuts.push(flat.length);
  return { plan: cuts.slice(0, -1).map((c, k) => flat.slice(c, cuts[k + 1])).filter((d) => d.length), total };
}

const BACK = [
  { id: "numbers", title: "Every number and deadline" },
  { id: "formulas", title: "Math formulas and calculation patterns" },
  { id: "portugal", title: "Portugal vs Florida: the traps your experience sets" },
  { id: "tactics", title: "Exam-day tactics" },
  { id: "glossary", title: "Glossary" },
  { id: "sources", title: "Sources and limits of this summary" },
];

function extrasById() {
  const md = readFileSync(join(ROOT, "print", "extras.md"), "utf8");
  const r = spawnSync("pandoc", ["-f", "markdown-tex_math_dollars-smart", "-t", "html5", "--wrap=none"], { input: md, encoding: "utf8" });
  if (r.status !== 0) throw new Error("pandoc failed: " + r.stderr);
  const out = {};
  for (const part of r.stdout.split(/(?=<h1 )/)) {
    const m = part.match(/^<h1 id="([^"]+)">[^<]*<\/h1>/);
    if (m) out[m[1]] = part.slice(m[0].length).replace(/<h2 id="[^"]*">/g, "<h3>").replace(/<\/h2>/g, "</h3>");
  }
  for (const b of BACK) if (!["numbers", "glossary"].includes(b.id) && !out[b.id]) throw new Error(`print/extras.md lacks # … {#${b.id}}`);
  return out;
}

function numbersTable() {
  const order = new Map(flat.map((l, i) => [l.id, i]));
  const rows = [...data.numbers].sort((a, b) => (order.get(a.l) ?? 999) - (order.get(b.l) ?? 999));
  let lastCh = null; const tr = [];
  for (const n of rows) {
    const ch = flat.find((l) => l.id === n.l)?.chN;
    if (ch !== lastCh) { tr.push(`<tr class="group"><td colspan="4">Section ${ch} · ${esc(chapters.find((c) => c.n === ch)?.title)}</td></tr>`); lastCh = ch; }
    const watch = [n.cond, n.exc].filter(Boolean).map(esc).join(" ");
    tr.push(`<tr><td><b>${esc(n.s)}</b></td><td>${esc(n.val)}${n.aid ? `<div class="aid">${esc(n.aid)}</div>` : ""}</td><td>${watch}</td><td class="ref">${esc(n.l)}${n.v ? `<br>${esc(n.v)}` : ""}</td></tr>`);
  }
  return `<p>All ${rows.length} numbers, deadlines and amounts in the course, in section order. Read this table every day of the last week.</p>
<table class="numbers"><thead><tr><th>What</th><th>The rule</th><th>Conditions and traps</th><th>Ref</th></tr></thead><tbody>${tr.join("")}</tbody></table>`;
}

function glossary() {
  const chOf = new Map(flat.map((l) => [l.id, l.chN]));
  const groups = new Map();
  for (const g of data.glossary) { const ch = chOf.get(g.l) ?? 0; if (!groups.has(ch)) groups.set(ch, []); groups.get(ch).push(g); }
  return `<p>The ${data.glossary.length} key terms of the course, grouped by section. Exam questions often turn on the exact meaning of one of these words.</p>` +
    [...groups.keys()].sort((a, b) => a - b).map((ch) => `<h3>Section ${ch} · ${esc(chapters.find((c) => c.n === ch)?.title)}</h3><dl class="gloss">${groups.get(ch).map((g) => `<div><dt>${esc(g.term)}</dt><dd>${esc(g.def)}${g.note ? ` <i>${esc(g.note)}</i>` : ""}</dd></div>`).join("")}</dl>`).join("");
}

function weights() {
  const sorted = [...chapters].sort((a, b) => b.examPct - a.examPct || a.n - b.n);
  const big = sorted.filter((c) => c.examPct >= 7), bigSum = big.reduce((s, c) => s + c.examPct, 0);
  const rows = chapters.map((c) => `<tr class="${c.examPct >= 7 ? "big" : ""}"><td>${c.n}</td><td>${esc(c.title)}</td><td class="num">${c.examPct}%</td><td class="barcell"><span class="bar" style="width:${c.examPct * 8}%"></span></td></tr>`).join("");
  return `<p><b>${big.length} sections carry ${bigSum} of the 100 questions</b>: ${big.sort((a, b) => a.n - b.n).map((c) => c.n).join(", ")} (marked ★ in the contents). Give them your best attention, but read everything: the other sections still hold ${100 - bigSum} questions.</p>
<table class="weights"><thead><tr><th>#</th><th>Official section</th><th>Weight</th><th></th></tr></thead><tbody>${rows}</tbody></table>
<p class="small">Source: DBPR Candidate Information Booklet, Real Estate Sales Associate Examination, effective January 2025, content outline (V-02).</p>`;
}

const readTime = (w) => { const min = w / 130; return min >= 60 ? `${String(Math.round(min / 30) / 2).replace(".5", "½")} h` : `${Math.round(min)} min`; };

function html(pages = {}) {
  const pg = (k) => pages[k] ?? "00";
  const { plan, total } = readingPlan();
  const extras = extrasById();
  const bigCh = new Set(chapters.filter((c) => c.examPct >= 7).map((c) => c.n));
  const toc = [
    ...chapters.flatMap((c) => [
      `<div class="toc-row ch"><span>${bigCh.has(c.n) ? "★ " : ""}Section ${c.n} · ${esc(c.title)} <span class="pct">${c.examPct}%</span></span><span class="dots"></span><span>${pg("ch" + c.n)}</span></div>`,
      ...c.lessons.map((l) => `<div class="toc-row"><span>${esc(l.id)} · ${esc(l.title)}</span><span class="dots"></span><span>${pg(l.id)}</span></div>`),
    ]),
    ...BACK.map((b) => `<div class="toc-row ch"><span>${esc(b.title)}</span><span class="dots"></span><span>${pg(b.id)}</span></div>`),
  ].join("");
  const planRows = plan.map((d, i) => {
    const a = d[0], z = d.at(-1), w = d.reduce((s, l) => s + words(l.body), 0);
    const secs = a.chN === z.chN ? `Section ${a.chN}` : `Sections ${a.chN}–${z.chN}`;
    const next = plan[i + 1]?.[0];
    const from = pg(a.id), to = next ? (pages[next.id] ? pages[next.id] - 1 : "00") : (pages.numbers ? pages.numbers - 1 : "00");
    return `<tr><td><b>Day ${i + 1}</b></td><td>${secs}: ${esc(a.id)} → ${esc(z.id)} (${d.length} lessons)</td><td class="num">pp. ${from}–${to}</td><td class="num">${readTime(w)}</td></tr>`;
  }).join("");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${TITLE}</title><style>${readFileSync(join(ROOT, "print", "print.css"), "utf8")}</style></head><body>
<section class="cover">
  <div class="kicker">Florida Real Estate Sales Associate Exam</div>
  <h1>Complete Study Summary</h1>
  <p class="sub">All 19 official exam sections · ${flat.length} lessons · every number, formula and trap</p>
  <ul class="facts"><li><b>100</b> questions</li><li><b>3 h 30</b>to answer</li><li><b>75</b> correct to pass</li></ul>
  <p class="note">Built from the verified lessons of your study app. Rules checked against official Florida and federal sources on ${esc(data.meta.checkedOn)}. Written in our own words; not a copy of any textbook.</p>
</section>

<section class="front">
<h2>How to use this summary</h2>
<ol class="how">
  <li><b>Read with a pen and three highlighters.</b> <span class="hl y">Yellow</span> for the rule itself. <span class="hl o">Orange or pink</span> for every number, deadline, percentage and amount. <span class="hl g">Green</span> for traps: the wrong idea the exam wants you to pick.</li>
  <li><b>Highlight little.</b> One or two lines a paragraph. If everything is yellow, nothing stands out when you review.</li>
  <li><b>Write in the margins.</b> A "?" next to anything you don't understand; ask in the study app's chat or here. A "!" next to anything that surprised you: surprises are what you forget.</li>
  <li><b>End every lesson with its memory sheet</b> (the boxed list). Cover it, say the points aloud, then check. Remembering without looking is what fixes a fact; re-reading alone doesn't.</li>
  <li><b>End every day</b> by re-reading the memory sheets of that day's lessons (10 minutes).</li>
  <li><b>Labels:</b> <i>V-nn</i> = checked against an official source (list in the app). <i>Manual; not yet verified</i> = from the study manual only. <i>L04-1</i> = the lesson in the app with the full version, examples and quiz.</li>
</ol>

<h2>The 10-day plan</h2>
<p>Seven reading days split this summary into equal parts (about ${Math.round(total / 1000)},000 words, at a careful reading pace with highlighting). Then three days of practice.</p>
<table class="plan"><thead><tr><th>Day</th><th>Read</th><th>Pages</th><th>Reading time</th></tr></thead><tbody>${planRows}
<tr><td><b>Day 8</b></td><td colspan="3">Practice exam A, timed (100 questions, 3 h 30, one sitting). Correct it with the key, then re-read the lesson of every question you missed.</td></tr>
<tr><td><b>Day 9</b></td><td colspan="3">Practice exam B, same routine. Then the numbers table and the formula pages.</td></tr>
<tr><td><b>Day 10</b></td><td colspan="3">Weakness training and mixed quizzes in the app; the memory sheets you marked "!". Stop early and sleep.</td></tr>
</tbody></table>
<p class="small">Reading times assume about 130 words a minute with highlighting; add time for the memory-sheet recall and the calculation practice in Section 14.</p>

<h2 class="glance">The exam at a glance</h2>
<p><b>100 multiple-choice questions, 3 hours 30 minutes, 75 correct answers to pass</b> (V-01): about 2 minutes a question. Some unscored pilot questions may be included; you cannot tell which, so answer every question as if it counts (V-80). Answer with Florida law as it stands now.</p>
${weights()}
</section>

<section class="toc"><h2>Contents</h2>${toc}</section>

${chapters.map((c) => `<section class="chapter">
<header class="ch-head"><div class="ch-kicker">Official exam section ${c.n} of 19</div><h1>Section ${c.n} · ${esc(c.title)}</h1>
<p class="ch-meta">${c.examPct}% of the exam · about ${c.examPct} of the 100 questions · ${c.lessons.length} lesson${c.lessons.length === 1 ? "" : "s"}${bigCh.has(c.n) ? " · ★ high-weight section" : ""}</p>
<ul class="ch-lessons">${c.lessons.map((l) => `<li>${esc(l.id)} · ${esc(l.title)}</li>`).join("")}</ul></header>
${c.lessons.map((l) => `<article class="lesson"><h2 class="l-title">${esc(l.id)} · ${esc(l.title)}</h2>
<p class="l-meta">${l.pri === "high" ? "High priority" : l.pri === "medium" ? "Medium priority" : "Low priority"} · ${esc(l.type)} lesson</p>
${l.body}</article>`).join("\n")}
</section>`).join("\n")}

${BACK.map((b) => `<section class="back" id="${b.id}"><h1>${esc(b.title)}</h1>${b.id === "numbers" ? numbersTable() : b.id === "glossary" ? glossary() : extras[b.id]}</section>`).join("\n")}
</body></html>`;
}

// Page of the last occurrence of each marker (the contents list them first).
function findPages(pdf) {
  const pages = execFileSync("pdftotext", [pdf, "-"], { maxBuffer: 1 << 28 }).toString().split("\f");
  const flatText = pages.map((p) => p.replace(/\s+/g, " ").toLowerCase());
  const last = (needle) => { for (let i = flatText.length - 1; i >= 0; i--) if (flatText[i].includes(needle.toLowerCase())) return i + 1; return null; };
  const out = {};
  for (const c of chapters) out["ch" + c.n] = last(`Official exam section ${c.n} of 19`);
  for (const l of flat) out[l.id] = last(`${l.id} · `);
  for (const b of BACK) out[b.id] = last(b.title.slice(0, 28));
  const missing = Object.entries(out).filter(([, v]) => !v).map(([k]) => k);
  if (missing.length) throw new Error("markers not found in PDF: " + missing.join(", "));
  return { out, count: pages.length - (pages.at(-1).trim() ? 0 : 1) };
}

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  const footer = `<div style="width:100%;font:8px Inter,sans-serif;color:#777;text-align:center;">${TITLE} · <span class="pageNumber"></span> / <span class="totalPages"></span></div>`;
  const render = async (doc, format, path) => {
    await page.setContent(doc, { waitUntil: "load" });
    await page.pdf({ path, format, printBackground: true, displayHeaderFooter: true, headerTemplate: "<div></div>", footerTemplate: footer, margin: { top: "16mm", bottom: "17mm", left: "19mm", right: "17mm" } });
  };
  for (const format of formats) {
    const pdf = join(OUT, `florida-summary-${format}.pdf`);
    await render(html(), format, pdf);
    const first = findPages(pdf);
    const doc = html(first.out);
    await render(doc, format, pdf);
    const second = findPages(pdf);
    const moved = Object.keys(first.out).filter((k) => first.out[k] !== second.out[k]);
    if (moved.length) throw new Error(`page numbers moved on the second pass (${moved.slice(0, 5).join(", ")}); rerun`);
    if (format === formats[0]) writeFileSync(join(OUT, "summary.html"), doc);
    // Page of every section, lesson and back-matter part, plus the reading days, for plan builders.
    writeFileSync(join(OUT, `pages-${format}.json`), JSON.stringify({ pages: second.out, count: second.count, days: readingPlan().plan.map((d) => d.map((l) => l.id)) }, null, 1));
    console.log(`${format}: ${second.count} pages → ${pdf}`);
  }
} finally {
  await browser.close();
}
