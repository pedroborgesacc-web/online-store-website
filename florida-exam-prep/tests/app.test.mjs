// End-to-end tests for dist/study-app.html (local-storage mode).
// Run: node tests/app.test.mjs   (uses the globally installed Playwright)
import { createRequire } from "node:module";
import { execSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { chromium } = require(join(execSync("npm root -g").toString().trim(), "playwright"));
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const URL = "file://" + join(ROOT, "dist", "study-app.html");
const DATA = JSON.parse(readFileSync(join(ROOT, "dist", "data.json"), "utf8"));
const Q = new Map(DATA.questions.map((q) => [q.id, q]));

let passed = 0, failed = 0;
const results = [];
async function test(name, fn) {
  try { await fn(); passed++; results.push(`  ✔ ${name}`); }
  catch (e) { failed++; results.push(`  ✘ ${name}\n      ${String(e.message || e).split("\n")[0]}`); }
}
const assert = (c, m) => { if (!c) throw new Error(m); };

const userDir = mkdtempSync(join(tmpdir(), "flexam-"));
let ctx = await chromium.launchPersistentContext(userDir, { viewport: { width: 1280, height: 900 }, acceptDownloads: true });
let page = ctx.pages()[0] || await ctx.newPage();
const consoleErrors = [];
const watch = (p) => { p.on("pageerror", (e) => consoleErrors.push(String(e))); p.on("console", (m) => { if (m.type() === "error" && !/fonts\.(googleapis|gstatic)/.test(m.text()) && !/ERR_NAME_NOT_RESOLVED|ERR_INTERNET_DISCONNECTED|net::/.test(m.text())) consoleErrors.push(m.text()); }); };
watch(page);
const state = () => page.evaluate(() => JSON.parse(localStorage.getItem("flexam.v1") || "null"));
const nav = async (hash) => { await page.evaluate((h) => { location.hash = h; }, hash); await page.waitForTimeout(120); };
const currentQ = async () => { const id = (await page.locator(".qmeta .chip").first().textContent()).trim(); return Q.get(id); };
async function answer(correct, conf = "s") {
  const q = await currentQ();
  if (q.t === "num") await page.fill("#numans", String(correct ? q.ans : q.ans * 2 + 7));
  else { const idx = correct ? q.a : [0, 1, 2, 3].find((i) => i !== q.a); await page.locator(`.choice[data-ci="${idx}"]`).click(); }
  await page.locator(`[data-conf="${conf}"]`).click();
  await page.waitForSelector(".feedback");
  return q;
}

await page.goto(URL);
await page.waitForSelector("h1");

await test("dashboard renders with recommendation and stats", async () => {
  assert((await page.textContent("h1")).includes("Study dashboard"), "no dashboard heading");
  assert(await page.locator("text=Recommended next").count(), "no recommendation");
  assert((await page.textContent("#store")).includes("browser"), "storage pill not in local mode: " + await page.textContent("#store"));
});

await test("every navigation view renders a heading without errors", async () => {
  for (const v of ["home", "syllabus", "practice", "review", "cards", "calc", "exam", "numbers", "compare", "mistakes", "stats", "search", "sources", "settings"]) {
    await nav(v);
    assert(await page.locator("#view h1").count(), `view ${v} has no h1`);
  }
  assert(!consoleErrors.length, "console errors: " + consoleErrors.join(" | "));
});

await test("syllabus lists 19 chapters and all lessons", async () => {
  await nav("syllabus");
  assert((await page.locator("details.chapter").count()) === 19, "chapter count");
  assert((await page.locator(".lesson-row").count()) === DATA.lessons.length, "lesson count");
});

await test("lesson L01-1 shows objectives and all full-lesson sections", async () => {
  await nav("lesson~L01-1");
  const txt = await page.textContent("#view");
  for (const h of ["1. Learning objectives", "2. Why it matters", "3. Simple explanation", "6. Portugal comparison", "8. Visual explanation", "10. Memory sheet", "11–14."]) assert(txt.includes(h), "missing " + h);
  await page.click("#mark-read");
  assert((await state()).lessons["L01-1"]?.read, "mark as studied not saved");
});

await test("lesson quiz: correct answer feedback, wrong answer explains misconception", async () => {
  await nav("quiz~A~L01-1");
  await page.waitForSelector(".stem");
  const before = (await state())?.attempts.length || 0;
  await answer(true, "s");
  assert((await page.textContent(".feedback .verdict")).startsWith("Correct"), "correct verdict");
  await page.click("#next");
  const q = await answer(false, "s");
  const fb = await page.textContent(".feedback");
  assert(fb.includes("Not correct") && fb.includes("Correct answer"), "wrong verdict");
  if (q.t !== "num") assert(fb.includes("Why your answer is wrong"), "no misconception text");
  assert(await page.locator("#cat").count(), "no error-category selector");
  await page.fill("#elab", "Because the FREC disciplines and the DBPR investigates.");
  await page.click("#next");
  const st = await state();
  assert(st.attempts.length === before + 2, "attempts not recorded");
  const m = st.mistakes[q.id];
  assert(m && m.status === "open" && m.confident, "mistake not logged as confident error");
  assert(m.note.includes("FREC"), "elaboration note not saved");
  assert(st.items[q.id].due - Date.now() < 11 * 60000, "wrong answer not rescheduled within minutes");
});

await test("re-test: a different question on the same objective is inserted after an error", async () => {
  const live = await page.evaluate(() => JSON.parse(localStorage.getItem("flexam.v1.live")));
  assert(live.retested.length >= 1 || live.queue.length >= 4, "no retest bookkeeping");
});

await test("finish quiz shows a session report", async () => {
  for (let i = 0; i < 20 && !(await page.locator("text=Session report").count()); i++) {
    if (await page.locator(".feedback").count()) { await page.click("#next"); continue; }
    await answer(true, "u");
  }
  assert(await page.locator("text=Session report").count(), "no session report");
  assert((await page.textContent("#view")).includes("Accuracy by chapter"), "report missing accuracy by chapter");
  assert((await state()).sessions.length >= 1, "session not stored");
});

await test("numeric calculation: tolerance, steps and unit-error categorisation", async () => {
  await nav("quiz~E~L14-6");
  await page.waitForSelector(".stem");
  let q = await currentQ();
  for (let i = 0; q.t !== "num" && i < 12; i++) { await answer(true, "s"); await page.click("#next"); q = await currentQ(); }
  assert(q.t === "num", "no numeric question in Mode E");
  await page.fill("#numans", "$" + q.ans.toLocaleString("en-US"));
  await page.click('[data-conf="s"]');
  assert((await page.textContent(".feedback .verdict")).startsWith("Correct"), "formatted numeric not accepted");
  await page.click("#next");
  q = await currentQ();
  for (let i = 0; q.t !== "num" && i < 12; i++) { await answer(true, "s"); await page.click("#next"); q = await currentQ(); }
  await page.fill("#numans", String(q.ans / 100));
  await page.click('[data-conf="s"]');
  assert(await page.locator(".steps li").count(), "no solution steps");
  assert((await state()).mistakes[q.id].cat === "UNITS", "decimal-placement error not categorised as UNITS");
});

await test("keyboard: 1–4 selects and S submits", async () => {
  await nav("quiz~B~ch03");
  await page.waitForSelector(".stem");
  const q = await currentQ();
  if (q.t === "num") return;
  await page.keyboard.press("2");
  await page.keyboard.press("s");
  await page.waitForSelector(".feedback");
});

await test("flashcards: type, reveal, grade, schedule", async () => {
  await nav("cards~due");
  await page.waitForSelector(".flash");
  await page.fill("#typed", "DBPR investigates, FREC disciplines");
  await page.click("#reveal");
  await page.waitForSelector("[data-grade]");
  await page.click('[data-grade="hard"]');
  const st = await state();
  const cardItems = Object.entries(st.items).filter(([k]) => k[0] === "F");
  assert(cardItems.length >= 1 && cardItems[0][1].due > Date.now() + 12 * 3600000, "card not scheduled ≥ 12 h ahead");
});

await test("review queue, mistake log, analytics reflect activity", async () => {
  await nav("review");
  assert((await page.textContent("#view")).includes("Questions due"), "review view");
  await nav("mistakes");
  assert(await page.locator("#mlist details").count(), "mistake log empty");
  await nav("stats");
  assert((await page.textContent("#view")).includes("Confidence calibration"), "analytics view");
});

await test("weakness training (Mode D) builds a queue from the mistake log", async () => {
  await nav("quiz~D");
  assert(await page.locator(".stem").count(), "Mode D produced no questions");
});

await test("search finds lessons, glossary and rules", async () => {
  await nav("search");
  await page.fill("#sq", "riparian");
  await page.waitForTimeout(100);
  const t = await page.textContent("#sres");
  assert(t.includes("Glossary") && t.includes("Lessons"), "search results incomplete");
});

await test("law & numbers search and Portugal comparison reveal", async () => {
  await nav("numbers");
  await page.fill("#nq", "escrow");
  assert((await page.locator("#nlist details").count()) >= 2, "numbers search");
  await nav("compare");
  await page.click('[data-show="PT-07"]');
  assert(await page.locator('[data-pa="PT-07"]').isVisible(), "comparison answer not revealed");
});

await test("settings: exam date saves and produces a study plan", async () => {
  await nav("settings");
  const d = new Date(Date.now() + 60 * 86400000).toISOString().slice(0, 10);
  await page.fill("#set-date", d); await page.fill("#set-min", "60");
  await page.click("#save-set");
  const st = await state();
  assert(st.settings.examDate === d && st.settings.dailyMinutes === "60", "settings not saved");
  assert((await page.textContent("#view")).includes("Pace:"), "no study plan");
});

await test("export produces a valid backup file", async () => {
  await nav("settings");
  const [dl] = await Promise.all([page.waitForEvent("download", { timeout: 5000 }), page.click("#export")]);
  const json = JSON.parse(readFileSync(await dl.path(), "utf8"));
  assert(json.app === "fl-exam-coach" && json.state.attempts.length > 0, "backup content");
});

await test("import rejects invalid JSON and merges a valid backup", async () => {
  await nav("settings");
  await page.fill("#backup-text", "{not json");
  await page.click("#importtext");
  assert(await page.locator(".toast", { hasText: "not a valid backup" }).count(), "no error toast");
  const backup = await page.evaluate(() => JSON.stringify({ state: JSON.parse(localStorage.getItem("flexam.v1")) }));
  const n = (await state()).attempts.length;
  await page.fill("#backup-text", backup);
  await page.click("#importtext");
  assert((await state()).attempts.length === n, "merge duplicated attempts");
});

await test("mock exam: 100 questions, timer, flag, confirm and report", async () => {
  await nav("exam");
  await page.click("#startexam");
  await page.waitForSelector("#timer");
  assert((await page.locator(".navgrid button").count()) === 100, "mock does not have 100 questions");
  assert(/^3:2\d:\d\d$/.test((await page.textContent("#timer")).trim()), "timer not near 3:30");
  const q = await currentQ().catch(() => null);
  if (await page.locator(".choice").count()) await page.locator(".choice").first().click(); else await page.fill("#examnum", "1");
  await page.click("#flag");
  await page.click("#submitexam");
  await page.click("#confirmsubmit");
  await page.waitForSelector("text=Session report");
  assert((await page.textContent("h1")).includes("/ 100"), "mock report total");
  const st = await state();
  const mockAtt = st.attempts.filter((a) => a.m === "H");
  assert(mockAtt.length === 100 && !mockAtt.some((a) => a.c === "s"), "mock attempts recorded with wrong confidence");
});

await test("progress survives a page reload", async () => {
  const before = await state();
  await page.reload(); await page.waitForSelector("h1");
  const after = await state();
  assert(after.attempts.length === before.attempts.length && after.lessons["L01-1"], "state lost on reload");
});

await test("progress survives closing and relaunching the browser", async () => {
  const n = (await state()).attempts.length;
  await ctx.close();
  ctx = await chromium.launchPersistentContext(userDir, { viewport: { width: 1280, height: 900 } });
  page = ctx.pages()[0] || await ctx.newPage(); watch(page);
  await page.goto(URL); await page.waitForSelector("h1");
  assert((await state()).attempts.length === n, "state lost after relaunch");
  assert((await page.textContent("#view")).includes("Lessons studied"), "dashboard after relaunch");
});

await test("phone (390px) and tablet (820px): no horizontal page scroll", async () => {
  for (const w of [390, 820]) {
    await page.setViewportSize({ width: w, height: 840 });
    for (const v of ["home", "syllabus", "lesson~L01-1", "lesson~L10-2", "practice", "quiz~A~L02-1", "numbers", "compare", "stats", "settings", "sources", "exam"]) {
      await nav(v);
      const over = await page.evaluate(() => document.scrollingElement.scrollWidth - window.innerWidth);
      assert(over <= 1, `horizontal overflow ${over}px at ${w}px on ${v}`);
    }
  }
  await page.setViewportSize({ width: 1280, height: 900 });
});

await test("every lesson at phone width: no overflow, no unrendered Markdown or HTML", async () => {
  await page.setViewportSize({ width: 390, height: 840 });
  for (const l of DATA.lessons) {
    await nav("lesson~" + l.id);
    const r = await page.evaluate(() => ({
      over: document.scrollingElement.scrollWidth - window.innerWidth,
      text: document.querySelector("main").innerText,
      math: document.querySelectorAll("main .math").length,
    }));
    assert(r.over <= 1, `horizontal overflow ${r.over}px on ${l.id}`);
    assert(!r.math, `${l.id}: text rendered as TeX math`);
    const lit = r.text.match(/\*\*[^*\n]{1,60}\*\*|<\/?(div|details|summary|span|b)\b[^>]*>/);
    assert(!lit, `${l.id}: unrendered markup "${lit && lit[0]}"`);
  }
  await page.setViewportSize({ width: 1280, height: 900 });
});

await test("dark mode renders with dark background", async () => {
  await page.emulateMedia({ colorScheme: "dark" });
  await nav("home");
  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  assert(bg === "rgb(15, 20, 23)", "dark background not applied: " + bg);
  await page.emulateMedia({ colorScheme: "light" });
});

await test("reset requires in-page confirmation and clears progress", async () => {
  await nav("settings");
  await page.click("#reset");
  assert(await page.locator("#resetyes").isVisible(), "no confirmation step");
  await page.click("#resetyes");
  await page.waitForTimeout(500);
  assert((await state()).attempts.length === 0, "progress not cleared");
});

await test("no uncaught errors during the whole run", async () => { assert(!consoleErrors.length, consoleErrors.slice(0, 3).join(" | ")); });

await ctx.close();
rmSync(userDir, { recursive: true, force: true });
console.log(results.join("\n"));
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
