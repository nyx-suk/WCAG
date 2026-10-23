# Phase 5 IDE Prompt Pack (Person A + Person B combined)
Integration, Demo, and Submission. Based on Progress Report 04 and the PRD (§7 FR-06/07/08, §9, §13, §15, §16).

These prompts replace the Phase 5 prompts from the earlier packs. Run them in order. Commit after each one. Each ends with a "Done when" check.

---

## Prompt R: Context refresh (paste first)

````text
Context refresh. I now own BOTH Person A and Person B responsibilities on the "WCAG Accessibility Auditor" hackathon project. Phases 1-4 are complete.

Current state (from my progress report):
- Engine: engine/ (runAudit, checks, evidence, index.ts, INTERFACE.md), 44/44 tests passing, typecheck clean.
- Backend: src/server.ts (standalone entrypoint), src/api/server.ts with POST /api/audits, POST /api/issues/:id/approve|reject, POST /api/issues/:id/retest; SQLite via sql.js (data/auditor.sqlite); audit store in src/persistence/sqlite.ts.
- Fixtures: fixtures/server.ts (TC1 bad/good, TC2 broken/fixed, TC3, TC4; state endpoints GET/POST /__state/tc2, /__state/tc4, POST /__state/reset).
- Official runners: scripts/run-tc1.ts, run-tc2.ts, verify-tc3-contrast.ts, verify-tc4-retest.ts, verify-e2e-tc2-retest.ts. recordOfficialTestRun() writes SQLite test_runs, /evidence/test-runs/<TC>.json, /evidence/<auditId>/official-report.json, and test-runs.json (repo root and /evidence/).
- Branch: feature/keyboard-audit. Phase 4 deliverables are not yet all committed.

PRD requirements that still matter (WCAG_Accessibility_Auditor_PRD.md):
- A DEPLOYED, working agent that accepts a URL and WCAG level and can be demonstrated from a clean start.
- A DASHBOARD with: audit input form, proposed-findings review with approve/reject, issue viewer (title, description, WCAG rule, severity, detection source, status, evidence preview, associated audit run), retest trigger and retest view (FR-06, FR-07, FR-08, TC4 step 3 says "trigger a retest from the issue dashboard").
- Evidence viewable from the dashboard. Test results clearly distinguish pass, fail, and incomplete.
- Deliverables: deployed agent, source evidence, presentation, TC1-TC4 inputs/results/evidence.

RULES:
1. Do not break the 44 existing tests; run `npm run typecheck && npm test` after every change.
2. Never let a failed or incomplete audit/retest look like a pass or resolve an issue.
3. Keep changes minimal and typed; no features beyond each prompt.
4. Never claim full WCAG compliance.

Acknowledge briefly, then wait for the next prompt. Do not generate code yet.
````

---

## Prompt 5.1: Commit hygiene and baseline

````text
1. Run `git status` and list uncommitted files. Group them into logical commits (TC2 runner + shared storage helper; E2E verification; reports/docs). Check .gitignore: evidence artifacts (videos, screenshots, data/auditor.sqlite) should not bloat the repo, BUT the official judge-facing evidence (test-runs.json and the TC1-TC4 evidence referenced by it) must be reproducible by script. Tell me what you recommend committing vs ignoring and why; do not delete anything.
2. Run `npm ci`, `npm run typecheck`, `npm test`, and each official runner script (tc1, tc2, tc3, tc4, e2e). Report a PASS/FAIL table.
3. Create the commits (one per group, clear messages) and print the push command without running it.

Done when: working tree is clean, all checks pass, and I have the push command.
````

---

## Prompt 5.2: Fix the TC4 status semantics

````text
Review how TC4 is recorded in test_runs and test-runs.json. Currently "TC4 (Initial)" is stored with status "fail" even though its expected outcome ("initial audit identifies the keyboard failure and logs a pending issue") was met.

