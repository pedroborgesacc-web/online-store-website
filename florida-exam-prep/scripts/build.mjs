// Build: validate all curriculum data, re-check every numeric answer with an
// independent expression, convert lessons (Markdown → HTML via pandoc),
// derive flashcards, generate the Markdown knowledge-base documents, and
// bundle everything into one self-contained HTML app.
//
//   node scripts/build.mjs          build + validate (fails on errors)
//   node scripts/build.mjs --check  validate only
//   node scripts/build.mjs --plan <file> --out <dir>
//                                   also build a personal copy with a study plan
//
// A personal study plan (exam date, daily time, lessons per day) is kept out of
// this public repository: if personal/plan.json exists (git-ignored), the build
// also writes dist/personal/artifact.html and dist/personal/study-app.html with
// the plan embedded. The public outputs in dist/ never contain a plan.

import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { chapters, lessons as lessonDefs, manualCoverage } from "../data/curriculum.mjs";
import { verification, CHECKED_ON } from "../data/verification.mjs";
import { numbers } from "../data/numbers.mjs";
import { comparisons } from "../data/comparisons.mjs";
import { glossary } from "../data/glossary.mjs";
import { flashcards as handCards } from "../data/flashcards.mjs";
import { questions as qa } from "../data/questions_law_a.mjs";
import { questions as qb } from "../data/questions_law_b.mjs";
import { questions as qp } from "../data/questions_property.mjs";
import { questions as qf } from "../data/questions_finance.mjs";
import { questions as qv } from "../data/questions_valuation.mjs";
import { questions as qx } from "../data/questions_extra.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CHECK_ONLY = process.argv.includes("--check");
const argOf = (name) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : null; };
const PLAN_FILE = argOf("--plan") || (existsSync(join(ROOT, "personal", "plan.json")) ? join(ROOT, "personal", "plan.json") : null);
const PLAN_OUT = argOf("--out") || join(ROOT, "dist", "personal");
const errors = [];
const warnings = [];
const err = (m) => errors.push(m);
const warn = (m) => warnings.push(m);

// ── Index ─────────────────────────────────────────────────────────────
const questions = [...qa, ...qb, ...qp, ...qf, ...qv, ...qx];
const chapterById = new Map(chapters.map((c) => [c.id, c]));
const lessonById = new Map(lessonDefs.map((l) => [l.id, l]));
const vById = new Map(verification.map((v) => [v.id, v]));
const numById = new Map(numbers.map((n) => [n.id, n]));

function uniq(list, label) {
  const seen = new Set();
  for (const x of list) {
    if (seen.has(x.id)) err(`${label}: duplicate id ${x.id}`);
    seen.add(x.id);
  }
}
uniq(chapters, "chapter");
uniq(lessonDefs, "lesson");
uniq(verification, "verification");
uniq(numbers, "number");
uniq(comparisons, "comparison");
uniq(questions, "question");
uniq(handCards, "flashcard");

// ── Curriculum checks ─────────────────────────────────────────────────
for (const l of lessonDefs) {
  if (!chapterById.has(l.ch)) err(`${l.id}: unknown chapter ${l.ch}`);
  for (const p of l.pre) if (!lessonById.has(p)) err(`${l.id}: unknown prerequisite ${p}`);
  if (!l.o.length) err(`${l.id}: no objectives`);
}
for (const c of chapters) {
  if (!lessonDefs.some((l) => l.ch === c.id)) err(`${c.id}: chapter has no lessons`);
}
// prerequisite cycle check (topological order)
const order = [];
{
  const state = new Map();
  const visit = (id, path) => {
    if (state.get(id) === 2) return;
    if (state.get(id) === 1) { err(`prerequisite cycle: ${[...path, id].join(" → ")}`); return; }
    state.set(id, 1);
    for (const p of lessonById.get(id)?.pre || []) visit(p, [...path, id]);
    state.set(id, 2);
    order.push(id);
  };
  for (const l of lessonDefs) visit(l.id, []);
}

// objectives get stable ids: O-<lesson>-<n>
const objectives = [];
for (const l of lessonDefs) {
  l.o.forEach(([kind, text], i) => objectives.push({ id: `O-${l.id}-${i + 1}`, l: l.id, kind, text }));
}

