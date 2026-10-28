# Person A: IDE Prompt Pack, Part 2
Remaining work from Progress Reports 02 and 03: finish Phase 3, then Phases 4 and 5.

How to use: paste **Prompt R** (refresh) at the start of the session. Then paste the prompts in order. Each ends with a "Done when" checklist. Commit after each prompt. Phase 3 prompts map directly to the 8 actions and 6 defects in Progress Report 03.

---

## Prompt R: Context refresh (paste first)

````text
Context refresh. I am Person A on the "WCAG Accessibility Auditor" hackathon project. Phases 1 and 2 are complete; Phase 3 is partially done. Current repo state:

- Branch: feature/keyboard-audit (Person B's feature/contrast-retest is already merged).
- Engine (mine): engine/runAudit.ts, engine/browser.ts, engine/evidence.ts, engine/fingerprint.ts, engine/types.ts, engine/errors.ts, engine/checks/{axe,keyboardTrap,keyboardOperability}.ts
- Person B's code (DO NOT MODIFY unless I explicitly say so): src/api/server.ts, src/persistence/sqlite.ts, engine/contrast-sampler.ts, and their tests.
- Fixtures: fixtures/ (server + TC1 bad/good, TC2 broken/fixed served at the same /tc2 URL, state toggle via POST /__state/tc2 {"fixed":true|false}, POST /__state/reset).
- Tests: `npm test` runs `tsx --test test/**/*.test.ts` with node:test; 27/27 passing; `npm run typecheck` passes. Existing tests use fixture ports 4101-4104; use 4111+ for anything new to avoid collisions.
- Scripts: scripts/dev-axe.ts, dev-keyboard-trap.ts, dev-keyboard-operability.ts.

CONTRACT (unchanged): AuditInput { url, wcagLevel: "A"|"AA"|"AAA", auditId, checks? }, AuditResult { auditId, url, status: "complete"|"incomplete"|"error", findings, checksPlanned, checksExecuted[{checkId,status,error?}], axeSummary?, startedAt, completedAt }, AuditFinding { title, description, wcagRule, severity, source, checkId, fingerprint, selector?, screenshot?, recording?, evidence }.

RULES:
1. A failed navigation, timeout, or crashed check must never look like a pass.
2. Modal focus containment is not a failure; only a genuine inability to exit by keyboard is.
3. Do not break any of the 27 existing tests. Run `npm run typecheck && npm test` after every change.
4. Keep changes minimal and typed. No new features beyond what each prompt asks.
5. Never overclaim WCAG compliance.

Acknowledge briefly, then wait for the next prompt. Do not generate code yet.
````

---

# PHASE 3 (finish): Assemble the Auditor

## Prompt 3.A: Input validation (Defect 3 / REQ-1.2)

````text
Add input validation at the very top of runAudit in engine/runAudit.ts, BEFORE any browser is launched.

Rules (throw a descriptive Error for each; create a ValidationError class in engine/errors.ts and throw that):
- auditId must be a non-empty string after trimming. Also reject characters that are unsafe for a folder name: allow only [A-Za-z0-9._-], max 100 chars (it is used as /evidence/{auditId}/).
- wcagLevel must be exactly "A", "AA" or "AAA".
- url must parse with new URL() (catch the parse error and rethrow as ValidationError) and its protocol must be http: or https:.
- If `checks` is provided, it must be a non-empty array of known CheckIds (axe, keyboard-trap, keyboard-operability, contrast); reject unknown ids and duplicates.

Important: validation throws (rejects the promise); it does NOT return an AuditResult. Navigation failures still return status "error" as before.

Then check how Person B's API layer (src/api/server.ts, parseAuditInput) calls runAudit, and make sure a ValidationError there would surface as a 400-style response rather than a crash. Do NOT edit their file; if a change is needed, list it for me to send to Person B.

Add tests for each rule (put them in the new file engine/__tests__/runAudit.test.ts, created in prompt 3.G; for now write them in test/run-audit-validation.test.ts and I will merge them later).

Done when: empty auditId, "INVALID_LEVEL", "ftp://x", "not-a-valid-url", unknown check id all reject BEFORE Chromium launches (assert no browser was launched, e.g. by timing or by a spy), and all 27 existing tests still pass.
````

## Prompt 3.B: Dynamic contrast import with fallback (Defect 4 / REQ-1.4)

````text
In engine/runAudit.ts, replace the top-level static import of sampleContrast from "./contrast-sampler" with a guarded dynamic import inside the "contrast" check branch.

Requirements:
- Inside the contrast branch: `try { const mod = await import("./contrast-sampler"); ... } catch (err) { ... }`.
- If the module cannot be loaded (import throws, or the expected export is missing), record that check as status "skipped" with error exactly "contrast module not available", mark overall status "incomplete", and continue with the other checks.
- If the module loads but the contrast run itself throws, record "failed" with the error message (different from skipped).
- Add a comment above the branch documenting the expected interface: runContrastCheck(page: Page, input: AuditInput): Promise<AuditFinding[]>, and note that the current implementation adapts sampleContrast to that shape.
- Do NOT modify engine/contrast-sampler.ts (Person B's).
- Make the module path easy to override in tests (an optional internal parameter or a constant I can stub) so that the "module missing" case can be tested without deleting files.

Add a test for the skipped case and a test for the failed case.

Done when: with the module stubbed as missing, runAudit on /tc2 returns status "incomplete", contrast "skipped" with the exact message, and other checks still executed; the real TC3 contrast test still passes.
````

## Prompt 3.C: withTimeout on axe and contrast (REQ-1.6)

````text
In engine/runAudit.ts, wrap the calls to runAxe and the contrast check in withTimeout from engine/browser.ts, consistent with how the keyboard checks already use it.

- axe: 30s. contrast: 30s. Keep the values as named constants at the top of the file.
- On timeout, record the check as "failed" with a message that includes the check id and the timeout, set overall status to "incomplete", and continue to the next check.
- Make sure a timed-out check does not leave a dangling page/context: the shared page for axe/contrast must still be closed in finally.
- Add a test that forces a timeout (make the timeout injectable via an internal option so the test can use e.g. 50ms against a deliberately slow check) and asserts status "incomplete", the failed check message, and that later checks still ran.

Done when: the timeout test passes, no Chromium processes remain after the test (check with pgrep), and existing tests pass.
````

## Prompt 3.D: Fingerprint dedupe and unification (Defects 5 and 6 / REQ-1.9, REQ-3.3)

````text
Two related fixes in engine/runAudit.ts.

PART 1: Unify fingerprints.
- axeFinding and the contrast finding mapper currently use createStableFindingId (24-hex). Change them to use makeFingerprint(checkId, input.url, selector) from engine/fingerprint.ts so ALL findings have a 16-hex fingerprint.
- For axe, use selector = `${ruleId}|${firstNodeSelector}` so two different rules or two different elements produce different fingerprints.
- For contrast, use the selector of the sampled element; if none, use a stable descriptor (e.g. the CSS selector or element path that identifies the text).
- BEFORE changing, search the whole repo (including src/, test/, and SQLite code) for every use of createStableFindingId and of `fingerprint`. Tell me every place that compares or stores fingerprints, because Person B's retest matching depends on them. Do not edit Person B's files; list any needed follow-up for me to send them.

PART 2: Dedupe.
- Before returning AuditResult, deduplicate findings by fingerprint (keep the first). Keep order stable.

Update any existing test expectations that depended on the old fingerprint format. Add a test that two runs of the same input on /tc2 and /tc1/bad produce identical fingerprints, and that different checks/selectors produce different ones.

Done when: all findings in a TC1, TC2 and TC3 run have 16-char hex fingerprints, repeated runs match, and the API/retest tests (test/api.test.ts, test/sqlite.test.ts) still pass.
````

## Prompt 3.E: Public entrypoint (Defect 1, part 1 / REQ-3.1)

````text
Create engine/index.ts as the ONLY public entrypoint of the engine.

- Export runAudit from ./runAudit.
- Re-export all public types from ./types (AuditInput, AuditResult, AuditFinding, CheckId, CheckStatus, Severity, and the evidence types) using `export type { ... }`.
- Export ValidationError, NavigationError, CheckTimeoutError, CheckFailedError from ./errors.
- Export makeFingerprint (retest consumers need it).
- Do NOT export internals (browser harness, evidence helpers, individual checks).

Then find all places that import from "engine/runAudit" or relative paths like "../engine/runAudit" outside the engine folder (src/, scripts/, test/). Update the ones that are mine (scripts/, my tests) to import from the entrypoint. For Person B's files in src/, DO NOT edit; give me the exact one-line import changes to send them.

Done when: typecheck passes, tests pass, and `grep -R "engine/runAudit" src scripts test` shows only intentional internal usages.
````

## Prompt 3.F: INTERFACE.md (Defect 1, part 2 / REQ-3.2, 3.5-3.8)

````text
Write engine/INTERFACE.md for Person B. HARD LIMIT: 60 lines. It must let a developer integrate and implement retests without reading source code.

It must contain, accurately matching the CURRENT code:
1. Import line: import { runAudit } from "engine" (use the real path used in this repo).
2. The exact AuditInput, AuditResult, AuditFinding shapes (compact), plus CheckId, CheckStatus, Severity values (critical, serious, moderate, minor).
3. Status semantics: complete / incomplete / error, and that validation errors throw ValidationError instead of returning a result.
4. Fingerprints: makeFingerprint(checkId, url, selector), 16 hex chars, URL hash fragment ignored; axe uses ruleId|selector as the selector.
5. Retest pass rule: runAudit({ ...original, checks: [original.checkId] }) returns status "complete", that check executed successfully, AND no finding with the original fingerprint. Anything incomplete/error is NOT a pass.
6. Evidence: files at /evidence/{auditId}/..., finding.screenshot/recording are paths relative to /evidence.
7. TC2 fixture toggling: POST /__state/tc2 with {"fixed": true} (and {"fixed": false}, POST /__state/reset).
8. Known limitations: AAA coverage by axe is partial; keyboard candidate discovery is heuristic (opener/control detection may miss custom patterns); keyboard checks cover only the checks that ran.

Verify every claim against the code before writing it. Count the lines (`wc -l`) and keep it at or under 60.

Done when: `wc -l engine/INTERFACE.md` <= 60 and every statement is verifiably true.
````

## Prompt 3.G: Test suite required by the checklist (Defect 2 / REQ-2.1, 2.3a-f)

````text
Create engine/__tests__/runAudit.test.ts and move/merge into it the validation tests from prompt 3.A and any new runAudit tests from 3.B-3.D. Update package.json so `npm test` runs BOTH test/**/*.test.ts and engine/__tests__/**/*.test.ts (keep node:test + tsx). Keep existing tests in test/ unless they are exact duplicates.

The file must contain these six cases explicitly (each with clear names):
1. Unreachable host (e.g. http://127.0.0.1:9 or a closed local port) -> status "error", zero findings, non-empty error message on the checks, never "complete".
2. HTTP 404 on the fixture server (/does-not-exist) -> status "error".
3. Injected failing check -> that check "failed" with its message, the remaining checks still execute, overall status "incomplete". Implement via a small internal dependency-injection parameter (e.g. runAudit(input, internals?) where internals can override a check runner). Keep this OUT of engine/index.ts's public types, and document it as test-only.
4. Same input run twice -> identical fingerprints for the same findings (on /tc1/bad and /tc2 broken).
5. checks: ["keyboard-trap"] -> checksPlanned equals ["keyboard-trap"] AND checksExecuted only contains keyboard-trap.
6. Invalid wcagLevel -> rejects with ValidationError.

Start/stop the fixture server inside the tests using startFixtureServer/stopFixtureServer on ports 4111+. Keep total runtime of this file under 60s, and make sure no Chromium processes leak.

Done when: `npm run typecheck && npm test` passes, the new file has all six cases, and `pgrep -l -f "chromium|playwright"` shows nothing afterwards.
````

## Prompt 3.H: Re-audit Phase 3

````text
Re-run the Phase 3 acceptance checks and report PASS/FAIL per item, with evidence (command output):

1. runAudit validation (4 invalid inputs reject before browser launch).
2. contrast dynamic import with the exact fallback message "contrast module not available".
3. withTimeout on all four checks.
4. Fingerprint dedupe + 16-hex everywhere.
5. engine/index.ts exists and exports exactly the public surface.
6. engine/INTERFACE.md <= 60 lines and accurate.
7. engine/__tests__/runAudit.test.ts has all six cases.
8. Acceptance scenarios: /tc1/bad -> keyboard-trap finding; /tc2 broken -> operability finding AND axeSummary.violationCount === 0; /does-not-exist -> status "error".
9. npm run typecheck, npm test (all pass), no leaked Chromium processes, ports released.

Do not change code. If anything fails, list it and the minimal fix.
````

---

# PHASE 4: Run the Official Test Cases (Person A: TC1, TC2)

## Prompt 4.1: Learn the official reporting format

````text
Before writing any test runner, read the PRD section that defines how official test cases must be reported and what evidence each needs (the PRD file is WCAG_Accessibility_Auditor_PRD.md; look for the test case definitions for TC1-TC4 and the section about test reporting, referred to in my notes as Section 10.4).

Produce a short summary (no code):
1. The exact required fields for each test record (input, expected result, actual result, evidence, etc.).
2. For TC1 and TC2 specifically: what the PRD says must be proven (e.g. TC1 genuine inability to exit, with a recording; TC2 axe clean AND manual keyboard failure).
3. Whether the PRD requires results in SQLite (test_runs table), a JSON file, or both, and where judge-facing evidence must live.
4. Anything in my current engine output that does not yet satisfy those requirements.

Also check src/persistence/sqlite.ts and the repo root for any existing test_runs table or test-runs.json that Person B added, and report what exists. Do not modify anything.
````

## Prompt 4.2: Test-run record format shared with Person B

````text
Based on your summary, create scripts/lib/testRun.ts with:

- A typed TestRunRecord: { testCase: "TC1"|"TC2"|"TC3"|"TC4", title, input: { url, wcagLevel, checks, auditId, fixtureState? }, expected, actual, status: "PASS"|"FAIL"|"INCOMPLETE", explanation?, evidence: { screenshots: string[], recordings: string[], files: string[], details: unknown }, ranAt: ISO string, engine: { commit?: string } }.
- writeTestRun(record): writes /evidence/test-runs/{testCase}.json (pretty JSON, paths relative to /evidence). If Person B's test_runs persistence already exists and has a function I can call without editing their code, ALSO persist through it; otherwise only write the JSON and tell me what to coordinate.
- summarize(record): returns a 3-5 line plain-language summary for console output.
- A validator that fails loudly if any referenced evidence file does not exist on disk or is empty (0 bytes).

Keep the shape compatible with whatever the PRD/Person B format requires; if they conflict, tell me instead of guessing.

Done when: typecheck passes and a small test proves the validator rejects a record pointing at a missing file.
````

## Prompt 4.3: TC1 official runner

````text
Create scripts/run-tc1.ts and an npm script "tc1".

Flow:
1. Start the fixture server programmatically on a free port (or 4000 with a clear failure if busy). Reset state.
2. Run runAudit via the public entrypoint: { url: <base>/tc1/bad, wcagLevel: "AA", auditId: "tc1-<timestamp>", checks: ["keyboard-trap"] }.
3. Run the control: same on /tc1/good (auditId "tc1-control-<timestamp>").
4. PASS only if ALL are true:
   - audit status "complete" and keyboard-trap executed;
   - exactly 1 finding on /tc1/bad with wcagRule "2.1.2 No Keyboard Trap", severity "critical";
   - its evidence shows cycleDetected=true, escapePressed=true, modalStillOpenAfterEscape=true, dismissControlsWorked=false;
   - the screenshot and .webm recording exist and are non-empty;
   - the control (/tc1/good) has 0 findings.
   INCOMPLETE if any audit is incomplete/error. FAIL otherwise, with an explanation of exactly which condition failed.
5. Use scripts/lib/testRun.ts to write the record (input, expected, actual, evidence). "expected" must state the PRD's expectation in plain language; "actual" must describe what really happened, including the tab sequence length and how Escape/buttons behaved.
6. Print the summary, exit code 0 only on PASS.
7. Always stop the server and ensure no Chromium process leaks (try/finally).

Done when: `npm run tc1` prints PASS, /evidence/test-runs/TC1.json exists, and the recording plays and visibly shows Tab cycling with Escape doing nothing (open it and confirm).
````

## Prompt 4.4: TC2 official runner

````text
Create scripts/run-tc2.ts and an npm script "tc2".

Flow:
1. Start the fixture server; POST /__state/reset so /tc2 is in the broken state.
2. Run runAudit via the public entrypoint: { url: <base>/tc2, wcagLevel: "AA", auditId: "tc2-<timestamp>", checks: ["axe", "keyboard-operability"] }.
3. PASS only if ALL are true:
   - status "complete", both checks executed;
   - axeSummary.violationCount === 0 (the page must be axe-clean, otherwise the fixture is invalid for TC2: report FAIL with that explanation);
   - exactly 1 keyboard-operability finding on #add-to-cart (wcagRule "2.1.1 Keyboard"), with screenshot and recording present and non-empty;
   - evidence shows reachableByTab=false, enterActivated=false, spaceActivated=false, and that a mouse click works.
4. Write the TestRunRecord (use scripts/lib/testRun.ts). Evidence must include axeSummary AND the finding together so the discrepancy is visible.
5. Console output must show these two lines clearly:
   "axe-core: 0 violations"
   "keyboard check: 1 failure (#add-to-cart cannot be reached or activated by keyboard)"
6. Exit 0 only on PASS; always clean up server and browsers.

Done when: `npm run tc2` prints PASS and both lines, /evidence/test-runs/TC2.json exists, evidence files open correctly.
````

## Prompt 4.5: Adversarial review (false positives and missing evidence)

````text
Act as a strict reviewer of my engine and runners. Report problems BEFORE changing code.

1. False positives (build 4 throwaway fixtures under fixtures/pages/_edge/, not committed to the official set, and run the checks on them):
   a. A modal with focus containment whose ONLY exit is Shift+Tab to a reachable close button.
   b. A modal that closes with Escape but not with buttons.
   c. A div with cursor:pointer and no click handler (decorative).
   d. An element with role="button", tabindex="0" and Enter/Space key handlers (accessible custom button).
   Expected: only genuine failures are flagged. Report expected vs actual for each.
2. False negatives: a trap where Escape works but the dialog reopens immediately; a focus trap in a non-dialog widget. State honestly whether the engine detects them and add them to LIMITATIONS if not.
3. Evidence integrity: for every finding type, confirm screenshot/recording/selector/wcagRule/auditId/checkId/fingerprint exist, the video is non-empty and has a meaningful duration, and the screenshot visibly shows the issue.
4. Pass/fail logic in run-tc1/run-tc2: can a navigation failure, a timeout, or a missing recording ever yield PASS?
5. Flakiness: any fixed sleeps, ordering assumptions, or port assumptions.

Give a prioritized list: critical / should-fix / nice-to-have, each with the minimal fix. Do not modify code until I reply "apply".
````

## Prompt 4.6: Apply fixes and regenerate records

````text
Apply the critical and should-fix items from your review (and only those). After EACH fix run `npm run typecheck && npm test && npm run tc1 && npm run tc2`; all must still pass. Remove or gitignore the throwaway _edge fixtures unless I ask to keep them as extra tests; if they are valuable, convert them into proper tests under engine/__tests__/.

Then regenerate /evidence/test-runs/TC1.json and TC2.json from a clean evidence folder, and write /evidence/test-runs/TC1_TC2_SUMMARY.md with, for each case: Input, Expected, Actual, Status, evidence file paths, and a 2-3 sentence plain-language explanation of how the finding was detected. Everything must match the JSON records exactly.

Done when: all commands pass and the summary matches the JSON.
````

## Prompt 4.7: End-to-end check with Person B's flow (read-only)

````text
Without modifying Person B's code, write scripts/verify-e2e-tc2-retest.ts that exercises the full flow through their public API (src/api/server.ts) against the fixture server:

1. POST an audit for /tc2 (broken) with all default checks; confirm findings are persisted, including the keyboard-operability finding with evidence links.
2. Approve that issue via the API.
3. Retest WHILE STILL BROKEN: confirm the issue stays OPEN (not resolved).
4. POST /__state/tc2 {"fixed": true}; retest again: confirm it resolves, that the retest result is linked to the original, and that the retest only ran the original check.
5. Reset state (POST /__state/reset) at the end.
6. Also confirm a retest that ends "incomplete" or "error" does NOT resolve the issue (simulate by pointing at an unreachable URL if the API allows it, otherwise note that this is covered by their unit tests).

Print a clear PASS/FAIL per step. Report any mismatch between what I expect and what Person B's API does, as a message I can send them. Do not change their files.

Done when: the script passes, or produces a precise list of discrepancies for Person B.
````

---

# PHASE 5: Integration, Demo, and Submission (Person A)

## Prompt 5.1: Reproducibility and flake hardening

````text
Make TC1 and TC2 reliably reproducible.

1. Create scripts/repeat.ts that runs tc1 and tc2 10 times each (fresh evidence folder each run, fresh server) and prints a table: run number, status, duration, tab-sequence length (TC1), number of findings. Report pass rate and any variance.
2. Eliminate flakiness: replace any fixed sleeps with condition waits, make video finalization robust, handle port conflicts (fail clearly or pick a free port), and kill leftover Chromium processes on failure paths.
3. Clean-start test: delete node_modules, /evidence contents, and any cache; run `npm ci && npx playwright install chromium && npm run typecheck && npm test && npm run tc1 && npm run tc2`. Fix anything that breaks.
4. Linux/Docker readiness: list the system dependencies Playwright needs (npx playwright install --with-deps chromium) and verify the video recording works headless on Linux if I have Docker available; otherwise write down what Person B must put in the Dockerfile.

Target: 10/10 for both. Report the table.
````

## Prompt 5.2: Engine freeze

````text
Prepare the engine freeze.

1. Run typecheck, the full test suite, tc1, tc2, and the e2e verify script. All must pass.
2. Remove dead code, unused exports, and debug logging. Keep one structured log line per check (checkId, status, durationMs).
3. Update engine/INTERFACE.md so it matches the final code exactly (still <= 60 lines).
4. Write engine/LIMITATIONS.md honestly: heuristic opener and control discovery, partial AAA axe coverage, keyboard trap detection only for dialog-like patterns, only keyboard checks that ran are claimed, no claim of full WCAG compliance.
5. Write a CHANGELOG entry listing what is frozen and print (do not run) the git tag command `git tag engine-freeze-v1`.
6. List the files that are frozen so I can tell Person B: after this point only critical bug fixes are allowed.

Done when: everything passes and the freeze summary is ready to send to Person B.
````

## Prompt 5.3: Submission evidence bundle

````text
Prepare the submission evidence bundle for TC1 and TC2. First check what Person B decided about the location (look for a submission/ or evidence/ convention in the repo and README); if undecided, use /submission/evidence/ and tell me.

Create scripts/package-evidence.ts that:
1. Runs tc1 and tc2 from a clean state.
2. Copies into the bundle: TC1.json, TC2.json, TC1_TC2_SUMMARY.md, the TC1 recording and screenshot, the TC2 screenshot, recording, and axe summary JSON, plus the fixtures README describing how to reproduce each failure.
3. Writes an INDEX.md in the bundle listing each file, what it proves, and the test case it belongs to.
4. Validates that every referenced file exists and is non-empty, and fails otherwise.

Do not include secrets, node_modules, or unrelated evidence runs.

Done when: running the script produces a bundle that I can zip and a judge can understand from INDEX.md alone.
````

## Prompt 5.4: Demo explainer

````text
Write docs/DETECTION_EXPLAINER.md, a plain-language speaking guide for me (Person A) to explain how each finding was detected and evidenced. Strictly accurate to the code and results; no overclaiming.

For TC1 and TC2:
- The one-sentence claim.
- The 4-6 step detection logic, in narration order.
- The evidence to show and exactly where it is (paths, dashboard location).
- A 60-second version and a 2-minute version.

Then a Q&A section with short accurate answers to likely judge questions:
- "Isn't focus containment in a modal normal?"
- "How do you know axe really found nothing?"
- "Why not just use axe for keyboard issues?"
- "How does your trap detector avoid false positives?" (mention the good-modal control)
- "What happens if the page fails to load or a check crashes?" (explicit error/incomplete, never a silent pass)
- "How does retest work and when is an issue closed?"
- "What are the limits of this approach?" (pull from LIMITATIONS.md)
````

## Prompt 5.5: Final rehearsal checklist

````text
Create docs/DEMO_CHECKLIST_PERSON_A.md (under 50 lines): a numbered tick-box checklist for a clean-start rehearsal.

1. Fresh clone, npm ci, Playwright browser install.
2. Start the app and fixtures; check /health; TC2 default state is broken.
3. Run TC1; open the recording and confirm Tab cycles and Escape does nothing.
4. Run TC2; confirm "axe-core: 0 violations" and the keyboard failure appear together.
5. Hand-off to Person B for approval, persistence, TC3, and TC4: flip TC2 with POST /__state/tc2 {"fixed": true}, retest with checks ["keyboard-operability"].
6. Confirm a retest while still broken keeps the issue OPEN; it resolves only after the fix.
7. Reset state (POST /__state/reset).
8. If something breaks live: where the pre-recorded evidence and the evidence bundle are, and which files to show.
9. Final sign-off: freeze tag exists, README matches reality, deployed agent works (Person B confirms), submission portal deadline confirmed separately.
````

---

## Notes

- Run 3.A to 3.H first. They close every PARTIAL/FAIL item in Progress Report 03 and make Person B's integration "READY" rather than "READY WITH CAVEATS".
- Prompts 3.A, 3.D, and 3.E touch places where Person B's code depends on yours (input validation behavior, fingerprints, import paths). Those prompts tell the IDE to list changes for Person B instead of editing their files. Send them that list.
- Confirm the portal deadline separately, since the blueprint doesn't give one.
