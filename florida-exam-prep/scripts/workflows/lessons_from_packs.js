export const meta = {
  name: 'fl-exam-lessons-from-packs',
  description: 'Write missing full lessons, then adversarially review-and-fix and fact-audit every staged lesson batch, using compact per-batch context packs',
  phases: [
    { title: 'Write', detail: 'full lessons for batches with no staged draft' },
    { title: 'Review', detail: 'adversarial review that fixes problems in place' },
    { title: 'Audit', detail: 'independent fact-by-fact accuracy audit with fixes' },
  ],
}

const A = args
const ROOT = A.root
const pack = b => ROOT + '/staging/_ctx/' + b.name + '.md'
const files = b => b.lessons.map(l => ROOT + '/staging/' + l.id + '.md').join(', ')
const ids = b => b.lessons.map(l => l.id + ' "' + l.title + '" (' + l.type + ')').join('; ')

const LEARNER = 'The learner is a Portuguese real estate professional who knows practical brokerage but not US/Florida law, US units or exam vocabulary. Clear, accessible English; define terms before using them; realistic Florida examples; never sacrifice legal accuracy for simplicity.'
const SOURCE_RULES = [
  'SOURCES: read the context pack ' + '{PACK}' + ' in full. It contains the lesson objectives, the current core notes, the numbers database entries, the verification entries (official-source checks of 2026-10-19/20, which override the study manual), the Portugal-vs-Florida comparison entries, glossary entries, the practice questions for these lessons, and the relevant study-manual chapters. Do NOT use WebSearch or WebFetch. Do not open the data/ files or the full manual: the pack has what you need.',
  'ACCURACY: introduce no statute, rule, number, deadline, percentage or threshold that is not in the pack. Preserve legal qualifications and exceptions. A fact is "verified" only if its verification entry has status confirmed, corrected or gap-filled; facts that rest only on the manual (including everything under V-26) must carry "(manual; not yet verified)"; unresolved entries are taught with a flag; pending-law items are not law. Where an older figure may still appear in exam materials (e.g. condo resale 3 days, month-to-month 15 days, $500 exemption), mention it explicitly as outdated. You may cite verification ids (V-nn) as they appear in the pack. Do not cite case law other than what the pack cites.',
  'PORTUGAL: use ONLY Portuguese facts present in the pack\'s comparison entries; label anything else "requires verification"; never let a Portuguese rule answer a Florida question.',
]
const FORMAT_RULES = [
  'FORMAT: the first line of each file is exactly "<!-- lesson: <LessonId> | content: full -->", then a blank line. Then EXACTLY these level-2 headings, in order: "## 2. Why it matters", "## 3. Simple explanation", "## 4. Key terms", "## 5. Practical example", "## 6. Portugal comparison", "## 7. Legal and numerical requirements", "## 8. Visual explanation", "## 9. Common misconceptions", "## 10. Memory sheet". No section 1 or 11-14 (the app generates objectives, active recall, mastery and review plan). Level-3 headings are allowed inside sections.',
  'SECTIONS: 2 = practical relevance and exam relevance. 3 = build from the foundation upward; explain WHY rules work as they do. 4 = a two-column Markdown table of essential terms. 5 = a realistic Florida scenario applying the rules. 6 = Portugal vs Florida: the familiar principle, then the Florida rule, then the precise difference and the exam implication; if there is no meaningful difference say so briefly. 7 = two subsections "**Memorize exactly**" and "**Understand**". 8 = a table, decision tree, timeline, diagram or worked calculation that clarifies a specific concept. 9 = misconceptions with the correction. 10 = a concise memory sheet.',
  'CALCULATION lessons (type calculation): inside "## 3. Simple explanation" use level-3 headings "### Step 1: What it represents", "### Step 2: Units", "### Step 3: Formula", "### Step 4: When it applies", "### Step 5: Worked example", "### Step 6: Reasonableness check", "### Step 7: Common errors", "### Step 8: Guided practice", "### Step 9: Independent practice", "### Step 10: Exam application". Every practice answer goes inside <details><summary>Check your answer</summary> ... </details>. Recompute every number twice. US customary units (metric only as an aside). Course conventions (V-79, a convention, not law): 365-day year, buyer owns the day of closing; documentary stamps rounded UP to the next $100.',
  'VISUALS: Markdown tables, or raw HTML using only: <div class="stack"><div class="stack-row"><b>..</b><span>..</span></div></div> (rows may add class fed or court); <div class="decision"><div class="q">question</div><div class="no">branch</div><div class="yes">result</div></div>; <div class="timeline"><div><b>..</b><span>..</span></div></div>; <p class="caption">..</p>. Markdown inside raw HTML blocks is not rendered, so use <b>/<i> there.',
  'LENGTH: roughly 1,000-2,000 words per lesson; prefer tables to long prose; no large blocks of statute text; no long verbatim passages from the manual.',
]
const fill = (arr, b) => arr.map(s => s.split('{PACK}').join(pack(b)))

const WSCHEMA = { type: 'object', properties: {
  written: { type: 'array', items: { type: 'string' } },
  manualOnly: { type: 'array', items: { type: 'string' } },
  notes: { type: 'string' } }, required: ['written', 'manualOnly', 'notes'] }
const RSCHEMA = { type: 'object', properties: {
  issues: { type: 'array', items: { type: 'object', properties: {
    lesson: { type: 'string' }, severity: { type: 'string', enum: ['blocker', 'major', 'minor'] },
    category: { type: 'string' }, quote: { type: 'string' }, problem: { type: 'string' },
    action: { type: 'string', enum: ['fixed', 'left'] }, reason: { type: 'string' } },
    required: ['lesson', 'severity', 'category', 'quote', 'problem', 'action', 'reason'] } },
  summary: { type: 'string' } }, required: ['issues', 'summary'] }
