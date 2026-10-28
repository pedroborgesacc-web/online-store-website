// Rebuild a personal study plan with a new start date (and optionally a new exam date).
// Lesson order, fast-track lessons, texts and the final-week template come from the base plan.
//
//   node scripts/make_plan.mjs --start 2026-10-28 [--exam 2026-11-13] [--base personal/plan.json] [--out personal/plan.json] [--done L01-1,L01-2]
//
// Needs dist/data.json (run node scripts/build.mjs first) for lesson length and question counts.
import { createRequire } from "node:module";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const P = createRequire(import.meta.url)(join(ROOT, "app", "planner.js"));
const arg = (n, d) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : d; };
const basePath = arg("--base", join(ROOT, "personal", "plan.json"));
const out = arg("--out", basePath);
const base = JSON.parse(readFileSync(basePath, "utf8"));
const data = JSON.parse(readFileSync(join(ROOT, "dist", "data.json"), "utf8"));
const start = arg("--start");
const exam = arg("--exam", base.examDate);
const done = new Set((arg("--done", "") || "").split(",").filter(Boolean));
if (!start) { console.error("--start YYYY-MM-DD is required"); process.exit(1); }

const fast = new Set(base.fast || []);
const qCount = new Map();
for (const q of data.questions) qCount.set(q.l, (qCount.get(q.l) || 0) + 1);
const order = [...new Set([...base.days.flatMap((d) => d.lessons || []), ...data.order])];
const L = new Map(data.lessons.map((l) => [l.id, l]));
const lessons = order.filter((id) => !done.has(id)).map((id) => ({
  id, min: P.lessonMinutes({ words: P.wordsOf(L.get(id).html), questions: qCount.get(id) || 0, type: L.get(id).type, fast: fast.has(id) }),
}));
const sat = base.days.find((d) => (d.lessons || []).length && d.tasks?.length)?.tasks[0];
const plan = P.build({ start, exam, lessons, base, saturdayTask: sat && { ...sat, min: 30 } });
writeFileSync(out, JSON.stringify(plan, null, 2) + "\n");
const study = plan.days.filter((d) => d.lessons.length);
const h = (m) => `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")}`;
console.log(`Plan ${start} → exam ${exam}: ${lessons.length} lessons over ${study.length} study days, then ${plan.days.length - study.length - 1} final-week days.`);
for (const d of plan.days) console.log(`  ${d.date}  ${h(d.min).padStart(8)}  ${d.lessons.length ? d.lessons.map((id) => id + (fast.has(id) ? "R" : "")).join(" ") : d.title}`);
console.log(`Study days: average ${h(Math.round(study.reduce((s, d) => s + d.min, 0) / (study.length || 1)))}, peak ${h(plan.peakMinutes)}. Written to ${out}`);
