export const meta = {
  name: 'fl-exam-verify-and-expand',
  description: 'Verify unverified Florida exam rules against official sources, then write, adversarially review and fix full lessons for the 61 core lessons',
  phases: [
    { title: 'Verify', detail: '7 topical batches researched against official sources' },
    { title: 'Skeptic', detail: 'independent attempt to refute each batch verdict' },
    { title: 'Write', detail: '19 lesson batches written to staging/<LessonId>.md' },
    { title: 'Review', detail: 'adversarial accuracy/coverage review per batch' },
    { title: 'Fix', detail: 'apply review findings, then re-review' },
  ],
}

const A = args
const ROOT = A.root

const VSCHEMA = { type: 'object', properties: { items: { type: 'array', items: { type: 'object', properties: {
  key: { type: 'string' }, manualClaim: { type: 'string' },
  status: { type: 'string', enum: ['confirmed', 'corrected', 'unresolved'] },
  finding: { type: 'string' }, citation: { type: 'string' }, url: { type: 'string' }, method: { type: 'string' } },
  required: ['key', 'status', 'finding', 'citation', 'url', 'method'] } } }, required: ['items'] }
const SKSCHEMA = { type: 'object', properties: { items: { type: 'array', items: { type: 'object', properties: {
  key: { type: 'string' }, agree: { type: 'boolean' }, note: { type: 'string' }, url: { type: 'string' } },
  required: ['key', 'agree', 'note'] } } }, required: ['items'] }
const WSCHEMA = { type: 'object', properties: { written: { type: 'array', items: { type: 'string' } },
  manualOnlyFacts: { type: 'array', items: { type: 'string' } }, notes: { type: 'string' } }, required: ['written', 'notes'] }
const RSCHEMA = { type: 'object', properties: { issues: { type: 'array', items: { type: 'object', properties: {
  lesson: { type: 'string' }, severity: { type: 'string', enum: ['blocker', 'major', 'minor'] },
  quote: { type: 'string' }, problem: { type: 'string' }, fix: { type: 'string' } },
  required: ['lesson', 'severity', 'problem', 'fix'] } } }, required: ['issues'] }
const FSCHEMA = { type: 'object', properties: { fixed: { type: 'array', items: { type: 'string' } },
  unresolved: { type: 'array', items: { type: 'string' } } }, required: ['fixed', 'unresolved'] }

const OFFICIAL = 'flsenate.gov, leg.state.fl.us, flrules.org, myfloridalicense.com, floridarevenue.com, ecfr.gov, consumerfinance.gov, hud.gov, ftc.gov, irs.gov, epa.gov, govinfo.gov, federalregister.gov, law.cornell.edu (for federal CFR/USC text only)'

function verifyPrompt(b) {
  return [
    'Verify these Florida Real Estate Sales Associate exam rules against OFFICIAL sources. Check date: ' + A.checkedOn + '.',
    'Tools: load WebSearch and WebFetch with ToolSearch. Use WebSearch with allowed_domains limited to official domains: ' + OFFICIAL + '. Try WebFetch on the official page too; this environment\'s network policy usually blocks those hosts, in which case rely on the official-domain search excerpts and say so in method (e.g. "official-excerpt" or "official-fetch").',
    'For each item decide:',
    '- confirmed: an official source states the same rule. Put the operative wording (paraphrase closely, keep qualifications and exceptions) in finding; citation = statute/rule/CFR section with edition year; url = the official page.',
    '- corrected: an official source states a different CURRENT rule. Give the current rule precisely, and what changed if known.',
    '- unresolved: official sources conflict, excerpts are fragmentary, or nothing official was found.',
    'Never mark confirmed or corrected from commercial exam-prep sites, blogs, AI summaries without an official URL, or memory. Run several searches per item if needed. Florida items: prefer the current (2025/2026) Florida Statutes and the current Florida Administrative Code rule.',
    'Items (key: manual claim [where to look]):',
    b.items.map(i => '- ' + i.key + ': ' + i.claim + ' [' + i.where + ']').join('\n'),
    'Return one entry per item key, including manualClaim.',
  ].join('\n')
}
function skepticPrompt(b, r) {
  return [
    'You are an independent skeptic checking another researcher\'s verdicts on Florida real estate exam rules (check date ' + A.checkedOn + '). Try to REFUTE each verdict.',
    'Load WebSearch with ToolSearch and search only official domains: ' + OFFICIAL + '.',
    'Rules: for a verdict of "corrected", you must independently find official support for the new rule; if you cannot, set agree=false. For "confirmed", set agree=false only if you find official evidence of a different current rule, or the cited source clearly does not support the claim. For "unresolved", set agree=true unless you can find a clear official answer (then agree=false and give it in note with url).',
    'Verdicts to check:',
    JSON.stringify(r.items, null, 1),
  ].join('\n')
}

