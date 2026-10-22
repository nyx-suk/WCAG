## Milestone 1: Right now

**When:** Before we build `runAudit.ts`, as we are about to combine axe and
keyboard checks into the main orchestrator.

**Copy and send this to Person B now:**

> Hey Person B! I’ve completed the core engine checks (axe-core, keyboard-trap
> with video recording, and keyboard-operability).
>
> Before I implement `runAudit.ts`, can we confirm two contract details?
>
> 1. Is your SQLite schema expecting `Promise<AuditResult>` (with findings,
>    check execution statuses, and `axeSummary`) or just `AuditFinding[]`?
> 2. Does your findings table store evidence as a serialized JSON string, and
>    do you have a column for fingerprint (16-char SHA-256) for deduplication
>    and retest matching?

---

## Milestone 2: When wiring the contrast check into `runAudit`

**When:** Implementing the `"contrast"` branch in `runAudit`.

**Ask Person B:**

> Hey Person B, I’m wiring the `"contrast"` check branch in `runAudit`:
>
> 1. What is the export name and file path for your contrast function (e.g.,
>    `runContrastCheck` in `src/audit/contrast.ts`)?
> 2. Does your function expect the Playwright `Page` object directly, or
>    specific arguments like `{ screenshot, targetSelector, requiredRatio }`?
> 3. Where will your TC3 test page be hosted (e.g.,
>    `http://localhost:4000/tc3`)?

---

## Milestone 3: When writing the retest runner (TC4)

**When:** Testing retesting an issue against a fixed page.

**Ask Person B:**

> Hey Person B, regarding the retest workflow:
>
> 1. When a user clicks **Retest** in your UI, will you pass `checks: [checkId]`
>    in `AuditInput` so the engine only re-runs that specific check?
> 2. For TC4, my fixture server provides `POST /__state/tc2` with
>    `{"fixed": true}` to switch the page to fixed. Does your retest runner
>    trigger that endpoint to simulate the fix?
> 3. Can you confirm the UI state machine only moves an issue to `RESOLVED` if
>    the retest produces 0 findings (never on error or failure)?

---

## Milestone 4: When building the TC1–TC4 runner scripts

**When:** Writing `scripts/run-tc1.ts` and `scripts/run-tc2.ts` for official
evidence.

**Ask Person B:**

> Hey Person B, Section 10.4 of the PRD requires recording inputs, expected
> outcomes, actual outcomes, and evidence for TC1–TC4:
>
> 1. Do you have a `test_runs` SQLite table for this, or should my scripts
>    output a `test-runs.json` file for the submission?
> 2. Where in the repo should we aggregate the final evidence artifacts for
>    the judges?

---

## Milestone 5: Final demo and submission freeze

**When:** The engine is frozen and we prepare for the end-to-end demo.

**Ask Person B:**

> Hey Person B, ready for the final integration rehearsal:
>
> 1. What is the single command to run the whole app from a clean start
>    (e.g., `npm run setup && npm start`)?
> 2. Do you need any specific technical slides from me explaining how TC1 and
>    TC2 detect issues for the presentation?
> 3. What is our confirmed final submission deadline on the portal?

---

**Next action:** You can copy and send Milestone 1 to Person B now. Whenever
you are ready, let me know the next task (such as implementing `runAudit.ts`)
and I will proceed!
