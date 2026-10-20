// Builds one compact context file per lesson batch (staging/_ctx/<batch>.md) so that
// lesson-writing and review agents read only the material relevant to their lessons.
// Usage: node scripts/context_packs.mjs <manual.md> <batches.json>
import fs from "node:fs";
import path from "node:path";

const ROOT = path.dirname(path.dirname(new URL(import.meta.url).pathname));
const [manualPath, batchesPath] = process.argv.slice(2);
const imp = (f) => import(path.join(ROOT, "data", f));
const { chapters, lessons } = await imp("curriculum.mjs");
const { numbers } = await imp("numbers.mjs");
const { verification } = await imp("verification.mjs");
const { comparisons } = await imp("comparisons.mjs");
const { glossary } = await imp("glossary.mjs");
const questions = [];
for (const f of fs.readdirSync(path.join(ROOT, "data")).filter((x) => /^questions_.*\.mjs$/.test(x))) questions.push(...(await imp(f)).questions);

const manual = fs.readFileSync(manualPath, "utf8").split("\n");
const top = manual.map((l, i) => [l, i]).filter(([l]) => /^# \*\*(\d+|Appendix)/.test(l));
const manualChapter = (n) => {
  const k = top.findIndex(([l]) => l.startsWith(`# **${n}.`) || (n === "A" && l.includes("Appendix")));
  if (k < 0) throw new Error("manual chapter " + n);
  return manual.slice(top[k][1], k + 1 < top.length ? top[k + 1][1] : manual.length).join("\n").trim();
};
const core = new Map();
for (const f of fs.readdirSync(path.join(ROOT, "lessons")).filter((x) => /^ch\d\d\.md$/.test(x))) {
  const parts = fs.readFileSync(path.join(ROOT, "lessons", f), "utf8").split(/<!--\s*lesson:\s*([A-Z0-9-]+)\s*\|\s*content:\s*(full|core)\s*-->/);
  for (let i = 1; i < parts.length; i += 3) core.set(parts[i], { kind: parts[i + 1], text: parts[i + 2].trim() });
}
const vById = new Map(verification.map((v) => [v.id, v]));
const L = "ABCD";
const batches = JSON.parse(fs.readFileSync(batchesPath, "utf8"));
for (const b of batches) {
  const ids = b.lessons.map((l) => l.id);
  const ls = ids.map((id) => lessons.find((l) => l.id === id));
  const nums = numbers.filter((n) => ids.includes(n.l));
  const qs = questions.filter((q) => ids.includes(q.l));
  const comps = comparisons.filter((c) => c.l.some((x) => ids.includes(x)));
  const gl = glossary.filter((g) => ids.includes(g[2]));
  const vRef = new Set([...nums.map((n) => n.v), ...qs.map((q) => q.v).filter(Boolean)]);
  for (const q of qs) for (const n of q.num || []) { const x = numbers.find((y) => y.id === n); if (x) vRef.add(x.v); }
  const out = [];
  out.push(`# Context pack: ${b.name} (${ids.join(", ")})`, "", "Everything an agent needs for these lessons. Data current as of the 2026-10-19/20 verification passes. The verification entries override the study manual where they conflict.", "");
  out.push("## 1. Lessons, objectives and prerequisites", "");
  for (const l of ls) {
    const ch = chapters.find((c) => c.id === l.ch);
    out.push(`### ${l.id} — ${l.title}`, `- Type: ${l.type} · priority ${l.pri} · ~${l.min} min · chapter ${ch.n} "${ch.title}" (${ch.frec}; exam weight ${ch.examPct}%) · manual: ${l.manual}`, `- Prerequisites: ${l.pre.join(", ") || "none"}`, "- Objectives:", ...l.o.map(([k, t], i) => `  ${i}. (${k}) ${t}`), "");
  }
  out.push("## 2. Current core notes (every rule, number, qualification, correction and flag here must survive in the full lesson)", "");
  for (const id of ids) out.push(`### ${id} (current ${core.get(id)?.kind || "missing"} text)`, "", core.get(id)?.text || "(none)", "");
  out.push("## 3. Numbers database entries for these lessons", "");
  for (const n of nums) out.push(`- **${n.id} ${n.s}:** ${n.val}${n.u ? ` [${n.u}]` : ""}. Context: ${n.ctx || "—"} Conditions: ${n.cond || "—"} Exceptions: ${n.exc || "—"} Verification: ${n.v} (${vById.get(n.v)?.status}). Confused with: ${n.conf.join(", ") || "—"}. Memory aid: ${n.aid || "—"}`);
  out.push("", "## 4. Verification entries referenced by these lessons (full)", "");
  for (const id of [...vRef].sort()) { const v = vById.get(id); if (!v) continue; out.push(`### ${v.id} · ${v.topic} — ${v.status}${v.checks ? ` (${v.checks})` : ""}`, `- Manual said: ${v.manual}`, `- Finding: ${v.finding}`, `- Citation: ${v.citation}`, `- Teach: ${v.teach}`, ""); }
  out.push("## 5. All verification entries (summary: id · topic · status · what we teach)", "", "Status meanings: confirmed / corrected (manual was wrong) / gap-filled (added from an official source) = verified; unresolved = teach with a flag; pending-law = not law; not-verified (V-26) = manual statement, label it \"not yet verified\".", "");
  for (const v of verification) if (!vRef.has(v.id)) out.push(`- ${v.id} · ${v.topic} · ${v.status} · ${v.teach}`);
  out.push("", "## 6. Portugal vs Florida comparisons for these lessons (the ONLY Portuguese facts allowed; anything else must be labelled \"requires verification\")", "");
  for (const c of comps) out.push(`### ${c.id} ${c.concept} (lessons ${c.l.join(", ")})`, ...Object.entries(c).filter(([k]) => !["id", "concept", "l"].includes(k)).map(([k, v]) => `- ${k}: ${v}`), "");
  out.push("## 7. Glossary entries for these lessons", "");
  for (const g of gl) out.push(`- **${g[0]}** — ${g[1]}${g[3] ? ` (${g[3]})` : ""}`);
  out.push("", "## 8. Practice questions for these lessons (align with them; do not copy them into lessons)", "");
  for (const q of qs) {
    const ans = q.t === "num" ? `${q.ans}${q.unit ? " " + q.unit : ""}` : `${L[q.a]}. ${q.c[q.a]}`;
    out.push(`- ${q.id} (${q.l}, objective ${q.o}): ${q.q}${q.c ? " | " + q.c.map((c, i) => `${L[i]}. ${c}`).join(" | ") : ""} → **${ans}**. ${q.ex || (q.steps || []).join(" ")}`);
  }
  out.push("", "## 9. Study manual text for these lessons", "", "The learner's own study manual (copyrighted; use it as a source, do not copy long passages). Where it conflicts with sections 3–5, sections 3–5 win.", "");
  for (const n of b.manualChapters) out.push(manualChapter(n), "");
  out.push("## 10. Study manual appendix: every number on the exam", "", manualChapter("A"), "");
  const p = path.join(ROOT, "staging", "_ctx", b.name + ".md");
  fs.writeFileSync(p, out.join("\n"));
  console.log(`${b.name}: ${(fs.statSync(p).size / 1024).toFixed(0)} KB · ${nums.length} numbers · ${qs.length} questions · ${vRef.size} V refs`);
}