Read PRD §8 TC4 (and §10.4) and decide the correct representation, then fix it. My requirement:
- A test run's status must describe whether the AUDITOR behaved as the PRD expects, not whether the fixture page is broken. Detecting the failure on the broken page = the auditor passed this stage.
- The record's `explanation` must still say clearly that the page had a real accessibility failure at this stage.
- Retest while still broken: the issue stays OPEN (auditor passes by NOT resolving it).
- Incomplete retest: issue not resolved, status "incomplete" for that run.
- Preserve the initial result, retest result, and status transition history (PRD §6).

Options: (a) one TC4 record with two stages (initial + retest) and a single verdict, or (b) keep two records but both with correct verdicts and a shared case id. Pick the one that keeps the PRD §10.4 fields intact and is easiest for a judge to read; explain the choice in one paragraph first.

Update recordOfficialTestRun callers, the aggregator, the existing tests, and regenerate test-runs.json. Do not change engine detection logic.

Done when: test-runs.json shows no case where a correct auditor behavior is labelled "fail", every record has the §10.4 fields, tests pass, and `npm run tc4` still resolves the issue only after the fix.
````

---

## Prompt 5.3: Gap check against the PRD (read-only)

````text
Do a READ-ONLY gap check of the repo against PRD §7 (FR-01 to FR-09), §9 and §13 (MVP acceptance criteria). For each item output: MET / PARTIAL / MISSING, with the file or endpoint that proves it.

Pay special attention to:
- FR-01 audit input form (URL + WCAG level) in a UI, not just the API.
- FR-06 proposed findings shown BEFORE logging, approve/reject, no duplicates on retried audit/approval actions.
- FR-07 issue dashboard with every field listed in the PRD and an evidence preview (screenshot image, playable .webm).
- FR-08 retest from the dashboard, before/after results, status transition history.
- §9.1 four-step agent workflow (collect, plan, find, act): where is each step visible to the user?
- §13: "deployed application accepts a URL and WCAG level."
- Is there ANY frontend in the repo right now? Is evidence served over HTTP?

Output a prioritized list of what is missing, with a one-line suggested fix each. Do not modify code.
````

---

## Prompt 5.4: Dashboard (largest remaining gap, if 5.3 confirms it is missing)

````text
Build a minimal dashboard served by the EXISTING Express server (src/server.ts) so the whole app deploys as one container. If 5.3 found an existing frontend, extend it instead and skip what already exists.

Tech: keep it simple and dependency-light. Use static files under /public (plain HTML + TypeScript/JS modules, or a small Vite/React build if the repo already has React). PRD proposes React/Tailwind but calls the stack "proposed"; a lean working UI beats an unfinished framework setup. Mobile-friendly, keyboard-accessible, and itself free of obvious axe violations (this is an accessibility product, so run axe on the dashboard and fix what it finds).

Screens (single page with sections or simple hash routes):
1. New audit: URL field, WCAG level select (A/AA/AAA), Run audit button. Quick-fill buttons for the demo fixtures (TC1 bad, TC2, TC3, TC4) using the deployed host's fixture URLs. Show progress and the planned vs executed checks when done, plus audit status (complete / incomplete / error) clearly, including error messages.
2. Proposed findings review: for each proposed finding show title, description, WCAG rule, severity, detection source, evidence (screenshot image, video player for .webm, plus a "details" JSON toggle), and Approve / Reject buttons. Nothing is logged as an issue until approved. Disable buttons while a request is in flight (prevents duplicate logging).
3. Issues: table or cards with title, description, WCAG rule, severity, source, status (open / resolved / rejected), evidence preview, and the associated audit run id. Filter by status.
4. Issue detail: status history timeline, original audit evidence, Retest button. After a retest show before/after side by side: result (pass / fail / incomplete), findings, evidence, and the status transition. Make it visually obvious that an incomplete retest does NOT resolve the issue.
5. Test runs: list TC1-TC4 from test-runs.json (or the API) with input, expected, actual, status (pass / fail / incomplete) and evidence links.

