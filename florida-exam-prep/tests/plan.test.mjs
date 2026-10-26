// End-to-end tests for the optional personal study plan.
// Builds a copy of the app with tests/fixtures/plan.sample.json and drives it
// with a fixed clock. Run: node tests/plan.test.mjs
import { createRequire } from "node:module";
import { execSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { chromium } = require(join(execSync("npm root -g").toString().trim(), "playwright"));
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = mkdtempSync(join(tmpdir(), "flplan-"));
const b = spawnSync("node", [join(ROOT, "scripts", "build.mjs"), "--plan", join(ROOT, "tests", "fixtures", "plan.sample.json"), "--out", out], { encoding: "utf8" });
if (b.status !== 0) { console.error(b.stdout, b.stderr); process.exit(1); }
const publicHtml = readFileSync(join(ROOT, "dist", "artifact.html"), "utf8");

let passed = 0, failed = 0;
const results = [];
async function test(name, fn) {
  try { await fn(); passed++; results.push(`  ✔ ${name}`); }
  catch (e) { failed++; results.push(`  ✘ ${name}\n      ${String(e.message || e).split("\n")[0]}`); }
}
const assert = (c, m) => { if (!c) throw new Error(m); };

const browser = await chromium.launch();
const errors = [];
async function open(day) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 900 } });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.clock.setFixedTime(new Date(day + "T10:00:00"));
  await page.goto("file://" + join(out, "study-app.html"));
  await page.waitForSelector("h1");
  return { ctx, page };
}
const nav = async (page, h) => { await page.evaluate((x) => { location.hash = x; }, h); await page.waitForTimeout(150); };
const text = (page) => page.evaluate(() => document.querySelector("main").innerText);

await test("public build carries no personal plan", async () => {
  assert(publicHtml.includes('"plan":null'), "public artifact should have plan:null");
  assert(!publicHtml.includes("Sample plan (test fixture)"), "fixture leaked into public build");
});

await test("day 1: dashboard shows today's lessons, modes, exam countdown and recommends the first lesson", async () => {
  const { ctx, page } = await open("2030-03-01");
  const t = await text(page);
  assert(t.includes("Lições de hoje · 0/2"), "today's lessons missing");
  assert(t.includes("Rápida (R)") && t.includes("Completa"), "lesson modes missing");
  assert(/faltam 7 dias/i.test(t), "countdown missing");
  const rec = await page.locator(".btn.primary").first().textContent();
  assert(rec.includes("L01-1"), "recommendation should be L01-1, got " + rec);
  await ctx.close();
});

await test("lesson page shows the plan note for a fast lesson", async () => {
  const { ctx, page } = await open("2030-03-01");
  await nav(page, "lesson~L01-2");
  const t = await text(page);
  assert(t.includes("lição rápida (R)") && t.includes("Fast lesson: read sections 7, 9 and 10"), "fast-lesson note missing");
  await nav(page, "lesson~L14-1");
  assert((await text(page)).includes("Calculation: work the guided practice by hand"), "calculation note missing");
  await ctx.close();
});

await test("day 2 with day-1 lessons unread: backlog is shown and recommended first", async () => {
  const { ctx, page } = await open("2030-03-02");
  const t = await text(page);
  assert(t.includes("2 lições de dias anteriores estão por estudar"), "backlog note missing");
  assert(t.includes("Em atraso"), "late chip missing");
  assert(t.indexOf("L01-1") < t.indexOf("Lições de hoje"), "backlog should be listed before today's lessons");
  const rec = await page.locator(".btn.primary").first().textContent();
  assert(rec.includes("L01-1"), "backlog lesson should come first, got " + rec);
  await ctx.close();
});

await test("marking lessons studied moves the recommendation forward and updates the count", async () => {
  const { ctx, page } = await open("2030-03-01");
  for (const id of ["L01-1", "L01-2"]) { await nav(page, "lesson~" + id); await page.click("#mark-read"); }
  await nav(page, "home");
  const t = await text(page);
  assert(t.includes("Lições de hoje · 2/2"), "count not updated");
  const rec = await page.locator(".btn.primary").first().textContent();
  assert(rec.includes("Adiantar L02-1"), "should offer to work ahead, got " + rec);
  await ctx.close();
});

await test("mock day recommends the mock exam; plan page lists every day", async () => {
  const { ctx, page } = await open("2030-03-03");
  const rec = await page.locator(".btn.primary").first().textContent();
  assert(rec.includes("Mock 1"), "mock should be recommended, got " + rec);
  await nav(page, "plan");
  const t = await text(page);
  for (const d of ["2/3", "3/3", "8/3"]) assert(t.includes(d), "plan page missing day " + d);
  assert(t.includes("Hoje"), "today marker missing");
  const over = await page.evaluate(() => document.scrollingElement.scrollWidth - innerWidth);
  assert(over <= 1, "plan page overflows on phone: " + over);
  await ctx.close();
});

await test("settings show the plan's exam date and time; saved values override the plan", async () => {
  const { ctx, page } = await open("2030-03-01");
  await nav(page, "settings");
  assert(await page.inputValue("#set-date") === "2030-03-08", "exam date not prefilled from plan");
  assert(await page.inputValue("#set-min") === "240", "minutes not prefilled from plan");
  await page.fill("#set-date", "2030-03-09"); await page.click("#save-set");
  await nav(page, "home");
  assert(/faltam 8 dias/i.test(await text(page)), "saved date should override the plan");
  await ctx.close();
});

await test("no uncaught errors", async () => { assert(!errors.length, errors.join(" | ")); });

await browser.close();
rmSync(out, { recursive: true, force: true });
console.log(results.join("\n") + `\n\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