const SOURCES = (b, V) => [
  'Project root: ' + ROOT,
  'Read first:',
  '1. ' + ROOT + '/lessons/ch01.md and ' + ROOT + '/lessons/ch02.md: the format and tone exemplars (full lessons; L01-1 and L02-3 are the best models).',
  '2. ' + b.files.map(f => ROOT + '/lessons/' + f).join(' and ') + ': the CURRENT core notes for these lessons. Every rule, number, qualification, correction and flag in them must survive.',
  '3. ' + ROOT + '/data/curriculum.mjs: each lesson\'s type, objectives (o), manual reference and prerequisites.',
  '4. ' + ROOT + '/data/numbers.mjs (entries whose l is one of these lessons), ' + ROOT + '/data/verification.mjs, ' + ROOT + '/data/comparisons.mjs (entries whose l includes these lessons), ' + ROOT + '/data/glossary.mjs (entries for these lessons), and this lesson set\'s practice questions in ' + ROOT + '/data/questions_*.mjs (align with them; do not copy them).',
  '5. The study manual, ' + b.manual + ': ' + A.manualPath + ' (if missing, read Google Doc fileId ' + A.manualDriveId + ' with the Google Drive MCP tool read_file_content).',
  '6. NEW VERIFICATION RESULTS from today (they override the manual and older verification entries where they conflict; "unresolved" items must be taught with a flag, not as settled fact):',
  V,
]