Backend additions (only what is missing; keep existing routes unchanged):
- GET /api/audits, GET /api/audits/:id, GET /api/issues, GET /api/issues/:id (with history), GET /api/test-runs.
- Static serving of /evidence with correct content types and path-traversal protection (resolve the path and ensure it stays under the evidence dir).
- Serve fixtures from the same server under a clear prefix, or confirm fixtures can be reached by the audit engine on the deployed host (see prompt 5.5).

Add API tests for new routes and one Playwright test that opens the dashboard, runs an audit on the TC2 fixture, approves the finding, and sees the issue listed.

Done when: from a fresh start I can do the whole flow in the browser: run audit on TC2 -> see the proposed finding with evidence -> approve -> see it in Issues -> fix via state toggle -> Retest -> issue resolved; and a retest while still broken keeps it open.
````

---

## Prompt 5.5: Surface the agent workflow (collect, plan, find, act)

````text
PRD §9.1 describes a four-step agent workflow: collect audit details, plan checks, inspect/find, and act (present for approval, persist, retest). Make this visible without inventing fake AI.

1. Add a "plan" step to the audit result and API response: which checks will run and why (e.g. keyboard-trap planned because the page has dialog-like elements or triggers; contrast planned because large images or text-over-image candidates exist; if you cannot determine applicability cheaply, plan all checks and say so). Record planned vs executed (already in AuditResult) and expose a short human-readable plan and step log.
2. In the dashboard, render the four steps as a timeline for each audit: Collect (URL, level), Plan (checks), Find (findings count, per-check status and durations), Act (awaiting approval / approved / retest).
3. The PRD says optional LLM integration must not be required. Do NOT add an LLM dependency. If I later want a summary, it can be an optional, clearly-labelled feature off by default.

Done when: the dashboard shows the four-step timeline for a real audit, and tests assert that plan and executed checks are both recorded.
````

---

## Prompt 5.6: Deployment (Docker)

````text
Prepare deployment as a single Docker container.

Constraints: the app needs real Chromium (Playwright) with video recording, so serverless platforms (Vercel/Netlify functions) will NOT work. Target a container host such as Render, Fly.io, or Railway.

