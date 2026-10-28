// Unit tests for app/planner.js (pure plan builder). Run: node tests/planner.test.mjs
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const P = createRequire(import.meta.url)(join(ROOT, "app", "planner.js"));
const base = JSON.parse(readFileSync(join(ROOT, "tests", "fixtures", "plan.sample.json"), "utf8"));
let passed = 0, failed = 0; const results = [];
const test = (name, fn) => { try { fn(); passed++; results.push(`  ✔ ${name}`); } catch (e) { failed++; results.push(`  ✘ ${name}\n      ${e.message}`); } };
const assert = (c, m) => { if (!c) throw new Error(m); };
const lessons = Array.from({ length: 30 }, (_, i) => ({ id: "X" + String(i).padStart(2, "0"), min: 20 + (i % 4) * 10 }));

test("every lesson is scheduled exactly once, in order, before the final week", () => {
  const p = P.build({ start: "2030-03-01", exam: "2030-03-20", lessons, base });
  const flat = p.days.flatMap((d) => d.lessons);
  assert(flat.join() === lessons.map((l) => l.id).join(), "order or coverage changed");
  const lastStudy = p.days.filter((d) => d.lessons.length).pop().date;
  assert(lastStudy < p.days.find((d) => d.kind === "mock").date, "mock should come after all lessons");
});

test("dates are consecutive from the start date and the exam day is last", () => {
  const p = P.build({ start: "2030-03-01", exam: "2030-03-20", lessons, base });
  p.days.forEach((d, i) => assert(d.date === P.addDays("2030-03-01", i), `day ${i} has date ${d.date}`));
  assert(p.days[p.days.length - 1].kind === "exam" && p.days[p.days.length - 1].date === "2030-03-20", "exam day missing");
});

test("load is spread evenly (no study day more than 1.6× the average)", () => {
  const p = P.build({ start: "2030-03-01", exam: "2030-03-20", lessons, base, overhead: 0 });
  const study = p.days.filter((d) => d.lessons.length);
  const avg = study.reduce((s, d) => s + d.min, 0) / study.length;
  assert(study.every((d) => d.min <= avg * 1.6), "uneven: " + study.map((d) => d.min).join(","));
});

test("short runway keeps at least 3 study days, the light day and the first mock", () => {
  const p = P.build({ start: "2030-03-01", exam: "2030-03-06", lessons });
  assert(p.days.some((d) => d.kind === "light"), "light day should be kept");
  assert(p.days.filter((d) => d.lessons.length).length === 3, "should have 3 study days");
  assert(p.days.some((d) => d.kind === "mock"), "first mock should be kept");
  assert(p.days.flatMap((d) => d.lessons).length === 30, "lessons lost");
});

test("default final week is used when no base plan is given", () => {
  const p = P.build({ start: "2030-03-01", exam: "2030-03-20", lessons });
  assert(p.days.filter((d) => d.kind === "mock").length === 2 && p.days.some((d) => d.kind === "light"), "default tail missing");
});

test("Saturday task is added on Saturday study days", () => {
  const p = P.build({ start: "2030-03-01", exam: "2030-03-20", lessons, base, saturdayTask: { text: "Mixed quiz", href: "quiz~C", min: 30 } });
  const sat = p.days.find((d) => d.lessons.length && P.weekday(d.date) === 6);
  assert(sat && sat.tasks?.[0]?.text === "Mixed quiz", "no Saturday task");
});

test("start on or after the exam date is rejected", () => {
  let threw = false; try { P.build({ start: "2030-03-20", exam: "2030-03-20", lessons }); } catch { threw = true; }
  assert(threw, "should throw");
});

test("lesson minutes: fast < full < calculation of the same length", () => {
  const f = P.lessonMinutes({ words: 2400, questions: 4, type: "legal", fast: true });
  const n = P.lessonMinutes({ words: 2400, questions: 4, type: "legal" });
  const c = P.lessonMinutes({ words: 2400, questions: 4, type: "calculation" });
  assert(f < n && n < c, `${f} ${n} ${c}`);
});

console.log(results.join("\n") + `\n\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
