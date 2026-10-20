# Spaced repetition, mastery and the mistake log

Live data (attempts, schedules, mistakes) is stored by the app: in the learner's private artifact database, mirrored in the browser, and exportable as JSON from Settings. It is deliberately not committed to this public repository. This file documents the rules the app applies (`app/app.js`).

## Review intervals

Every question and flashcard has a step on the ladder: **10 minutes → 1 → 3 → 7 → 14 → 30 → 60 days**.

| Result | Effect |
|---|---|
| Wrong | Back to step 0 (seen again in about 10 minutes); lapse counted |
| Correct but guessing | No advance; next review in 1 day |
| Correct but unsure / flashcard "difficult" | Advance one step at half the interval (minimum 1 day) |
| Correct and sure / flashcard "easy" | Advance one step (two steps after consecutive "easy") |

Intervals are capped at half the days left before the exam date, so nothing is scheduled past the exam. New flashcards unlock only for lessons marked as studied, at most 15 a day by default (adjustable).

## Mastery status per learning objective

Evidence = the answers to all questions linked to that objective. Answers given while "guessing" never count as evidence of knowledge.

| Status | Rule |
|---|---|
| Not started | Lesson not studied and no answers |
| Introduced | Lesson studied, or only one answer so far |
| Developing | Some answers, but not yet meeting Proficient |
| Needs review | Last answer wrong, or a confident error among the last 3, or 2+ errors among the last 4 |
| Proficient | 3+ independent correct answers among the last 4, on at least 2 different questions, last answer correct |
| Exam-ready | Proficient, plus: 4+ independent correct answers in total, on days at least 2 days apart, including a mixed or cumulative mode, and no error in the last 3 |

A single correct answer never makes an objective proficient. Saying "it makes sense" changes nothing.

## Mistake log

An entry is created for every wrong answer and every correct guess. It records:

- date, chapter, lesson, objective, question id, your answer, the correct answer and the explanation;
- the error category (suggested from the misconception attached to the distractor you chose, editable) and the likely misconception;
- your confidence ("confident error" if you were sure), your own explanation if you wrote one, the next review date, and the number of later successes.

Status moves **open → improving → resolved**. It resolves after 3 later independent correct answers on the same objective, on at least 2 different days. Weakness training (Mode D) draws from open entries, preferring a different question on the same objective so that recognition of a familiar question is not mistaken for knowledge.

Error categories: did not know the rule · confused two similar rules · applied Portuguese assumptions · misunderstood the question · misread a legal qualification · forgot a number or deadline · used the wrong formula · arithmetic error · confused units · guessed correctly · correct but could not explain why.
