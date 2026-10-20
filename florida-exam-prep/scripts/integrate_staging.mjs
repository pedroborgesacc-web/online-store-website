// Replaces lesson blocks in lessons/chNN.md with full lessons from staging/<LessonId>.md.
// Usage: node scripts/integrate_staging.mjs [--dry]
// A staged file must start with "<!-- lesson: <id> | content: full -->" and is only
// used when the lesson currently exists in a chapter file.
import fs from "node:fs";
import path from "node:path";

const ROOT = path.dirname(path.dirname(new URL(import.meta.url).pathname));
const dry = process.argv.includes("--dry");
const MARK = /<!--\s*lesson:\s*([A-Z0-9-]+)\s*\|\s*content:\s*(full|core)\s*-->/g;
const stageDir = path.join(ROOT, "staging");
const staged = new Map();
for (const f of fs.existsSync(stageDir) ? fs.readdirSync(stageDir) : []) {
  if (!f.endsWith(".md")) continue;
  const id = f.slice(0, -3);
  const text = fs.readFileSync(path.join(stageDir, f), "utf8").trim();
  const first = text.split("\n")[0];
  if (first !== `<!-- lesson: ${id} | content: full -->`) { console.error(`skip ${f}: bad first line: ${first}`); continue; }
  staged.set(id, text);
}
let replaced = 0;
for (const f of fs.readdirSync(path.join(ROOT, "lessons")).filter((x) => /^ch\d\d\.md$/.test(x)).sort()) {
  const p = path.join(ROOT, "lessons", f);
  const src = fs.readFileSync(p, "utf8");
  const marks = [...src.matchAll(MARK)];
  if (!marks.length) continue;
  let out = src.slice(0, marks[0].index);
  marks.forEach((m, i) => {
    const end = i + 1 < marks.length ? marks[i + 1].index : src.length;
    const id = m[1];
    if (staged.has(id) && m[2] === "core") { out += staged.get(id) + "\n\n"; replaced++; console.log(`${f}: ${id} core → full`); }
    else out += src.slice(m.index, end);
  });
  if (!dry) fs.writeFileSync(p, out.replace(/\n{3,}$/, "\n").replace(/\s*$/, "\n"));
}
console.log(`${replaced} lessons replaced${dry ? " (dry run)" : ""}; ${staged.size} staged files.`);
