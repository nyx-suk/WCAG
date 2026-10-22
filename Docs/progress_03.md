# WCAG Accessibility Auditor — Progress Report 03
## Repository Implementation, Test, and Acceptance Audit

**Date:** October 22, 2026  
**Auditor:** Independent QA Auditor & Strict TypeScript Engineer  
**Audit Target:** Core Audit Engine (`engine/runAudit.ts`), Automated Test Suite, Public API & Documentation  
**Execution Environment:** macOS, Node.js v24.21.0, Playwright 1.49.1, `@axe-core/playwright` 4.10.1, `tsx` 4.19.2  

---

## 1. Executive Summary

- **Overall Verdict:** **PARTIAL**
- **Requirements Checked:** 30 independently verifiable requirements
  - **PASS:** 14 (46.7%)
  - **PARTIAL:** 7 (23.3%)
  - **FAIL:** 9 (30.0%)
  - **UNVERIFIABLE:** 0 (0.0%)
- **Test Suite Status:** 27/27 unit and integration tests passing (`npm test` duration: 5.01s).
- **Critical Blockers:**
  1. **Missing Public Entrypoint & Interface Documentation:** `/engine/index.ts` and `/engine/INTERFACE.md` (required $\le 60$ lines) do not exist in the repository.
  2. **Missing Test Suite File & Coverage:** `/engine/__tests__/runAudit.test.ts` does not exist at that path (existing tests reside under `test/run-audit.test.ts`), and 5 out of 6 required error/edge test cases (unreachable host, 404 on `runAudit`, injected failure isolation, repeated run deduplication, invalid `wcagLevel` throw) are completely unasserted.
  3. **Missing Input Validation in `runAudit.ts`:** Empty `auditId`, malformed URLs, and invalid `wcagLevel` values are not validated before browser launch.
  4. **Contract Deviations in `runAudit.ts`:** Contrast is statically imported (not dynamically imported with fallback error `contrast module not available`), findings are not deduplicated by fingerprint, and `withTimeout` is omitted on `runAxe` and `runContrast`.

---

## 2. Requirement Matrix