const ASCHEMA = { type: 'object', properties: {
  factsChecked: { type: 'integer' },
  problems: { type: 'array', items: { type: 'object', properties: {
    lesson: { type: 'string' }, quote: { type: 'string' }, problem: { type: 'string' },
    action: { type: 'string', enum: ['fixed', 'left'] }, reason: { type: 'string' } },
    required: ['lesson', 'quote', 'problem', 'action', 'reason'] } },
  summary: { type: 'string' } }, required: ['factsChecked', 'problems', 'summary'] }

function writePrompt(b) {
  return ['Write full study lessons for a Florida Real Estate Sales Associate exam-prep curriculum. ' + LEARNER,
    'Lessons to write: ' + ids(b) + '.',
    'Format and tone model: the lesson block that starts with "<!-- lesson: L02-3" in ' + ROOT + '/lessons/ch02.md (read only that block).']
    .concat(fill(SOURCE_RULES, b)).concat(FORMAT_RULES).concat([
    'Every rule, number, qualification, correction and flag in the current core notes (pack section 2) must survive in the full lesson. Cover every objective in pack section 1.',
    'OUTPUT: write each lesson to ' + ROOT + '/staging/<LessonId>.md. Do not modify any other file. Return the ids written, the manual-only facts you relied on, and notes.',
  ]).join('\n')
}
function reviewPrompt(b) {
  return ['You are an adversarial reviewer AND editor for Florida Real Estate Sales Associate exam lessons written by another author. Assume errors exist; find them; then fix them directly in the files. ' + LEARNER,
    'Lessons: ' + files(b) + ' (' + ids(b) + ').']
    .concat(fill(SOURCE_RULES, b)).concat(FORMAT_RULES).concat([
    'CHECK every lesson for: (a) any number, deadline, percentage, threshold or rule that disagrees with pack sections 3-5, or with the manual where not overridden; (b) invented law: statutes, rules, cases, numbers or requirements not in the pack; (c) coverage loss: any rule, qualification, correction or flag in the core notes (pack section 2) that the lesson dropped or weakened, and any objective (pack section 1) not taught; (d) verification labels: unverified facts presented as verified, verified facts still labelled "not yet verified", unresolved items presented as settled, wrong V-ids; (e) structure: first line, the nine headings in order, calculation Steps 1-10 with answers hidden in <details>; (f) arithmetic: recompute every worked example and practice answer; (g) Portugal statements not supported by the pack\'s comparison entries and not labelled "requires verification", or any suggestion that Portuguese law answers a Florida question; (h) contradictions with the practice questions in pack section 8 (if a question looks wrong rather than the lesson, leave the lesson and report it); (i) misleading simplifications, ambiguous wording, unexplained jargon.',
    'FIX: edit the staged files to fix every blocker and major issue, and minor ones where the fix is clear. Do not shorten correct content just for length. Do not introduce new unsourced facts. If a suspected issue turns out to be correct per the pack, leave the text and report it with action "left" and the reason.',
    'severity: blocker = wrong law/number/arithmetic, dropped rule, invented fact; major = verification-label error, missing qualification, structure error, misleading; minor = clarity/style. Quote the original offending text in quote. Return every issue found, with action fixed or left.',
  ]).join('\n')
}
function auditPrompt(b) {
  return ['You are an independent fact auditor for Florida Real Estate Sales Associate exam lessons. Other agents wrote and reviewed them; your job is narrow and exhaustive: check EVERY factual claim.',
    'Lessons: ' + files(b) + '.']
    .concat(fill(SOURCE_RULES, b)).concat([
    'METHOD: go through each lesson line by line. For every number, deadline, percentage, dollar amount, threshold, legal rule, statute/rule citation, verification label and calculation: find its support in the pack (sections 3-5 first, then the manual text) and recompute every calculation independently. Count the facts you checked.',
    'FIX in place anything unsupported, contradicted, mislabelled or miscalculated (smallest correct change; keep the structure: first line marker, the nine "## N." headings, calculation Steps and <details> answers). If a claim is correct but you cannot find support, change it to match the pack or label it "(manual; not yet verified)" only if it is in the manual. Report every problem with action fixed or left (left only when the text was in fact correct, with the reason).',
  ]).join('\n')
}

const need = new Set(A.needWrite)
const results = await pipeline(A.batches,
  b => need.has(b.name)
    ? agent(writePrompt(b), { label: 'write:' + b.name, phase: 'Write', schema: WSCHEMA }).then(w => w ? { b, w } : null)
    : Promise.resolve({ b, w: { written: b.lessons.map(l => l.id), manualOnly: [], notes: 'draft already staged' } }),
  x => x ? agent(reviewPrompt(x.b), { label: 'review:' + x.b.name, phase: 'Review', schema: RSCHEMA }).then(r => r ? Object.assign(x, { r }) : null) : null,
  x => x ? agent(auditPrompt(x.b), { label: 'audit:' + x.b.name, phase: 'Audit', schema: ASCHEMA }).then(a => a ? Object.assign(x, { a }) : null) : null,
)
const done = [], failed = []
results.forEach((x, i) => x && x.a ? done.push({ batch: x.b.name, lessons: x.b.lessons.map(l => l.id), write: x.w, review: x.r, audit: x.a }) : failed.push(A.batches[i].name))
log('Batches complete (written, reviewed, audited): ' + done.length + '; incomplete: ' + (failed.join(', ') || 'none'))
return { done, failed }