function writePrompt(b, V) {
  return [
    'Write full study lessons for a Florida Real Estate Sales Associate exam-prep curriculum. The learner is a Portuguese real estate professional who knows practical brokerage but not US/Florida law, US units or exam vocabulary. Clear, accessible English; define terms before using them; realistic Florida examples; never sacrifice legal accuracy for simplicity.',
    'Lessons to write: ' + b.lessons.map(l => l.id + ' "' + l.title + '" (' + l.type + ')').join('; '),
  ].concat(SOURCES(b, V)).concat([
    'FORMAT: each lesson uses EXACTLY these level-2 headings, in order: "## 2. Why it matters", "## 3. Simple explanation", "## 4. Key terms", "## 5. Practical example", "## 6. Portugal comparison", "## 7. Legal and numerical requirements", "## 8. Visual explanation", "## 9. Common misconceptions", "## 10. Memory sheet". Do not write section 1 or sections 11-14 (the app generates objectives, active recall, mastery and review plan). Level-3 headings are allowed inside sections.',
    'Section guidance: 2 = practical relevance and exam relevance. 3 = build from the foundation upward; explain WHY rules work as they do. 4 = a two-column Markdown table of essential terms. 5 = a realistic Florida scenario applying the rules. 6 = Portugal vs Florida: start from the familiar principle, then the Florida rule, then the precise difference and the exam implication; use ONLY Portuguese facts present in data/comparisons.mjs and label anything else "requires verification"; if there is no meaningful difference say so briefly; never let a Portuguese rule answer a Florida question. 7 = two subsections "**Memorize exactly**" and "**Understand**"; mark any fact that is only manual-based and not verified with "(manual; not yet verified)"; keep corrected/updated rules and, where an older figure may still appear in exam materials, mention it explicitly as outdated. 8 = a table, decision tree, timeline, diagram or worked calculation that clarifies a specific concept. 9 = misconceptions with the correction. 10 = a concise memory sheet.',
    'CALCULATION lessons (type calculation): inside "## 3. Simple explanation" use level-3 headings for the ten steps: "### Step 1: What it represents", "### Step 2: Units", "### Step 3: Formula", "### Step 4: When it applies", "### Step 5: Worked example", "### Step 6: Reasonableness check", "### Step 7: Common errors", "### Step 8: Guided practice", "### Step 9: Independent practice", "### Step 10: Exam application". Put every practice answer inside <details><summary>Check your answer</summary> ... </details> so it is hidden until opened. Recompute every number twice. Use US customary units (metric only as an aside for intuition). Course conventions: 365-day year, buyer owns the day of closing, documentary stamps rounded UP to the next $100.',
    'ACCURACY: introduce no statute, rule, number, deadline, percentage or threshold that is not in the sources above. Preserve legal qualifications and exceptions. Do not claim anything is verified unless its verification entry says so. Do not cite case law other than what the sources cite.',
    'VISUALS: Markdown tables, or raw HTML using only these classes: <div class="stack"><div class="stack-row"><b>..</b><span>..</span></div></div> (rows may add class fed or court); <div class="decision"><div class="q">question</div><div class="no">branch</div><div class="yes">result</div></div>; <div class="timeline"><div><b>..</b><span>..</span></div></div>; <p class="caption">..</p>.',
    'LENGTH: roughly 700-1,500 words per lesson; prefer tables to long prose; no large blocks of statute text.',
    'OUTPUT: write each lesson to ' + ROOT + '/staging/<LessonId>.md. The first line must be exactly "<!-- lesson: <LessonId> | content: full -->", then a blank line, then the sections. Do not modify any other file. Return the ids written, the manual-only facts you relied on, and notes.',
  ]).join('\n')
}
function reviewPrompt(b, V) {
  return [
    'You are an adversarial reviewer for Florida Real Estate Sales Associate exam lessons. Assume errors exist and find them. Do NOT edit any file.',
    'Lessons under review: ' + b.lessons.map(l => ROOT + '/staging/' + l.id + '.md').join(', '),
  ].concat(SOURCES(b, V)).concat([
    'Check every lesson for:',
    '(a) any number, deadline, percentage, threshold or rule that disagrees with data/numbers.mjs, data/verification.mjs, the new verification results, or the manual (where the manual is not overridden);',
    '(b) invented law: statutes, rules, cases, numbers or requirements not found in the sources;',
    '(c) coverage loss: any rule, qualification, correction or flag in the current core notes (lessons/' + b.files.join(', lessons/') + ') that the full lesson dropped or weakened;',
    '(d) unverified facts presented as verified, or unresolved items presented as settled;',
    '(e) structure: exactly the nine headings "## 2. Why it matters" .. "## 10. Memory sheet" in order; first line "<!-- lesson: ID | content: full -->"; calculation lessons have Steps 1-10 and hidden answers inside <details>;',
    '(f) arithmetic: recompute every worked example and practice answer;',
    '(g) Portugal statements not supported by data/comparisons.mjs and not labelled "requires verification", or any suggestion that Portuguese law answers a Florida question;',
    '(h) misleading simplifications, ambiguous wording, unexplained jargon.',
    'severity: blocker = wrong law/number/arithmetic or dropped rule; major = unverified-as-verified, missing qualification, structure error, misleading; minor = clarity/style. Quote the offending text in quote. Return an empty issues list only if you genuinely find nothing.',
  ]).join('\n')
}
function fixPrompt(b, issues, V) {
  return [
    'Fix these review findings in the staged lesson files. Edit only ' + b.lessons.map(l => ROOT + '/staging/' + l.id + '.md').join(', ') + '.',
    'Keep the required structure (first line marker; headings "## 2. Why it matters" .. "## 10. Memory sheet"; calculation lessons Steps 1-10 with answers in <details>). Do not introduce new unsourced facts while fixing.',
  ].concat(SOURCES(b, V)).concat([
    'Findings (JSON):',
    JSON.stringify(issues, null, 1),
    'If a finding is itself wrong (the lesson was correct per the sources), leave the text and list it in unresolved with the reason. Return the findings fixed and those left unresolved.',
  ]).join('\n')
}

