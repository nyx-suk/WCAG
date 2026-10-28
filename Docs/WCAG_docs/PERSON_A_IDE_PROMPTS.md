# Person A: IDE Prompt Pack
WCAG Accessibility Auditor, Ziro.Digital Agentic AI Hackathon 2026

How to use: paste **Prompt 0** once at the start of each IDE session (or save it as a rules file such as `.cursorrules` / `CLAUDE.md`). Then paste the phase prompts in order. Each prompt ends with a "Done when" checklist, so you can verify before moving on. Do not skip ahead: later prompts assume earlier files exist.

---

## Prompt 0: Project context (paste first, every session)

````text
You are helping me (Person A) build the audit engine for a "WCAG Accessibility Auditor" for a hackathon.

STACK: Node.js, TypeScript (strict), Playwright with Chromium, @axe-core/playwright, Express (fixture server only for my part). Person B owns SQLite persistence, approval/review flow, retest flow, TC3 contrast, README, deployment. I own fixtures for TC1/TC2, axe checks, keyboard checks, the runAudit runner, and running TC1/TC2.

MY FOLDERS (do not touch Person B's): 
- /fixtures      (TC1, TC2 pages + a small fixture server)
- /engine        (axe, keyboard, evidence, runAudit)
- /scripts       (TC1/TC2 runners)
- /evidence      (screenshots, videos, JSON results; gitignored except .gitkeep)

NON-NEGOTIABLE RULES:
1. A failed navigation, timeout, or crashed check must NEVER look like a pass or an empty findings list. Always surface an explicit error/incomplete status.
2. Focus containment inside an open modal is EXPECTED and is not a failure. A genuine keyboard trap means the user cannot leave by keyboard (Escape does not dismiss, no focusable control can dismiss it).
3. TC2's fixture must be genuinely axe-clean (0 violations) while still having a real keyboard failure (a non-interactive <div> styled as a button).
4. Every finding must carry evidence and be traceable to an audit run (auditId) and a check (checkId).
5. Deterministic behavior: no random waits. Use explicit waits on conditions, fixed viewport (1280x720), fixed fixture port (4000).
6. Never claim full WCAG compliance; findings only reflect the checks that ran.
7. Keep code small, typed, and commented where logic is subtle. No unused abstractions.

SHARED CONTRACT (agreed with Person B, extended from the original proposal):

type Severity = "critical" | "serious" | "moderate" | "minor";
type CheckId = "axe" | "keyboard-trap" | "keyboard-operability" | "contrast";

type AuditInput = {
  url: string;
  wcagLevel: "A" | "AA" | "AAA";
  auditId: string;
  checks?: CheckId[]; // if provided, run only these (used by retests)
};

type AuditFinding = {
  title: string;
  description: string;
  wcagRule: string;        // e.g. "2.1.2 No Keyboard Trap"
  severity: Severity;
  source: CheckId;
  checkId: CheckId;
  fingerprint: string;     // stable hash of checkId + url + element selector, for dedupe/retest matching
  selector?: string;
  screenshot?: string;     // path relative to /evidence
  recording?: string;      // path relative to /evidence
  evidence: unknown;       // shape depends on source; see engine/types.ts
};

type CheckStatus = "executed" | "failed" | "skipped";
type AuditResult = {
  auditId: string;
  url: string;
  status: "complete" | "incomplete" | "error";
  findings: AuditFinding[];
  checksPlanned: CheckId[];
  checksExecuted: { checkId: CheckId; status: CheckStatus; error?: string }[];
  axeSummary?: { violationCount: number; passesCount: number; incompleteCount: number };
  startedAt: string;
  completedAt: string;
};

function runAudit(input: AuditInput): Promise<AuditResult>;

Acknowledge you understand, then wait for the phase prompts. Do not generate code yet.
````

---

# PHASE 1: Project Setup and Testbed (Person A)

## Prompt 1.1: Shared types and engine scaffolding

````text
Create the engine scaffolding and shared types.

1. Create /engine/types.ts containing the exact contract from my project context (Severity, CheckId, AuditInput, AuditFinding, CheckStatus, AuditResult). Also define typed evidence shapes (discriminated by source):
   - AxeEvidence: { ruleId, impact, helpUrl, nodes: { html, target, failureSummary }[] }
   - KeyboardTrapEvidence: { opener: string, tabSequence: string[] (selector/description of active element per Tab press), cycleDetected: boolean, cycleLength?: number, escapePressed: boolean, modalStillOpenAfterEscape: boolean, dismissControlsFound: number, dismissControlsWorked: boolean }
   - KeyboardOperabilityEvidence: { selector, html, cursorPointer: boolean, hasClickHandler: boolean, reachableByTab: boolean, tabsPressed: number, enterActivated: boolean, spaceActivated: boolean }
   - ContrastEvidence: unknown placeholder (Person B owns this)
2. Create /engine/fingerprint.ts exporting makeFingerprint(checkId, url, selector?): string using a SHA-256 hash (node:crypto) of normalized inputs (strip hash fragment, sort nothing else), return the first 16 hex chars.
3. Create /engine/errors.ts with typed errors: NavigationError, CheckTimeoutError, CheckFailedError, each carrying checkId and cause.
4. Set up tsconfig (strict, ESM or CJS consistent with the repo), and add npm scripts if missing: "fixtures": start fixture server, "build", "typecheck".
5. Do not add features beyond this.

Done when: `npm run typecheck` passes and makeFingerprint is deterministic (same inputs -> same output, different selector -> different output). Add a tiny unit test for that using the repo's test runner (or node:test if none).
````

## Prompt 1.2: Fixture server with state toggle

````text
Create the fixture server in /fixtures/server.ts (Express, port 4000, configurable via FIXTURE_PORT).

Requirements:
- Routes: GET /tc1/bad, GET /tc1/good, GET /tc2. Each serves a static HTML file from /fixtures/pages.
- The TC2 page must support a broken/fixed state at the SAME URL (/tc2). Keep state in memory on the server. Add:
  - POST /__state/tc2  body {"fixed": true|false} -> sets state
  - GET  /__state/tc2  -> returns current state
  - Default state is broken (fixed=false).
  Reason: TC4 must retest the same page URL after a fix, so I will flip the state instead of using a different URL.
- Add a POST /__state/reset that resets all state to broken.
- Serve with no caching (Cache-Control: no-store) so retests never see stale HTML.
- Add GET /health returning 200 "ok".
- Export a startFixtureServer(port?) function (returns the http.Server) and stopFixtureServer, so test scripts can start and stop it programmatically. Also make the file runnable directly via `npm run fixtures`.

Done when: `npm run fixtures` starts the server, /health returns ok, and toggling /__state/tc2 changes what /tc2 serves (it can be a placeholder page for now).
````

## Prompt 1.3: TC1 fixtures (bad modal and good modal)

````text
Create two HTML fixtures in /fixtures/pages: tc1-bad.html and tc1-good.html. Plain HTML/CSS/JS, no frameworks, accessible-looking and realistic (a "Subscribe to newsletter" modal).

Both pages:
- A main page with a heading, some text, and a button "Open newsletter signup" that opens a modal via click, Enter, or Space.
- The modal has: a heading, an email input, a "Subscribe" button, a "Maybe later" button.
- Focus moves into the modal (first focusable) when it opens.
- Focus is contained inside the modal while open (Tab and Shift+Tab wrap around).
- Page language and title set, proper labels, so the page is otherwise clean.

tc1-bad.html (GENUINE keyboard trap):
- Escape does NOT close the modal.
- "Maybe later" and "Subscribe" do nothing that dismisses the modal when activated by keyboard (for example, they only run a handler on mouse click events, not keyboard activation. Make this realistic and comment it in the HTML so I can explain it: e.g. handlers bound to `mousedown`).
- There is no other focusable control that can dismiss the modal.
- Result: with only a keyboard, the user can never leave. Mouse users can still close it by clicking the dark backdrop (this makes it a realistic keyboard-only failure).

tc1-good.html (CONTROL: correct focus containment, NOT a failure):
- Same focus containment.
- Escape closes the modal and returns focus to the opener button.
- "Maybe later" closes the modal via keyboard activation too.

Add a visible short note at the bottom of each page? NO. Keep pages clean; document intent only in HTML comments.

Wire these to /tc1/bad and /tc1/good in the fixture server if not already.

Done when: I can manually open each page, and in the bad one I cannot exit with the keyboard, while in the good one Escape works.
````

## Prompt 1.4: TC2 fixture (axe-clean page with fake button)

````text
Create /fixtures/pages/tc2-broken.html and /fixtures/pages/tc2-fixed.html, and make GET /tc2 serve one or the other based on the in-memory state flag (fixed=false -> broken, fixed=true -> fixed). The URL must stay /tc2.

Both pages must be fully axe-clean (zero violations with axe-core default rules at wcag2a, wcag2aa, wcag21a, wcag21aa tags):
- <html lang="en">, a <title>, one <h1>, landmarks (<header>, <main>, <footer>), sufficient color contrast on all text, labelled form fields if any, no duplicate ids, no empty links/buttons.

tc2-broken.html:
- Contains a "Add to cart" control implemented as <div class="btn" id="add-to-cart">Add to cart</div> styled to look like a button (padding, background, border-radius, cursor: pointer).
- A JS click handler (addEventListener('click')) on it that updates a visible status message ("Added to cart!") with aria-live NOT used in a way that triggers axe issues.
- It has NO tabindex, NO role, NO key handlers. So it cannot be reached by Tab and cannot be activated by Enter/Space.
- Careful: adding role="button" without tabindex WOULD trigger axe issues, so do not add roles.
- Include a few other legit controls (a real <a> link and a real <button>) so the Tab sequence is meaningful.

tc2-fixed.html:
- Identical layout and ids, but "Add to cart" is a real <button id="add-to-cart" class="btn">, keyboard operable, same status message behavior.

Add a short script /scripts/verify-tc2-axe-clean.ts that launches Playwright, loads /tc2 in both states, runs @axe-core/playwright with those tags, and prints violation counts. It must exit non-zero if either state has any violation.

Done when: the verify script prints 0 violations for both states.
````

## Prompt 1.5: Playwright harness and video helper

````text
Create /engine/browser.ts, a Playwright harness used by all checks.

Requirements:
1. launchBrowser(): launches Chromium headless (allow HEADLESS=false env override for debugging).
2. newAuditContext({ record?: { dir: string } }): creates a BrowserContext with viewport 1280x720, and if record is provided, enables recordVideo with that dir and size 1280x720.
3. navigate(page, url, { timeoutMs = 15000 }): goes to url with waitUntil "load", checks response status < 400, and throws NavigationError on failure/timeout/non-2xx. Never swallow errors.
4. A helper finalizeVideo(page, context): closes the page and context (Playwright only finalizes the video file on close), then returns the final video path from page.video().path(). Rename it to a deterministic name like `{auditId}-{checkId}.webm` under /evidence/recordings.
5. A helper saveScreenshot(page, name, opts?): saves a PNG under /evidence/screenshots and returns the path RELATIVE to /evidence.
6. Create /evidence/screenshots and /evidence/recordings dirs if missing (add .gitkeep, and gitignore the contents).
7. Add a withTimeout(promise, ms, checkId) utility that rejects with CheckTimeoutError.

Important design note to include as a comment: keyboard checks that need video must run in their OWN browser context (video is per-context), separate from the axe context.

Done when: a small script can open /tc1/bad, press Tab 3 times, finalize the video, and a .webm file exists and plays.
````

## Prompt 1.6: Fixture reproduction doc

````text
Write /fixtures/README.md documenting, for TC1 (bad + good control) and TC2 (broken + fixed):
- How to start the server and the URLs.
- Exactly how each fixture reproduces the expected accessibility failure (or correct behavior for the controls), with the specific HTML/JS lines responsible.
- How to flip TC2 state with curl.
- The expected auditor outcome for each page (finding or no finding, which WCAG rule: 2.1.2 No Keyboard Trap for TC1-bad; 2.1.1 Keyboard and 4.1.2 Name, Role, Value for TC2-broken).
Keep it under 80 lines and accurate to the code as written.
````

---

# PHASE 2: Build the Audit Capabilities (Person A)

## Prompt 2.1: axe-core check

````text
Create /engine/checks/axe.ts exporting:

runAxeCheck(page: Page, input: { wcagLevel, url, auditId }): Promise<{ findings: AuditFinding[]; summary: { violationCount, passesCount, incompleteCount } }>

Requirements:
- Use @axe-core/playwright AxeBuilder.
- Map wcagLevel to axe tags: A -> ["wcag2a","wcag21a"], AA -> ["wcag2a","wcag2aa","wcag21a","wcag21aa","wcag22aa"], AAA -> AA tags + ["wcag2aaa"] (add a comment that axe covers AAA only partially).
- One AuditFinding per violation (per rule), with the offending nodes in AxeEvidence (html, target selector, failureSummary).
- wcagRule: derive a readable reference from the rule's tags where possible (e.g. wcag143 -> "1.4.3"); fall back to the axe rule id.
- severity: map axe impact (critical/serious/moderate/minor) directly.
- checkId and source both "axe". fingerprint via makeFingerprint("axe", url, ruleId + first node selector).
- IMPORTANT: always return the summary even when there are zero violations (TC2 needs to show "axe: 0 violations").
- Wrap in withTimeout (30s) and convert errors to CheckFailedError.

Add /scripts/dev-axe.ts to run it against a URL and print the result for quick manual testing.

Done when: running it against /tc2 returns 0 findings and summary.violationCount === 0 in both states.
````

## Prompt 2.2: Keyboard trap detector (TC1)

````text
Create /engine/checks/keyboardTrap.ts exporting:

runKeyboardTrapCheck(ctx: { url, auditId, browser }): Promise<AuditFinding[]>

It must create its OWN browser context with video recording (use newAuditContext + finalizeVideo from engine/browser.ts).

ALGORITHM (implement exactly, and comment each step):
1. Navigate to url.
2. Discover openers: visible, focusable elements that are likely to open a dialog: elements with aria-haspopup="dialog", aria-controls pointing at a dialog, or text/attributes matching /open|modal|dialog|signup|subscribe|menu/i. Cap at 5 candidates. If none are found, return no findings (and let the caller record this check as executed-with-nothing-to-test).
3. For each opener: focus it, press Enter (keyboard-open, never mouse). Wait up to 1s for a dialog to appear: [role=dialog], [aria-modal=true], <dialog open>, or a newly visible element whose DOM position suggests an overlay (position fixed + high z-index). If none appears, continue to next opener.
4. Record the focus path: press Tab up to (numberOfFocusableDescendants + 3) times, minimum 6, recording a short descriptor of document.activeElement after each press (tag, id, text snippet, selector). Also run the same with Shift+Tab for 3 presses.
5. Detect containment vs escape: if focus ever leaves the dialog subtree, this is not a trap (and not a failure). Record and move on.
6. If focus stayed inside and the sequence repeats (cycle), then test EXIT ABILITY:
   a. Press Escape. Check if the dialog is still visible and focus is still inside.
   b. For each focusable control inside the dialog, focus it and activate it with Enter, then (if dialog still open) with Space. After each activation check whether the dialog closed. (Re-open the dialog if it closes, so you can continue testing, but stop as soon as ANY keyboard path exits.)
7. VERDICT: It is a GENUINE TRAP only if ALL are true: focus stayed contained, Escape did not dismiss, and no control could dismiss via Enter/Space. If any keyboard path exits, return NO finding (this is correct modal behavior).
8. On a genuine trap, produce a finding: title "Keyboard trap in modal dialog", wcagRule "2.1.2 No Keyboard Trap", severity "critical", source/checkId "keyboard-trap", screenshot of the trapped state, recording path (finalized video), and KeyboardTrapEvidence (full tabSequence, cycle details, escape result, controls tried).
9. Always finalize the video, even on errors (try/finally), and return the recording path only on a finding. Delete the video if there is no finding, to avoid evidence clutter.

Also write /scripts/dev-keyboard-trap.ts that runs this on /tc1/bad and /tc1/good and prints findings.

Done when: /tc1/bad returns exactly 1 critical finding with a playable recording and a tab sequence showing the cycle; /tc1/good returns 0 findings.
````

## Prompt 2.3: Keyboard operability detector (TC2)

````text
Create /engine/checks/keyboardOperability.ts exporting:

runKeyboardOperabilityCheck(ctx: { url, auditId, browser }): Promise<AuditFinding[]>

Purpose: find controls that look/behave like buttons for mouse users but are not operable by keyboard (WCAG 2.1.1 Keyboard, 4.1.2 Name Role Value), even when axe reports nothing.

ALGORITHM:
1. Own browser context with video recording (reuse the harness). Navigate.
2. Find CANDIDATES: visible elements that are NOT natively interactive (not a, button, input, select, textarea, summary, [contenteditable]) and NOT tabbable, but show interactivity signals:
   - computed style cursor: pointer, OR
   - a click event listener (use a CDP session: DOMDebugger.getEventListeners on the node via Runtime.evaluate objectId; handle failures gracefully), OR
   - an onclick attribute.
   Exclude elements that are descendants of an already-interactive element. Cap at 20 candidates.
3. For each candidate, confirm the failure BEHAVIORALLY:
   a. Press Tab from the top of the page enough times to cover all tabbable elements (count them first, plus 2), recording the active element each time. Check whether the candidate ever receives focus (reachableByTab).
   b. Programmatically verify activation by keyboard is impossible: since it can't take focus, dispatch real key presses (Enter, Space) with the candidate NOT focused is meaningless, so instead attach a one-time instrumentation (page.evaluate adding a click-counter listener before the test) and confirm that no activation occurs from Enter/Space presses at the point where focus would be. Record enterActivated/spaceActivated = false.
   c. Also confirm it DOES work with a mouse click (page.click) to prove it is a real control (hasClickHandler behaviour). This is what separates a true failure from a decorative div.
4. A candidate is a finding only if: it responds to mouse click AND is not reachable by Tab AND not activatable by keyboard.
5. Finding: title "Custom control is not keyboard operable", wcagRule "2.1.1 Keyboard", severity "serious", source/checkId "keyboard-operability", selector, screenshot with the element highlighted (inject a temporary outline before screenshot, remove after), recording of the Tab walk, and KeyboardOperabilityEvidence.
6. If there are no candidates, return [] (executed, nothing found). Delete the recording when there is no finding.

Also write /scripts/dev-keyboard-operability.ts.

Done when: /tc2 (broken) yields 1 finding on #add-to-cart; /tc2 (fixed) yields 0 findings; and axe still reports 0 violations on the broken page.
````

## Prompt 2.4: Evidence module and finding review aid

````text
Create /engine/evidence.ts that centralizes evidence handling:

1. buildEvidenceDir(auditId): ensures /evidence/{auditId}/ exists and returns paths.
2. Update saveScreenshot and finalizeVideo so files go under /evidence/{auditId}/ and the returned path is RELATIVE to /evidence (e.g. "abc123/keyboard-trap.png").
3. highlightElement(page, selector): adds a temporary visible outline for screenshots and returns a cleanup function.
4. writeEvidenceJson(auditId, name, data): writes a JSON file next to the screenshots for the raw detection details; returns the relative path.
5. A function describeFinding(finding: AuditFinding): string that renders a human-readable, plain-language explanation (what happened, why it matters to a keyboard user, which evidence file to open). Person B will show this in the review UI, so keep it free of jargon and under 6 lines.

Then audit my existing checks and refactor them to use these helpers consistently, with no behavior change.

Done when: after running TC1 and TC2 dev scripts, evidence is grouped under /evidence/{auditId}/ and every finding's screenshot/recording path resolves to an existing file.
````

---

# PHASE 3: Assemble the Auditor (Person A)

## Prompt 3.1: runAudit orchestrator

````text
Create /engine/runAudit.ts implementing:

export async function runAudit(input: AuditInput): Promise<AuditResult>

Behavior:
1. Validate input: url must be http(s), wcagLevel in A|AA|AAA, auditId non-empty. Throw a clear error otherwise.
2. checksPlanned = input.checks ?? ["axe", "keyboard-trap", "keyboard-operability", "contrast"]. (Contrast is implemented by Person B; import it behind a try/catch dynamic import: if the module does not exist yet, record contrast as "skipped" with error "contrast module not available". Define the expected signature in a comment: runContrastCheck(page: Page, input: AuditInput): Promise<AuditFinding[]>.)
3. Run checks SEQUENTIALLY (axe and contrast on a shared page in one context; keyboard checks each in their own context for video). Each check is wrapped in try/catch + withTimeout. Record per-check status in checksExecuted: "executed" | "failed" (with error message) | "skipped".
4. Never let one failed check abort the others. But if the initial navigation fails, return status "error" with no findings and the NavigationError message, NOT an empty "complete" result.
5. status: "complete" if every planned check executed; "incomplete" if any check failed or was skipped; "error" if navigation failed or nothing could run.
6. Include axeSummary whenever axe ran (even with 0 violations).
7. Deduplicate findings by fingerprint within a run.
8. Set startedAt / completedAt ISO timestamps.
9. Always close browsers in finally blocks. No leaked Chromium processes.

Keep the module free of any database code, since Person B persists the result.

Done when: runAudit on /tc1/bad returns a keyboard-trap finding; on /tc2 (broken) returns a keyboard-operability finding AND axeSummary.violationCount === 0; on http://localhost:4000/does-not-exist returns status "error".
````

## Prompt 3.2: Failure handling and robustness tests

````text
Write tests (use the repo's runner, or node:test + tsx if none) in /engine/__tests__/runAudit.test.ts covering:

1. Unreachable host -> status "error", zero findings, error message present (not "complete").
2. HTTP 404 page -> status "error".
3. A check that throws (simulate by injecting a failing check via an optional dependency-injection parameter or a test-only env flag) -> that check's status "failed", other checks still run, overall status "incomplete".
4. Same input run twice -> same fingerprints for the same findings (dedupe/retest stability).
5. `checks: ["keyboard-trap"]` only runs that check and checksPlanned reflects it.
6. Invalid wcagLevel -> throws a validation error.

Start the fixture server programmatically in the test setup (startFixtureServer) and stop it in teardown. Keep each test under 60s total.

Done when: all tests pass locally.
````

## Prompt 3.3: Agreement with Person B (retest-ready output)

````text
Add /engine/index.ts as the ONLY public entrypoint, exporting runAudit and all types from /engine/types.ts. Then write /engine/INTERFACE.md (max 60 lines) for Person B documenting:

- The exact AuditInput/AuditResult/AuditFinding shapes.
- How fingerprints work and how to use them to match an original finding to a retest result (same checkId + url + selector => same fingerprint). Explain the retest rule: an issue passes the retest only if runAudit(input with checks=[original.checkId]) returns status "complete", the check executed successfully, AND no finding with the same fingerprint appears. If status is "incomplete" or "error", the retest is NOT a pass.
- Where evidence files live (/evidence/{auditId}/...), and that paths are relative to /evidence.
- Which severity values exist.
- How to flip the TC2 fixture to fixed (POST /__state/tc2).
- Known limitations (AAA coverage partial; keyboard checks only test candidates discovered heuristically).

Done when: Person B can call runAudit and implement retests using only this document.
````

---

# PHASE 4: Run the Official Test Cases (Person A)

## Prompt 4.1: TC1 runner script

````text
Create /scripts/run-tc1.ts that executes official test case TC1 end to end and writes a result record.

Steps:
1. Start the fixture server programmatically.
2. Run runAudit({ url: "http://localhost:4000/tc1/bad", wcagLevel: "AA", auditId: "tc1-<timestamp>", checks: ["keyboard-trap"] }).
3. Also run the same against /tc1/good as a control.
4. Evaluate:
   - PASS if /tc1/bad produced exactly one keyboard-trap finding with a recording file that exists on disk and evidence showing cycleDetected=true, modalStillOpenAfterEscape=true, dismissControlsWorked=false; AND /tc1/good produced zero findings.
   - FAIL otherwise, with an explanation of the discrepancy.
5. Write /evidence/test-runs/TC1.json with this shape:
   { testCase: "TC1", input: {...}, expected: "Auditor identifies a genuine keyboard trap and logs a finding with a browser recording; correct modal containment is not flagged", actual: "<plain-language summary of what really happened>", status: "PASS"|"FAIL"|"INCOMPLETE", explanation: "<only if actual differs from expected>", evidence: { recording, screenshot, tabSequence, controlResult: {...} }, ranAt }
6. Print a short readable summary to the console. Exit non-zero if not PASS.
7. Add npm script "tc1".

Make "INCOMPLETE" a distinct outcome when the audit status is "incomplete" or "error".

Done when: `npm run tc1` prints PASS and the JSON, screenshot and recording exist.
````

## Prompt 4.2: TC2 runner script

````text
Create /scripts/run-tc2.ts that executes official test case TC2 end to end.

Steps:
1. Start the fixture server and reset state (POST /__state/reset so TC2 is broken).
2. Run runAudit({ url: "http://localhost:4000/tc2", wcagLevel: "AA", auditId: "tc2-<timestamp>" , checks: ["axe", "keyboard-operability"] }).
3. Evaluate:
   - PASS only if axeSummary.violationCount === 0 AND there is exactly one keyboard-operability finding for #add-to-cart (with screenshot and recording on disk).
   - FAIL if axe is not clean (the fixture is invalid for TC2), or if the keyboard failure is not reported.
   - INCOMPLETE if the audit is incomplete/error.
4. Write /evidence/test-runs/TC2.json with: testCase, input, expected ("axe-core reports zero violations; auditor still reports the keyboard failure"), actual, status, explanation if different, evidence { axeSummary, finding, screenshot, recording, tabWalk }, ranAt.
5. Console output must show the discrepancy clearly, in two lines: "axe-core: 0 violations" and "keyboard check: 1 failure (#add-to-cart cannot be reached or activated by keyboard)".
6. Add npm script "tc2".

Done when: `npm run tc2` prints PASS with both lines and the evidence files exist.
````

## Prompt 4.3: Review for false positives and missing evidence

````text
Review my engine and test runs against these rules and report problems BEFORE changing code:

1. False positives: does the keyboard trap check ever flag a modal where Escape or a button dismisses it? Does the operability check flag decorative divs that have no click behavior? Try to construct 3 edge-case fixtures (good modal with focus trap + close button only reachable by Shift+Tab; a div with cursor:pointer but no handler; an element with role="button" and tabindex="0" and key handlers) and run them mentally or via quick scripts. Report expected vs actual.
2. Missing evidence: for each finding type, is there a screenshot, a recording where required, selector, WCAG rule, auditId, checkId, and fingerprint?
3. Wrong pass/fail logic in tc1/tc2 runners: could a failed navigation or timeout produce PASS?
4. Flakiness: any fixed sleeps or timing assumptions?

Give me a prioritized list of fixes (critical / should-fix / nice-to-have). Do not modify code until I say "apply".
````

## Prompt 4.4: Apply fixes and write the test-case record

````text
Apply the critical and should-fix items from your review. After each fix, rerun `npm run tc1` and `npm run tc2` and confirm both still PASS. Then generate /evidence/test-runs/TC1_TC2_SUMMARY.md containing, for each of TC1 and TC2: Input, Expected result, Actual result, Status, Evidence file paths, and a 2-3 sentence plain-language explanation of how it was detected. Keep claims strictly consistent with the JSON records.
````

---

# PHASE 5: Integration, Demo, and Submission (Person A)

## Prompt 5.1: Reproducibility and flake hardening

````text
Make TC1 and TC2 reliably reproducible:

1. Run `npm run tc1` and `npm run tc2` 10 times each in a loop script (/scripts/repeat.ts) and report pass rate and any variance in tab sequences or timing.
2. Find and eliminate any flakiness: replace fixed delays with condition waits, make video finalization robust, make sure port 4000 conflicts and leftover Chromium processes are handled (fail clearly or pick a free port).
3. Ensure a clean-start run works: delete /evidence contents and node_modules/.cache, run `npm ci && npx playwright install chromium && npm run tc1 && npm run tc2` from scratch and fix anything that breaks.
4. Confirm that the tests also work in the Docker/Linux environment: list system dependencies Playwright needs (e.g. `npx playwright install --with-deps chromium`) and note them for Person B's Dockerfile.

Target: 10/10 passes for both. Report results as a small table.
````

## Prompt 5.2: Engine freeze

````text
Prepare the engine freeze:

1. Run typecheck, the full test suite, tc1, and tc2. All must pass.
2. Remove dead code, unused exports, and debug logging. Keep one structured log line per check (checkId, status, duration).
3. Update /engine/INTERFACE.md to match the final code exactly.
4. Create a git tag `engine-freeze-v1` (print the command; do not run it) and write a CHANGELOG entry listing what is frozen.
5. List any known limitations honestly (heuristic opener discovery, AAA partial coverage, etc.) in /engine/LIMITATIONS.md.

After this point, only critical bug fixes are allowed. Do not add features.
````

## Prompt 5.3: Explanation script for the demo

````text
Write /docs/DETECTION_EXPLAINER.md, a speaking guide for me (Person A) to explain how each finding was detected and evidenced during the demo. Use plain language.

For each of TC1 and TC2 include:
- The one-sentence claim ("The auditor found X because Y").
- The 4-6 step detection logic, in the order I would narrate it.
- What evidence to show on screen and where it is (file paths / dashboard location).
- The likely judge questions and short, accurate answers, for example: "Isn't focus containment in a modal normal?" "How do you know axe really found nothing?" "Why not just use axe for keyboard issues?" "What happens if the page fails to load?" "What are the limits of this approach?"
- A 60-second version and a 2-minute version of the narration.

Be strictly accurate to the code and results. Do not overclaim (no "full WCAG compliance").
````

## Prompt 5.4: Final demo rehearsal checklist

````text
Create /docs/DEMO_CHECKLIST_PERSON_A.md with a numbered, tick-box checklist for a clean-start rehearsal:

1. Fresh clone, install, Playwright browser install.
2. Start fixtures; verify /health and TC2 default state is broken.
3. Run TC1; open the recording and confirm the trap is visible (Tab cycles, Escape does nothing).
4. Run TC2; confirm "axe: 0 violations" and the keyboard failure are shown together.
5. Hand-off point to Person B for approval, persistence, TC3, TC4 (flip TC2 to fixed via POST /__state/tc2, then Person B triggers the retest using checks=["keyboard-operability"]).
6. Confirm retest passes only when status is "complete" and the fingerprint is absent, and that a deliberately failing retest (state still broken) keeps the issue OPEN.
7. Reset state (POST /__state/reset) so the demo can be repeated.
8. A "if something breaks live" fallback list: where the pre-recorded evidence is, and which files to show.

Keep it under 50 lines.
````

---

## Tips for using these in your IDE

- Run Prompt 0 first, every new session. Paste it as a rules file if your IDE supports one.
- Commit after each prompt, so you can roll back a bad generation.
- If the IDE assistant drifts from the contract, re-paste the "SHARED CONTRACT" block.
- Agree the contract with Person B before Phase 3 starts. Prompt 3.3's `INTERFACE.md` is what you hand them.
- Confirm the real submission deadline with your team, since the blueprint doesn't state it.
