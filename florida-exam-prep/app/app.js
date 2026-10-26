(() => {
"use strict";

// ═════════════════════════════════════════════════════════════════════
// Data & indexes
// ═════════════════════════════════════════════════════════════════════
const DATA = JSON.parse(document.getElementById("app-data").textContent);
const CH = new Map(DATA.chapters.map((c) => [c.id, c]));
const LS_ = new Map(DATA.lessons.map((l) => [l.id, l]));
const Q = new Map(DATA.questions.map((q) => [q.id, q]));
const FC = new Map(DATA.flashcards.map((f) => [f.id, f]));
const NUM = new Map(DATA.numbers.map((n) => [n.id, n]));
const VER = new Map(DATA.verification.map((v) => [v.id, v]));
const OBJ = new Map(DATA.objectives.map((o) => [o.id, o]));
const objOf = (q) => `O-${q.l}-${q.o + 1}`;
const qByLesson = group(DATA.questions, (q) => q.l);
const qByObj = group(DATA.questions, objOf);
const fcByLesson = group(DATA.flashcards, (f) => f.l);
const lessonsByCh = group(DATA.lessons, (l) => l.ch);
const objByLesson = group(DATA.objectives, (o) => o.l);
const chOfLesson = (lid) => LS_.get(lid)?.ch;
const CALC_LESSONS = DATA.lessons.filter((l) => l.type === "calculation").map((l) => l.id);
const isCalcQ = (q) => q.t === "num" || CALC_LESSONS.includes(q.l);

const STATUS = ["NOT_STARTED", "INTRODUCED", "DEVELOPING", "NEEDS_REVIEW", "PROFICIENT", "EXAM_READY"];
const STATUS_LABEL = { NOT_STARTED: "Not started", INTRODUCED: "Introduced", DEVELOPING: "Developing", NEEDS_REVIEW: "Needs review", PROFICIENT: "Proficient", EXAM_READY: "Exam-ready" };
const CAT_LABEL = {
  RULE: "Did not know the rule", CONFUSED: "Confused two similar rules", PT: "Applied Portuguese assumptions",
  MISREAD: "Misunderstood the question", QUALIFIER: "Misread a legal qualification", NUMBER: "Forgot a number or deadline",
  FORMULA: "Used the wrong formula", ARITH: "Made an arithmetic error", UNITS: "Confused units / decimal placement",
  GUESS: "Guessed correctly", NOEXPL: "Correct, but could not explain why",
};
const V_LABEL = { confirmed: "Verified", corrected: "Corrected vs manual", "gap-filled": "Added from official source", unresolved: "Unresolved", "pending-law": "Pending law", "not-verified": "Not yet verified" };
const MODES = {
  A: { name: "Lesson quiz", desc: "Questions on one lesson, easiest first." },
  B: { name: "Chapter review", desc: "Questions from one chapter, mixed." },
  C: { name: "Cumulative review", desc: "Interleaved questions from everything you have studied." },
  D: { name: "Weakness training", desc: "Targets your mistake log and weakest objectives, using new variants where possible." },
  E: { name: "Calculation practice", desc: "Numeric problems, increasing difficulty." },
  F: { name: "Florida law & numbers", desc: "Exact rules, deadlines, thresholds." },
  G: { name: "Mixed exam practice", desc: "25 questions across the syllabus, weighted like the exam." },
  H: { name: "Timed mock exam", desc: "100 questions · 3.5 hours · 75 to pass. No feedback until the end." },
  R: { name: "Spaced review", desc: "Questions whose review date has arrived." },
};
const MIXED_MODES = new Set(["C", "D", "G", "H", "R"]);

// Personal study plan: only present in the learner's own build (never in the public files).
const PLAN = DATA.plan || null;
const PLAN_FAST = new Set(PLAN?.fast || []);
const PLAN_DAY_OF = new Map(); // lesson id → planned date (YYYY-MM-DD)
if (PLAN) for (const d of PLAN.days) for (const id of d.lessons || []) PLAN_DAY_OF.set(id, d.date);

// ═════════════════════════════════════════════════════════════════════
// Utilities
// ═════════════════════════════════════════════════════════════════════
function group(list, key) { const m = new Map(); for (const x of list) { const k = key(x); if (!m.has(k)) m.set(k, []); m.get(k).push(x); } return m; }
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const now = () => Date.now();
const DAY = 86400000;
const dayKey = (t = now()) => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const fmtDate = (t) => t ? new Date(t).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "—";
const fmtDue = (t) => { if (!t) return "—"; const d = t - now(); if (d <= 0) return "due now"; if (d < 3600000) return `in ${Math.ceil(d / 60000)} min`; if (d < DAY) return `in ${Math.ceil(d / 3600000)} h`; return `in ${Math.round(d / DAY)} d`; };
const pct = (a, b) => (b ? Math.round((100 * a) / b) : 0);
const shuffle = (a) => { a = [...a]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const uid = () => Math.random().toString(36).slice(2, 10) + now().toString(36);
const uniq = (a) => [...new Set(a)];
const plain = (html) => html.replace(/<[^>]+>/g, " ").replace(/&[a-z#0-9]+;/gi, " ").replace(/\s+/g, " ");
function toast(msg) { const t = document.createElement("div"); t.className = "toast"; t.textContent = msg; document.body.appendChild(t); setTimeout(() => t.remove(), 2600); }
function chip(text, cls = "") { return `<span class="chip ${cls}">${esc(text)}</span>`; }
function statusChip(st) { return chip(STATUS_LABEL[st], `st-${st}`); }
function vChip(vid) {
  if (!vid) return chip("From study manual · not independently verified", "v-not-verified");
  const v = VER.get(vid); if (!v) return "";
  return `<a href="#source~${vid}" class="chip v-${v.status}" title="${esc(v.topic)}">${esc(V_LABEL[v.status])} · ${vid}</a>`;
}

// ═════════════════════════════════════════════════════════════════════
// State & persistence
// ═════════════════════════════════════════════════════════════════════
const LS_KEY = "flexam.v1";
const blank = () => ({ v: 1, settings: { examDate: "", dailyMinutes: "", newCardsPerDay: 15 }, lessons: {}, items: {}, mistakes: {}, sessions: [], attempts: [], days: {}, updated: 0 });
let S = blank();
let live = null; // active quiz / card / exam session (in memory, mirrored to localStorage)

function lsGet(k) { try { return localStorage.getItem(k); } catch { return null; } }
function lsSet(k, v) { try { localStorage.setItem(k, v); return true; } catch { return false; } }

function mergeState(a, b) {
  // union two progress states, keeping the newest record per key
  const out = blank();
  out.settings = (b.updated || 0) >= (a.updated || 0) ? { ...a.settings, ...b.settings } : { ...b.settings, ...a.settings };
  out.lessons = { ...a.lessons, ...b.lessons };
  for (const src of [a.items, b.items]) for (const [k, v] of Object.entries(src || {})) if (!out.items[k] || (v.last || 0) > (out.items[k].last || 0)) out.items[k] = v;
  for (const src of [a.mistakes, b.mistakes]) for (const [k, v] of Object.entries(src || {})) if (!out.mistakes[k] || (v.last || 0) > (out.mistakes[k].last || 0)) out.mistakes[k] = v;
  const att = new Map(); for (const x of [...(a.attempts || []), ...(b.attempts || [])]) att.set(x.id, x);
  out.attempts = [...att.values()].sort((x, y) => x.t - y.t).slice(-8000);
  const ses = new Map(); for (const x of [...(a.sessions || []), ...(b.sessions || [])]) ses.set(x.id, x);
  out.sessions = [...ses.values()].sort((x, y) => x.started - y.started).slice(-300);
  out.days = { ...a.days }; for (const [k, v] of Object.entries(b.days || {})) out.days[k] = Math.max(out.days[k] || 0, v);
  out.updated = Math.max(a.updated || 0, b.updated || 0);
  return out;
}

const Store = {
  mode: "starting", db: null, dirty: new Set(), busy: new Set(), timer: null, dl: null,
  async init() {
    const raw = lsGet(LS_KEY);
    if (raw) { try { S = mergeState(blank(), JSON.parse(raw)); } catch { /* ignore corrupt local copy */ } }
    try { const l = lsGet(LS_KEY + ".live"); if (l) live = JSON.parse(l); } catch { live = null; }
    this.mode = raw !== null || lsSet(LS_KEY + ".probe", "1") ? "local" : "memory";
    paintStore(); route();
    let db = null;
    try { db = window.claude?.use ? await window.claude.use("db") : null; } catch { db = null; }
    if (db) {
      try { await this.loadRemote(db); this.db = db; this.mode = "cloud"; }
      catch (e) { console.warn("db load failed", e); }
    }
    try { this.dl = window.claude?.use ? await window.claude.use("downloads") : null; } catch { this.dl = null; }
    paintStore(); route();
  },
  async loadRemote(db) {
    const [core, iq, ifc, mk] = await Promise.all(["progress/core", "progress/itemsQ", "progress/itemsF", "progress/mistakes"].map((p) => db.doc(p).get()));
    const [att, ses] = await Promise.all([db.collection("attempts").get(), db.collection("sessions").get()]);
    const remote = blank();
    if (core.exists) Object.assign(remote, core.data(), { items: {}, mistakes: {}, attempts: [], sessions: [] });
    if (iq.exists) Object.assign(remote.items, iq.data().items || {});
    if (ifc.exists) Object.assign(remote.items, ifc.data().items || {});
    if (mk.exists) remote.mistakes = { ...(mk.data().mistakes || {}) };
    for (const d of att.docs) remote.attempts.push(...((d.data().list) || []));
    for (const d of ses.docs) remote.sessions.push(d.data());
    const hadLocal = S.attempts.length || Object.keys(S.lessons).length;
    S = mergeState(remote, S);
    if (hadLocal || !core.exists) {
      // push anything that exists only locally
      ["core", "itemsQ", "itemsF", "mistakes"].forEach((k) => this.dirty.add(k));
      for (const k of uniq(S.attempts.map((a) => dayKey(a.t)))) this.dirty.add("att:" + k);
      for (const s of S.sessions) this.dirty.add("ses:" + s.id);
      this.flushSoon();
    }
  },
  touch(...keys) {
    S.updated = now();
    keys.forEach((k) => this.dirty.add(k));
    // write the browser copy synchronously so closing the tab never loses an answer
    if (!lsSet(LS_KEY, JSON.stringify(S)) && this.mode === "local") { this.mode = "memory"; paintStore(); }
    this.flushSoon();
  },
  flushSoon() { if (!this.db) return; clearTimeout(this.timer); this.timer = setTimeout(() => this.flush(), 1200); },
  payload(k) {
    if (k === "core") return { v: S.v, settings: S.settings, lessons: S.lessons, days: S.days, updated: S.updated };
    if (k === "itemsQ" || k === "itemsF") { const pre = k === "itemsQ" ? "Q" : "F"; const items = {}; for (const [id, it] of Object.entries(S.items)) if (id[0] === pre) items[id] = it; return { items }; }
    if (k === "mistakes") return { mistakes: S.mistakes };
    if (k.startsWith("att:")) { const d = k.slice(4); return { day: d, list: S.attempts.filter((a) => dayKey(a.t) === d) }; }
    if (k.startsWith("ses:")) return S.sessions.find((s) => s.id === k.slice(4)) || null;
    return null;
  },
  path(k) { if (k.startsWith("att:")) return "attempts/" + k.slice(4); if (k.startsWith("ses:")) return "sessions/" + k.slice(4); return "progress/" + k; },
  async flush() {
    if (!this.db) return;
    for (const k of [...this.dirty]) {
      if (this.busy.has(k)) continue; // one write at a time per document
      this.dirty.delete(k); this.busy.add(k);
      const body = this.payload(k);
      try { if (body) await this.db.doc(this.path(k)).set(body); }
      catch (e) {
        console.warn("save failed", k, e);
        if (e?.code === "unavailable") this.dirty.add(k);
        else if (e?.code === "invalid_argument" || e?.code === "revoked" || e?.code === "not_granted") {
          // this viewer may not write the store (e.g. a shared copy): keep progress in the browser
          this.db = null; this.mode = "local"; paintStore(); toast("Progress is being saved in this browser only."); return;
        }
        else { toast(e?.code === "quota_exceeded" ? "Cloud storage is full. Export a backup in Settings." : "Could not save to cloud; progress kept in this browser."); }
      } finally { this.busy.delete(k); }
    }
    if (this.dirty.size) this.flushSoon();
  },
  saveLive() { lsSet(LS_KEY + ".live", live ? JSON.stringify(live) : ""); },
};

// push pending cloud writes immediately when the page is hidden or closed
const flushNow = () => { if (Store.db && Store.dirty.size) { clearTimeout(Store.timer); Store.flush(); } };
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") flushNow(); });
window.addEventListener("pagehide", flushNow);

function paintStore() {
  const el = $("#store");
  const m = { cloud: ["Saved to your account", "ok"], local: ["Saved in this browser", "local"], memory: ["Not saved — export a backup", "local"], starting: ["Loading…", ""] }[Store.mode];
  el.textContent = m[0]; el.className = "store-pill " + m[1];
}

// ═════════════════════════════════════════════════════════════════════
// Scheduling (spaced repetition) & mastery
// ═════════════════════════════════════════════════════════════════════
const STEPS = [10 / 1440, 1, 3, 7, 14, 30, 60]; // days: same session, 1, 3, 7, 14, 30, 60
// A personal plan sets the exam date and daily time, unless the learner saved other values after the plan was made.
const planRules = () => PLAN && !((S.settings.savedAt || "") >= PLAN.created);
const examDateSet = () => (planRules() ? PLAN.examDate : S.settings.examDate) || "";
const dailyMinSet = () => (planRules() ? PLAN.dailyMinutes : S.settings.dailyMinutes) || "";
function daysToExam() { const d = examDateSet(); if (!d) return null; return Math.ceil((new Date(d + "T09:00:00").getTime() - now()) / DAY); }
function capInterval(ivl) { const left = daysToExam(); if (left && left > 0) return Math.min(ivl, Math.max(1, Math.floor(left / 2))); return ivl; }
function schedule(id, result) {
  const it = S.items[id] || { step: -1, reps: 0, lapses: 0, hist: [] };
  const lastGood = it.hist.length && it.hist[it.hist.length - 1][1] === "good";
  let step = Math.max(it.step, 0), ivl;
  if (result === "wrong") { step = 0; it.lapses++; ivl = STEPS[0]; }
  else if (result === "guess") { step = Math.min(step, 1); ivl = 1; }
  else if (result === "hard") { step = Math.min(step + 1, STEPS.length - 1); ivl = Math.max(1, STEPS[step] * 0.5); }
  else { step = Math.min(step + (lastGood ? 2 : 1), STEPS.length - 1); ivl = STEPS[step]; }
  if (result !== "wrong") ivl = capInterval(ivl);
  it.step = step; it.reps++; it.last = now(); it.due = now() + ivl * DAY; it.hist = [...it.hist, [now(), result]].slice(-6);
  if (!it.first) it.first = now();
  S.items[id] = it;
}
const isDue = (id) => { const it = S.items[id]; return it && it.due <= now(); };
function dueQuestions() { return DATA.questions.filter((q) => isDue(q.id)).sort((a, b) => S.items[a.id].due - S.items[b.id].due); }
function studiedLessons() { return DATA.lessons.filter((l) => S.lessons[l.id]?.read).map((l) => l.id); }
function newCardsToday() { const k = dayKey(); return Object.entries(S.items).filter(([id, it]) => id[0] === "F" && dayKey(it.first) === k).length; }
function dueCards() {
  const due = DATA.flashcards.filter((f) => isDue(f.id)).sort((a, b) => S.items[a.id].due - S.items[b.id].due);
  const studied = new Set(studiedLessons());
  const room = Math.max(0, (Number(S.settings.newCardsPerDay) || 15) - newCardsToday());
  const fresh = DATA.flashcards.filter((f) => studied.has(f.l) && !S.items[f.id]).slice(0, room);
  return { due, fresh };
}

let _memo = null;
function memo() {
  if (_memo) return _memo;
  const byObj = new Map();
  for (const a of S.attempts) { const q = Q.get(a.q); if (!q) continue; const k = objOf(q); if (!byObj.has(k)) byObj.set(k, []); byObj.get(k).push(a); }
  const status = new Map();
  for (const o of DATA.objectives) status.set(o.id, objStatusFrom(o, byObj.get(o.id) || []));
  _memo = { byObj, status };
  return _memo;
}
const invalidate = () => { _memo = null; };
function objStatusFrom(o, list) {
  const studied = !!S.lessons[o.l]?.read;
  if (!list.length) return studied ? "INTRODUCED" : "NOT_STARTED";
  const indep = list.filter((a) => a.ok && a.c !== "g");
  const last = list[list.length - 1];
  const recent = list.slice(-4);
  const last3 = list.slice(-3);
  if (!last.ok || last3.some((a) => !a.ok && a.c === "s") || recent.filter((a) => !a.ok).length >= 2) return list.length < 2 ? "DEVELOPING" : "NEEDS_REVIEW";
  const recentIndep = recent.filter((a) => a.ok && a.c !== "g");
  const distinctQ = uniq(recentIndep.map((a) => a.q)).length;
  const proficient = recentIndep.length >= 3 && distinctQ >= 2 && last.ok;
  if (proficient) {
    const days = uniq(indep.map((a) => dayKey(a.t))).sort();
    const spread = days.length >= 2 && (new Date(days[days.length - 1]) - new Date(days[0])) / DAY >= 2;
    const mixed = indep.some((a) => MIXED_MODES.has(a.m));
    if (spread && mixed && indep.length >= 4 && !last3.some((a) => !a.ok)) return "EXAM_READY";
    return "PROFICIENT";
  }
  return list.length < 2 ? "INTRODUCED" : "DEVELOPING";
}
const objStatus = (oid) => memo().status.get(oid);
function statusCounts(objs) { const c = Object.fromEntries(STATUS.map((s) => [s, 0])); for (const o of objs) c[objStatus(o.id)]++; return c; }
function lessonStatus(lid) {
  const objs = objByLesson.get(lid) || [];
  const c = statusCounts(objs);
  if (c.NEEDS_REVIEW) return "NEEDS_REVIEW";
  if (c.EXAM_READY === objs.length) return "EXAM_READY";
  if (c.PROFICIENT + c.EXAM_READY === objs.length) return "PROFICIENT";
  if (c.NOT_STARTED === objs.length) return "NOT_STARTED";
  if (c.DEVELOPING || c.PROFICIENT || c.EXAM_READY) return "DEVELOPING";
  return "INTRODUCED";
}
function statusBar(counts) {
  const total = Object.values(counts).reduce((a, b) => a + b, 0) || 1;
  return `<div class="bar" role="img" aria-label="${STATUS.map((s) => `${STATUS_LABEL[s]} ${counts[s]}`).join(", ")}">${STATUS.map((s) => counts[s] ? `<i class="b-${s}" style="width:${(100 * counts[s]) / total}%"></i>` : "").join("")}</div>`;
}
const legend = () => `<div class="legend">${STATUS.map((s) => `<span><i class="b-${s}" style="background:var(${{ NOT_STARTED: "--line", INTRODUCED: "--accent", DEVELOPING: "--warn", NEEDS_REVIEW: "--bad", PROFICIENT: "--good", EXAM_READY: "--good" }[s]});${s === "INTRODUCED" || s === "PROFICIENT" ? "opacity:.55" : ""}"></i>${STATUS_LABEL[s]}</span>`).join("")}</div>`;

// ═════════════════════════════════════════════════════════════════════
// Recording answers
// ═════════════════════════════════════════════════════════════════════
function correctText(q) {
  if (q.t !== "num") return q.c[q.a];
  const v = Number(q.ans);
  if (q.unit === "$") return "$" + v.toLocaleString("en-US", Number.isInteger(v) ? {} : { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${v.toLocaleString("en-US", { maximumFractionDigits: 4 })} ${q.unit}`.trim();
}
function numCategory(q, given) {
  if (!isFinite(given)) return "MISREAD";
  const r = Math.abs(given - q.ans) / Math.max(1e-9, Math.abs(q.ans));
  if (r < 0.03) return "ARITH";
  for (const f of [10, 100, 1000]) if (Math.abs(given * f - q.ans) < 1e-6 * Math.max(1, q.ans) || Math.abs(given / f - q.ans) < 1e-6 * Math.max(1, q.ans)) return "UNITS";
  return "FORMULA";
}
function recordAttempt(q, { ok, conf, answerText, choice, given, mode, ms }) {
  const a = { id: uid(), t: now(), q: q.id, ok: ok ? 1 : 0, c: conf, m: mode, a: String(answerText ?? "").slice(0, 160), ms: ms || 0 };
  S.attempts.push(a); if (S.attempts.length > 8000) S.attempts.shift();
  S.days[dayKey()] = (S.days[dayKey()] || 0) + 1;
  schedule(q.id, !ok ? "wrong" : conf === "g" ? "guess" : conf === "u" ? "hard" : "good");
  // mistake log
  const oid = objOf(q);
  if (!ok || conf === "g") {
    const prev = S.mistakes[q.id];
    const cat = ok ? "GUESS" : q.t === "num" ? numCategory(q, given) : (q.w?.[choice]?.[0] || "RULE");
    S.mistakes[q.id] = {
      qid: q.id, lesson: q.l, ch: chOfLesson(q.l), obj: oid,
      first: prev?.first || a.t, last: a.t, my: a.a, correct: correctText(q),
      cat: prev?.userCat ? prev.cat : cat, userCat: prev?.userCat || false,
      mis: ok ? "Answered correctly by guessing — not yet reliable knowledge." : (q.t === "num" ? "" : (q.w?.[choice]?.[1] || "")),
      conf, confident: !ok && conf === "s", errors: (prev?.errors || 0) + (ok ? 0 : 1), wins: 0, winDays: [], status: "open", note: prev?.note || "",
    };
  } else if (conf !== "g") {
    for (const m of Object.values(S.mistakes)) {
      if (m.obj === oid && m.status !== "resolved" && m.last < a.t) {
        m.wins = (m.wins || 0) + 1; m.winDays = uniq([...(m.winDays || []), dayKey(a.t)]);
        m.status = m.wins >= 3 && m.winDays.length >= 2 ? "resolved" : "improving";
      }
    }
  }
  invalidate();
  Store.touch("core", "itemsQ", "mistakes", "att:" + dayKey(a.t));
  return a;
}

// ═════════════════════════════════════════════════════════════════════
// Question selection per practice mode
// ═════════════════════════════════════════════════════════════════════
function lastSeen(qid) { const it = S.items[qid]; return it?.last || 0; }
function pickFresh(list, n) {
  // prefer never-seen, then least recently seen; shuffle ties
  return shuffle(list).sort((a, b) => lastSeen(a.id) - lastSeen(b.id)).slice(0, n);
}
function interleave(list) {
  const by = group(list, (q) => chOfLesson(q.l)); const keys = shuffle([...by.keys()]); const out = [];
  let more = true; while (more) { more = false; for (const k of keys) { const x = by.get(k).shift(); if (x) { out.push(x); more = true; } } }
  return out;
}
function weightedSample(pool, n) {
  const out = []; const byCh = group(pool, (q) => chOfLesson(q.l));
  const weights = DATA.chapters.map((c) => [c.id, c.examPct]).filter(([id]) => byCh.has(id));
  const total = weights.reduce((s, [, w]) => s + w, 0);
  for (const [id, w] of weights) out.push(...pickFresh(byCh.get(id), Math.round((n * w) / total)));
  const rest = pickFresh(pool.filter((q) => !out.includes(q)), Math.max(0, n - out.length));
  return interleave([...out, ...rest]).slice(0, n);
}
function buildQueue(mode, arg) {
  const studied = new Set(studiedLessons());
  const studiedPool = DATA.questions.filter((q) => studied.has(q.l) || S.items[q.id]);
  const pool = studiedPool.length >= 10 ? studiedPool : DATA.questions;
  switch (mode) {
    case "A": { const qs = qByLesson.get(arg) || []; return [1, 2, 3].flatMap((d) => shuffle(qs.filter((q) => q.d === d))); }
    case "B": return pickFresh(DATA.questions.filter((q) => chOfLesson(q.l) === arg), 20);
    case "C": return interleave(pickFresh(pool, 20));
    case "D": {
      const out = [];
      const open = Object.values(S.mistakes).filter((m) => m.status !== "resolved").sort((a, b) => b.last - a.last);
      for (const m of open) {
        const alts = (qByObj.get(m.obj) || []).filter((q) => !out.includes(q));
        const variant = alts.filter((q) => q.id !== m.qid && now() - lastSeen(q.id) > 6 * 3600000);
        out.push(variant.length ? pickFresh(variant, 1)[0] : (Q.get(m.qid)));
        if (out.length >= 15) break;
      }
      if (out.length < 15) {
        const weakObjs = DATA.objectives.filter((o) => ["NEEDS_REVIEW", "DEVELOPING"].includes(objStatus(o.id)));
        for (const o of shuffle(weakObjs)) { const c = (qByObj.get(o.id) || []).filter((q) => !out.includes(q)); if (c.length) out.push(pickFresh(c, 1)[0]); if (out.length >= 15) break; }
      }
      return uniq(out.filter(Boolean));
    }
    case "E": {
      const qs = DATA.questions.filter((q) => isCalcQ(q) && (!arg || q.l === arg));
      return [1, 2, 3].flatMap((d) => pickFresh(qs.filter((q) => q.d === d), arg ? 10 : 4)).slice(0, 12);
    }
    case "F": return interleave(pickFresh(pool.filter((q) => q.num?.length || q.v), 15));
    case "G": return weightedSample(pool, 25);
    case "H": return weightedSample(DATA.questions, 100);
    case "R": return dueQuestions().slice(0, 30);
  }
  return [];
}

// ═════════════════════════════════════════════════════════════════════
// Router
// ═════════════════════════════════════════════════════════════════════
const VIEWS = {};
function go(hash) { if (location.hash === "#" + hash) route(); else location.hash = hash; }
function route() {
  const [v, arg] = (location.hash.slice(1) || "home").split("~");
  const fn = VIEWS[v] || VIEWS.home;
  $$("#nav a").forEach((a) => a.classList.toggle("on", a.dataset.v === v || (v === "lesson" && a.dataset.v === "syllabus") || (v === "quiz" && a.dataset.v === "practice") || (v === "source" && a.dataset.v === "sources")));
  const due = dueQuestions().length + dueCards().due.length;
  const b = $("#due-badge"); b.hidden = !due; b.textContent = due;
  $("#view").innerHTML = fn(arg) || "";
  bind[v]?.(arg);
  if (!keepScroll) window.scrollTo(0, 0);
  keepScroll = false;
}
let keepScroll = false;
window.addEventListener("hashchange", route);
const bind = {};

// ═════════════════════════════════════════════════════════════════════
// Dashboard
// ═════════════════════════════════════════════════════════════════════
const WEEKDAY_PT = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const fmtPlanDate = (k) => { const [y, m, d] = k.split("-").map(Number); return `${WEEKDAY_PT[new Date(y, m - 1, d).getDay()]} ${d}/${m}`; };
const planToday = () => (PLAN ? PLAN.days.find((d) => d.date === dayKey()) || null : null);
const isRead = (id) => !!S.lessons[id]?.read;
function planBacklog() { const k = dayKey(); return PLAN ? PLAN.days.filter((d) => d.date < k).flatMap((d) => (d.lessons || []).filter((id) => !isRead(id))) : []; }
function planNextLesson() { // earliest unstudied lesson scheduled up to today
  if (!PLAN) return null; const k = dayKey();
  for (const d of PLAN.days) { if (d.date > k) break; const id = (d.lessons || []).find((x) => !isRead(x)); if (id) return id; }
  return null;
}
function planAhead() { const k = dayKey(); for (const d of PLAN?.days || []) if (d.date > k) { const id = (d.lessons || []).find((x) => !isRead(x)); if (id) return id; } return null; }
const lessonMode = (id) => (PLAN_FAST.has(id) ? "fast" : LS_.get(id)?.type === "calculation" ? "calc" : "full");
const modeChip = (id) => ({ fast: chip("Rápida (R)", "st-DEVELOPING"), calc: chip("Completa · cálculo", "full"), full: chip("Completa", "full") })[lessonMode(id)];
const modeText = (id) => lessonMode(id) === "fast" ? PLAN.modes.fast : PLAN.modes.full + (lessonMode(id) === "calc" ? " " + PLAN.modes.calc : "");
const taskList = (tasks) => `<ol class="small" style="margin:0;padding-left:20px;display:grid;gap:4px">${tasks.map((t) => `<li>${t.href ? `<a href="#${t.href}">${esc(t.text)}</a>` : esc(t.text)}</li>`).join("")}</ol>`;
function planPanelHtml() {
  if (!PLAN) return "";
  const k = dayKey(), today = planToday(), back = planBacklog(), left = daysToExam();
  const row = (id, late) => `<a class="lesson-row" href="#lesson~${id}"><span class="lr-id">${id}</span><span class="lr-title">${esc(LS_.get(id)?.title)}</span>${modeChip(id)}${late ? chip("Em atraso", "st-NEEDS_REVIEW") : ""}${isRead(id) ? chip("Estudada ✓", "st-PROFICIENT") : ""}</a>`;
  let body = "";
  if (k < PLAN.days[0].date) body = `<p class="small">O plano começa ${fmtPlanDate(PLAN.days[0].date)}.</p>`;
  else if (k > PLAN.examDate) body = `<p class="small">O plano terminou no dia do exame (${fmtPlanDate(PLAN.examDate)}).</p>`;
  else {
    if (back.length) body += `<div class="note">${back.length === 1 ? "1 lição de um dia anterior está" : back.length + " lições de dias anteriores estão"} por estudar. Faça-as primeiro; se faltar tempo, adie as lições R, nunca as dos capítulos 4, 5, 8, 9, 11, 12 e 16 nem a matemática.</div><div class="list">${back.slice(0, 3).map((id) => row(id, true)).join("")}</div>${back.length > 3 ? `<details><summary class="small">Mais ${back.length - 3} em atraso</summary><div class="list">${back.slice(3).map((id) => row(id, true)).join("")}</div></details>` : ""}`;
    const ls = today?.lessons || [];
    if (ls.length) body += `<h3>Lições de hoje · ${ls.filter(isRead).length}/${ls.length} estudadas</h3><div class="list">${ls.map((id) => row(id, false)).join("")}</div>`;
    if (today?.tasks?.length) body += `<h3>${esc(today.title || "Também hoje")}</h3>${taskList(today.tasks)}`;
    if (!today) body += `<p class="small">Hoje não há nada marcado no plano.</p>`;
  }
  return `<div class="panel plan-today">
    <div class="panel-head"><div><div class="eyebrow">O seu plano · ${fmtPlanDate(k)}${left > 0 ? ` · faltam ${left} dias para o exame` : ""}</div><h2>${today?.kind === "exam" ? "Dia do exame" : "Hoje"}</h2></div><a class="small" href="#plan">Plano completo</a></div>
    ${body}
    <p class="small muted">Comece sempre pelo Bloco 1: revisão do dia e erros abertos. Ao fim do dia, releia os Memory sheets das lições estudadas.</p>
  </div>`;
}
function nextLesson() {
  const studied = new Set(studiedLessons());
  return DATA.order.map((id) => LS_.get(id)).find((l) => !studied.has(l.id) && l.pre.every((p) => studied.has(p))) || DATA.order.map((id) => LS_.get(id)).find((l) => !studied.has(l.id));
}
function recommendation() {
  if (live && !live.done) return { text: `Resume: ${live.title}`, href: live.kind === "cards" ? "cards~run" : live.kind === "exam" ? "exam~run" : "quiz", why: "You have an unfinished session." };
  const dq = dueQuestions().length, dc = dueCards();
  if (dq + dc.due.length >= 5) return { text: `Review ${dq + dc.due.length} due items`, href: dq ? "quiz~R" : "cards~due", why: "Retrieval at the scheduled time is the most efficient study you can do today." };
  const open = Object.values(S.mistakes).filter((m) => m.status === "open").length;
  const didToday = (m) => S.sessions.some((x) => x.mode === m && dayKey(x.started) === dayKey());
  if (open >= 3 && !(PLAN && didToday("D"))) return { text: `Weakness training (${open} open mistakes)`, href: "quiz~D", why: "Several recent errors are not yet corrected." };
  if (PLAN) {
    const t = planToday();
    if (t?.kind === "mock" && !didToday("H")) return { text: `${t.title}: exame simulado de 100 perguntas`, href: "exam", why: "Dia de simulado no seu plano: 3h30 de seguida, como no exame." };
    const pl = planNextLesson();
    if (pl) return { text: `Estudar ${pl}: ${LS_.get(pl).title}`, href: "lesson~" + pl, why: PLAN_DAY_OF.get(pl) < dayKey() ? `Em atraso no seu plano (era para ${fmtPlanDate(PLAN_DAY_OF.get(pl))}).` : `Do seu plano de hoje · ${lessonMode(pl) === "fast" ? "lição rápida (R)" : "lição completa"}.` };
    const task = (t?.tasks || []).find((x) => x.href);
    if (task) return { text: task.text, href: task.href, why: "Do seu plano de hoje." };
    const ah = planAhead();
    if (ah) return { text: `Adiantar ${ah}: ${LS_.get(ah).title}`, href: "lesson~" + ah, why: `As lições de hoje estão feitas. Faça o Bloco 4 (Memory sheets) e, se tiver tempo, adiante a lição de ${fmtPlanDate(PLAN_DAY_OF.get(ah))}.` };
  }
  const nl = nextLesson();
  if (nl) return { text: `Study ${nl.id}: ${nl.title}`, href: "lesson~" + nl.id, why: "Next lesson in prerequisite order." };
  return { text: "Mixed exam practice", href: "quiz~G", why: "All lessons studied — keep mixing topics." };
}
function streak() { let n = 0; for (let d = 0; d < 400; d++) { const k = dayKey(now() - d * DAY); if (S.days[k]) n++; else if (d > 0) break; } return n; }
VIEWS.home = () => {
  const studied = studiedLessons();
  const counts = statusCounts(DATA.objectives);
  const rec = recommendation();
  const dq = dueQuestions().length, dc = dueCards();
  const left = daysToExam();
  const open = Object.values(S.mistakes).filter((m) => m.status !== "resolved");
  const readyW = DATA.chapters.reduce((s, c) => { const objs = DATA.objectives.filter((o) => chOfLesson(o.l) === c.id); const r = objs.filter((o) => objStatus(o.id) === "EXAM_READY").length; return s + (objs.length ? (c.examPct * r) / objs.length : 0); }, 0);
  const totalW = DATA.chapters.reduce((s, c) => s + c.examPct, 0);
  const setup = !examDateSet() || !dailyMinSet();
  return `
  <div class="panel-head"><div><div class="eyebrow">Florida Real Estate Sales Associate</div><h1>Study dashboard</h1></div>
    <div class="muted small">${left === null ? "Exam date not set" : left > 0 ? `${left} days to your exam` : left === 0 ? "Exam day" : "Exam date has passed — update it in Settings"}</div></div>
  ${setup ? `<div class="note info">Set your exam date and daily study time in <a href="#settings">Settings</a> to get a paced study plan. You can start studying without it.</div>` : ""}
  ${planPanelHtml()}
  <div class="panel">
    <div class="eyebrow">Recommended next</div>
    <div class="row"><a class="btn primary" href="#${rec.href}">${esc(rec.text)}</a><span class="muted small">${esc(rec.why)}</span></div>
  </div>
  <div class="grid3">
    <div class="stat"><b>${studied.length}/${DATA.lessons.length}</b><span>Lessons studied</span></div>
    <div class="stat"><b>${dq + dc.due.length}</b><span>Reviews due now</span></div>
    <div class="stat"><b>${dc.fresh.length}</b><span>New flashcards ready</span></div>
    <div class="stat"><b>${open.length}</b><span>Unresolved mistakes</span></div>
    <div class="stat"><b>${S.attempts.length}</b><span>Questions answered</span></div>
    <div class="stat"><b>${streak()}</b><span>Day study streak</span></div>
  </div>
  <div class="panel">
    <div class="panel-head"><h2>Mastery of ${DATA.objectives.length} learning objectives</h2><span class="muted small">Evidence-weighted exam readiness: ${Math.round((100 * readyW) / totalW)}% · not a score prediction</span></div>
    ${statusBar(counts)}${legend()}
    <div class="tablewrap"><table><thead><tr><th>Chapter</th><th>Objectives</th><th class="num">Accuracy</th><th class="num">Weight</th></tr></thead><tbody>
    ${DATA.chapters.map((c) => {
      const objs = DATA.objectives.filter((o) => chOfLesson(o.l) === c.id);
      const att = S.attempts.filter((a) => chOfLesson(Q.get(a.q)?.l) === c.id);
      return `<tr><td><a href="#syllabus~${c.id}">${c.n}. ${esc(c.title)}</a></td><td style="min-width:140px">${statusBar(statusCounts(objs))}</td><td class="num mono">${att.length ? pct(att.filter((a) => a.ok).length, att.length) + "%" : "—"}</td><td class="num mono">${c.examPct}%${c.est ? "*" : ""}</td></tr>`;
    }).join("")}</tbody></table></div>
    <p class="muted small">Weights from the content outline of the official Candidate Information Booklet (Jan 2025). See <a href="#source~V-02">V-02</a>.</p>
  </div>
  <div class="grid2">
    <div class="panel"><div class="panel-head"><h3>Recent mistakes</h3><a href="#mistakes" class="small">Mistake log</a></div>
      ${open.length ? `<div class="list">${open.sort((a, b) => b.last - a.last).slice(0, 5).map((m) => `<div><div class="row"><span class="mono small muted">${m.qid}</span>${chip(CAT_LABEL[m.cat] || m.cat)}${m.confident ? chip("Confident error", "st-NEEDS_REVIEW") : ""}</div><div class="small">${esc(Q.get(m.qid)?.q.slice(0, 110))}…</div></div>`).join("")}</div>` : `<div class="empty">No mistakes yet. They will appear here and drive your weakness training.</div>`}
    </div>
    ${PLAN ? `<div class="panel"><h3>Os blocos do dia (${dailyMinSet()} min)</h3>${taskList(PLAN.blocks.map((b) => ({ text: `${b.name} · ${b.min}: ${b.text}`, href: b.href })))}${studyPlanHtml()}</div>` : `<div class="panel"><h3>Today's session (about ${dailyMinSet() || 45} min)</h3>
      <ol class="small" style="margin:0;padding-left:20px;display:grid;gap:4px">
        <li>Warm-up retrieval: ${Math.min(dq, 10) || "a few"} due questions (Review)</li>
        <li>Flashcards: ${dc.due.length} due + ${dc.fresh.length} new</li>
        <li>One new lesson: ${esc(nextLesson()?.id || "—")} — read, then take its lesson quiz</li>
        <li>Mistake review: ${open.length ? open.length + " open" : "none yet"}</li>
        <li>Short cumulative quiz once 3+ lessons are studied</li>
      </ol>
      ${studyPlanHtml()}
    </div>`}
  </div>`;
};
function studyPlanHtml() {
  if (PLAN) {
    const k = dayKey(), ids = [...PLAN_DAY_OF.keys()];
    const due = ids.filter((id) => PLAN_DAY_OF.get(id) <= k), late = due.filter((id) => !isRead(id));
    return `<div class="note ${late.length ? "" : "good"}"><b>Plano:</b> ${ids.filter(isRead).length} de ${ids.length} lições estudadas; ${due.length} previstas até hoje${late.length ? `, ${late.length} por fazer` : ", em dia"}.${location.hash.startsWith("#plan") ? "" : ` <a href="#plan">Ver plano</a>`}</div>`;
  }
  const left = daysToExam(); const mins = Number(dailyMinSet());
  if (!left || !mins) return "";
  if (left <= 0) return `<div class="note">Your saved exam date has passed. Update it in Settings so the plan and review intervals are correct.</div>`;
  const remaining = DATA.lessons.filter((l) => !S.lessons[l.id]?.read);
  const lessonMin = remaining.reduce((s, l) => s + l.min, 0);
  const studyDays = Math.max(1, left - Math.min(14, Math.floor(left / 4)));
  const perDay = remaining.length / studyDays;
  const need = lessonMin / studyDays + 20; // + review time
  return `<div class="note ${need > mins ? "" : "good"}"><b>Pace:</b> ${remaining.length} lessons left over ${studyDays} study days ≈ ${perDay.toFixed(1)} lessons/day, about ${Math.round(need)} min/day including reviews. You have ${mins} min/day.${need > mins ? " This is tight: prioritize high-priority and high-weight lessons, and keep the final two weeks for mixed practice and mocks." : " The final two weeks are reserved for cumulative practice and mock exams."}</div>`;
}

// ═════════════════════════════════════════════════════════════════════
// Syllabus & lesson viewer
// ═════════════════════════════════════════════════════════════════════
VIEWS.syllabus = (open) => `
  <div><div class="eyebrow">19 sections of the official FREC Course I syllabus</div><h1>Syllabus</h1></div>
  <p class="muted prose">Each chapter follows an official course section. Every lesson is a full lesson: the text covers sections 2–10, and the app adds objectives, active recall, mastery and review.</p>
  <div class="panel">${DATA.chapters.map((c) => {
    const ls = lessonsByCh.get(c.id) || [];
    const objs = DATA.objectives.filter((o) => chOfLesson(o.l) === c.id);
    return `<details class="chapter" ${open === c.id ? "open" : ""}><summary><span class="ch-n">${c.n}</span><h3>${esc(c.title)}</h3><span style="width:120px">${statusBar(statusCounts(objs))}</span></summary>
      <div class="chapter-body"><p class="muted small">${esc(c.frec)} · Manual: ${esc(c.manual)} · Exam weight ${c.examPct}%${c.est ? " (estimate)" : ""}</p>
      <div class="list">${ls.map((l) => `<a class="lesson-row" href="#lesson~${l.id}"><span class="lr-id">${l.id}</span><span class="lr-title">${esc(l.title)}</span>${chip(l.status === "full" ? "Full lesson" : "Core notes", l.status === "full" ? "full" : "")}${S.lessons[l.id]?.read ? chip("Studied", "st-INTRODUCED") : ""}${statusChip(lessonStatus(l.id))}<span class="muted small mono">${(qByLesson.get(l.id) || []).length} Q</span></a>`).join("")}</div></div></details>`;
  }).join("")}</div>`;

VIEWS.lesson = (id) => {
  const l = LS_.get(id); if (!l) return `<div class="empty">Lesson not found.</div>`;
  const c = CH.get(l.ch);
  const idx = DATA.order.indexOf(id);
  const prev = DATA.order[idx - 1], next = DATA.order[idx + 1];
  const objs = objByLesson.get(id) || [];
  const nums = DATA.numbers.filter((n) => n.l === id);
  const cmps = DATA.comparisons.filter((x) => x.l.includes(id));
  const qs = qByLesson.get(id) || [];
  const read = S.lessons[id]?.read;
  return `
  <div><div class="eyebrow">Chapter ${c.n} · ${esc(c.title)}</div><h1>${esc(l.title)}</h1>
  <div class="row small" style="margin-top:6px">${chip(l.id)}${chip(l.type)}${chip(`~${l.min} min`)}${chip(l.status === "full" ? "Full lesson" : "Core notes", l.status === "full" ? "full" : "")}${l.pre.length ? `<span class="muted">Before this: ${l.pre.map((p) => `<a href="#lesson~${p}">${p}</a>`).join(", ")}</span>` : ""}</div></div>
  ${PLAN_DAY_OF.has(id) ? `<div class="note info"><b>Plano · ${fmtPlanDate(PLAN_DAY_OF.get(id))} · ${lessonMode(id) === "fast" ? "lição rápida (R)" : "lição completa"}.</b> ${esc(modeText(id))}</div>` : ""}
  <div class="panel"><h2>1. Learning objectives</h2>
    <ul class="objectives">${objs.map((o) => `<li>${statusChip(objStatus(o.id))}<span>${esc(o.text)} <span class="muted small">(${o.kind})</span></span></li>`).join("")}</ul>
  </div>
  <div class="panel lesson">${l.html}</div>
  ${nums.length ? `<div class="panel"><h2>Exact facts in this lesson</h2><div class="tablewrap"><table><thead><tr><th>Subject</th><th>Rule</th><th>Status</th></tr></thead><tbody>${nums.map((n) => `<tr><td>${esc(n.s)}</td><td>${esc(n.val)}${n.exc ? `<div class="muted small">${esc(n.exc)}</div>` : ""}</td><td>${vChip(n.v)}</td></tr>`).join("")}</tbody></table></div></div>` : ""}
  ${cmps.length ? `<div class="panel"><h2>Portugal vs Florida</h2>${cmps.map((x) => `<div><b>${esc(x.concept)}</b> — ${esc(x.diff)} <a href="#compare~${x.id}">Open ${x.id}</a></div>`).join("")}</div>` : ""}
  <div class="panel"><h2>11–14. Active recall, application, mastery and review</h2>
    <p class="muted small">Retrieval comes before re-reading: answer questions without looking back, one at a time, and the app schedules each one for review.</p>
    <div class="row">
      <button class="btn ${read ? "" : "primary"}" id="mark-read">${read ? "Studied ✓ (marked " + fmtDate(read) + ")" : "Mark as studied"}</button>
      <a class="btn primary" href="#quiz~A~${id}">Lesson quiz (${qs.length} questions)</a>
      <a class="btn" href="#cards~lesson~${id}">Flashcards (${(fcByLesson.get(id) || []).length})</a>
    </div>
    <p class="small muted">Sources: study manual ${esc(l.manual)} · ${esc(c.frec)} · verification entries are linked from each fact and question.</p>
  </div>
  <div class="row">${prev ? `<a class="btn" href="#lesson~${prev}">← ${prev}</a>` : ""}<span class="spacer"></span>${next ? `<a class="btn" href="#lesson~${next}">${next} →</a>` : ""}</div>`;
};
bind.lesson = (id) => {
  $("#mark-read")?.addEventListener("click", () => {
    if (S.lessons[id]?.read) delete S.lessons[id]; else S.lessons[id] = { read: now() };
    invalidate(); Store.touch("core"); keepScroll = true; route();
  });
};

// ═════════════════════════════════════════════════════════════════════
// Practice hub & quiz runner
// ═════════════════════════════════════════════════════════════════════
VIEWS.practice = () => {
  const studied = studiedLessons();
  return `
  <div><div class="eyebrow">Practice modes</div><h1>Practice</h1></div>
  <p class="muted prose">All questions are original practice questions written for this curriculum — not official exam questions. Answer, then say how sure you were: confidence changes how soon you see the question again and what counts as mastery.</p>
  <div class="grid2">
    <div class="panel"><h3>A · ${MODES.A.name}</h3><p class="small muted">${MODES.A.desc}</p>
      <select id="pick-lesson">${DATA.lessons.map((l) => `<option value="${l.id}" ${l.id === (nextLesson()?.id) ? "selected" : ""}>${l.id} · ${esc(l.title)}</option>`).join("")}</select>
      <button class="btn primary" data-start="A">Start lesson quiz</button></div>
    <div class="panel"><h3>B · ${MODES.B.name}</h3><p class="small muted">${MODES.B.desc}</p>
      <select id="pick-ch">${DATA.chapters.map((c) => `<option value="${c.id}">${c.n}. ${esc(c.title)}</option>`).join("")}</select>
      <button class="btn primary" data-start="B">Start chapter review</button></div>
    ${["C", "D", "E", "F", "G", "R"].map((m) => `<div class="panel"><h3>${m} · ${MODES[m].name}</h3><p class="small muted">${MODES[m].desc}</p>${m === "C" && studied.length < 3 ? `<p class="small muted">Works best after 3+ lessons are marked studied (${studied.length} so far).</p>` : ""}<a class="btn ${m === "D" ? "primary" : ""}" href="#quiz~${m}">Start</a></div>`).join("")}
    <div class="panel"><h3>H · ${MODES.H.name}</h3><p class="small muted">${MODES.H.desc}</p><a class="btn" href="#exam">Open mock exam</a></div>
  </div>`;
};
bind.practice = () => {
  $$("[data-start]").forEach((b) => b.addEventListener("click", () => {
    const m = b.dataset.start; const arg = m === "A" ? $("#pick-lesson").value : $("#pick-ch").value;
    go(`quiz~${m}~${arg}`);
  }));
};

// numeric choice sets ("$1,000", "15 business days") are shown in ascending
// order; everything else is shuffled so answer position carries no signal
const NUMERIC_CHOICE = /^\$?\d[\d,]*(\.\d+)?\s*(%|[a-z][a-z ]*)?$/i;
function displayOrder(q) {
  if (q.t === "num") return null;
  const idx = [0, 1, 2, 3];
  if (q.c.every((s) => NUMERIC_CHOICE.test(s.trim()))) return idx.sort((a, b) => parseFloat(q.c[a].replace(/[$,]/g, "")) - parseFloat(q.c[b].replace(/[$,]/g, "")));
  return shuffle(idx);
}
function setHash(h) { try { history.replaceState(null, "", "#" + h); } catch { location.hash = h; } }
function startQuiz(mode, arg) {
  const queue = buildQueue(mode, arg).map((q) => q.id);
  if (!queue.length) return null;
  const title = mode === "A" ? `Lesson quiz · ${arg}` : mode === "B" ? `Chapter review · ${CH.get(arg)?.n}. ${CH.get(arg)?.title}` : mode === "E" && arg ? `Calculation practice · ${arg}` : MODES[mode].name;
  live = { kind: "quiz", id: uid(), mode, arg: arg || "", title, queue, orders: {}, idx: 0, answers: [], retested: [], started: now(), shownAt: now(), fb: null, done: false };
  Store.saveLive();
  return live;
}
VIEWS.quiz = (arg) => {
  const [mode, a2] = (arg || "").split("~").length > 1 ? arg.split("~") : [arg, location.hash.split("~")[2]];
  if (mode && (!live || live.kind !== "quiz" || live.done || live.mode !== mode || (live.arg || "") !== (a2 || ""))) {
    if (!startQuiz(mode, a2)) return `<div class="empty">No questions available for this mode yet. ${mode === "R" ? "Nothing is due for review — come back later or practise new material." : mode === "D" ? "No mistakes or weak objectives yet — that will change once you practise." : ""}</div><a class="btn" href="#practice">Back to practice</a>`;
    setHash("quiz");
  }
  if (!live || live.kind !== "quiz") return `<div class="empty">No active quiz.</div><a class="btn" href="#practice">Choose a practice mode</a>`;
  if (live.done) return reportHtml(live);
  return quizCardHtml();
};
function quizCardHtml() {
  const qid = live.queue[live.idx]; const q = Q.get(qid);
  if (!live.orders[qid]) live.orders[qid] = displayOrder(q);
  const order = live.orders[qid]; const fb = live.fb;
  const l = LS_.get(q.l);
  const keys = ["A", "B", "C", "D"];
  return `
  <div class="row"><div><div class="eyebrow">${esc(live.title)}</div></div><span class="spacer"></span><span class="mono small muted">${live.idx + 1} / ${live.queue.length}</span><button class="btn sm ghost" id="quit">End session</button></div>
  <div class="progress"><i style="width:${(100 * live.idx) / live.queue.length}%"></i></div>
  <div class="panel qcard">
    <div class="qmeta">${chip(q.id)}${chip(`Lesson ${q.l}`)}${chip(["", "Basic", "Intermediate", "Hard"][q.d])}${q.t === "scn" ? chip("Scenario") : ""}${q.t === "num" ? chip("Calculation") : ""}</div>
    <div class="stem">${esc(q.q)}</div>
    ${q.t === "num" ? `<div class="numin"><input id="numans" inputmode="decimal" autocomplete="off" placeholder="Your answer" ${fb ? "disabled" : ""} value="${esc(fb?.given ?? "")}"><span class="muted">${esc(q.unit)}</span></div><p class="small muted">Numbers only; commas and $ are fine.</p>` :
    `<div class="choices">${order.map((ci, k) => {
      let cls = ""; if (fb) { if (ci === q.a) cls = "right"; else if (ci === fb.choice) cls = "wrong"; } else if (live.sel === ci) cls = "sel";
      return `<button class="choice ${cls}" data-ci="${ci}" ${fb ? "disabled" : ""}><span class="key">${keys[k]}</span><span>${esc(q.c[ci])}</span></button>`;
    }).join("")}</div>`}
    ${fb ? feedbackHtml(q, fb) : `<div class="confbar"><span class="small muted" style="align-self:center">Submit with your confidence:</span>
      <button class="btn primary" data-conf="s">Sure</button><button class="btn" data-conf="u">Unsure</button><button class="btn" data-conf="g">Guessing</button></div>`}
  </div>
  <p class="small muted">Keyboard: 1–4 choose · S / U / G submit · Enter next. From ${esc(l.title)}.</p>`;
}
function feedbackHtml(q, fb) {
  const m = S.mistakes[q.id];
  const wrongWhy = !fb.ok && q.t !== "num" ? q.w?.[fb.choice] : null;
  return `<div class="feedback ${fb.ok ? "ok" : "no"}">
    <div class="verdict">${fb.ok ? (fb.conf === "g" ? "Correct — but a guess is not knowledge yet" : "Correct") : "Not correct"}</div>
    ${!fb.ok ? `<div><b>Correct answer:</b> ${esc(correctText(q))}</div>` : ""}
    ${q.t === "num" ? `<ol class="steps">${q.steps.map((s) => `<li>${esc(s)}</li>`).join("")}</ol>` : ""}
    ${q.ex ? `<div>${esc(q.ex)}</div>` : ""}
    ${wrongWhy ? `<div><b>Why your answer is wrong:</b> ${esc(wrongWhy[1])}</div>` : ""}
    ${(!fb.ok || fb.conf === "g") && m ? `<label class="field">Likely error type (change it if another fits better)
      <select id="cat">${Object.entries(CAT_LABEL).map(([k, v]) => `<option value="${k}" ${m.cat === k ? "selected" : ""}>${esc(v)}</option>`).join("")}</select></label>` : ""}
    ${!fb.ok || fb.conf !== "s" ? `<label class="field">In your own words: why is the correct answer right? (optional, strengthens recall)<textarea id="elab" placeholder="Type a one- or two-sentence explanation…">${esc(m?.note || "")}</textarea></label>` : ""}
    <div class="row small">${vChip(q.v)}<a href="#lesson~${q.l}">Review lesson ${q.l}</a></div>
    <div class="row"><button class="btn primary" id="next">${live.idx + 1 < live.queue.length ? "Next question" : "Finish session"}</button>${fb.ok && fb.conf === "s" ? `<button class="btn sm ghost" id="noexpl">I got it right but couldn't explain why</button>` : ""}</div>
  </div>`;
}
function submitQuiz(conf) {
  if (live.fb) return;
  const q = Q.get(live.queue[live.idx]);
  let ok, answerText, choice = null, given = null;
  if (q.t === "num") {
    const raw = ($("#numans")?.value || "").replace(/[$,%\s]/g, "");
    if (!raw) { toast("Type a number first."); return; }
    given = Number(raw); if (!isFinite(given)) { toast("That is not a number."); return; }
    ok = Math.abs(given - q.ans) <= q.tol + 1e-9; answerText = String(given);
  } else {
    if (live.sel === undefined || live.sel === null) { toast("Choose an answer first."); return; }
    choice = live.sel; ok = choice === q.a; answerText = q.c[choice];
  }
  recordAttempt(q, { ok, conf, answerText, choice, given, mode: live.mode, ms: now() - live.shownAt });
  live.answers.push({ q: q.id, ok: ok ? 1 : 0, c: conf, a: answerText });
  live.fb = { ok, conf, choice, given: given ?? "" };
  // re-test the same objective later in the session with a different question
  if ((!ok || conf === "g") && !live.retested.includes(objOf(q))) {
    const alt = (qByObj.get(objOf(q)) || []).filter((x) => x.id !== q.id && !live.queue.includes(x.id));
    if (alt.length) { live.queue.splice(Math.min(live.idx + 3, live.queue.length), 0, pickFresh(alt, 1)[0].id); live.retested.push(objOf(q)); }
  }
  Store.saveLive(); keepScroll = true; route();
}
function nextQuiz() {
  const q = Q.get(live.queue[live.idx]);
  const elab = $("#elab")?.value?.trim(); const cat = $("#cat")?.value;
  const m = S.mistakes[q.id];
  if (m && (elab || (cat && cat !== m.cat))) { if (elab) m.note = elab.slice(0, 600); if (cat && cat !== m.cat) { m.cat = cat; m.userCat = true; } Store.touch("mistakes"); }
  live.idx++; live.fb = null; live.sel = null; live.shownAt = now();
  if (live.idx >= live.queue.length) finishQuiz();
  Store.saveLive(); route();
}
function finishQuiz() {
  live.done = true; live.finished = now();
  const rep = summarize(live);
  S.sessions.push(rep); Store.touch("ses:" + rep.id);
}
function summarize(s) {
  const byCh = {}; const cats = {}; const weakObj = {};
  for (const a of s.answers) {
    const q = Q.get(a.q); const c = chOfLesson(q.l);
    byCh[c] = byCh[c] || [0, 0]; byCh[c][1]++; if (a.ok) byCh[c][0]++;
    if (!a.ok) { const m = S.mistakes[a.q]; const k = m?.cat || "RULE"; cats[k] = (cats[k] || 0) + 1; weakObj[objOf(q)] = (weakObj[objOf(q)] || 0) + 1; }
  }
  return { id: s.id, mode: s.mode, title: s.title, started: s.started, finished: s.finished || now(), total: s.answers.length, correct: s.answers.filter((a) => a.ok).length, byCh, cats, weakObj,
    lowConf: s.answers.filter((a) => a.ok && a.c !== "s").map((a) => a.q), confErr: s.answers.filter((a) => !a.ok && a.c === "s").map((a) => a.q) };
}
function reportHtml(s) {
  const r = S.sessions.find((x) => x.id === s.id) || summarize(s);
  const weak = Object.entries(r.weakObj).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const lessonsHit = uniq(weak.map(([o]) => OBJ.get(o)?.l));
  const nl = nextLesson();
  return `
  <div><div class="eyebrow">Session report · ${esc(r.title)}</div><h1>${r.correct} / ${r.total} correct (${pct(r.correct, r.total)}%)</h1></div>
  ${r.mode === "H" ? `<div class="note ${pct(r.correct, r.total) >= 75 ? "good" : ""}">The real exam needs 75 of 100. A practice score does not guarantee a result; the bank's questions are not official exam questions, and repeated mocks reuse questions.</div>` : ""}
  <div class="grid2">
    <div class="panel"><h3>Accuracy by chapter</h3><div class="tablewrap"><table><tbody>${Object.entries(r.byCh).map(([c, [ok, n]]) => `<tr><td>${CH.get(c).n}. ${esc(CH.get(c).title)}</td><td class="num mono">${ok}/${n}</td></tr>`).join("")}</tbody></table></div></div>
    <div class="panel"><h3>Error types</h3>${Object.keys(r.cats).length ? `<div class="list">${Object.entries(r.cats).map(([k, n]) => `<div class="row"><span>${esc(CAT_LABEL[k] || k)}</span><span class="spacer"></span><b class="mono">${n}</b></div>`).join("")}</div>` : `<div class="empty">No errors this session.</div>`}</div>
    <div class="panel"><h3>Weakest objectives</h3>${weak.length ? `<ul class="objectives">${weak.map(([o, n]) => `<li>${statusChip(objStatus(o))}<span>${esc(OBJ.get(o)?.text)} <a href="#lesson~${OBJ.get(o)?.l}">${OBJ.get(o)?.l}</a></span></li>`).join("")}</ul>` : `<div class="empty">None flagged.</div>`}</div>
    <div class="panel"><h3>Calibration</h3>
      <p class="small">Correct but not sure: <b>${r.lowConf.length}</b>${r.lowConf.length ? ` <span class="muted">(${r.lowConf.join(", ")})</span>` : ""}</p>
      <p class="small">Wrong while sure (confident errors): <b>${r.confErr.length}</b>${r.confErr.length ? ` <span class="muted">(${r.confErr.join(", ")}) — these get extra review.</span>` : ""}</p></div>
  </div>
  <div class="panel"><h3>Recommended next</h3><div class="row">
    ${Object.keys(r.cats).length ? `<a class="btn primary" href="#quiz~D">Weakness training</a>` : ""}
    ${lessonsHit.map((l) => `<a class="btn" href="#lesson~${l}">Re-read ${l}</a>`).join("")}
    ${nl ? `<a class="btn" href="#lesson~${nl.id}">Next lesson: ${nl.id}</a>` : ""}
    <a class="btn" href="#practice">Practice hub</a></div></div>`;
}
bind.quiz = () => {
  if (!live || live.kind !== "quiz" || live.done) return;
  $$(".choice").forEach((b) => b.addEventListener("click", () => { if (live.fb) return; live.sel = Number(b.dataset.ci); $$(".choice").forEach((x) => x.classList.toggle("sel", x === b)); }));
  $$("[data-conf]").forEach((b) => b.addEventListener("click", () => submitQuiz(b.dataset.conf)));
  $("#next")?.addEventListener("click", nextQuiz);
  $("#noexpl")?.addEventListener("click", () => {
    const q = Q.get(live.queue[live.idx]);
    S.mistakes[q.id] = { qid: q.id, lesson: q.l, ch: chOfLesson(q.l), obj: objOf(q), first: now(), last: now(), my: q.t === "num" ? live.fb.given : q.c[live.fb.choice], correct: correctText(q), cat: "NOEXPL", userCat: true, mis: "Correct answer without a reliable explanation.", conf: "s", confident: false, errors: 0, wins: 0, winDays: [], status: "open", note: "" };
    schedule(q.id, "hard"); invalidate(); Store.touch("mistakes", "itemsQ"); toast("Logged for review"); keepScroll = true; route();
  });
  $("#quit")?.addEventListener("click", () => { if (live.answers.length) finishQuiz(); else live = null; Store.saveLive(); route(); });
  $("#numans")?.focus();
};
document.addEventListener("keydown", (e) => {
  if (!live || live.done || e.target.matches("textarea, input:not(#numans), select")) return;
  const v = location.hash.slice(1).split("~")[0];
  if (v === "quiz" && live.kind === "quiz") {
    if (!live.fb && /^[1-4]$/.test(e.key) && Q.get(live.queue[live.idx]).t !== "num") { const btn = $$(".choice")[Number(e.key) - 1]; btn?.click(); }
    else if (!live.fb && /^[sug]$/i.test(e.key) && e.target.id !== "numans") submitQuiz(e.key.toLowerCase());
    else if (live.fb && e.key === "Enter" && !e.target.matches("textarea")) { e.preventDefault(); nextQuiz(); }
  }
});

// ═════════════════════════════════════════════════════════════════════
// Flashcards
// ═════════════════════════════════════════════════════════════════════
VIEWS.cards = (arg) => {
  const [sub, a2] = (location.hash.split("~").slice(1));
  if (sub && sub !== "run") {
    let deck;
    if (sub === "due") { const d = dueCards(); deck = [...d.due, ...d.fresh]; }
    else if (sub === "lesson") deck = shuffle(fcByLesson.get(a2) || []);
    else if (sub === "type") deck = shuffle(DATA.flashcards.filter((f) => f.t === a2 && (S.lessons[f.l]?.read || S.items[f.id]))).slice(0, 30);
    if (!deck?.length) return `<div class="empty">No cards in this deck yet. Cards unlock when you mark lessons as studied.</div><a class="btn" href="#cards">Back</a>`;
    live = { kind: "cards", id: uid(), title: sub === "lesson" ? `Flashcards · ${a2}` : sub === "due" ? "Due flashcards" : `Flashcards · ${a2}`, deck: deck.map((f) => f.id), idx: 0, revealed: false, typed: "", grades: [], done: false, started: now() };
    Store.saveLive(); setHash("cards~run");
  }
  if (sub === "run" || (live?.kind === "cards" && sub)) {
    if (!live || live.kind !== "cards") return `<div class="empty">No active deck.</div><a class="btn" href="#cards">Choose a deck</a>`;
    if (live.done) {
      const g = live.grades; const n = (k) => g.filter((x) => x === k).length;
      return `<h1>Deck finished</h1><div class="grid3"><div class="stat"><b>${n("good")}</b><span>Correct and easy</span></div><div class="stat"><b>${n("hard")}</b><span>Correct but difficult</span></div><div class="stat"><b>${n("wrong")}</b><span>Incorrect</span></div></div>
      <p class="muted">Incorrect cards return within minutes; difficult ones sooner than easy ones.</p><div class="row"><a class="btn primary" href="#cards">More decks</a><a class="btn" href="#home">Dashboard</a></div>`;
    }
    const f = FC.get(live.deck[live.idx]);
    return `
    <div class="row"><div class="eyebrow">${esc(live.title)}</div><span class="spacer"></span><span class="mono small muted">${live.idx + 1} / ${live.deck.length}</span><button class="btn sm ghost" id="quitcards">End</button></div>
    <div class="progress"><i style="width:${(100 * live.idx) / live.deck.length}%"></i></div>
    <div class="panel flash">
      <div class="row small">${chip(f.t)}${chip("Lesson " + f.l)}</div>
      <div class="face">${esc(f.f)}</div>
      ${live.revealed ? `
        ${live.typed ? `<div class="small"><b>You wrote:</b> ${esc(live.typed)}</div>` : ""}
        ${f.chk && live.typed ? `<div class="small ${f.chk.every((k) => live.typed.toLowerCase().includes(k.toLowerCase())) ? "" : "muted"}">${f.chk.every((k) => live.typed.toLowerCase().includes(k.toLowerCase())) ? "Your answer contains the key terms." : "Your answer is missing a key term: " + esc(f.chk.filter((k) => !live.typed.toLowerCase().includes(k.toLowerCase())).join(", "))}</div>` : ""}
        <div class="face back">${esc(f.b)}</div>
        <div class="row"><span class="small muted">Grade honestly — the schedule depends on it:</span></div>
        <div class="confbar"><button class="btn" data-grade="wrong">Incorrect</button><button class="btn" data-grade="hard">Correct but difficult</button><button class="btn primary" data-grade="good">Correct and easy</button></div>` :
      `<label class="field">Answer from memory first (recommended)<textarea id="typed" placeholder="Type what you remember…"></textarea></label><button class="btn primary" id="reveal">Show answer</button>`}
    </div>`;
  }
  const d = dueCards();
  const types = uniq(DATA.flashcards.map((f) => f.t));
  return `
  <div><div class="eyebrow">Retrieval practice with spaced repetition</div><h1>Flashcards</h1></div>
  <div class="panel"><div class="grid3"><div class="stat"><b>${d.due.length}</b><span>Due now</span></div><div class="stat"><b>${d.fresh.length}</b><span>New today (limit ${S.settings.newCardsPerDay || 15})</span></div><div class="stat"><b>${Object.keys(S.items).filter((k) => k[0] === "F").length}</b><span>Cards started</span></div></div>
  <a class="btn primary" href="#cards~due">Study due + new cards</a>
  <p class="small muted">New cards come only from lessons you have marked as studied, so the queue stays manageable.</p></div>
  <div class="panel"><h3>Practise one card type</h3><div class="row">${types.map((t) => `<a class="btn sm" href="#cards~type~${t}">${esc(t)}</a>`).join("")}</div></div>
  <div class="panel"><h3>By lesson</h3><div class="list">${DATA.lessons.map((l) => `<a class="lesson-row" href="#cards~lesson~${l.id}"><span class="lr-id">${l.id}</span><span class="lr-title">${esc(l.title)}</span><span class="mono small muted">${(fcByLesson.get(l.id) || []).length} cards</span></a>`).join("")}</div></div>`;
};
bind.cards = () => {
  $("#reveal")?.addEventListener("click", () => { live.typed = $("#typed").value.trim(); live.revealed = true; Store.saveLive(); keepScroll = true; route(); });
  $$("[data-grade]").forEach((b) => b.addEventListener("click", () => {
    const f = FC.get(live.deck[live.idx]); const g = b.dataset.grade;
    schedule(f.id, g); live.grades.push(g); S.days[dayKey()] = (S.days[dayKey()] || 0) + 1;
    Store.touch("itemsF", "core");
    live.idx++; live.revealed = false; live.typed = "";
    if (live.idx >= live.deck.length) live.done = true;
    Store.saveLive(); route();
  }));
  $("#quitcards")?.addEventListener("click", () => { live.done = true; Store.saveLive(); route(); });
  $("#typed")?.focus();
};

// ═════════════════════════════════════════════════════════════════════
// Review queue
// ═════════════════════════════════════════════════════════════════════
VIEWS.review = () => {
  const dq = dueQuestions(); const dc = dueCards();
  const forecast = [...Array(7)].map((_, i) => { const end = now() + (i + 1) * DAY; return Object.values(S.items).filter((it) => it.due > now() + i * DAY && it.due <= end).length; });
  return `
  <div><div class="eyebrow">Spaced review</div><h1>Review queue</h1></div>
  <div class="grid3"><div class="stat"><b>${dq.length}</b><span>Questions due</span></div><div class="stat"><b>${dc.due.length}</b><span>Flashcards due</span></div><div class="stat"><b>${dc.fresh.length}</b><span>New cards available</span></div></div>
  <div class="row">${dq.length ? `<a class="btn primary" href="#quiz~R">Review due questions</a>` : ""}${dc.due.length + dc.fresh.length ? `<a class="btn" href="#cards~due">Review flashcards</a>` : ""}</div>
  <div class="panel"><h3>Next 7 days</h3><div class="spark">${forecast.map((n) => `<i style="height:${Math.max(4, Math.min(100, n * 4))}%" title="${n} items"></i>`).join("")}</div><div class="small muted mono">${forecast.join(" · ")}</div>
  <p class="small muted">Intervals start at minutes → 1 → 3 → 7 → 14 → 30 → 60 days, move faster when you are right and sure, restart when you are wrong, and are capped at half the time left before your exam date.</p></div>
  <div class="panel"><h3>Due questions</h3>${dq.length ? `<div class="list">${dq.slice(0, 40).map((q) => `<div class="row small"><span class="mono muted">${q.id}</span><span style="flex:1;min-width:0">${esc(q.q.slice(0, 100))}…</span>${chip(fmtDue(S.items[q.id].due))}</div>`).join("")}</div>` : `<div class="empty">Nothing due. New questions are scheduled after you first answer them.</div>`}</div>`;
};

// ═════════════════════════════════════════════════════════════════════
// Calculations
// ═════════════════════════════════════════════════════════════════════
VIEWS.calc = () => {
  const calcLessons = DATA.lessons.filter((l) => (qByLesson.get(l.id) || []).some((q) => q.t === "num"));
  const formulas = DATA.flashcards.filter((f) => f.t === "formula");
  return `
  <div><div class="eyebrow">Mathematics</div><h1>Calculation training</h1></div>
  <p class="muted prose">Each topic runs from basic to hard: start with the worked example in the lesson, then guided practice (steps shown after each answer), then independent problems, then mixed problems where you must choose the method. All exam math uses US units: feet, square feet, acres (43,560 sq ft), miles (5,280 ft).</p>
  <div class="row"><a class="btn primary" href="#quiz~E">Mixed calculation drill</a></div>
  <div class="panel"><h3>Topics</h3><div class="list">${calcLessons.map((l) => {
    const qs = (qByLesson.get(l.id) || []).filter((q) => q.t === "num");
    const att = S.attempts.filter((a) => qs.some((q) => q.id === a.q));
    return `<div class="lesson-row"><span class="lr-id">${l.id}</span><span class="lr-title"><a href="#lesson~${l.id}">${esc(l.title)}</a></span><span class="small muted mono">${att.length ? pct(att.filter((a) => a.ok).length, att.length) + "% of " + att.length : qs.length + " problems"}</span><a class="btn sm" href="#quiz~E~${l.id}">Practise</a></div>`;
  }).join("")}</div></div>
  <div class="panel"><h3>Formula sheet</h3><div class="list">${formulas.map((f) => `<div><b>${esc(f.f)}</b><div class="mono small" style="white-space:pre-line">${esc(f.b)}</div></div>`).join("")}</div></div>`;
};

// ═════════════════════════════════════════════════════════════════════
// Mock exam (Mode H)
// ═════════════════════════════════════════════════════════════════════
let examTick = null;
VIEWS.exam = (arg) => {
  if (arg !== "run" || !live || live.kind !== "exam") {
    const past = S.sessions.filter((s) => s.mode === "H").slice(-5).reverse();
    return `
    <div><div class="eyebrow">Mode H</div><h1>Timed mock exam</h1></div>
    <div class="panel"><dl class="kv"><dt>Format</dt><dd>100 questions · 3 hours 30 minutes · pass with 75 correct (official Candidate Information Booklet, Jan 2025 — ${vChip("V-01")})</dd>
    <dt>Weighting</dt><dd>By chapter, using the official content-outline weights (${vChip("V-02")}); a chapter with too few questions is topped up from the rest of the bank</dd>
    <dt>Feedback</dt><dd>None until you submit; flag questions and move freely</dd>
    <dt>Limits</dt><dd>The bank has ${DATA.questions.length} original questions, so mocks overlap. Use mocks sparingly and mainly in the final weeks; a mock score does not guarantee an exam result.</dd></dl>
    <div class="row">${live?.kind === "exam" && !live.done ? `<a class="btn primary" href="#exam~run">Resume mock in progress</a><button class="btn" id="startexam">Discard it and start a new mock</button>` : `<button class="btn primary" id="startexam">Start a 100-question mock</button>`}</div></div>
    ${past.length ? `<div class="panel"><h3>Past mocks</h3><table><tbody>${past.map((s) => `<tr><td>${fmtDate(s.started)}</td><td class="num mono">${s.correct}/${s.total}</td><td>${s.correct >= 75 ? chip("≥ 75", "st-PROFICIENT") : chip("< 75", "st-NEEDS_REVIEW")}</td></tr>`).join("")}</tbody></table></div>` : ""}`;
  }
  if (live.done) return reportHtml(live) + examReviewHtml();
  const qid = live.queue[live.idx]; const q = Q.get(qid);
  if (!live.orders[qid]) { live.orders[qid] = displayOrder(q); Store.saveLive(); }
  const keys = ["A", "B", "C", "D"]; const ans = live.resp[qid];
  return `
  <div class="row"><div class="eyebrow">Mock exam</div><span class="spacer"></span><span class="timer" id="timer"></span><button class="btn sm" id="submitexam">Submit exam</button></div>
  <div class="panel qcard">
    <div class="qmeta">${chip(`Question ${live.idx + 1} of ${live.queue.length}`)}<button class="btn sm ghost" id="flag">${live.flags.includes(qid) ? "Unflag" : "Flag for review"}</button></div>
    <div class="stem">${esc(q.q)}</div>
    ${q.t === "num" ? `<div class="numin"><input id="examnum" inputmode="decimal" value="${esc(ans ?? "")}" placeholder="Your answer"><span class="muted">${esc(q.unit)}</span></div>` :
      `<div class="choices">${live.orders[qid].map((ci, k) => `<button class="choice ${ans === ci ? "sel" : ""}" data-ci="${ci}"><span class="key">${keys[k]}</span><span>${esc(q.c[ci])}</span></button>`).join("")}</div>`}
    <div class="row"><button class="btn" id="prevq" ${live.idx ? "" : "disabled"}>← Previous</button><span class="spacer"></span><button class="btn primary" id="nextq">${live.idx + 1 < live.queue.length ? "Next →" : "Review grid"}</button></div>
  </div>
  <div class="panel"><div class="navgrid">${live.queue.map((id, i) => `<button data-go="${i}" class="${live.resp[id] !== undefined && live.resp[id] !== "" ? "ans" : ""} ${live.flags.includes(id) ? "flag" : ""} ${i === live.idx ? "cur" : ""}">${i + 1}</button>`).join("")}</div>
  <p class="small muted">${Object.values(live.resp).filter((x) => x !== "" && x !== undefined).length} answered · ${live.flags.length} flagged</p></div>
  <div class="panel" id="confirmbox" hidden><p>Submit now? Unanswered questions count as wrong.</p><div class="row"><button class="btn primary" id="confirmsubmit">Yes, submit</button><button class="btn" id="cancelsubmit">Keep working</button></div></div>`;
};
function examReviewHtml() {
  return `<div class="panel"><h3>Review every question</h3><div class="list">${live.queue.map((id, i) => {
    const q = Q.get(id); const r = live.resp[id]; const ok = live.answers.find((a) => a.q === id)?.ok;
    return `<details><summary class="row small"><span class="mono">${i + 1}.</span>${ok ? chip("Correct", "st-PROFICIENT") : chip("Wrong", "st-NEEDS_REVIEW")}<span style="flex:1;min-width:0">${esc(q.q.slice(0, 90))}…</span></summary>
      <div class="small" style="padding:8px 0;display:grid;gap:6px"><div>${esc(q.q)}</div><div><b>Your answer:</b> ${esc(q.t === "num" ? (r || "—") : (r !== undefined && r !== "" ? q.c[r] : "—"))}</div><div><b>Correct:</b> ${esc(correctText(q))}</div><div>${esc(q.ex || "")}</div>${q.steps ? `<ol class="steps">${q.steps.map((s) => `<li>${esc(s)}</li>`).join("")}</ol>` : ""}<div>${vChip(q.v)} <a href="#lesson~${q.l}">Lesson ${q.l}</a></div></div></details>`;
  }).join("")}</div></div>`;
}
function examRemaining() { return Math.max(0, live.started + 210 * 60000 - now()); }
function submitExam() {
  clearInterval(examTick);
  for (const id of live.queue) {
    const q = Q.get(id); const r = live.resp[id];
    let ok = false, answerText = "", choice = null, given = null;
    if (q.t === "num") { given = Number(String(r ?? "").replace(/[$,%\s]/g, "")); ok = r !== undefined && r !== "" && Math.abs(given - q.ans) <= q.tol + 1e-9; answerText = r ?? ""; }
    else if (r !== undefined && r !== "") { choice = r; ok = r === q.a; answerText = q.c[r]; }
    // the mock does not ask for confidence: answered = "unsure", blank = "guess"
    const conf = answerText === "" ? "g" : "u";
    recordAttempt(q, { ok, conf, answerText, choice, given, mode: "H" });
    live.answers.push({ q: id, ok: ok ? 1 : 0, c: conf, a: answerText });
  }
  live.done = true; live.finished = now();
  const rep = summarize(live); S.sessions.push(rep); Store.touch("ses:" + rep.id); Store.saveLive(); route();
}
bind.exam = (arg) => {
  $("#startexam")?.addEventListener("click", () => {
    const queue = buildQueue("H").map((q) => q.id);
    live = { kind: "exam", id: uid(), mode: "H", title: "Timed mock exam", queue, orders: {}, idx: 0, resp: {}, flags: [], answers: [], started: now(), done: false };
    Store.saveLive(); go("exam~run");
  });
  if (arg !== "run" || !live || live.kind !== "exam" || live.done) return;
  const paint = () => { const ms = examRemaining(); const t = $("#timer"); if (t) t.textContent = `${Math.floor(ms / 3600000)}:${String(Math.floor(ms / 60000) % 60).padStart(2, "0")}:${String(Math.floor(ms / 1000) % 60).padStart(2, "0")}`; if (ms <= 0) { toast("Time is up — exam submitted."); submitExam(); } };
  clearInterval(examTick); examTick = setInterval(paint, 1000); paint();
  const save = () => { const qid = live.queue[live.idx]; const n = $("#examnum"); if (n) live.resp[qid] = n.value.trim(); Store.saveLive(); };
  $$(".choice").forEach((b) => b.addEventListener("click", () => { live.resp[live.queue[live.idx]] = Number(b.dataset.ci); Store.saveLive(); keepScroll = true; route(); }));
  $("#examnum")?.addEventListener("input", save);
  $("#nextq")?.addEventListener("click", () => { save(); if (live.idx + 1 < live.queue.length) live.idx++; Store.saveLive(); route(); });
  $("#prevq")?.addEventListener("click", () => { save(); live.idx = Math.max(0, live.idx - 1); Store.saveLive(); route(); });
  $$("[data-go]").forEach((b) => b.addEventListener("click", () => { save(); live.idx = Number(b.dataset.go); Store.saveLive(); route(); }));
  $("#flag")?.addEventListener("click", () => { const id = live.queue[live.idx]; live.flags = live.flags.includes(id) ? live.flags.filter((x) => x !== id) : [...live.flags, id]; Store.saveLive(); keepScroll = true; route(); });
  $("#submitexam")?.addEventListener("click", () => { save(); $("#confirmbox").hidden = false; $("#confirmbox").scrollIntoView({ block: "center" }); });
  $("#cancelsubmit")?.addEventListener("click", () => { $("#confirmbox").hidden = true; });
  $("#confirmsubmit")?.addEventListener("click", submitExam);
};

// ═════════════════════════════════════════════════════════════════════
// Reference: law & numbers, Portugal vs Florida, sources
// ═════════════════════════════════════════════════════════════════════
VIEWS.numbers = () => `
  <div><div class="eyebrow">Precise recall</div><h1>Law &amp; numbers</h1></div>
  <p class="muted prose">Every deadline, threshold and percentage in the curriculum, with its verification status. "Not yet verified" means the rule comes from your study manual and has not been checked against an official source yet.</p>
  <div class="row"><input type="search" id="nq" placeholder="Search rules, e.g. escrow, 30 days, homestead" style="flex:1;min-width:200px"><select id="nch" style="width:auto"><option value="">All chapters</option>${DATA.chapters.map((c) => `<option value="${c.id}">${c.n}. ${esc(c.title)}</option>`).join("")}</select></div>
  <div class="panel" id="nlist"></div>`;
bind.numbers = () => {
  const paint = () => {
    const t = $("#nq").value.toLowerCase().trim(); const ch = $("#nch").value;
    const rows = DATA.numbers.filter((n) => (!ch || chOfLesson(n.l) === ch) && (!t || `${n.s} ${n.val} ${n.ctx} ${n.cond} ${n.exc}`.toLowerCase().includes(t)));
    $("#nlist").innerHTML = rows.length ? `<div class="list">${rows.map((n) => {
      const qs = DATA.questions.filter((q) => q.num?.includes(n.id));
      return `<details><summary class="row"><span class="mono small muted">${n.id}</span><b style="flex:1;min-width:0">${esc(n.s)}</b>${vChip(n.v)}</summary>
        <div style="display:grid;gap:6px;padding:8px 0" class="small"><div class="mono">${esc(n.val)}</div>${n.ctx ? `<div>${esc(n.ctx)}</div>` : ""}${n.cond ? `<div><b>Conditions:</b> ${esc(n.cond)}</div>` : ""}${n.exc ? `<div><b>Qualifications:</b> ${esc(n.exc)}</div>` : ""}${n.aid ? `<div><b>Memory aid:</b> ${esc(n.aid)}</div>` : ""}${n.conf.length ? `<div><b>Easily confused with:</b> ${n.conf.map((c) => esc(NUM.get(c)?.s)).join("; ")}</div>` : ""}
        <div class="row"><a href="#lesson~${n.l}">Lesson ${n.l}</a>${qs.length ? `<span class="muted">${qs.length} practice question(s): ${qs.map((q) => q.id).join(", ")}</span>` : ""}</div></div></details>`;
    }).join("")}</div>` : `<div class="empty">No matching rules.</div>`;
  };
  $("#nq").addEventListener("input", paint); $("#nch").addEventListener("change", paint); paint();
};

VIEWS.compare = (open) => `
  <div><div class="eyebrow">Jurisdiction differences</div><h1>Portugal vs Florida</h1></div>
  <p class="muted prose">Use your Portuguese experience as a starting point, then switch to the Florida rule. Portuguese law never answers a Florida exam question. Each entry says whether its Portuguese side has been verified.</p>
  <input type="search" id="cq" placeholder="Search, e.g. deposit, license, tax">
  <div id="clist" style="display:grid;gap:14px"></div>`;
bind.compare = (open) => {
  const paint = () => {
    const t = $("#cq").value.toLowerCase().trim();
    const rows = DATA.comparisons.filter((c) => !t || Object.values(c).join(" ").toLowerCase().includes(t));
    $("#clist").innerHTML = rows.map((c) => `<div class="panel" id="${c.id}"><div class="panel-head"><h3>${esc(c.concept)}</h3><span class="mono small muted">${c.id}</span></div>
      <div class="compare two"><div class="side"><b>Portuguese context</b>${esc(c.pt)}</div><div class="side"><b>Florida context</b>${esc(c.fl)}</div></div>
      <dl class="kv"><dt>The important difference</dt><dd>${esc(c.diff)}</dd><dt>Practical example</dt><dd>${esc(c.ex)}</dd><dt>Exam implication</dt><dd>${esc(c.exam)}</dd><dt>Memory aid</dt><dd>${esc(c.aid)}</dd></dl>
      <div class="note info"><b>Practice:</b> ${esc(c.pq)}<div class="row" style="margin-top:6px"><textarea data-pq="${c.id}" placeholder="Your answer…" style="min-height:48px"></textarea></div><button class="btn sm" data-show="${c.id}">Show answer</button><div data-pa="${c.id}" hidden style="margin-top:6px"><b>Answer:</b> ${esc(c.pa)}</div></div>
      <p class="small muted">Portuguese side: ${esc(c.ptv)} · Lessons: ${c.l.map((l) => `<a href="#lesson~${l}">${l}</a>`).join(", ")}</p></div>`).join("") || `<div class="empty">No matches.</div>`;
    $$("[data-show]").forEach((b) => b.addEventListener("click", () => { $(`[data-pa="${b.dataset.show}"]`).hidden = false; }));
  };
  $("#cq").addEventListener("input", paint); paint();
  if (open) setTimeout(() => document.getElementById(open)?.scrollIntoView({ block: "start" }), 50);
};

VIEWS.sources = () => `
  <div><div class="eyebrow">Traceability</div><h1>Sources &amp; verification</h1></div>
  <div class="panel prose"><h3>Source inventory</h3>
    <p><b>Principal curriculum source:</b> "FL-Study-Manual-Expanded" (Google Doc in your Drive, Aug 2026), a 12-chapter companion that maps to Gold Coast course book chapters 2–19. The Gold Coast textbook itself was <b>not</b> among the supplied files.</p>
    <p><b>Earlier version:</b> "FL Sales Associate — Study Manual (Pedro).docx" — the file is damaged in Drive; only its first section (identical to the Google Doc) could be recovered.</p>
    <p><b>Structure authority:</b> the official FREC Course I syllabus (19 sections, eff. 1/1/2023) and the DBPR Candidate Information Booklet (Jan 2025).</p>
    <p><b>Legal verification:</b> official Florida statute and rule pages located on official domains; full pages could not be downloaded from this environment, so entries are marked with how they were checked.</p></div>
  <div class="panel"><h3>Verification log (${DATA.verification.length} entries, checked ${esc(DATA.meta.checkedOn)})</h3><div class="list">${DATA.verification.map((v) => `<details id="${v.id}"><summary class="row"><span class="mono small muted">${v.id}</span><b style="flex:1;min-width:0">${esc(v.topic)}</b>${chip(V_LABEL[v.status], "v-" + v.status)}</summary>
    <dl class="kv small" style="padding:8px 0"><dt>Manual says</dt><dd>${esc(v.manual)}</dd><dt>Finding</dt><dd>${esc(v.finding)}</dd><dt>Citation</dt><dd>${esc(v.citation)}</dd>${v.url ? `<dt>Source</dt><dd><a href="${esc(v.url)}" target="_blank" rel="noopener">${esc(v.url)}</a></dd>` : ""}<dt>Method</dt><dd>${esc(v.method)}${v.checks ? ` · ${esc(v.checks)}` : ""}</dd><dt>We teach</dt><dd>${esc(v.teach)}</dd></dl></details>`).join("")}</div></div>
  <div class="panel"><h3>Manual coverage</h3><div class="tablewrap"><table><tbody>${DATA.manualCoverage.map(([a, b]) => `<tr><td>${esc(a)}</td><td>${esc(b)}</td></tr>`).join("")}</tbody></table></div></div>
  <div class="panel"><h3>Known limitations</h3><ul class="small" style="margin:0;padding-left:20px;display:grid;gap:4px">
    <li>The Gold Coast textbook is missing; topics that appear only in the book (and not in the manual) may be absent. Uploading the book would allow a full coverage check.</li>
    <li>Per-section FREC learning objectives could not be read in full. Exam weights come from search excerpts of the Candidate Information Booklet (section 1 is derived from the 100% total).</li>
    <li>${DATA.lessons.some((l) => l.status === "core") ? `${DATA.lessons.filter((l) => l.status === "core").length} of ${DATA.lessons.length} lessons are core notes; full lessons are written as tutoring reaches them.` : `All ${DATA.lessons.length} lessons are full lessons. Each was checked by an independent AI reviewer against the manual, the numbers database and the verification log; none has been reviewed by a licensed Florida instructor.`}</li>
    <li>Rules marked "Not yet verified" come from the study manual and are on the next verification list.</li>
    <li>Practice questions are original and not official exam questions.</li></ul></div>`;
VIEWS.source = (id) => { setTimeout(() => { const d = document.getElementById(id); if (d) { d.open = true; d.scrollIntoView({ block: "start" }); } }, 30); return VIEWS.sources(); };

// ═════════════════════════════════════════════════════════════════════
// Mistake log & analytics
// ═════════════════════════════════════════════════════════════════════
VIEWS.mistakes = () => `
  <div><div class="eyebrow">Every error is information</div><h1>Mistake log</h1></div>
  <div class="row"><select id="mfilter" style="width:auto"><option value="active">Open and improving</option><option value="open">Open</option><option value="improving">Improving</option><option value="resolved">Resolved</option><option value="all">All</option></select><a class="btn primary" href="#quiz~D">Practise open mistakes</a></div>
  <p class="small muted">An entry resolves after 3 later correct, not-guessed answers on the same objective, on at least 2 different days. Errors made while "sure" are marked as confident errors and reviewed first.</p>
  <div id="mlist"></div>`;
bind.mistakes = () => {
  const paint = () => {
    const f = $("#mfilter").value;
    const rows = Object.values(S.mistakes).filter((m) => f === "all" || (f === "active" ? m.status !== "resolved" : m.status === f)).sort((a, b) => (b.confident - a.confident) || b.last - a.last);
    $("#mlist").innerHTML = rows.length ? `<div class="panel"><div class="list">${rows.map((m) => {
      const q = Q.get(m.qid); if (!q) return "";
      return `<details><summary class="row small"><span class="mono muted">${m.qid}</span>${chip(m.status, m.status === "resolved" ? "st-PROFICIENT" : m.status === "improving" ? "st-DEVELOPING" : "st-NEEDS_REVIEW")}${m.confident ? chip("Confident error", "st-NEEDS_REVIEW") : ""}${chip(CAT_LABEL[m.cat] || m.cat)}<span style="flex:1;min-width:0">${esc(q.q.slice(0, 80))}…</span></summary>
        <dl class="kv small" style="padding:8px 0"><dt>Date</dt><dd>${fmtDate(m.first)}${m.last !== m.first ? " · last " + fmtDate(m.last) : ""}</dd><dt>Chapter / lesson</dt><dd>${CH.get(m.ch)?.n}. ${esc(CH.get(m.ch)?.title)} · <a href="#lesson~${m.lesson}">${m.lesson}</a></dd>
        <dt>Objective</dt><dd>${esc(OBJ.get(m.obj)?.text)} ${statusChip(objStatus(m.obj))}</dd><dt>Question</dt><dd>${esc(q.q)}</dd><dt>Your answer</dt><dd>${esc(m.my)}</dd><dt>Correct answer</dt><dd>${esc(m.correct)}</dd><dt>Explanation</dt><dd>${esc(q.ex || q.steps?.join(" "))}</dd>
        ${m.mis ? `<dt>Likely misconception</dt><dd>${esc(m.mis)}</dd>` : ""}<dt>Confidence</dt><dd>${{ s: "Sure", u: "Unsure", g: "Guessing" }[m.conf] || "—"}</dd><dt>Later correct answers</dt><dd>${m.wins || 0} on ${(m.winDays || []).length} day(s)</dd><dt>Next review</dt><dd>${fmtDue(S.items[m.qid]?.due)}</dd>${m.note ? `<dt>Your explanation</dt><dd>${esc(m.note)}</dd>` : ""}</dl></details>`;
    }).join("")}</div></div>` : `<div class="empty">Nothing here.</div>`;
  };
  $("#mfilter").addEventListener("change", paint); paint();
};

VIEWS.stats = () => {
  const A = S.attempts;
  if (!A.length) return `<h1>Analytics</h1><div class="empty">Answer some questions and your performance by chapter, question type and confidence will appear here.</div>`;
  const by = (fn) => { const m = new Map(); for (const a of A) { const q = Q.get(a.q); if (!q) continue; const k = fn(q, a); const v = m.get(k) || [0, 0]; v[1]++; if (a.ok) v[0]++; m.set(k, v); } return m; };
  const byCh = by((q) => chOfLesson(q.l)); const byType = by((q) => ({ mcq: "Multiple choice", scn: "Scenario", num: "Calculation" }[q.t])); const byD = by((q) => ["", "Basic", "Intermediate", "Hard"][q.d]);
  const cal = { s: [0, 0], u: [0, 0], g: [0, 0] }; for (const a of A) { cal[a.c][a.ok ? 0 : 1]++; }
  const cats = {}; for (const m of Object.values(S.mistakes)) cats[m.cat] = (cats[m.cat] || 0) + 1;
  const days = [...Array(30)].map((_, i) => S.days[dayKey(now() - (29 - i) * DAY)] || 0); const maxD = Math.max(1, ...days);
  const tbl = (m, label) => `<table><thead><tr><th>${label}</th><th class="num">Answered</th><th class="num">Accuracy</th></tr></thead><tbody>${[...m.entries()].map(([k, [ok, n]]) => `<tr><td>${esc(CH.get(k) ? CH.get(k).n + ". " + CH.get(k).title : k)}</td><td class="num mono">${n}</td><td class="num mono">${pct(ok, n)}%</td></tr>`).join("")}</tbody></table>`;
  return `
  <div><div class="eyebrow">${A.length} answers recorded</div><h1>Analytics</h1></div>
  <div class="panel"><h3>Activity, last 30 days</h3><div class="spark">${days.map((d) => `<i style="height:${(100 * d) / maxD}%" title="${d}"></i>`).join("")}</div></div>
  <div class="grid2"><div class="panel"><h3>By question type</h3>${tbl(byType, "Type")}</div><div class="panel"><h3>By difficulty</h3>${tbl(byD, "Difficulty")}</div></div>
  <div class="panel"><h3>Confidence calibration</h3><div class="cal"><div class="h"></div><div class="h">Correct</div><div class="h">Wrong</div>${["s", "u", "g"].map((k) => `<div class="h">${{ s: "Sure", u: "Unsure", g: "Guessing" }[k]}</div><div>${cal[k][0]}</div><div>${cal[k][1]}</div>`).join("")}</div>
  <p class="small muted">Watch the "Sure / Wrong" cell: confident errors reveal misconceptions that feel like knowledge. "Guessing / Correct" answers do not count toward mastery.</p></div>
  <div class="panel"><h3>By chapter</h3><div class="tablewrap">${tbl(byCh, "Chapter")}</div></div>
  <div class="panel"><h3>Error types in the mistake log</h3>${Object.keys(cats).length ? `<div class="list">${Object.entries(cats).sort((a, b) => b[1] - a[1]).map(([k, n]) => `<div class="row"><span>${esc(CAT_LABEL[k] || k)}</span><span class="spacer"></span><b class="mono">${n}</b></div>`).join("")}</div>` : `<div class="empty">No errors logged.</div>`}</div>`;
};

// ═════════════════════════════════════════════════════════════════════
// Search
// ═════════════════════════════════════════════════════════════════════
VIEWS.search = () => `<div><div class="eyebrow">Lessons, terms, rules, formulas</div><h1>Search</h1></div><input type="search" id="sq" placeholder="Type at least 3 letters, e.g. 'riparian', 'blind ad', 'proration'"><div id="sres" style="display:grid;gap:14px"></div>`;
const lessonText = new Map(DATA.lessons.map((l) => [l.id, plain(l.html || "")]));
bind.search = () => {
  const box = $("#sq"); box.focus();
  box.addEventListener("input", () => {
    const t = box.value.toLowerCase().trim(); const out = $("#sres");
    if (t.length < 3) { out.innerHTML = ""; return; }
    const hl = (s) => esc(s).replace(new RegExp(t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"), (m) => `<mark>${m}</mark>`);
    const snip = (txt) => { const i = txt.toLowerCase().indexOf(t); return i < 0 ? "" : "…" + txt.slice(Math.max(0, i - 60), i + 90) + "…"; };
    const L = DATA.lessons.filter((l) => (l.title + " " + lessonText.get(l.id)).toLowerCase().includes(t)).slice(0, 12);
    const G = DATA.glossary.filter((g) => (g.term + " " + g.def).toLowerCase().includes(t)).slice(0, 15);
    const N = DATA.numbers.filter((n) => (n.s + " " + n.val).toLowerCase().includes(t)).slice(0, 10);
    const C = DATA.comparisons.filter((c) => (c.concept + c.fl + c.pt).toLowerCase().includes(t)).slice(0, 6);
    const F = DATA.flashcards.filter((f) => f.t === "formula" && (f.f + f.b).toLowerCase().includes(t));
    const Qs = DATA.questions.filter((q) => q.q.toLowerCase().includes(t)).slice(0, 8);
    out.innerHTML = [
      L.length && `<div class="panel"><h3>Lessons</h3><div class="list">${L.map((l) => `<div><a href="#lesson~${l.id}"><b>${l.id} · ${esc(l.title)}</b></a><div class="small muted">${hl(snip(lessonText.get(l.id)))}</div></div>`).join("")}</div></div>`,
      G.length && `<div class="panel"><h3>Glossary</h3><div class="list">${G.map((g) => `<div><b>${hl(g.term)}</b> — ${hl(g.def)} <a class="small" href="#lesson~${g.l}">${g.l}</a>${g.note ? `<div class="small muted">${esc(g.note)}</div>` : ""}</div>`).join("")}</div></div>`,
      N.length && `<div class="panel"><h3>Rules &amp; numbers</h3><div class="list">${N.map((n) => `<div><b>${hl(n.s)}</b><div class="small mono">${hl(n.val)}</div>${vChip(n.v)}</div>`).join("")}</div></div>`,
      F.length && `<div class="panel"><h3>Formulas</h3><div class="list">${F.map((f) => `<div><b>${hl(f.f)}</b><div class="small mono">${hl(f.b)}</div></div>`).join("")}</div></div>`,
      C.length && `<div class="panel"><h3>Portugal vs Florida</h3><div class="list">${C.map((c) => `<div><a href="#compare~${c.id}">${esc(c.concept)}</a></div>`).join("")}</div></div>`,
      Qs.length && `<div class="panel"><h3>Practice questions (answers hidden)</h3><div class="list">${Qs.map((q) => `<div class="small"><span class="mono muted">${q.id}</span> ${hl(q.q)} <a href="#quiz~A~${q.l}">Lesson quiz</a></div>`).join("")}</div></div>`,
    ].filter(Boolean).join("") || `<div class="empty">No results.</div>`;
  });
};

// ═════════════════════════════════════════════════════════════════════
// Study plan
// ═════════════════════════════════════════════════════════════════════
VIEWS.plan = () => {
  if (!PLAN) return `<div><div class="eyebrow">Your plan</div><h1>Study plan</h1></div><div class="panel">${studyPlanHtml() || `<div class="empty">Set your exam date and daily study time in <a href="#settings">Settings</a> to see your pace.</div>`}</div>`;
  const k = dayKey(), ids = [...PLAN_DAY_OF.keys()];
  return `
  <div><div class="eyebrow">O seu plano</div><h1>${esc(PLAN.title)}</h1>
    <p class="muted small">Exame: ${fmtPlanDate(PLAN.examDate)} · ${PLAN.dailyMinutes} min por dia · ${ids.filter(isRead).length} de ${ids.length} lições estudadas</p></div>
  ${studyPlanHtml()}
  <div class="panel"><h3>Os blocos do dia</h3>${taskList(PLAN.blocks.map((b) => ({ text: `${b.name} · ${b.min}: ${b.text}`, href: b.href })))}</div>
  <div class="panel"><h3>Dois tipos de lição</h3><ul class="small" style="margin:0;padding-left:20px;display:grid;gap:4px"><li>${esc(PLAN.modes.full)}</li><li>${esc(PLAN.modes.fast)}</li><li>${esc(PLAN.modes.calc)}</li></ul>
    <h3>Regras</h3><ul class="small" style="margin:0;padding-left:20px;display:grid;gap:4px">${PLAN.rules.map((r) => `<li>${esc(r)}</li>`).join("")}</ul></div>
  <div class="panel"><h3>Calendário</h3><div class="list">${PLAN.days.map((d) => `<div class="plan-day${d.date === k ? " today" : d.date < k ? " past" : ""}">
    <div class="row"><b>${fmtPlanDate(d.date)}</b>${d.title ? chip(d.title, d.kind === "exam" ? "st-NEEDS_REVIEW" : "full") : ""}${d.date === k ? chip("Hoje", "st-INTRODUCED") : ""}</div>
    ${(d.lessons || []).length ? `<div class="row small" style="margin-top:6px">${d.lessons.map((id) => `<a href="#lesson~${id}" class="chip ${isRead(id) ? "st-PROFICIENT" : d.date < k ? "st-NEEDS_REVIEW" : ""}" title="${esc(LS_.get(id)?.title)}">${id}${PLAN_FAST.has(id) ? " R" : ""}${isRead(id) ? " ✓" : ""}</a>`).join("")}</div>` : ""}
    ${(d.tasks || []).length ? `<div style="margin-top:6px">${taskList(d.tasks)}</div>` : ""}
  </div>`).join("")}</div>
  <p class="small muted">R = lição rápida. Verde = estudada. Vermelho = em atraso.</p></div>`;
};

// ═════════════════════════════════════════════════════════════════════
// Settings: exam date, export / import, reset
// ═════════════════════════════════════════════════════════════════════
VIEWS.settings = () => `
  <div><div class="eyebrow">Your plan and your data</div><h1>Settings</h1></div>
  <div class="panel"><h3>Study plan</h3>
    <div class="grid2"><label class="field">Exam date<input type="date" id="set-date" value="${esc(examDateSet())}"></label>
    <label class="field">Realistic study time per day (minutes)<input type="number" id="set-min" min="10" max="600" step="5" value="${esc(dailyMinSet())}" placeholder="e.g. 60"></label>
    <label class="field">New flashcards per day<input type="number" id="set-new" min="0" max="100" value="${esc(S.settings.newCardsPerDay)}"></label></div>
    <button class="btn primary" id="save-set">Save plan</button>${studyPlanHtml()}</div>
  <div class="panel"><h3>Where your progress is saved</h3>
    <p class="small">${Store.mode === "cloud" ? "Your progress is saved to your account through this page, so it follows you across devices. A copy is also kept in this browser." : Store.mode === "local" ? "Your progress is saved in this browser only. Export a backup regularly, especially before clearing browser data or switching devices." : "This browser is not allowing storage. Export a backup before closing the page."}</p></div>
  <div class="panel"><h3>Backup</h3><p class="small muted">Export everything (progress, mistakes, flashcard schedule, history) as a JSON file. Import merges a backup into your current progress.</p>
    <div class="row"><button class="btn" id="export">Export backup</button><label class="btn">Import from file<input type="file" id="importfile" accept="application/json,.json" hidden></label></div>
    <textarea id="backup-text" placeholder="Or paste a backup here, then press Import pasted backup" style="min-height:90px"></textarea>
    <div class="row"><button class="btn sm" id="importtext">Import pasted backup</button><button class="btn sm ghost" id="copybk">Copy backup to clipboard</button></div></div>
  <div class="panel"><h3>Reset</h3><p class="small muted">Deletes all progress on this page. Export a backup first.</p><button class="btn danger" id="reset">Reset all progress…</button>
    <div id="resetconfirm" hidden class="row"><span class="small">This cannot be undone.</span><button class="btn danger" id="resetyes">Yes, delete my progress</button><button class="btn" id="resetno">Cancel</button></div></div>`;
bind.settings = () => {
  $("#save-set").addEventListener("click", () => {
    S.settings.examDate = $("#set-date").value; S.settings.dailyMinutes = $("#set-min").value; S.settings.newCardsPerDay = Number($("#set-new").value) || 15; S.settings.savedAt = dayKey();
    Store.touch("core"); toast("Plan saved"); route();
  });
  const backup = () => JSON.stringify({ app: "fl-exam-coach", exported: new Date().toISOString(), state: S }, null, 1);
  $("#export").addEventListener("click", async () => {
    const name = `fl-exam-backup-${dayKey()}.json`;
    if (Store.dl) { try { await Store.dl.save({ filename: name, data: backup() }); toast("Backup saved"); return; } catch (e) { if (e?.code === "declined") return; } }
    try { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([backup()], { type: "application/json" })); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); } catch { /* fall through */ }
    $("#backup-text").value = backup(); toast("Backup also placed in the box below — copy it somewhere safe.");
  });
  $("#copybk").addEventListener("click", async () => { const t = backup(); try { await navigator.clipboard.writeText(t); toast("Copied"); } catch { $("#backup-text").value = t; $("#backup-text").select(); toast("Select-all and copy the text in the box."); } });
  const doImport = (txt) => {
    try { const j = JSON.parse(txt); const st = j.state || j; if (!st.attempts || !st.items) throw new Error("not a backup"); S = mergeState(S, st); invalidate(); Store.touch("core", "itemsQ", "itemsF", "mistakes", ...uniq(S.attempts.map((a) => "att:" + dayKey(a.t))), ...S.sessions.map((s) => "ses:" + s.id)); toast("Backup merged"); route(); }
    catch { toast("That file is not a valid backup."); }
  };
  $("#importfile").addEventListener("change", (e) => { const f = e.target.files[0]; if (!f) return; const r = new FileReader(); r.onload = () => doImport(r.result); r.readAsText(f); });
  $("#importtext").addEventListener("click", () => doImport($("#backup-text").value));
  $("#reset").addEventListener("click", () => { $("#resetconfirm").hidden = false; });
  $("#resetno").addEventListener("click", () => { $("#resetconfirm").hidden = true; });
  $("#resetyes").addEventListener("click", () => {
    const days = uniq(S.attempts.map((a) => dayKey(a.t))); const ses = S.sessions.map((s) => s.id);
    S = blank(); live = null; Store.saveLive(); invalidate();
    if (Store.db) { for (const d of days) Store.db.doc("attempts/" + d).delete().catch(() => {}); for (const s of ses) Store.db.doc("sessions/" + s).delete().catch(() => {}); }
    Store.touch("core", "itemsQ", "itemsF", "mistakes"); toast("Progress reset"); go("home");
  });
};

// ═════════════════════════════════════════════════════════════════════
Store.init();
})();
