// Printable English → Portuguese vocabulary, by exam section (highest value first).
//   node scripts/print_vocab.mjs [--format A4|Letter|both]   (run node scripts/build.mjs first)
// Writes dist/print/vocabulary-EN-PT-<format>.pdf.
import { createRequire } from "node:module";
import { execSync } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";
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
const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const chOf = new Map(data.lessons.map((l) => [l.id, l.ch]));
const sections = [...data.chapters].sort((a, b) => b.examPct - a.examPct || a.n - b.n).map((c) => ({
  c, terms: data.vocab.filter((v) => chOf.get(v[3]) === c.id).sort((a, b) => a[0].localeCompare(b[0])),
})).filter((s) => s.terms.length);

const html = `<!doctype html><html lang="pt"><head><meta charset="utf-8"><title>Vocabulário EN-PT</title><style>
* { box-sizing: border-box; } html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body { margin: 0; color: #151515; font: 9.6pt/1.35 "Bitstream Charter", "DejaVu Serif", serif; }
h1 { font: 700 20pt Inter, sans-serif; margin: 0 0 4pt; } .intro { font-size: 9.5pt; color: #444; margin: 0 0 10pt; }
h2 { font: 700 11.5pt Inter, sans-serif; color: #1d4e89; margin: 12pt 0 4pt; padding-bottom: 2pt; border-bottom: 1.2pt solid #1d4e89; break-after: avoid; }
.cols { columns: 2; column-gap: 14pt; }
.t { break-inside: avoid; margin: 0 0 4.5pt; }
.en { font: 700 9.4pt Inter, sans-serif; } .alt { font: 400 7.8pt Inter, sans-serif; color: #666; }
.pt { font-weight: 700; color: #1d4e89; } .d { color: #333; }
</style></head><body>
<h1>Vocabulário do exame: inglês → português</h1>
<p class="intro">${data.vocab.length} termos, por secção do exame (as que valem mais perguntas primeiro). Os equivalentes portugueses são aproximados: no exame só conta a lei da Florida. Na app, toque numa palavra sublinhada para ver o mesmo.</p>
${sections.map(({ c, terms }) => `<h2>${c.n}. ${esc(c.title)} · ${c.examPct} de 100 perguntas</h2><div class="cols">${terms.map(([forms, pt, d]) => {
  const [en, ...alt] = forms.split("|");
  return `<div class="t"><span class="en">${esc(en)}</span>${alt.length ? ` <span class="alt">(${esc(alt.join(", "))})</span>` : ""} → <span class="pt">${esc(pt)}</span><br><span class="d">${esc(d)}</span></div>`;
}).join("")}</div>`).join("")}</body></html>`;

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: "load" });
  const footer = `<div style="width:100%;font:8px Inter,sans-serif;color:#777;text-align:center;">Vocabulário EN→PT · <span class="pageNumber"></span> / <span class="totalPages"></span></div>`;
  for (const format of formats) {
    const path = join(OUT, `vocabulario-EN-PT-${format}.pdf`);
    await page.pdf({ path, format, printBackground: true, displayHeaderFooter: true, headerTemplate: "<div></div>", footerTemplate: footer, margin: { top: "14mm", bottom: "15mm", left: "15mm", right: "14mm" } });
    console.log(`${format} → ${path}`);
  }
} finally {
  await browser.close();
}
