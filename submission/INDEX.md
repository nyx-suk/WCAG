# Submission Evidence Bundle — Master Index

This self-contained directory contains the certified submission evidence for the **WCAG Accessibility Auditor**.
A judge can inspect any evidence file or reproduce all claims using the index below.

## 1. Executive Summary & Verification Claims

- **Repository:** `https://github.com/nyx-suk/WCAG`
- **Release Tag:** `v1.0-submission`
- **Total Official Cases:** 4 / 4 PASS (100%)
- **Schema Conformance:** Strictly conforms to PRD §10.4 schema (`id`, `test_case`, `input`, `expected_result`, `actual_result`, `evidence`, `status`, `explanation`, `started_at`, `completed_at`).

## 2. Test Case Evidence Guide

### TC1: PASS
- **What it proves:** Auditor successfully identified a genuine keyboard trap on /tc1/bad (#newsletter-modal), logging 1 critical finding for WCAG 2.1.2 No Keyboard Trap. Focus movement was tracked across 9 tab steps, detecting a loop of 3 elements (cycleDetected=true). Escape key was pressed but the modal remained open (modalStillOpenAfterEscape=true). Dismiss controls (#maybe-later-btn, #subscribe-btn) were activated via keyboard but failed to dismiss the dialog (dismissControlsWorked=false). Non-empty screenshot and .webm interaction recording were captured under /evidence/tc1-1792776770971/. The control page /tc1/good produced 0 findings with full keyboard exit support.
- **JSON Record:** [`test-runs/TC1.json`](./test-runs/TC1.json)
- **Evidence Files:**
  - [`evidence/tc1-1792776770971/keyboard-trap.png`](./evidence/tc1-1792776770971/keyboard-trap.png)
  - [`evidence/tc1-1792776770971/keyboard-trap.webm`](./evidence/tc1-1792776770971/keyboard-trap.webm)
  - [`evidence/tc1-1792776770971/official-report.json`](./evidence/tc1-1792776770971/official-report.json)

### TC2: PASS
- **What it proves:** axe-core executed with 0 violations (15 rules passed). Keyboard interaction check identified 1 failure: control #add-to-cart responds to mouse clicks (hasClickHandler=true) but is unreachable by keyboard navigation (reachableByTab=false, tabsPressed=6) and cannot be activated via Enter or Space (enterActivated=false, spaceActivated=false). Captured screenshot and .webm interaction recording under /evidence/tc2-1792776773545/.
- **JSON Record:** [`test-runs/TC2.json`](./test-runs/TC2.json)
- **Evidence Files:**
  - [`evidence/tc2-1792776773545/operability-0.png`](./evidence/tc2-1792776773545/operability-0.png)
  - [`evidence/tc2-1792776773545/keyboard-operability.webm`](./evidence/tc2-1792776773545/keyboard-operability.webm)
  - [`evidence/tc2-1792776773545/axe-summary.json`](./evidence/tc2-1792776773545/axe-summary.json)
  - [`evidence/tc2-1792776773545/official-report.json`](./evidence/tc2-1792776773545/official-report.json)

### TC3: PASS
- **What it proves:** Measured contrast ratio 1.693164014892572:1 against 4.5:1 threshold on #hero-caption using screenshot background pixel sampling. Produced 1 finding for WCAG 1.4.3 Contrast (Minimum) with screenshot and annotated screenshot evidence.
- **JSON Record:** [`test-runs/TC3.json`](./test-runs/TC3.json)
- **Evidence Files:**
  - [`evidence/official-tc3-1792776775333/contrast.png`](./evidence/official-tc3-1792776775333/contrast.png)
  - [`evidence/official-tc3-1792776775333/contrast-annotated.png`](./evidence/official-tc3-1792776775333/contrast-annotated.png)
  - [`evidence/official-tc3-1792776775333/official-report.json`](./evidence/official-tc3-1792776775333/official-report.json)

### TC4: PASS
- **What it proves:** Initial audit detected 1 finding for WCAG 2.1.1 Keyboard on #add-to-cart: control is inoperable via keyboard. Created pending issue with screenshot evidence. Issue was approved. Following fix deployment, retest completed with 0 violations and transitioned issue status to resolved.
- **JSON Record:** [`test-runs/TC4.json`](./test-runs/TC4.json)
- **Evidence Files:**
  - [`evidence/audit_1f42942a-d599-49af-aa63-f40a7b2b6b9c/operability-0.png`](./evidence/audit_1f42942a-d599-49af-aa63-f40a7b2b6b9c/operability-0.png)
  - [`evidence/audit_1f42942a-d599-49af-aa63-f40a7b2b6b9c/keyboard-operability.webm`](./evidence/audit_1f42942a-d599-49af-aa63-f40a7b2b6b9c/keyboard-operability.webm)
  - [`evidence/audit_1f42942a-d599-49af-aa63-f40a7b2b6b9c/official-report.json`](./evidence/audit_1f42942a-d599-49af-aa63-f40a7b2b6b9c/official-report.json)
  - [`evidence/audit_b84e9ba4-c25e-412c-bade-82f93c97e472/official-report.json`](./evidence/audit_b84e9ba4-c25e-412c-bade-82f93c97e472/official-report.json)

## 3. Complete File Manifest

| File Path | Size | Description & What It Proves |
| :--- | :---: | :--- |
| [`TC_RESULTS.md`](./TC_RESULTS.md) | 10.1 KB | Executive test case results matrix generated from test-runs.json |
| [`test-runs.json`](./test-runs.json) | 22.1 KB | Master aggregate test run records adhering to PRD §10.4 schema |
| [`test-runs/TC1.json`](./test-runs/TC1.json) | 3.7 KB | Individual certified test run record for TC1 |
| [`test-runs/TC2.json`](./test-runs/TC2.json) | 2.5 KB | Individual certified test run record for TC2 |
| [`test-runs/TC3.json`](./test-runs/TC3.json) | 8.6 KB | Individual certified test run record for TC3 |
| [`test-runs/TC4.json`](./test-runs/TC4.json) | 6.0 KB | Individual certified test run record for TC4 |
| [`evidence/tc1-1792776770971/keyboard-trap.png`](./evidence/tc1-1792776770971/keyboard-trap.png) | 49.1 KB | Full-page or element screenshot for TC1 |
| [`evidence/tc1-1792776770971/keyboard-trap.webm`](./evidence/tc1-1792776770971/keyboard-trap.webm) | 134.1 KB | Interaction video recording for TC1 |
| [`evidence/tc1-1792776770971/official-report.json`](./evidence/tc1-1792776770971/official-report.json) | 3.7 KB | Detailed structured report for TC1 |
| [`evidence/tc2-1792776773545/operability-0.png`](./evidence/tc2-1792776773545/operability-0.png) | 67.1 KB | Full-page or element screenshot for TC2 |
| [`evidence/tc2-1792776773545/keyboard-operability.webm`](./evidence/tc2-1792776773545/keyboard-operability.webm) | 104.2 KB | Interaction video recording for TC2 |
| [`evidence/tc2-1792776773545/axe-summary.json`](./evidence/tc2-1792776773545/axe-summary.json) | 0.1 KB | Detailed structured report for TC2 |
| [`evidence/tc2-1792776773545/official-report.json`](./evidence/tc2-1792776773545/official-report.json) | 2.5 KB | Detailed structured report for TC2 |
| [`evidence/official-tc3-1792776775333/contrast.png`](./evidence/official-tc3-1792776775333/contrast.png) | 74.2 KB | Full-page or element screenshot for TC3 |
| [`evidence/official-tc3-1792776775333/contrast-annotated.png`](./evidence/official-tc3-1792776775333/contrast-annotated.png) | 74.1 KB | Annotated contrast bounding-box crop for TC3 |
| [`evidence/official-tc3-1792776775333/official-report.json`](./evidence/official-tc3-1792776775333/official-report.json) | 8.6 KB | Detailed structured report for TC3 |
| [`evidence/audit_1f42942a-d599-49af-aa63-f40a7b2b6b9c/operability-0.png`](./evidence/audit_1f42942a-d599-49af-aa63-f40a7b2b6b9c/operability-0.png) | 16.1 KB | Full-page or element screenshot for TC4 |
| [`evidence/audit_1f42942a-d599-49af-aa63-f40a7b2b6b9c/keyboard-operability.webm`](./evidence/audit_1f42942a-d599-49af-aa63-f40a7b2b6b9c/keyboard-operability.webm) | 21.4 KB | Interaction video recording for TC4 |
| [`evidence/audit_1f42942a-d599-49af-aa63-f40a7b2b6b9c/official-report.json`](./evidence/audit_1f42942a-d599-49af-aa63-f40a7b2b6b9c/official-report.json) | 4.3 KB | Detailed structured report for TC4 |
| [`evidence/audit_b84e9ba4-c25e-412c-bade-82f93c97e472/official-report.json`](./evidence/audit_b84e9ba4-c25e-412c-bade-82f93c97e472/official-report.json) | 6.0 KB | Detailed structured report for TC4 |

## 4. How a Judge Can Verify Cold

1. Inspect `TC_RESULTS.md` for the high-level matrix.
2. Open any `.webm` file in Chrome/Firefox or VLC to view video recordings of interaction checks.
3. Inspect `test-runs.json` to verify schema conformance.
4. In the codebase, run `npm run tc1`, `npm run tc2`, `npm run tc3`, `npm run tc4`, or `npm run repeat` (10x clean runs) to reproduce all findings.
