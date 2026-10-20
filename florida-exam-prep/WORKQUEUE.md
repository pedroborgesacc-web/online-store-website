# Work queue (autonomous continuation)

This file is the checkpoint for work that continues without the learner present, including after a usage-limit interruption. An hourly routine on the Claude Code session wakes, reads this file, and resumes from the first unchecked step. Interactive tutoring is never advanced automatically.

Branch: `claude/intelligent-gauss-j3ghht` · Published app: the private artifact recorded in the session (republish from `dist/artifact.html`).

## Steps

- [ ] **1. Verification sweep.** Check every rule still marked "not yet verified" (V-26 list) plus the unresolved entries V-02, V-07, V-08, V-22 and V-25 against official sources, with an independent skeptic re-check of each result.
- [ ] **2. Full lessons.** Expand the 61 core lessons (L03-1 … L19-2) into full 14-section lessons. Each one is written, adversarially reviewed against the manual, the numbers database and the verification log, then fixed. Output: `staging/<LessonId>.md`.
- [ ] **3. Integrate.** Apply verification results to `data/verification.mjs` (new V-entries) and `data/numbers.mjs`; update any question or lesson that a correction affects; replace the core lessons in `lessons/chNN.md` with the staged full lessons.
- [ ] **4. Validate.** `node scripts/build.mjs` and `node tests/app.test.mjs` must both pass.
- [ ] **5. Publish.** Republish the artifact from `dist/artifact.html` (same URL); commit and push.
- [ ] **6. Close.** Disable the hourly routine and send the learner a short summary.

## Run log

| When (UTC) | Event |
|---|---|
| 2026-10-20 02:01 | Hourly routine `trig_01JxxExmx4TmaxfNt7GUBUtr` created (first wake 03:00 UTC). |
| 2026-10-20 02:02 | Workflow run `wf_f059b2e6-5ac` (task `wpbd3ank5`) launched for steps 1–2. Script copy: `scripts/workflows/verify_and_expand.js`. Resume in this session with `Workflow({scriptPath, resumeFromRunId: "wf_f059b2e6-5ac"})`; in a fresh container, re-run the script copy with the same args (lesson batches and verification items listed in the script's call in the session transcript). |

## Resume rules

- If the workflow run in the run log is still running, do nothing.
- If it stopped early, resume it with `resumeFromRunId`. Staging files are written by agents, so any chapter whose `staging/` files are missing after a resume must be re-run, not resumed from cache.
- The study manual text lives in the session scratchpad (`sources/manual_expanded.md`). If the container was replaced, re-read the Google Doc "FL-Study-Manual-Expanded" (Drive file id `1Kp2wPX_zqN7AogaJV2fAQcZ45kg3A5M4mWKsbGFtx7k`).