// ── Phase 1: verification, each batch independently re-checked by a skeptic ──
const verified = await pipeline(A.verifyBatches,
  b => agent(verifyPrompt(b), { label: 'verify:' + b.name, phase: 'Verify', schema: VSCHEMA }),
  (r, b) => r ? agent(skepticPrompt(b, r), { label: 'skeptic:' + b.name, phase: 'Skeptic', schema: SKSCHEMA })
    .then(s => ({ batch: b.name, items: r.items, skeptic: s ? s.items : null })) : ({ batch: b.name, items: null, skeptic: null })
)
const finalV = []
const failedVerify = []
for (const v of verified) {
  if (!v || !v.items) { failedVerify.push(v ? v.batch : 'unknown'); continue }
  for (const it of v.items) {
    const sk = (v.skeptic || []).find(s => s.key === it.key)
    const disputed = sk && !sk.agree
    finalV.push(Object.assign({}, it, {
      finalStatus: disputed ? 'unresolved' : it.status,
      skepticNote: sk ? sk.note : 'skeptic unavailable',
      skepticUrl: sk && sk.url ? sk.url : '',
    }))
  }
}
log('Verification: ' + finalV.length + ' items; corrected ' + finalV.filter(x => x.finalStatus === 'corrected').length + ', confirmed ' + finalV.filter(x => x.finalStatus === 'confirmed').length + ', unresolved ' + finalV.filter(x => x.finalStatus === 'unresolved').length + (failedVerify.length ? '; failed batches: ' + failedVerify.join(', ') : ''))
const V = JSON.stringify(finalV.map(x => ({ key: x.key, status: x.finalStatus, rule: x.finding, citation: x.citation, manualClaim: x.manualClaim })), null, 1)

// ── Phase 2: lessons — write → review → fix → re-review ──
const lessonResults = await pipeline(A.lessonBatches,
  b => agent(writePrompt(b, V), { label: 'write:' + b.name, phase: 'Write', schema: WSCHEMA }),
  (w, b) => w ? agent(reviewPrompt(b, V), { label: 'review:' + b.name, phase: 'Review', schema: RSCHEMA }).then(r => ({ w, r })) : null,
  (x, b) => {
    if (!x) return { batch: b.name, ok: false, stage: 'write' }
    if (!x.r) return { batch: b.name, ok: false, stage: 'review', written: x.w.written }
    if (!x.r.issues.length) return { batch: b.name, ok: true, written: x.w.written, manualOnly: x.w.manualOnlyFacts || [], issues: 0 }
    return agent(fixPrompt(b, x.r.issues, V), { label: 'fix:' + b.name, phase: 'Fix', schema: FSCHEMA })
      .then(f => ({ batch: b.name, written: x.w.written, manualOnly: x.w.manualOnlyFacts || [], firstIssues: x.r.issues, fix: f }))
  },
  (y, b) => {
    if (!y || y.ok !== undefined) return y
    return agent(reviewPrompt(b, V), { label: 're-review:' + b.name, phase: 'Fix', schema: RSCHEMA })
      .then(r2 => ({ batch: b.name, ok: !!r2 && !r2.issues.some(i => i.severity !== 'minor'), written: y.written, manualOnly: y.manualOnly,
        issues: y.firstIssues.length, fixed: y.fix ? y.fix.fixed.length : 0, unresolvedAfterFix: y.fix ? y.fix.unresolved : ['fix agent failed'],
        remaining: r2 ? r2.issues : [{ severity: 'major', problem: 're-review failed' }] }))
  }
)
return {
  verification: finalV,
  failedVerifyBatches: failedVerify,
  lessons: lessonResults,
  failedLessonBatches: lessonResults.filter(r => !r || r.ok === false).map(r => r ? r.batch : 'unknown'),
}