// ── Lessons: markdown → html ──────────────────────────────────────────
const lessonContent = new Map();
for (const file of readdirSync(join(ROOT, "lessons")).filter((f) => f.endsWith(".md")).sort()) {
  const src = readFileSync(join(ROOT, "lessons", file), "utf8");
  const parts = src.split(/<!--\s*lesson:\s*([A-Z0-9-]+)\s*\|\s*content:\s*(full|core)\s*-->/);
  for (let i = 1; i < parts.length; i += 3) {
    const id = parts[i], status = parts[i + 1], md = parts[i + 2].trim();
    if (!lessonById.has(id)) { err(`${file}: lesson ${id} not in curriculum`); continue; }
    if (lessonContent.has(id)) err(`${file}: lesson ${id} defined twice`);
    const r = spawnSync("pandoc", ["-f", "gfm-tex_math_dollars", "-t", "html5", "--wrap=none"], { input: md, encoding: "utf8" });
    if (r.status !== 0) { err(`${id}: pandoc failed: ${r.stderr}`); continue; }
    lessonContent.set(id, { status, html: r.stdout, md });
    if (/class="math/.test(r.stdout)) err(`${id}: Markdown produced TeX math (check $ signs)`);
    if (status === "full") {
      for (const h of ["## 2.", "## 3.", "## 4.", "## 5.", "## 6.", "## 7.", "## 8.", "## 9.", "## 10."]) {
        if (!md.includes(h)) err(`${id}: full lesson missing section "${h}"`);
      }
    } else {
      for (const h of ["## 3.", "## 10."]) if (!md.includes(h)) err(`${id}: core lesson missing section "${h}"`);
    }
  }
}
for (const l of lessonDefs) if (!lessonContent.has(l.id)) err(`${l.id}: no lesson content`);

// ── Verification / numbers / glossary / comparisons ───────────────────
for (const n of numbers) {
  if (!lessonById.has(n.l)) err(`${n.id}: unknown lesson ${n.l}`);
  if (!vById.has(n.v)) err(`${n.id}: unknown verification ${n.v}`);
  for (const c of n.conf) if (!numById.has(c)) err(`${n.id}: unknown confusable ${c}`);
}
for (const [term, def, l] of glossary) {
  if (!lessonById.has(l)) err(`glossary "${term}": unknown lesson ${l}`);
  if (!def) err(`glossary "${term}": empty definition`);
}
for (const c of comparisons) {
  for (const l of c.l) if (!lessonById.has(l)) err(`${c.id}: unknown lesson ${l}`);
  for (const f of ["concept", "pt", "fl", "diff", "ex", "exam", "aid", "pq", "pa", "ptv"]) if (!c[f]) err(`${c.id}: missing ${f}`);
}

// ── Questions ─────────────────────────────────────────────────────────
const CATS = new Set(["RULE", "CONFUSED", "PT", "MISREAD", "QUALIFIER", "NUMBER", "FORMULA", "ARITH", "UNITS"]);
const answerPos = [0, 0, 0, 0];
let longestCorrect = 0, mcqCount = 0;
for (const q of questions) {
  const l = lessonById.get(q.l);
  if (!l) { err(`${q.id}: unknown lesson ${q.l}`); continue; }
  if (!(q.o >= 0 && q.o < l.o.length)) err(`${q.id}: objective index ${q.o} out of range for ${q.l}`);
  if (![1, 2, 3].includes(q.d)) err(`${q.id}: bad difficulty`);
  if (!q.q) err(`${q.id}: empty stem`);
  for (const n of q.num || []) if (!numById.has(n)) err(`${q.id}: unknown number ${n}`);
  if (q.v && !vById.has(q.v)) err(`${q.id}: unknown verification ${q.v}`);
  if (q.t === "mcq" || q.t === "scn") {
    mcqCount++;
    if (!Array.isArray(q.c) || q.c.length !== 4) err(`${q.id}: needs exactly 4 choices`);
    if (!(q.a >= 0 && q.a < 4)) err(`${q.id}: bad answer index`);
    answerPos[q.a]++;
    if (new Set(q.c).size !== q.c.length) err(`${q.id}: duplicate choices`);
    // length leak: correct choice noticeably longer (≥ 1.25×) than every distractor
    const lens = q.c.map((s) => s.length);
    const maxOther = Math.max(...lens.filter((_, i) => i !== q.a));
    if (lens[q.a] >= 1.25 * maxOther) { longestCorrect++; warn(`${q.id}: correct choice is ${(lens[q.a] / maxOther).toFixed(2)}× longer than any distractor`); }
    for (const [k, v] of Object.entries(q.w || {})) {
      const i = Number(k);
      if (i === q.a) err(`${q.id}: misconception attached to the correct answer`);
      if (!(i >= 0 && i < 4)) err(`${q.id}: misconception index ${k} out of range`);
      if (!CATS.has(v[0])) err(`${q.id}: unknown error category ${v[0]}`);
    }
    for (let i = 0; i < 4; i++) if (i !== q.a && !(q.w || {})[i]) warn(`${q.id}: no explanation for wrong choice ${i}`);
    if (!q.ex) err(`${q.id}: no explanation`);
  } else if (q.t === "num") {
    if (typeof q.ans !== "number") err(`${q.id}: numeric answer missing`);
    if (typeof q.tol !== "number") err(`${q.id}: tolerance missing`);
    if (!q.steps?.length) err(`${q.id}: no solution steps`);
    if (q.calc) {
      // second-method verification of the answer key
      const v = Function(`"use strict"; return (${q.calc});`)();
      if (Math.abs(v - q.ans) > Math.max(q.tol, 0.005)) err(`${q.id}: answer key ${q.ans} disagrees with independent calc ${v}`);
    } else {
      warn(`${q.id}: numeric question without independent calc expression`);
    }
  } else err(`${q.id}: unknown type ${q.t}`);
}
const longPct = mcqCount ? longestCorrect / mcqCount : 0;
if (longPct > 0.05) warn(`length-leak risk in ${(longPct * 100).toFixed(0)}% of MCQs`);

// coverage of objectives by questions
const qByObj = new Map();
for (const q of questions) {
  const k = `O-${q.l}-${q.o + 1}`;
  qByObj.set(k, (qByObj.get(k) || 0) + 1);
}
const uncoveredObjectives = objectives.filter((o) => !qByObj.has(o.id)).map((o) => o.id);
for (const l of lessonDefs) {
  const n = questions.filter((q) => q.l === l.id).length;
  if (n < 2) warn(`${l.id}: only ${n} question(s)`);
}

// ── Flashcards: hand-written + derived ────────────────────────────────
for (const f of handCards) if (!lessonById.has(f.l)) err(`${f.id}: unknown lesson ${f.l}`);
const derivedCards = [
  ...numbers.map((n) => ({
    id: `F-${n.id}`, l: n.l, t: "number", src: n.id,
    f: `${n.s} — state the exact rule.`,
    b: [n.val, n.cond && `Conditions: ${n.cond}`, n.exc && `Qualifications: ${n.exc}`].filter(Boolean).join("\n"),
  })),
  ...glossary.map(([term, def, l, note], i) => ({
    id: `F-G${String(i + 1).padStart(3, "0")}`, l, t: "term-def",
    f: `Define: ${term}`, b: def + (note ? `\nNote: ${note}` : ""),
  })),
  ...comparisons.map((c) => ({ id: `F-${c.id}`, l: c.l[0], t: "pt-fl", src: c.id, f: c.pq, b: c.pa })),
];
const flashcards = [...handCards, ...derivedCards];
uniq(flashcards, "flashcard (all)");

// ── Report ────────────────────────────────────────────────────────────
const summary = {
  chapters: chapters.length,
  lessons: lessonDefs.length,
  lessonsFull: [...lessonContent.values()].filter((x) => x.status === "full").length,
  objectives: objectives.length,
  objectivesWithoutQuestions: uncoveredObjectives.length,
  questions: questions.length,
  numeric: questions.filter((q) => q.t === "num").length,
  flashcards: flashcards.length,
  numbers: numbers.length,
  glossary: glossary.length,
  comparisons: comparisons.length,
  verification: verification.length,
  answerPositions: answerPos,
  lengthLeakPct: Math.round(longPct * 100),
};
// ── Personal study plan (optional, never committed) ──────────────────
let plan = null;
if (PLAN_FILE) {
  try { plan = JSON.parse(readFileSync(PLAN_FILE, "utf8")); } catch (e) { err(`plan: cannot read ${PLAN_FILE}: ${e.message}`); }
  if (plan) {
    const isDate = (d) => /^\d{4}-\d{2}-\d{2}$/.test(d || "");
    if (!isDate(plan.examDate)) err("plan: examDate must be YYYY-MM-DD");
    if (!Array.isArray(plan.days) || !plan.days.length) err("plan: days missing");
    const seen = new Map();
    let prev = "";
    (plan.days || []).forEach((d, i) => {
      if (!isDate(d.date)) err(`plan: day ${i} has no valid date`);
      if (d.date <= prev) err(`plan: day ${d.date} is out of order`);
      prev = d.date;
      for (const id of d.lessons || []) {
        if (!lessonById.has(id)) err(`plan: ${d.date}: unknown lesson ${id}`);
        if (seen.has(id)) err(`plan: ${id} scheduled twice (${seen.get(id)} and ${d.date})`);
        seen.set(id, d.date);
      }
    });
    for (const id of plan.fast || []) if (!lessonById.has(id)) err(`plan: unknown fast lesson ${id}`);
    for (const l of lessonDefs) {
      if (!seen.has(l.id)) warn(`plan: ${l.id} is not scheduled`);
      for (const p of l.pre) if (seen.has(l.id) && seen.has(p) && seen.get(p) > seen.get(l.id)) warn(`plan: ${l.id} (${seen.get(l.id)}) comes before its prerequisite ${p} (${seen.get(p)})`);
    }
    if (plan.days?.length && plan.days[plan.days.length - 1].date > plan.examDate) err("plan: a day falls after the exam date");
  }
}

console.log("Summary:", JSON.stringify(summary));
if (warnings.length) console.log(`\n${warnings.length} warning(s):\n  ` + warnings.join("\n  "));
if (errors.length) {
  console.error(`\n${errors.length} ERROR(S):\n  ` + errors.join("\n  "));
  process.exit(1);
}
console.log("\nValidation passed.");
if (CHECK_ONLY) process.exit(0);

// ── Bundle data ───────────────────────────────────────────────────────
const data = {
  meta: {
    title: "Florida Sales Associate Exam Prep",
    built: new Date().toISOString(),
    checkedOn: CHECKED_ON,
    summary,
    exam: { questions: 100, minutes: 210, pass: 75, source: "V-01" },
  },
  chapters,
  lessons: lessonDefs.map((l) => ({
    id: l.id, ch: l.ch, title: l.title, type: l.type, pri: l.pri, min: l.min, manual: l.manual, pre: l.pre,
    status: lessonContent.get(l.id)?.status, html: lessonContent.get(l.id)?.html,
  })),
  order,
  objectives,
  questions: questions.map((q) => ({ ...q, calc: undefined })),
  flashcards,
  numbers,
  comparisons,
  glossary: glossary.map(([term, def, l, note]) => ({ term, def, l, note })),
  verification,
  manualCoverage,
};

mkdirSync(join(ROOT, "dist"), { recursive: true });
const css = readFileSync(join(ROOT, "app", "app.css"), "utf8");
const js = readFileSync(join(ROOT, "app", "app.js"), "utf8");
const body = readFileSync(join(ROOT, "app", "body.html"), "utf8");
const head = `<title>FL Exam Coach</title>\n<meta name="claude:viewport-fit-sides" content="cover">\n<link rel="preconnect" href="https://fonts.googleapis.com">\n<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Libre+Caslon+Text:wght@400;700&family=Public+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap">\n<style>\n${css}\n</style>`;
function writeApp(dir, withPlan) {
  mkdirSync(dir, { recursive: true });
  const dataJson = JSON.stringify({ ...data, plan: withPlan || null }).replace(/</g, "\\u003c");
  const scripts = `<script id="app-data" type="application/json">${dataJson}</script>\n<script>\n${js}\n</script>`;
  // artifact fragment: the publisher wraps it in a document skeleton
  writeFileSync(join(dir, "artifact.html"), `${head}\n${body}\n${scripts}\n`);
  // standalone document for local use (open the file in any browser)
  writeFileSync(join(dir, "study-app.html"),
    `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">\n${head}\n</head>\n<body>\n${body}\n${scripts}\n</body>\n</html>\n`);
}
writeApp(join(ROOT, "dist"), null);
if (plan) { writeApp(PLAN_OUT, plan); console.log(`Wrote personal build with study plan to ${PLAN_OUT}`); }
writeFileSync(join(ROOT, "dist", "data.json"), JSON.stringify(data, null, 1));

// ── Generated Markdown documents ──────────────────────────────────────
const md = (rel, text) => { mkdirSync(dirname(join(ROOT, rel)), { recursive: true }); writeFileSync(join(ROOT, rel), text); };
const esc = (s) => String(s ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ");
const GEN = `<!-- Generated by scripts/build.mjs from data/*.mjs — edit the data, not this file. -->\n\n`;
const statusLabel = { confirmed: "Confirmed", corrected: "Corrected", "gap-filled": "Gap filled", unresolved: "Unresolved", "pending-law": "Pending law", "not-verified": "Not verified" };

md("sources/verification_log.md", GEN + `# Verification log\n\nChecked on ${CHECKED_ON}. Method "official-excerpt" means the official page was located on its official domain and its content read through search excerpts; the container's network policy blocked full-page downloads from flsenate.gov, leg.state.fl.us, flrules.org and myfloridalicense.com. Treat these as strong but not final. "not-checked" items come from the study manual.\n\n` +
  verification.map((v) => `## ${v.id} · ${v.topic}\n\n- **Status:** ${statusLabel[v.status]} (${v.method}${v.checks ? ", " + v.checks : ""})\n- **Study manual says:** ${v.manual}\n- **Finding:** ${v.finding}\n- **Citation:** ${v.citation}${v.url ? `\n- **Source:** ${v.url}` : ""}\n- **What we teach:** ${v.teach}\n`).join("\n"));

md("knowledge_base/numbers_and_deadlines.md", GEN + `# Numbers, deadlines and thresholds\n\n| ID | Subject | Exact rule | Conditions / qualifications | Lesson | Verification | Memory aid |\n|---|---|---|---|---|---|---|\n` +
  numbers.map((n) => `| ${n.id} | ${esc(n.s)} | ${esc(n.val)} | ${esc([n.cond, n.exc].filter(Boolean).join(" · "))} | ${n.l} | ${n.v} (${statusLabel[vById.get(n.v).status]}) | ${esc(n.aid)} |`).join("\n") + "\n");

md("knowledge_base/glossary.md", GEN + `# Glossary\n\n| Term | Definition | Lesson | Note |\n|---|---|---|---|\n` +
  glossary.map(([t, d, l, n]) => `| ${esc(t)} | ${esc(d)} | ${l} | ${esc(n)} |`).join("\n") + "\n");

md("knowledge_base/portugal_vs_florida.md", GEN + `# Portugal vs Florida\n\nPortuguese law is never used to answer a Florida exam question. Each entry states whether its Portuguese side was verified.\n\n` +
  comparisons.map((c) => `## ${c.id} · ${c.concept}\n\n**Portuguese context.** ${c.pt}\n\n**Florida context.** ${c.fl}\n\n**The important difference.** ${c.diff}\n\n**Practical example.** ${c.ex}\n\n**Examination implication.** ${c.exam}\n\n**Memory aid.** ${c.aid}\n\n**Practice question.** ${c.pq}\n\n<details><summary>Answer</summary>\n\n${c.pa}\n\n</details>\n\n*Portuguese side: ${c.ptv}.* Lessons: ${c.l.join(", ")}\n`).join("\n"));

md("knowledge_base/formulas.md", GEN + `# Formulas\n\nEvery calculation the curriculum requires. Worked examples are in the Chapter 14 lessons and the calculation questions in the app.\n\n` +
  handCards.filter((f) => f.t === "formula").map((f) => `## ${f.f}\n\n${f.b}\n\n*Lesson ${f.l}*\n`).join("\n"));

md("knowledge_base/florida_laws.md", GEN + `# Laws and rules taught, with verification status\n\n| Topic | Citation | Status | What we teach |\n|---|---|---|---|\n` +
  verification.map((v) => `| ${esc(v.topic)} | ${esc(v.citation)} | ${statusLabel[v.status]} | ${esc(v.teach)} |`).join("\n") + "\n");

md("curriculum/syllabus.md", GEN + `# Master syllabus\n\nStructure: the 19 sections of the official FREC Course I syllabus (eff. 1/1/2023, V-03). Exam weights are low-confidence fragments from the Candidate Information Booklet (V-02); "est." marks estimates used only to weight mock exams.\n\n` +
  chapters.map((c) => {
    const ls = lessonDefs.filter((l) => l.ch === c.id);
    return `## ${c.n}. ${c.title}\n\n*${c.frec} · Manual: ${c.manual} · Exam weight: ${c.examPct}%${c.est ? " (est.)" : ""}*\n\n` +
      ls.map((l) => `### ${l.id} · ${l.title}\n\n- Type: ${l.type} · Priority: ${l.pri} · ~${l.min} min · Content: ${lessonContent.get(l.id)?.status}\n- Manual: ${l.manual}\n- Prerequisites: ${l.pre.join(", ") || "none"}\n- Objectives:\n${l.o.map(([k, t], i) => `  - O-${l.id}-${i + 1} (${k}) ${t}`).join("\n")}\n- Practice questions: ${questions.filter((q) => q.l === l.id).length} · Numbers: ${numbers.filter((n) => n.l === l.id).map((n) => n.id).join(", ") || "—"}\n`).join("\n");
  }).join("\n"));

md("curriculum/learning_objectives.md", GEN + `# Learning objectives\n\n| ID | Kind | Objective | Questions |\n|---|---|---|---|\n` +
  objectives.map((o) => `| ${o.id} | ${o.kind} | ${esc(o.text)} | ${qByObj.get(o.id) || 0} |`).join("\n") +
  `\n\nObjectives with no practice question yet: ${uncoveredObjectives.length ? uncoveredObjectives.join(", ") : "none"}.\n`);

md("curriculum/prerequisite_map.md", GEN + `# Prerequisite map\n\nA valid study order (every lesson after its prerequisites):\n\n${order.map((id, i) => `${i + 1}. ${id} · ${lessonById.get(id).title}`).join("\n")}\n\n## Dependencies\n\n| Lesson | Requires |\n|---|---|\n` +
  lessonDefs.map((l) => `| ${l.id} | ${l.pre.join(", ") || "—"} |`).join("\n") + "\n");

md("curriculum/coverage_checklist.md", GEN + `# Coverage checklist\n\n## Study manual sections → lessons\n\n| Manual section | Taught in |\n|---|---|\n` +
  manualCoverage.map(([s, w]) => `| ${esc(s)} | ${esc(w)} |`).join("\n") +
  `\n\n## FREC syllabus sections → lessons\n\n| Section | Lessons | Full lessons | Questions |\n|---|---|---|---|\n` +
  chapters.map((c) => {
    const ls = lessonDefs.filter((l) => l.ch === c.id);
    return `| ${c.n}. ${esc(c.title)} | ${ls.map((l) => l.id).join(", ")} | ${ls.filter((l) => lessonContent.get(l.id)?.status === "full").length}/${ls.length} | ${questions.filter((q) => ls.some((l) => l.id === q.l)).length} |`;
  }).join("\n") +
  `\n\n## Known gaps\n\n- The Gold Coast textbook itself is not among the supplied files. Coverage is mapped from the study manual (which references book chapters 2–19) and the official FREC syllabus section titles. Detailed FREC learning objectives per section could not be read (network policy), so sub-topics present only in the textbook may be missing.\n- Book Chapter 1 (The Real Estate Business) is not covered by the manual; L01-2 was written from general knowledge and the FREC section title.\n- Objectives with no practice question: ${uncoveredObjectives.length ? uncoveredObjectives.join(", ") : "none"}.\n- Lessons with core notes only (full 14-section lesson pending): ${lessonDefs.filter((l) => lessonContent.get(l.id)?.status === "core").length}.\n`);

md("practice/question_bank.json", JSON.stringify(questions, null, 1));
md("practice/flashcards.json", JSON.stringify(flashcards, null, 1));

console.log(`\nWrote dist/study-app.html (${(readFileSync(join(ROOT, "dist", "study-app.html")).length / 1024).toFixed(0)} KB), dist/artifact.html, dist/data.json and generated docs.`);
