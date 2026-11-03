// Two printable 100-question practice exams with no question in common, each weighted by the
// official content outline as far as the bank allows, plus answer sheets and answer keys
// (keys at the back). Rendered to PDF with the globally installed Playwright.
//
//   node scripts/print_exams.mjs [--format A4|Letter|both] [--seed 13]   (run node scripts/build.mjs first)
//
// Writes dist/print/practice-exams.html and dist/print/florida-practice-exams-<format>.pdf.
import { createRequire } from "node:module";
import { execSync } from "node:child_process";
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
const SIZE = 100, LETTERS = "ABCD";

// Seeded RNG so the same seed always prints the same exams.
let seed = Number(arg("--seed", 13)) >>> 0;
const rnd = () => { seed = (seed + 0x6d2b79f5) >>> 0; let t = seed; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const shuffle = (a) => { a = [...a]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

const chOf = new Map(data.lessons.map((l) => [l.id, l.ch]));
const chapter = new Map(data.chapters.map((c) => [c.id, c]));

// Split each section's questions in two (mixing question types evenly), then give each exam
// its official share of the section, topping up from the sections that still have questions.
function buildExams() {
  const halves = [new Map(), new Map()];
  for (const c of data.chapters) {
    const qs = shuffle(data.questions.filter((q) => chOf.get(q.l) === c.id)).sort((a, b) => a.t.localeCompare(b.t));
    halves[0].set(c.id, qs.filter((_, i) => i % 2 === 0));
    halves[1].set(c.id, qs.filter((_, i) => i % 2 === 1));
  }
  return halves.map((half) => {
    const take = new Map(data.chapters.map((c) => [c.id, Math.min(c.examPct, half.get(c.id).length)]));
    let n = [...take.values()].reduce((s, x) => s + x, 0);
    while (n < SIZE) {
      const open = data.chapters.filter((c) => half.get(c.id).length > take.get(c.id));
      if (!open.length) throw new Error("not enough questions for two exams");
      // most short of its official share first, then the heavier section
      const c = open.sort((a, b) => (take.get(a.id) - a.examPct) - (take.get(b.id) - b.examPct) || b.examPct - a.examPct)[0];
      take.set(c.id, take.get(c.id) + 1); n++;
    }
    const picked = data.chapters.flatMap((c) => half.get(c.id).slice(0, take.get(c.id)));
    // Balance the position of the correct letter: an even share of A–D across the multiple-choice items.
    const mc = picked.filter((q) => q.c?.length === 4);
    const slots = shuffle(Array.from({ length: mc.length }, (_, i) => i % 4));
    const orders = new Map(mc.map((q, i) => {
      const wrong = shuffle([0, 1, 2, 3].filter((x) => x !== q.a));
      wrong.splice(slots[i], 0, q.a);
      return [q.id, wrong];
    }));
    return { questions: shuffle(picked), orders, take };
  });
}

const unitBlank = (q) => (q.unit === "$" ? "$ ____________" : `____________ ${esc(q.unit)}`);
const fmtNum = (q) => (q.unit === "$" ? "$" + Number(q.ans).toLocaleString("en-US", { minimumFractionDigits: Number.isInteger(q.ans) ? 0 : 2, maximumFractionDigits: 2 }) : `${Number(q.ans).toLocaleString("en-US")} ${q.unit}`);

function examHtml(name, ex) {
  const items = ex.questions.map((q, i) => {
    const body = q.c?.length
      ? `<ol class="choices">${ex.orders.get(q.id).map((ci, k) => `<li><b>${LETTERS[k]}.</b> ${esc(q.c[ci])}</li>`).join("")}</ol>`
      : `<p class="blank">Answer: ${unitBlank(q)}</p>`;
    return `<div class="q"><p><b>${i + 1}.</b> ${esc(q.q)}</p>${body}</div>`;
  }).join("");
  const sheet = ex.questions.map((q, i) => `<div class="sh"><b>${i + 1}</b>${q.c?.length ? LETTERS.split("").map((l) => `<span class="bub">${l}</span>`).join("") : `<span class="line"></span>`}</div>`).join("");
  return `<section class="exam"><header class="ex-head"><div class="kicker">Practice exam ${name}</div><h1>Practice Exam ${name}</h1>
<p>100 questions · 3 hours 30 minutes · one sitting, no notes, no summary, no phone. Mark your answers on the answer sheet after the questions (or circle them here). Start the clock now.</p></header>
<div class="qs">${items}</div></section>
<section class="sheet"><h2>Practice Exam ${name} · Answer sheet</h2><p class="small">Fill in one letter per question; write numbers for the calculation questions. Name: ______________________ Date: __________ Time used: ________</p><div class="grid">${sheet}</div></section>`;
}

function keyHtml(name, ex) {
  const rows = ex.questions.map((q, i) => {
    const lesson = data.lessons.find((l) => l.id === q.l);
    const ans = q.c?.length ? `<b class="letter">${LETTERS[ex.orders.get(q.id).indexOf(q.a)]}</b> ${esc(q.c[q.a])}` : `<b class="letter">${esc(fmtNum(q))}</b>`;
    const steps = q.steps?.length ? `<div class="steps">${q.steps.map(esc).join(" → ")}</div>` : "";
    return `<div class="k"><div class="kn">${i + 1}</div><div><p>${ans}</p><p class="why">${esc(q.ex)}</p>${steps}<p class="ref">Review: ${esc(q.l)} · ${esc(lesson?.title)}${q.v ? ` · ${esc(q.v)}` : ""}</p></div></div>`;
  }).join("");
  const bySec = data.chapters.filter((c) => ex.take.get(c.id)).map((c) => `<tr><td>${c.n}</td><td>${esc(c.title)}</td><td class="num">${ex.take.get(c.id)}</td><td class="num">${c.examPct}</td><td></td></tr>`).join("");
  return `<section class="key"><h1>Answer key · Practice Exam ${name}</h1>
<p>Mark each answer right or wrong, then count your score per section in the table. For every miss, read the explanation, then re-read that lesson in the summary (find it in the contents by its number).</p>
<table class="score"><thead><tr><th>#</th><th>Section</th><th class="num">Questions here</th><th class="num">Official share</th><th>Your correct</th></tr></thead><tbody>${bySec}<tr class="tot"><td></td><td><b>Total</b> (75 needed on the real exam)</td><td class="num"><b>${SIZE}</b></td><td class="num">100</td><td></td></tr></tbody></table>
<div class="keys">${rows}</div></section>`;
}

const CSS = `
:root { --ink:#151515; --muted:#5b5b5b; --rule:#b9b9b9; --soft:#f1f1ef; --accent:#1d4e89; }
* { box-sizing: border-box; } html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body { margin:0; color:var(--ink); font:10.3pt/1.42 "Bitstream Charter","DejaVu Serif",serif; }
h1,h2,.kicker,th,.small,.ref,.sh,.kn,.letter { font-family: Inter,"DejaVu Sans",sans-serif; }
h1 { font-size:20pt; margin:4pt 0 6pt; } h2 { font-size:14pt; margin:0 0 4pt; color:var(--accent); }
.kicker { font-size:9pt; letter-spacing:.08em; text-transform:uppercase; color:var(--accent); font-weight:600; }
p { margin:0 0 5pt; } .small { font-size:8.5pt; color:var(--muted); }
.cover { height:230mm; display:flex; flex-direction:column; justify-content:center; break-after:page; }
.cover h1 { font-size:32pt; } .cover ol li { margin-bottom:5pt; } .cover .note { color:var(--muted); font-size:9.5pt; max-width:140mm; }
.exam, .sheet, .key { break-before:page; }
.ex-head { border-bottom:2pt solid var(--accent); margin-bottom:8pt; padding-bottom:4pt; }
.q { break-inside:avoid; margin:0 0 9pt; }
.choices { list-style:none; margin:2pt 0 0; padding-left:16pt; } .choices li { margin-bottom:1.5pt; }
.blank { padding-left:16pt; margin-top:4pt; font-family:Inter,sans-serif; }
.grid { columns:4; column-gap:10pt; font-size:9.5pt; margin-top:6pt; }
.sh { display:flex; align-items:center; gap:5pt; height:17pt; break-inside:avoid; } .sh b { width:20pt; text-align:right; }
.bub { display:inline-flex; width:12.5pt; height:12.5pt; border:0.8pt solid #777; border-radius:50%; font-size:7pt; align-items:center; justify-content:center; color:#777; }
.line { display:inline-block; width:62pt; border-bottom:0.8pt solid #777; height:11pt; }
.key h1 { border-bottom:2pt solid var(--accent); padding-bottom:4pt; }
table { width:100%; border-collapse:collapse; font-size:8.8pt; margin:4pt 0 10pt; } th,td { border:0.5pt solid var(--rule); padding:2pt 5pt; text-align:left; }
th { background:#e6e6e3; } .num { text-align:right; } .score td:last-child { width:22%; } .score tr { break-inside:avoid; }
.k { display:flex; gap:7pt; break-inside:avoid; border-top:0.5pt solid var(--rule); padding:4pt 0 3pt; font-size:9.2pt; line-height:1.36; }
.kn { width:20pt; flex:none; font-weight:700; text-align:right; } .k p { margin:0 0 2pt; }
.letter { color:var(--accent); margin-right:3pt; } .why { color:#2a2a2a; } .steps { font-size:8.6pt; color:var(--muted); margin-bottom:2pt; }
.ref { font-size:7.8pt; color:var(--muted); }`;

function html(exams) {
  const names = ["A", "B"];
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Florida Sales Associate · Practice Exams</title><style>${CSS}</style></head><body>
<section class="cover"><div class="kicker">Florida Real Estate Sales Associate Exam</div><h1>Practice Exams A and B</h1>
<p>Two exams of 100 questions each, with no question in common. Each follows the official section weights as closely as the question bank allows.</p>
<ol>
  <li><b>Do one exam per day, timed:</b> 3 hours 30 minutes in one sitting, like the real exam. No summary, notes or phone. Use a basic calculator.</li>
  <li><b>Don't look at the answer keys</b> (the last pages) until you have finished.</li>
  <li><b>Score it with the key.</b> The real exam needs 75 of 100. Fill in the score-by-section table: it shows where your points are leaking.</li>
  <li><b>Fix every miss the same day.</b> Read the explanation, then re-read that lesson in the summary. Write the rule you missed in one line on a separate sheet, and read those lines again the day before the exam.</li>
  <li><b>Calculation questions</b> have no choices here: work them out and write the number. On the real exam every question is multiple choice.</li>
</ol>
<p class="note">These are original practice questions written for this course from the verified lessons, not official exam questions. The study app uses the same question bank, so if you practised there first, some questions will be familiar. A practice score is a guide, not a promise of the real result.</p></section>
${exams.map((e, i) => examHtml(names[i], e)).join("\n")}
${exams.map((e, i) => keyHtml(names[i], e)).join("\n")}
</body></html>`;
}

const exams = buildExams();
const ids = exams.map((e) => new Set(e.questions.map((q) => q.id)));
if (exams.some((e) => e.questions.length !== SIZE) || [...ids[0]].some((id) => ids[1].has(id))) throw new Error("exam build failed");
for (const [i, e] of exams.entries()) console.log(`Exam ${"AB"[i]}: ` + data.chapters.map((c) => `${c.n}:${e.take.get(c.id)}/${c.examPct}`).join(" "));
const doc = html(exams);
mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, "practice-exams.html"), doc);
const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  await page.setContent(doc, { waitUntil: "load" });
  const footer = `<div style="width:100%;font:8px Inter,sans-serif;color:#777;text-align:center;">Florida Sales Associate · Practice Exams · <span class="pageNumber"></span> / <span class="totalPages"></span></div>`;
  for (const format of formats) {
    const path = join(OUT, `florida-practice-exams-${format}.pdf`);
    await page.pdf({ path, format, printBackground: true, displayHeaderFooter: true, headerTemplate: "<div></div>", footerTemplate: footer, margin: { top: "15mm", bottom: "16mm", left: "18mm", right: "16mm" } });
    console.log(`${format} → ${path}`);
  }
} finally {
  await browser.close();
}