1. Create a Dockerfile based on the official Playwright image that matches the installed Playwright version (check package.json; for 1.49.1 the tag is mcr.microsoft.com/playwright:v1.49.1-jammy; verify the tag against the installed version). Install deps with `npm ci`, build if needed, run as a non-root user if feasible, and start the single server (dashboard + API + fixtures + evidence).
2. Make the app read PORT and a public base URL from env (e.g. PUBLIC_BASE_URL) so the dashboard's demo-fixture buttons point at the deployed host, not localhost.
3. Make sure the audit engine can audit the fixtures served by the same process on the deployed host. If fixtures currently run on a separate port, mount them in the main server under a prefix (e.g. /fixtures) while keeping existing fixture tests working.
4. Chromium in containers: launch with the flags needed (e.g. --no-sandbox if running as root, and consider --disable-dev-shm-usage); verify video recording works headless in Docker.
5. Persistence: data/auditor.sqlite and /evidence must live on a mounted volume or be re-creatable at startup. State clearly what is lost on redeploy. Add a startup seed/reset option so the demo can start from a clean state (and an explicit "reset demo data" admin action or script, protected by an env token so judges can't wipe it accidentally).
6. Protect state-toggle endpoints (/__state/*) for the deployed version, or at least document the risk; they exist for the demo fix step. If the dashboard offers a "Deploy fix" button for TC2/TC4, it should call them server-side.
7. Add a /health endpoint check to the Dockerfile HEALTHCHECK, a .dockerignore, and an npm script `docker:build` / `docker:run`.
8. Build and run the container locally, then run: the dashboard flow from prompt 5.4 and `npm run tc1 && npm run tc2` against the container (or equivalent in-container run) and report results.

Do not deploy to a real host yet; give me exact steps for the host I choose.

Done when: `docker build` and `docker run -p 8080:8080` give a working dashboard where TC1 produces a playable recording and the TC4 retest flow works.
````

---

## Prompt 5.7: Hosting steps (pick one platform)

````text
I will deploy to <Render | Fly.io | Railway> (replace with my choice). Give me exact, minimal steps for that platform: connect repo, Docker build, env vars (PORT, PUBLIC_BASE_URL, admin token), persistent disk/volume for data/ and evidence/ (or the fallback if the free tier has none), health check path, and memory sizing note (Chromium needs roughly 1 GB RAM; flag if the free tier is too small and what to do). Also list how to verify the deployed instance from a clean start, and the first 5 things I should check if audits fail in production (Chromium launch, shm size, timeouts, fixture URL reachability, evidence write permissions).
Do not modify code unless a needed fix is small and obvious; list changes first.
````

---

## Prompt 5.8: Reproducibility and flake hardening

````text
Make the official cases reliably reproducible.

1. Create scripts/repeat.ts that runs tc1, tc2, tc3 and the TC4 flow 10 times each (fresh evidence folder, fresh fixture state, fresh DB per run) and prints a table: run, status, duration, key metrics (TC1 tab-sequence length, TC3 contrast ratio, TC4 final issue status). Report pass rate and any variance.
2. Eliminate flakiness found: replace fixed sleeps with condition waits, handle port conflicts, make video finalization robust, kill leftover Chromium on failure paths.
3. Clean-start test: remove node_modules, evidence/, data/, test-runs.json; run `npm ci && npx playwright install chromium && npm run typecheck && npm test` then all official runners. Fix anything that breaks.
4. Repeat the same flow inside the Docker container.

Target: 10/10 for all cases, locally and in Docker. Report the table.
````

---

## Prompt 5.9: Engine freeze

````text
Freeze the engine and the persistence/API contract.

1. Run typecheck, all tests, all official runners, the e2e verification, and the dashboard Playwright test. All must pass.
2. Remove dead code, unused exports, and debug logging. Keep one structured log line per check (checkId, status, durationMs).
3. Make engine/INTERFACE.md match the final code exactly (<= 60 lines). Write engine/LIMITATIONS.md honestly: heuristic opener and control discovery, partial AAA axe coverage, keyboard trap detection limited to dialog-like patterns, contrast sampling limited to the sampled/identified text regions, only executed checks are claimed, no claim of full WCAG compliance.
4. CHANGELOG entry and the command (do not run it) for `git tag v1.0-submission`.

After this: only critical bug fixes.
````

---

## Prompt 5.10: README

````text
Write README.md (root) that a judge can follow cold. Verify every command by running it.

Sections:
1. What it is (3-4 sentences) and what it does NOT claim.
2. Live demo URL (placeholder I will fill) and how to use the dashboard in 5 steps.
3. Quick start: prerequisites, install, Playwright browser install, `npm run fixtures`, `npm start`, ports.
4. Architecture (short diagram in text or Mermaid): dashboard, API, orchestrator/engine, checks, evidence, SQLite.
5. How each check works (axe, keyboard trap, keyboard operability, contrast), at the level a judge needs.
6. Official test cases TC1-TC4: input URL, expected, actual, how to run (`npm run tc1` ... ), where evidence lives, link to test-runs.json.
7. Retest workflow and when an issue closes.
8. Tests and verification commands.
9. Docker build/run and environment variables.
10. Limitations (link to engine/LIMITATIONS.md).

Done when: following the README from a fresh clone reproduces TC1-TC4 results.
````

---

## Prompt 5.11: Submission evidence bundle

````text
Create scripts/package-submission.ts that produces /submission/ containing:
- test-runs.json and per-case JSON (TC1, TC2, TC3, TC4 initial + retest)
- For each case: the screenshots, recordings (.webm), axe summary JSON, annotated contrast image (TC3), and before/after evidence (TC4)
- TC_RESULTS.md: one table with Input, Expected, Actual, Status, and evidence links per case, generated from test-runs.json (no hand-written numbers)
- INDEX.md explaining every file and what it proves
- A source-code zip or instructions pointing to the repository (exclude node_modules, data, secrets)

The script runs the official cases from a clean state first, then validates every referenced file exists and is non-empty, and fails otherwise.

Done when: `npm run package-submission` produces a bundle I can zip and upload, and INDEX.md alone lets a judge find any evidence.
````

---

## Prompt 5.12: Presentation content

````text
Draft the presentation as slide-by-slide content (title, 3-5 bullets, speaker notes, and the exact evidence image/video to show). Target 10-12 slides, ~8 minutes. Required by the PRD: the problem, agent workflow, technical implementation, official test case results, and the retest demonstration.

Suggested flow:
1. Problem: automated scanners miss keyboard and visual issues (use the TC2 contrast: axe says 0, keyboard check finds a failure).
2. Agent workflow: collect, plan, find, act with human approval.
3. Architecture.
4. How keyboard trap detection avoids false positives (good-modal control).
5. TC1 result with recording.
6. TC2 result: axe clean vs keyboard failure.
7. TC3 result: pixel sampling over the photo, ratio 1.69:1 vs 4.5:1, annotated screenshot.
8. TC4: approve, retest while broken stays open, fix, retest resolves; incomplete retest never resolves.
9. Evidence and traceability.
10. Limitations and honest scope.
11. What's next.

Use numbers from test-runs.json only. If I give you a slide tool preference (PowerPoint, Slides), tell me what format to export; otherwise produce Markdown I can paste.
````

---

## Prompt 5.13: Demo script and Q&A

````text
Write docs/DEMO_SCRIPT.md: a timed, word-for-word 5-minute live demo and a 90-second fallback, for a SINGLE presenter (me) covering the full app from a clean start on the DEPLOYED URL:
1. Open dashboard, run audit on TC1 bad: show plan, findings, recording of the trap. Mention the good-modal control.
2. Run audit on TC2: show axe 0 violations vs the keyboard finding.
3. Run audit on TC3: show annotated pixel sampling.
4. TC4: approve the issue, retest while broken (stays open), deploy fix, retest (resolves).
5. Show test runs page with all four cases.

Include a "if something breaks live" section: which pre-recorded evidence to open (paths from the bundle), and how to reset demo state.

Add a Q&A section with short accurate answers to likely judge questions:
- "Isn't focus containment in a modal normal?"
- "How do you know axe really found nothing?"
- "How do you measure contrast over a photo?"
- "What stops a failed retest from closing an issue?"
- "Is there any AI in this?" (answer honestly based on what the code does; the PRD says LLM is optional)
- "What are the limits?"

Strictly accurate to the code and results.
````

---

## Prompt 5.14: Final clean-start sign-off (read-only verification)

````text
Do a final read-only verification and output a checklist with PASS/FAIL and evidence:

1. Fresh clone, `npm ci`, Playwright install, typecheck, tests (all pass).
2. Docker image builds and runs; /health OK; dashboard loads.
3. Dashboard flow works for TC1, TC2, TC3, TC4 including approve, retest-while-broken (stays open), fix, retest (resolves), and incomplete retest (not resolved).
4. test-runs.json has TC1-TC4 with all PRD §10.4 fields and correct pass/fail/incomplete semantics.
5. Evidence viewable from the dashboard (screenshots display, videos play).
6. Submission bundle valid; README commands work; presentation figures match test-runs.json.
7. Deployed URL (if given) passes the same flow; list any difference between local and deployed behavior.
8. Git: clean tree, tag v1.0-submission ready, no secrets committed.
9. Portal deadline: remind me that the blueprint states none and I must confirm it separately.

Do not change anything; list failures with minimal fixes.
````
