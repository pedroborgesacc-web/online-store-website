// Study-plan builder, shared by the app (inlined before app.js by the build)
// and by scripts/make_plan.mjs (loaded with require). Pure functions only:
// no DOM, no storage, no clock. Dates are "YYYY-MM-DD" strings.
var FLPlanner = (function () {
  "use strict";
  const DAY = 86400000;
  const toDate = (k) => { const [y, m, d] = k.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d)); };
  const addDays = (k, n) => new Date(toDate(k).getTime() + n * DAY).toISOString().slice(0, 10);
  const diffDays = (a, b) => Math.round((toDate(b) - toDate(a)) / DAY);
  const weekday = (k) => toDate(k).getUTCDay(); // 0 = Sunday … 6 = Saturday
  const wordsOf = (html) => String(html || "").replace(/<[^>]+>/g, " ").replace(/&[a-z#0-9]+;/gi, " ").split(/\s+/).filter(Boolean).length;

  // Estimated minutes for one lesson including its quiz.
  // Full: reading at ~90 words/min with recall pauses, 1.5 min per question, 5 min
  // for the memory sheet, +10 min for calculation practice. Fast: sections 7, 9, 10 + quiz.
  function lessonMinutes({ words, questions, type, fast }) {
    if (fast) return Math.round(12 + 1.5 * questions);
    return Math.round(words / 90 + 1.5 * questions + 5 + (type === "calculation" ? 10 : 0));
  }

  const DEFAULT_TAIL = [
    { kind: "mock", title: "Mock exam 1", tasks: [{ text: "Timed mock exam: 100 questions in 3 h 30 in one sitting", href: "exam" }, { text: "Review every mistake", href: "mistakes" }] },
    { kind: "review", title: "Fix the mock", tasks: [{ text: "Weakness training", href: "quiz~D" }, { text: "All numbers and deadlines", href: "numbers" }] },
    { kind: "mock", title: "Mock exam 2", tasks: [{ text: "Second mock exam", href: "exam" }, { text: "Review every mistake", href: "quiz~D" }] },
    { kind: "review", title: "Weak areas", tasks: [{ text: "Weakness training", href: "quiz~D" }, { text: "Mixed exam practice", href: "quiz~G" }] },
    { kind: "review", title: "Calculations and numbers", tasks: [{ text: "All calculation patterns", href: "calc" }, { text: "All numbers and deadlines", href: "numbers" }] },
    { kind: "light", title: "Light day", tasks: [{ text: "One hour at most: number flashcards", href: "cards" }, { text: "Prepare documents; sleep early" }] },
  ];
  const DEFAULT_EXAM = { kind: "exam", title: "Exam", tasks: [{ text: "Exam day. Read every question to the end; watch NOT, EXCEPT and legal qualifications." }] };
  const KIND_MIN = { mock: 240, review: 180, light: 75, exam: 0 };

  // The lesson-free days a base plan keeps before its exam (mocks, reviews, light day).
  function tailOf(base) {
    if (!base?.days?.length) return { tail: DEFAULT_TAIL, exam: DEFAULT_EXAM };
    let last = -1;
    base.days.forEach((d, i) => { if ((d.lessons || []).length) last = i; });
    const after = base.days.slice(last + 1).map(({ date, lessons, min, ...rest }) => rest);
    const exam = after.find((d) => d.kind === "exam") || DEFAULT_EXAM;
    const tail = after.filter((d) => d.kind !== "exam");
    return { tail: tail.length ? tail : DEFAULT_TAIL, exam };
  }

  // When time is short, keep the light day, then the first mock, its review, the second mock…
  function shrinkTail(tail, n) {
    if (n >= tail.length) return tail;
    if (n <= 0) return [];
    const mocks = tail.map((d, i) => (d.kind === "mock" ? i : -1)).filter((i) => i >= 0);
    const prio = tail.map((d, i) => {
      if (d.kind === "light") return 0;
      if (i === mocks[0]) return 1;
      if (mocks.length && i === mocks[0] + 1 && d.kind === "review") return 2;
      if (i === mocks[1]) return 3;
      return 4 + i;
    });
    const keep = new Set(tail.map((_, i) => i).sort((a, b) => prio[a] - prio[b]).slice(0, n));
    return tail.filter((_, i) => keep.has(i));
  }

  /**
   * Build a day-by-day plan.
   * @param {object} o
   * @param {string} o.start   first study day
   * @param {string} o.exam    exam day
   * @param {{id:string,min:number}[]} o.lessons  lessons still to study, in study order
   * @param {object} [o.base]  plan supplying texts (title, blocks, modes, rules, fast) and the final-week template
   * @param {string[]} [o.fast] fast-track lesson ids (defaults to base.fast)
   * @param {number} [o.overhead] daily minutes outside lessons (review block + memory sheets)
   * @param {{text:string,href?:string,min?:number}} [o.saturdayTask] extra task on Saturdays
   */
  function build({ start, exam, lessons, base, fast, overhead = 60, saturdayTask }) {
    if (!start || !exam || diffDays(start, exam) < 1) throw new Error("The start date must be before the exam date.");
    const total = diffDays(start, exam); // days available before exam day
    const { tail: tpl, exam: examDay } = tailOf(base);
    const minStudy = lessons.length ? Math.min(3, total) : 0; // keep at least 3 study days when lessons remain
    const tail = shrinkTail(tpl, total - minStudy);
    const studyN = total - tail.length;
    const days = [];
    let i = 0, remaining = lessons.reduce((s, l) => s + l.min, 0);
    for (let d = 0; d < studyN; d++) {
      const left = studyN - d, target = remaining / left;
      const day = { date: addDays(start, d), lessons: [], min: 0 };
      while (i < lessons.length) {
        const m = lessons[i].min;
        if (day.lessons.length && left > 1 && day.min + m / 2 > target) break;
        day.lessons.push(lessons[i].id); day.min += m; remaining -= m; i++;
      }
      if (saturdayTask && weekday(day.date) === 6 && day.lessons.length) { day.tasks = [{ text: saturdayTask.text, href: saturdayTask.href }]; day.min += saturdayTask.min || 30; }
      if (!day.lessons.length) { day.kind = "review"; day.title = day.title || "Review"; day.tasks = [{ text: "Weakness training", href: "quiz~D" }, { text: "Mixed exam practice", href: "quiz~G" }]; day.min = 120; }
      day.min = Math.round(day.min + (day.lessons.length ? overhead : 0));
      days.push(day);
    }
    tail.forEach((t, j) => days.push({ ...t, date: addDays(start, studyN + j), lessons: [], min: t.min ?? KIND_MIN[t.kind] ?? 120 }));
    days.push({ ...examDay, date: exam, lessons: [], min: 0 });
    const study = days.filter((d) => d.lessons.length);
    const avg = study.length ? Math.round(study.reduce((s, d) => s + d.min, 0) / study.length) : 0;
    return {
      title: base?.title || "Study plan",
      examDate: exam,
      start,
      created: start,
      dailyMinutes: Math.ceil(avg / 15) * 15,
      peakMinutes: study.reduce((m, d) => Math.max(m, d.min), 0),
      blocks: base?.blocks || [],
      modes: base?.modes || { full: "Full lesson: read sections 3, 5, 7, 8 and 9 carefully, skim 2, 4 and 6, recall, check with the memory sheet, take the quiz.", fast: "Fast lesson: read sections 7, 9 and 10, then take the quiz.", calc: "Calculation: work the guided practice by hand before opening the answers." },
      rules: base?.rules || [],
      fast: fast || base?.fast || [],
      days,
    };
  }

  return { addDays, diffDays, weekday, wordsOf, lessonMinutes, tailOf, shrinkTail, build };
})();
if (typeof module !== "undefined") module.exports = FLPlanner;
