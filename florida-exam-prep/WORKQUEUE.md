# Work queue (autonomous continuation)

This file is the checkpoint for work that continues without the learner present, including after a usage-limit interruption. An hourly routine on the Claude Code session wakes, reads this file, and resumes from the first unchecked step. Interactive tutoring is never advanced automatically.

Branch: `claude/intelligent-gauss-j3ghht` · Published app: the private artifact recorded in the session (republish from `dist/artifact.html`).

## Steps

- [x] **1. Verification sweep.** Check every rule still marked "not yet verified" (V-26 list) plus the unresolved entries V-02, V-07, V-08, V-22 and V-25 against official sources, with an independent skeptic re-check of each result.
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
| 2026-10-20 02:20 | Container restart stopped task `wpbd3ank5`. Journal kept 7 research batches (64 verdicts, cached) and 3 skeptic checks. Those skeptics could not search: **WebSearch is capped at 200 calls per turn, shared by all agents**, and the 7 researchers used it all. |
| 2026-10-20 02:25 | Script patched (targeted skeptics capped at 12 searches each with an honest `checked` flag; exam-specs batch retried, capped at 20; lesson agents forbidden to search) and run resumed as task `wvb7dw2nk` (run `wf_f059b2e6-5ac`). Exact args saved in `scripts/workflows/verify_and_expand.args.json`. |
| 2026-10-20 02:40 | Task `wvb7dw2nk` ended: verification (64 items: 5 corrected, 56 confirmed, 3 unresolved) and all 7 skeptic re-checks completed and are cached; all 19 lesson writers failed on the account's session limit (reset 06:20 UTC). Partial drafts of L03-1, L03-2, L04-1 were discarded. |
| 2026-10-20 07:12 | After the reset, run `wf_f059b2e6-5ac` resumed as task `wabygq9tf` (verification cached; writers, reviewers and fixers run live). Integration of the verification results into `data/` started in parallel (lesson files untouched until staging is complete). |
| 2026-10-20 07:16 | Verification results integrated into `data/` (V-27 to V-80, official exam weights, numbers, questions); committed `7b95787`. Step 1 ticked. |
| 2026-10-20 ~07:50 | Task `wabygq9tf` stopped on the session limit again (reset 12:00 UTC). Staged and structurally complete but NOT reviewed: L03-1 … L08-3 (22 lessons, batches ch03–ch08a). |
| 2026-10-20 12:20 | New, cheaper workflow `wf_60ae246e-c60` (task `wx5kdt4vf`): agents read one compact context pack per batch (`staging/_ctx/<batch>.md`, built by `scripts/context_packs.mjs` from `scripts/workflows/lesson_batches.json`) instead of the whole manual and data files. Stages: write (13 missing batches) → adversarial review that fixes in place → independent fact audit. Script copy `scripts/workflows/lessons_from_packs.js`, args `scripts/workflows/lessons_from_packs.args.json`. |
| 2026-10-20 ~13:15 | Task `wx5kdt4vf` stopped on the session limit (reset 17:10 UTC) after writing 10 batches (ch08b–ch15-17) plus L16-1 and L18-1. Not yet written: L16-2–4, L18-2–3, L19-1–2. No batch reviewed yet. About 175K agent tokens per writer even with context packs; the account limit allows roughly 10 agents per window. |
| 2026-10-20 17:15 | Run `wf_65844fbe-e5e` (task `wd621bpuk`) launched. Drafts committed under `staging/` (only `staging/_ctx/`, which contains manual text, stays ignored) so a container reset cannot lose them. They are NOT used by the app until reviewed and integrated. New run: write the 7 missing lessons, then ONE combined adversarial review + fact audit per batch (cuts the remaining agents from 41 to 22). |
| 2026-10-20 ~18:10 | Task `wd621bpuk` stopped on the session limit (reset 22:10 UTC). Written: all 61 lessons. Reviewed + fact-audited: 13 batches (ch03–ch12, ch14a; 2,026 facts checked; 34 blockers, 56 major and 187 minor issues found and fixed in place). Not yet reviewed: ch13, ch14b, ch15-17, ch16, ch18, ch19. |
| 2026-10-20 23:10 | Resumed as task `wg40hwqsl` for the 6 remaining reviews. The 42 reviewed lessons were integrated into `lessons/` (`integrate_staging.mjs --only …`); 17 question/comparison problems reported by reviewers were fixed in `data/` (four calculation questions got new numbers so they no longer repeat the lessons' worked examples). Build and all 24 browser tests pass; artifact republished. |

## Resume rules

- If the latest workflow run in the run log is still running, do nothing.
- If it stopped early, resume the LATEST run (`wf_65844fbe-e5e`, script copy `scripts/workflows/lessons_review.js`) with `resumeFromRunId` and exactly the args in `scripts/workflows/lessons_review.args.json` (identical prompts keep completed agents cached). Earlier runs (`wf_f059b2e6-5ac`, `wf_60ae246e-c60`) are finished with.
- If the context packs are missing (fresh container), rebuild them first: `node scripts/context_packs.mjs <manual_expanded.md> scripts/workflows/lesson_batches.json`.
- Integrate only batches that finished all three stages (write/review/audit): `node scripts/integrate_staging.mjs` replaces core blocks with whatever is staged, so first move unreviewed drafts out of `staging/`.
- Web search budget: 200 calls per turn shared by every agent. Never schedule more searching agents than that budget allows; lesson agents must not search. Staging files are written by agents, so any chapter whose `staging/` files are missing after a resume must be re-run, not resumed from cache.
- The study manual text lives in the session scratchpad (`sources/manual_expanded.md`). If the container was replaced, re-read the Google Doc "FL-Study-Manual-Expanded" (Drive file id `1Kp2wPX_zqN7AogaJV2fAQcZ45kg3A5M4mWKsbGFtx7k`).
