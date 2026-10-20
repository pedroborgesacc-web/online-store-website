export const meta = {
  name: 'fl-exam-lessons-review',
  description: 'Write the 7 missing full lessons, then one combined adversarial review and line-by-line fact audit per batch, fixing problems in place',
  phases: [
    { title: 'Write', detail: 'missing lessons in ch16, ch18, ch19' },
    { title: 'Review', detail: 'adversarial review + fact audit, fixes in place' },
  ],
}

const A = args
const ROOT = A.root
const pack = b => ROOT + '/staging/_ctx/' + b.name + '.md'
const files = b => b.lessons.map(l => ROOT + '/staging/' + l.id + '.md').join(', ')
const ids = ls => ls.map(l => l.id + ' "' + l.title + '" (' + l.type + ')').join('; ')

const LEARNER = 'The learner is a Portuguese real estate professional who knows practical brokerage but not US/Florida law, US units or exam vocabulary. Clear, accessible English; define terms before using them; realistic Florida examples; never sacrifice legal accuracy for simplicity.'
const SOURCE_RULES = b => [
  'SOURCES: read the context pack ' + pack(b) + ' once, in full. It contains the lesson objectives, the current core notes, the numbers database entries, the verification entries (official-source checks of 2026-10-19/20, which override the study manual), the Portugal-vs-Florida comparison entries, glossary entries, the practice questions for these lessons, and the relevant study-manual chapters. Do NOT use WebSearch or WebFetch. Do not open the data/ files or the full manual: the pack has what you need.',
  'ACCURACY: no statute, rule, number, deadline, percentage or threshold that is not in the pack. Preserve legal qualifications and exceptions. A fact is "verified" only if its verification entry has status confirmed, corrected or gap-filled; facts that rest only on the manual (including everything under V-26) carry "(manual; not yet verified)"; unresolved entries are taught with a flag; pending-law items are not law. Where an older figure may still appear in exam materials (e.g. condo resale 3 days, month-to-month 15 days, $500 exemption), mention it explicitly as outdated. Verification ids (V-nn) may be cited as they appear in the pack. No case law other than what the pack cites.',
  'PORTUGAL: only Portuguese facts present in the pack\'s comparison entries; label anything else "requires verification"; never let a Portuguese rule answer a Florida question.',
]
const FORMAT_RULES = [
  'FORMAT: first line of each file exactly "<!-- lesson: <LessonId> | content: full -->", then a blank line. Then EXACTLY these level-2 headings, in order: "## 2. Why it matters", "## 3. Simple explanation", "## 4. Key terms", "## 5. Practical example", "## 6. Portugal comparison", "## 7. Legal and numerical requirements", "## 8. Visual explanation", "## 9. Common misconceptions", "## 10. Memory sheet". No section 1 or 11-14. Level-3 headings allowed inside sections.',
  'SECTIONS: 2 = practical and exam relevance. 3 = build from the foundation upward; explain WHY rules work as they do. 4 = two-column Markdown table of essential terms. 5 = realistic Florida scenario applying the rules. 6 = Portugal vs Florida: familiar principle, Florida rule, precise difference, exam implication (if no meaningful difference, say so briefly). 7 = subsections "**Memorize exactly**" and "**Understand**". 8 = a table, decision tree, timeline, diagram or worked calculation. 9 = misconceptions with the correction. 10 = concise memory sheet.',
  'CALCULATION lessons (type calculation): inside "## 3. Simple explanation" use level-3 headings "### Step 1: What it represents", "### Step 2: Units", "### Step 3: Formula", "### Step 4: When it applies", "### Step 5: Worked example", "### Step 6: Reasonableness check", "### Step 7: Common errors", "### Step 8: Guided practice", "### Step 9: Independent practice", "### Step 10: Exam application". Every practice answer inside <details><summary>Check your answer</summary> ... </details>. Recompute every number twice. US customary units (metric only as an aside). Course conventions (V-79, a convention, not law): 365-day year, buyer owns the day of closing; documentary stamps rounded UP to the next $100.',
  'VISUALS: Markdown tables, or raw HTML using only: <div class="stack"><div class="stack-row"><b>..</b><span>..</span></div></div> (rows may add class fed or court); <div class="decision"><div class="q">question</div><div class="no">branch</div><div class="yes">result</div></div>; <div class="timeline"><div><b>..</b><span>..</span></div></div>; <p class="caption">..</p>. Markdown inside raw HTML is not rendered: use <b>/<i> there.',
  'LENGTH: roughly 1,000-2,000 words per lesson; prefer tables to long prose; no large blocks of statute text; no long verbatim passages from the manual.',
]
const EFFICIENT = 'EFFICIENCY: read the pack once and each file once. Batch your changes: when a lesson needs more than three edits, rewrite it with a single Write call instead of many small edits.'