| ID | Requirement | Result | Evidence / Observed Behavior | Failure / Limitation Details |
| :--- | :--- | :---: | :--- | :--- |
| **REQ-1.1** | `runAudit(input: AuditInput): Promise<AuditResult>` implemented and exported | **PASS** | [`engine/runAudit.ts#L114`](file:///Users/sukruthasrigadde/stuff/WCAG/engine/runAudit.ts#L114) exports `runAudit`. Verified in automated tests and acceptance scenarios. | None. |
| **REQ-1.2** | Input validation: URL is HTTP(S), `wcagLevel` is A/AA/AAA, `auditId` nonempty | **FAIL** | Scratch execution `scratch/repeat-test.ts`: `auditId: ""` and `wcagLevel: "INVALID_LEVEL"` returned `status: "complete"`. `url: "not-a-valid-url"` launched browser and returned `status: "error"`. | [`engine/runAudit.ts#L114-L125`](file:///Users/sukruthasrigadde/stuff/WCAG/engine/runAudit.ts#L114-L125) has zero input validation checks. |
| **REQ-1.3** | Default checks `["axe", "keyboard-trap", "keyboard-operability", "contrast"]`; `input.checks` filtering | **PASS** | [`engine/runAudit.ts#L12`](file:///Users/sukruthasrigadde/stuff/WCAG/engine/runAudit.ts#L12), [`engine/runAudit.ts#L116`](file:///Users/sukruthasrigadde/stuff/WCAG/engine/runAudit.ts#L116). Verified in `test/run-audit.test.ts` and acceptance runs. | None. |
| **REQ-1.4** | Contrast dynamic import in `try/catch`; fallback message `contrast module not available`; interface comment | **FAIL** | [`engine/runAudit.ts#L4`](file:///Users/sukruthasrigadde/stuff/WCAG/engine/runAudit.ts#L4): `import { sampleContrast } from "./contrast-sampler"` is a top-level static import. | No dynamic `import()`, no `try/catch` on module loading, no fallback error message, no comment documenting `runContrastCheck(page: Page, input: AuditInput): Promise<AuditFinding[]>`. |
| **REQ-1.5** | Sequential execution; axe/contrast share page; keyboard checks use dedicated video contexts | **PASS** | [`engine/runAudit.ts#L147-L217`](file:///Users/sukruthasrigadde/stuff/WCAG/engine/runAudit.ts#L147-L217) loops sequentially. `runAxe`/`runContrast` share `page`. [`keyboardTrap.ts#L311`](file:///Users/sukruthasrigadde/stuff/WCAG/engine/checks/keyboardTrap.ts#L311) and [`keyboardOperability.ts#L182`](file:///Users/sukruthasrigadde/stuff/WCAG/engine/checks/keyboardOperability.ts#L182) invoke `newAuditContext(..., { record: ... })`. | None. |
| **REQ-1.6** | Each check uses `try/catch` and `withTimeout`; failure does not halt later checks | **PARTIAL** | Each check in [`engine/runAudit.ts#L147-L217`](file:///Users/sukruthasrigadde/stuff/WCAG/engine/runAudit.ts#L147-L217) has `try/catch` and updates `checksExecuted`. Check failures mark `status = "incomplete"` and loop continues. | `withTimeout` is called inside keyboard checks, but `runAudit.ts` does NOT wrap calls to `runAxe` or `runContrast` in `withTimeout`. |
| **REQ-1.7** | Initial navigation failure returns `status: "error"`, 0 findings, `NavigationError` message; 404 handled | **PASS** | [`engine/runAudit.ts#L126-L145`](file:///Users/sukruthasrigadde/stuff/WCAG/engine/runAudit.ts#L126-L145) and [`engine/browser.ts#L120-L125`](file:///Users/sukruthasrigadde/stuff/WCAG/engine/browser.ts#L120-L125). Acceptance Scenario 3 returned `status: "error"`, 0 findings, and message `"Navigation to ... failed with HTTP status 404"`. | None. |
| **REQ-1.8** | Status determination: `complete` on all pass, `incomplete` on check failure/skip, `error` on navigation failure | **PASS** | [`engine/runAudit.ts#L120,L129,L160,L172,L190,L207,L215`](file:///Users/sukruthasrigadde/stuff/WCAG/engine/runAudit.ts#L120). Verified across acceptance scenarios and unit tests. | None. |
| **REQ-1.9** | `axeSummary` included whenever axe runs; deduplicate findings by fingerprint; ISO timestamps | **PARTIAL** | `axeSummary` returned on `/tc2` with 0 violations ([`engine/runAudit.ts#L52-L73`](file:///Users/sukruthasrigadde/stuff/WCAG/engine/runAudit.ts#L52-L73)). Timestamps are ISO strings. | Findings are pushed directly without fingerprint deduplication (`findings.push(...)`). |
| **REQ-1.10** | Browser cleanup in `finally`; no Chromium leaks; no database code | **PASS** | [`engine/runAudit.ts#L218-L221`](file:///Users/sukruthasrigadde/stuff/WCAG/engine/runAudit.ts#L218-L221). `pgrep -l -f "chromium\|playwright"` confirmed 0 orphaned processes. Zero persistence code in `engine/`. | None. |
| **REQ-1.11** | Acceptance 1: `/tc1/bad` produces keyboard-trap finding | **PASS** | Target: `http://localhost:4250/tc1/bad`. Returned 1 critical finding on `#newsletter-modal`, WCAG `2.1.2 No Keyboard Trap`. Screenshot and recording verified. | None. |
| **REQ-1.12** | Acceptance 2: Broken `/tc2` produces keyboard-operability finding & `axeSummary.violationCount === 0` | **PASS** | Target: `http://localhost:4250/tc2`. Returned 1 serious finding on `#add-to-cart`, WCAG `2.1.1 Keyboard`. `axeSummary`: `{"violationCount":0,"passesCount":15,"incompleteCount":0}`. | None. |
| **REQ-1.13** | Acceptance 3: `/does-not-exist` returns `status: "error"`, navigation error, 0 findings | **PASS** | Target: `http://localhost:4250/does-not-exist`. Returned `status: "error"`, 0 findings, and HTTP 404 error message on all planned checks. | None. |
| **REQ-2.1** | Test file exists at `/engine/__tests__/runAudit.test.ts` | **FAIL** | Directory check: `ls engine/__tests__` returned code 1 (`No such file or directory`). | Test file currently exists at [`test/run-audit.test.ts`](file:///Users/sukruthasrigadde/stuff/WCAG/test/run-audit.test.ts), not `/engine/__tests__/runAudit.test.ts`. |
| **REQ-2.2** | Uses configured test runner (`node:test` with `tsx`) | **PASS** | [`package.json#L12`](file:///Users/sukruthasrigadde/stuff/WCAG/package.json#L12) uses `tsx --test test/**/*.test.ts` with native `node:test` and `node:assert/strict`. | None. |
| **REQ-2.3a** | Test Case 1: Unreachable host → error, zero findings, useful message; never complete | **FAIL** | Inspected [`test/run-audit.test.ts`](file:///Users/sukruthasrigadde/stuff/WCAG/test/run-audit.test.ts). Case is missing. | Not asserted in test suite. |
| **REQ-2.3b** | Test Case 2: HTTP 404 → error | **FAIL** | Inspected [`test/run-audit.test.ts`](file:///Users/sukruthasrigadde/stuff/WCAG/test/run-audit.test.ts). Case is missing. | Present only in `test/browser.test.ts` for lower-level `navigate()`, not for `runAudit()`. |
| **REQ-2.3c** | Test Case 3: Injected failing check → failed status, later checks run, incomplete status | **FAIL** | Inspected [`test/run-audit.test.ts`](file:///Users/sukruthasrigadde/stuff/WCAG/test/run-audit.test.ts). Case is missing. | No dependency injection or test-only failing check hook exists. |
| **REQ-2.3d** | Test Case 4: Repeated identical runs → stable finding fingerprints and retest stability | **FAIL** | Inspected [`test/run-audit.test.ts`](file:///Users/sukruthasrigadde/stuff/WCAG/test/run-audit.test.ts). Case is missing. | Verified manually via scratch script, but absent in test suite. |
| **REQ-2.3e** | Test Case 5: `checks: ["keyboard-trap"]` runs only that check and sets `checksPlanned` | **PARTIAL** | [`test/run-audit.test.ts#L45-L62`](file:///Users/sukruthasrigadde/stuff/WCAG/test/run-audit.test.ts#L45-L62) runs `checks: ["keyboard-trap"]` and asserts `checksExecuted`. | Does not assert `checksPlanned`. |
| **REQ-2.3f** | Test Case 6: Invalid `wcagLevel` throws validation error | **FAIL** | Inspected [`test/run-audit.test.ts`](file:///Users/sukruthasrigadde/stuff/WCAG/test/run-audit.test.ts). Case is missing. | `runAudit` does not validate input; invalid level runs without error. |
| **REQ-2.4** | Server lifecycle management (programmatic start/stop in teardown, isolated ports, runtime < 60s) | **PASS** | [`test/run-audit.test.ts#L10,L27,L46,L65`](file:///Users/sukruthasrigadde/stuff/WCAG/test/run-audit.test.ts#L10) starts on ports 4101–4104 and cleans up via `t.after()`. Suite finishes in 5.01s. | None. |
| **REQ-3.1** | `/engine/index.ts` public entrypoint exporting `runAudit` and types from `/engine/types.ts` | **FAIL** | `find . -name "index.ts"` returned no results in `engine/`. | Consumers import internal paths directly (`../engine/runAudit`). No public barrel entrypoint exists. |
| **REQ-3.2** | `INTERFACE.md` exists, $\le 60$ lines, documents exact `AuditInput`, `AuditResult`, `AuditFinding` | **FAIL** | File check: `find . -name "*INTERFACE*"` returned no files. | `/engine/INTERFACE.md` is completely missing. |
| **REQ-3.3** | Fingerprint creation explained (`checkId + url + selector`) and implementation follows | **PARTIAL** | [`engine/fingerprint.ts#L9`](file:///Users/sukruthasrigadde/stuff/WCAG/engine/fingerprint.ts#L9) implements `checkId:url:selector` (16-hex). Keyboard checks follow this. | In [`engine/runAudit.ts#L23,L93`](file:///Users/sukruthasrigadde/stuff/WCAG/engine/runAudit.ts#L23), axe and contrast use `createStableFindingId` (24-hex JSON format). `INTERFACE.md` missing. |
| **REQ-3.4** | Retest passes only on `checks: [original.checkId]`, `complete`, executed, no matching fingerprint | **PASS** | [`src/api/server.ts#L128-L154`](file:///Users/sukruthasrigadde/stuff/WCAG/src/api/server.ts#L128-L154), [`src/persistence/sqlite.ts#L167-L175`](file:///Users/sukruthasrigadde/stuff/WCAG/src/persistence/sqlite.ts#L167-L175), and [`test/api.test.ts#L80-L106`](file:///Users/sukruthasrigadde/stuff/WCAG/test/api.test.ts#L80-L106). | None. |
| **REQ-3.5** | Evidence paths `/evidence/{auditId}/...`, stored relative to `/evidence`; all severities listed | **PARTIAL** | Implementation matches: [`engine/evidence.ts`](file:///Users/sukruthasrigadde/stuff/WCAG/engine/evidence.ts) and [`engine/types.ts#L6`](file:///Users/sukruthasrigadde/stuff/WCAG/engine/types.ts#L6) (`critical`, `serious`, `moderate`, `minor`). | Undocumented publicly due to missing `INTERFACE.md`. |
| **REQ-3.6** | TC2 fixed state instructions include `POST /__state/tc2` and request body | **PARTIAL** | Documented in [`fixtures/README.md#L30-L36`](file:///Users/sukruthasrigadde/stuff/WCAG/fixtures/README.md#L30-L36) (`{"fixed":true}`). | Missing from `INTERFACE.md`. |
| **REQ-3.7** | Both limitations documented (partial AAA axe coverage, heuristic keyboard discovery) | **PARTIAL** | Documented in code comments: [`engine/checks/axe.ts#L25`](file:///Users/sukruthasrigadde/stuff/WCAG/engine/checks/axe.ts#L25), [`engine/checks/keyboardOperability.ts#L88`](file:///Users/sukruthasrigadde/stuff/WCAG/engine/checks/keyboardOperability.ts#L88). | Missing from public `INTERFACE.md`. |
| **REQ-3.8** | Developer self-sufficiency using only `INTERFACE.md` | **FAIL** | `INTERFACE.md` does not exist. | Third-party developer cannot integrate without inspecting source code. |

---

## 3. Test Report

### 3.1 Automated Test Suite Execution
- **Command:** `npm test` (`tsx --test test/**/*.test.ts`)
- **Exit Code:** `0`
- **Duration:** 5,007 ms (5.01 seconds)
- **Suite Counts:** 27 passed, 0 failed, 0 skipped (27 total)
- **Breakdown by Test File:**
  - `test/api.test.ts`: 2 passed (211 ms)
  - `test/axe.test.ts`: 4 passed (2,599 ms)
  - `test/browser.test.ts`: 1 passed (2,030 ms)
  - `test/contrast-sampler.test.ts`: 5 passed (13 ms)
  - `test/fingerprint.test.ts`: 4 passed (3 ms)
  - `test/fixtures-server.test.ts`: 1 passed (201 ms)
  - `test/keyboardOperability.test.ts`: 1 passed (2,566 ms)
  - `test/keyboardTrap.test.ts`: 1 passed (2,699 ms)
  - `test/run-audit.test.ts`: 4 passed (3,661 ms)
  - `test/sqlite.test.ts`: 2 passed (76 ms)
  - `test/tc1-pages.test.ts`: 2 passed (1,465 ms)

### 3.2 Acceptance Scenarios Execution
Executed programmatically on isolated fixture port `4250`:

1. **Scenario 1 (`/tc1/bad`):**
   - **Target URL:** `http://localhost:4250/tc1/bad`
   - **Status:** `complete`
   - **Checks Executed:** `[{"checkId":"keyboard-trap","status":"executed"}]`
   - **Findings Count:** 1
   - **Finding:** Title: `"Keyboard trap in modal dialog"`, Rule: `"2.1.2 No Keyboard Trap"`, Severity: `"critical"`, Selector: `"#newsletter-modal"`, Screenshot: `"audit-accept-tc1/keyboard-trap.png"`, Recording: `"audit-accept-tc1/keyboard-trap.webm"`
   - **Verdict:** **PASS**

2. **Scenario 2 (Broken `/tc2`):**
   - **Target URL:** `http://localhost:4250/tc2`
   - **Status:** `complete`
   - **Axe Summary:** `{"violationCount":0,"passesCount":15,"incompleteCount":0}`
   - **Checks Executed:** `[{"checkId":"axe","status":"executed"},{"checkId":"keyboard-operability","status":"executed"}]`
   - **Findings Count:** 1
   - **Finding:** Title: `"Custom control is not keyboard operable"`, Rule: `"2.1.1 Keyboard"`, Severity: `"serious"`, Selector: `"#add-to-cart"`
   - **Verdict:** **PASS**

3. **Scenario 3 (`/does-not-exist`):**
   - **Target URL:** `http://localhost:4250/does-not-exist`
   - **Status:** `error`
   - **Checks Planned:** `["axe","keyboard-trap","keyboard-operability","contrast"]`
   - **Checks Executed:** All 4 marked `failed` with error `"Navigation to http://localhost:4250/does-not-exist failed with HTTP status 404"`
   - **Findings Count:** 0
   - **Axe Summary:** `undefined`
   - **Verdict:** **PASS**

### 3.3 Chromium Process & Port Cleanup
- `lsof -i :4000` / `lsof -i :4250` confirmed ports released immediately upon server closure.
- `pgrep -l -f "chromium|playwright"` returned exit code 1 (0 active browser processes remaining).

---

## 4. Defects

### Defect 1: Missing Public Barrel and Interface Documentation
- **Severity:** High
- **Requirement ID:** REQ-3.1, REQ-3.2, REQ-3.8
- **Location:** Repository root and `/engine/`
- **Expected Behavior:** `/engine/index.ts` is the single entrypoint exporting `runAudit` and all core types. `/engine/INTERFACE.md` ($\le 60$ lines) documents input/output shapes, fingerprinting, retest rules, and limitations.
- **Actual Behavior:** Neither file exists. Consumers import from internal paths.
- **Minimal Fix:**
  1. Create `/engine/index.ts` exporting `runAudit` from `./runAudit` and types from `./types`.
  2. Create `/engine/INTERFACE.md` (under 60 lines) documenting `AuditInput`, `AuditResult`, `AuditFinding`, fingerprint rule, retest workflow, and limitations.

### Defect 2: Missing `/engine/__tests__/runAudit.test.ts` with Required Cases
- **Severity:** High
- **Requirement ID:** REQ-2.1, REQ-2.3a–f
- **Location:** `/engine/__tests__/runAudit.test.ts` (currently `test/run-audit.test.ts`)
- **Expected Behavior:** Test suite exists at `/engine/__tests__/runAudit.test.ts` and asserts all 6 cases: unreachable host, 404 navigation error, injected failing check isolation, repeated run fingerprint stability, `checksPlanned` filtering, and invalid `wcagLevel` throw.
- **Actual Behavior:** File is located at `test/run-audit.test.ts` and only tests basic positive execution of axe, keyboard-operability, keyboard-trap, and contrast. Cases 1, 2, 3, 4, and 6 are unasserted.
- **Minimal Fix:** Create `/engine/__tests__/runAudit.test.ts` (or expand `test/run-audit.test.ts`) to assert all 6 cases against programmatic fixture instances.

### Defect 3: Missing Input Validation in `runAudit.ts`
- **Severity:** Medium
- **Requirement ID:** REQ-1.2
- **Location:** [`engine/runAudit.ts#L114-L125`](file:///Users/sukruthasrigadde/stuff/WCAG/engine/runAudit.ts#L114-L125)
- **Expected Behavior:** Calling `runAudit` with invalid URL protocol (non-HTTP/HTTPS), invalid `wcagLevel` (not A, AA, or AAA), or empty `auditId` immediately throws a descriptive validation error before launching the browser.
- **Actual Behavior:** Inputs are unvalidated. Empty `auditId` and invalid `wcagLevel` launch Chromium and return `status: "complete"`.
- **Minimal Fix:** Add input validation guard at the top of `runAudit`:
  ```ts
  if (!input.auditId || typeof input.auditId !== "string" || !input.auditId.trim()) {
    throw new Error("Invalid auditId: must be a non-empty string");
  }
  if (!["A", "AA", "AAA"].includes(input.wcagLevel)) {
    throw new Error(`Invalid wcagLevel: expected 'A', 'AA', or 'AAA', received '${input.wcagLevel}'`);
  }
  const parsedUrl = new URL(input.url);
  if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
    throw new Error(`Invalid URL: protocol must be http: or https:, received '${parsedUrl.protocol}'`);
  }
  ```

### Defect 4: Static Contrast Import & Missing Fallback Handling
- **Severity:** Medium
- **Requirement ID:** REQ-1.4
- **Location:** [`engine/runAudit.ts#L4,L76-L112`](file:///Users/sukruthasrigadde/stuff/WCAG/engine/runAudit.ts#L4)
- **Expected Behavior:** Dynamic import of contrast module in `try/catch`. If unavailable, check is skipped with exact error `contrast module not available`. Document expected interface in a comment.
- **Actual Behavior:** Top-level static import `import { sampleContrast } from "./contrast-sampler"`. If missing, module fails to load.
- **Minimal Fix:** Implement dynamic import within the `checkId === "contrast"` block, catch load failures, and log `contrast module not available`. Add comment documenting `runContrastCheck(page: Page, input: AuditInput): Promise<AuditFinding[]>`.

### Defect 5: Missing Finding Deduplication by Fingerprint in `runAudit.ts`
- **Severity:** Low
- **Requirement ID:** REQ-1.9
- **Location:** [`engine/runAudit.ts#L118,L151,L165,L182,L199`](file:///Users/sukruthasrigadde/stuff/WCAG/engine/runAudit.ts#L118)
- **Expected Behavior:** `runAudit` deduplicates findings across all check executions so no two findings share the same fingerprint.
- **Actual Behavior:** Findings are appended blindly via `findings.push(...)`.
- **Minimal Fix:** Deduplicate findings before returning `AuditResult`:
  ```ts
  const uniqueFindings = Array.from(
    new Map(findings.map((f) => [f.fingerprint, f])).values()
  );
  ```

### Defect 6: Inconsistent Fingerprint Formats Across Checks
- **Severity:** Low
- **Requirement ID:** REQ-3.3
- **Location:** [`engine/runAudit.ts#L23,L93`](file:///Users/sukruthasrigadde/stuff/WCAG/engine/runAudit.ts#L23) vs [`engine/fingerprint.ts#L9`](file:///Users/sukruthasrigadde/stuff/WCAG/engine/fingerprint.ts#L9)
- **Expected Behavior:** All finding fingerprints are 16-hex characters generated from `checkId + url + selector` using `makeFingerprint`.
- **Actual Behavior:** Keyboard checks use `makeFingerprint` (16-char hex). Axe and contrast in `runAudit.ts` use `createStableFindingId` from Person B's module (24-char hex string with `fnd_` stripped).
- **Minimal Fix:** Standardize `axeFinding` and `runContrast` in `runAudit.ts` to call `makeFingerprint(checkId, input.url, selector)`.

---

## 5. Person B Readiness

**Verdict:** **READY WITH CAVEATS**

### Justification:
1. **Integrated Core Works:** Person B can pull `feature/keyboard-audit` and execute the full flow: `runAudit` executes axe, keyboard-trap, keyboard-operability, and contrast checks against TC1, TC2, TC3, and TC4.
2. **API & Persistence Compatibility:** The SQLite store and API routes (`/api/audits`, `/api/issues/:id/approve`, `/api/issues/:id/retest`) pass all 27 unit tests. The retest state machine correctly transitions issues to `resolved` only on a complete, passing retest.
3. **Evidence Available:** Visual and video evidence are stored under `/evidence/{auditId}/` and relative paths are cleanly referenced in `AuditFinding`.
4. **Caveats for Person B:**
   - Person B must currently import from `engine/runAudit` rather than `engine/index.ts`.
   - `runAudit` does not yet validate input, so malformed API inputs could enter the browser harness unless sanitized at the API layer (`parseAuditInput`).
   - Fingerprint lengths differ between keyboard findings (16-char) and axe/contrast findings (24-char).

---

## 6. Completion Checklist (Next Actions)

To achieve an unconditional **PASS**, the following concrete actions must be completed:

- [ ] **Action 1 (REQ-3.1):** Create [`/engine/index.ts`](file:///Users/sukruthasrigadde/stuff/WCAG/engine/index.ts) exporting `runAudit` and all contracts from `types.ts`.
- [ ] **Action 2 (REQ-3.2, REQ-3.5–3.8):** Author [`/engine/INTERFACE.md`](file:///Users/sukruthasrigadde/stuff/WCAG/engine/INTERFACE.md) ($\le 60$ lines) documenting `AuditInput`, `AuditResult`, `AuditFinding`, fingerprinting rules, retest pass criteria, severity levels, TC2 toggling via `POST /__state/tc2`, and known limitations (AAA partial, heuristic keyboard candidates).
- [ ] **Action 3 (REQ-1.2):** Add input validation at the entry of [`runAudit`](file:///Users/sukruthasrigadde/stuff/WCAG/engine/runAudit.ts#L114) for non-empty `auditId`, protocol `http:/https:`, and `wcagLevel` in `["A", "AA", "AAA"]`.
- [ ] **Action 4 (REQ-1.4):** Update `runAudit.ts` contrast check to use dynamic import with error fallback `contrast module not available` and add the required interface comment.
- [ ] **Action 5 (REQ-1.6):** Wrap `runAxe` and `runContrast` executions in [`withTimeout`](file:///Users/sukruthasrigadde/stuff/WCAG/engine/browser.ts#L152) within `runAudit.ts`.
- [ ] **Action 6 (REQ-1.9):** Add fingerprint deduplication on `findings` array prior to returning `AuditResult`.
- [ ] **Action 7 (REQ-3.3):** Unify fingerprint creation in `runAudit.ts` using `makeFingerprint`.
- [ ] **Action 8 (REQ-2.1, REQ-2.3a–f):** Create [`/engine/__tests__/runAudit.test.ts`](file:///Users/sukruthasrigadde/stuff/WCAG/engine/__tests__/runAudit.test.ts) covering all 6 mandatory cases: unreachable host, HTTP 404, injected check failure, repeated run fingerprint stability, `checksPlanned` filtering, and invalid `wcagLevel` validation rejection. Update `package.json` test script if needed.