const WSCHEMA = { type: 'object', properties: {
  written: { type: 'array', items: { type: 'string' } },
  manualOnly: { type: 'array', items: { type: 'string' } },
  notes: { type: 'string' } }, required: ['written', 'manualOnly', 'notes'] }
const RSCHEMA = { type: 'object', properties: {
  factsChecked: { type: 'integer' },
  issues: { type: 'array', items: { type: 'object', properties: {
    lesson: { type: 'string' }, severity: { type: 'string', enum: ['blocker', 'major', 'minor'] },
    category: { type: 'string' }, quote: { type: 'string' }, problem: { type: 'string' },
    action: { type: 'string', enum: ['fixed', 'left'] }, reason: { type: 'string' } },
    required: ['lesson', 'severity', 'category', 'quote', 'problem', 'action', 'reason'] } },
  questionProblems: { type: 'array', items: { type: 'string' } },
  summary: { type: 'string' } }, required: ['factsChecked', 'issues', 'questionProblems', 'summary'] }

function writePrompt(b, ls) {
  return ['Write full study lessons for a Florida Real Estate Sales Associate exam-prep curriculum. ' + LEARNER,
    'Lessons to write: ' + ids(ls) + '. (Other lessons of this batch already exist in ' + ROOT + '/staging/; do not modify them, but keep consistent with them.)',
    'Format and tone model: the lesson block that starts with "<!-- lesson: L02-3" in ' + ROOT + '/lessons/ch02.md (read only that block).']
    .concat(SOURCE_RULES(b)).concat(FORMAT_RULES).concat([
    'Every rule, number, qualification, correction and flag in the current core notes (pack section 2) for these lessons must survive in the full lesson. Cover every objective in pack section 1.',
    'OUTPUT: write each lesson to ' + ROOT + '/staging/<LessonId>.md with one Write call per lesson. Do not modify any other file. Return the ids written, the manual-only facts you relied on, and notes.',
  ]).join('\n')
}
function reviewPrompt(b) {
  return ['You are an adversarial reviewer, fact auditor AND editor for Florida Real Estate Sales Associate exam lessons written by another author. Assume errors exist; find them; fix them directly in the files. ' + LEARNER,
    'Lessons: ' + files(b) + ' (' + ids(b.lessons) + ').']
    .concat(SOURCE_RULES(b)).concat(FORMAT_RULES).concat([
    'PART 1 — FACT AUDIT (exhaustive): go through each lesson line by line. For every number, deadline, percentage, dollar amount, threshold, legal rule, statute/rule citation, verification label and calculation, find its support in the pack (sections 3-5 first, then the manual text) and recompute every calculation independently. Count the facts you checked (factsChecked).',
    'PART 2 — REVIEW: also check for (a) coverage loss: any rule, qualification, correction or flag in the core notes (pack section 2) that the lesson dropped or weakened, and any objective (pack section 1) not taught; (b) invented law, statutes, rules, cases, numbers or requirements; (c) verification labels: unverified facts presented as verified, verified facts still labelled "not yet verified", unresolved items presented as settled, wrong V-ids; (d) structure: first line, the nine headings in order, calculation Steps 1-10 with answers hidden in <details>; (e) Portugal statements not supported by the pack\'s comparison entries and not labelled "requires verification", or any suggestion that Portuguese law answers a Florida question; (f) contradictions with the practice questions in pack section 8 (if the QUESTION looks wrong rather than the lesson, leave the lesson and report it in questionProblems with the question id); (g) misleading simplifications, ambiguous wording, unexplained jargon.',
    'FIX: edit the staged files to fix every blocker and major issue, and minor ones where the fix is clear. Smallest correct change; keep the structure. Do not shorten correct content just for length. Do not introduce new unsourced facts. If a suspected issue turns out to be correct per the pack, leave the text and report it with action "left" and the reason.',
    EFFICIENT,
    'severity: blocker = wrong law/number/arithmetic, dropped rule, invented fact; major = verification-label error, missing qualification, structure error, misleading; minor = clarity/style. Quote the original offending text in quote. Return every issue found.',
  ]).join('\n')
}

const results = await pipeline(A.batches,
  b => b.write && b.write.length
    ? agent(writePrompt(b, b.lessons.filter(l => b.write.includes(l.id))), { label: 'write:' + b.name, phase: 'Write', schema: WSCHEMA }).then(w => w ? { b, w } : null)
    : Promise.resolve({ b, w: null }),
  x => x ? agent(reviewPrompt(x.b), { label: 'review:' + x.b.name, phase: 'Review', schema: RSCHEMA }).then(r => r ? Object.assign(x, { r }) : null) : null,
)
const done = [], failed = []
results.forEach((x, i) => x && x.r ? done.push({ batch: x.b.name, lessons: x.b.lessons.map(l => l.id), write: x.w, review: x.r }) : failed.push(A.batches[i].name))
log('Reviewed batches: ' + done.map(d => d.batch).join(', ') + ' | incomplete: ' + (failed.join(', ') || 'none'))
return { done, failed }