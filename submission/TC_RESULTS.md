# Official Test Case Results (TC1 – TC4)

> **Certified Hackathon Test Results**: Generated deterministically from `test-runs.json`.
> All official test cases adhere strictly to the PRD §10.4 schema with lowercase verdicts (`pass`, `fail`, `incomplete`).

| Test Case | Target / Mode | Conformance Level & Checks | Expected Outcome | Actual Outcome | Status | Primary Evidence |
| :--- | :--- | :--- | :--- | :--- | :---: | :--- |
| **TC1** | `http://localhost:4000/tc1/bad` | AA (keyboard-trap) | A page containing an open modal dialog creates a genuine keyboard trap. The auditor must detect the trap, prove that keyboard focus cannot exit the modal via Tab/Shift+Tab, confirm that the Escape key fails to dismiss the modal, capture an interaction recording (.webm), and verify that an accessible modal (control) passes with zero findings. | Auditor successfully identified a genuine keyboard trap on /tc1/bad (#newsletter-modal), logging 1 critical finding for WCAG 2.1.2 No Keyboard Trap. Focus movement was tracked across 9 tab steps, detecting a loop of 3 elements (cycleDetected=true). Escape key was pressed but the modal remained open (modalStillOpenAfterEscape=true). Dismiss controls (#maybe-later-btn, #subscribe-btn) were activated via keyboard but failed to dismiss the dialog (dismissControlsWorked=false). Non-empty screenshot and .webm interaction recording were captured under /evidence/tc1-1792776770971/. The control page /tc1/good produced 0 findings with full keyboard exit support. | **PASS** | [keyboard-trap.png](./evidence/tc1-1792776770971/keyboard-trap.png)<br>[keyboard-trap.webm](./evidence/tc1-1792776770971/keyboard-trap.webm)<br>[official-report.json](./evidence/tc1-1792776770971/official-report.json) |
| **TC2** | `http://localhost:4000/tc2` | AA (axe, keyboard-operability) | axe-core automated scanning against /tc2 must report zero violations, while manual keyboard interaction testing identifies custom control #add-to-cart as inoperable via keyboard (unreachable by Tab, Enter/Space inactive, despite mouse click handler present). | axe-core executed with 0 violations (15 rules passed). Keyboard interaction check identified 1 failure: control #add-to-cart responds to mouse clicks (hasClickHandler=true) but is unreachable by keyboard navigation (reachableByTab=false, tabsPressed=6) and cannot be activated via Enter or Space (enterActivated=false, spaceActivated=false). Captured screenshot and .webm interaction recording under /evidence/tc2-1792776773545/. | **PASS** | [operability-0.png](./evidence/tc2-1792776773545/operability-0.png)<br>[keyboard-operability.webm](./evidence/tc2-1792776773545/keyboard-operability.webm)<br>[axe-summary.json](./evidence/tc2-1792776773545/axe-summary.json)<br>[official-report.json](./evidence/tc2-1792776773545/official-report.json) |
| **TC3** | `http://localhost:4000/tc3` | AA (contrast) | Grey text (#hero-caption) displayed over a photo background must be evaluated by sampling screenshot pixels. The measured contrast ratio must fall below the WCAG AA 4.5:1 threshold (~1.69:1) and log 1 contrast finding with pixel coordinates and screenshot evidence. | Measured contrast ratio 1.693164014892572:1 against 4.5:1 threshold on #hero-caption using screenshot background pixel sampling. Produced 1 finding for WCAG 1.4.3 Contrast (Minimum) with screenshot and annotated screenshot evidence. | **PASS** | [contrast.png](./evidence/official-tc3-1792776775333/contrast.png)<br>[contrast-annotated.png](./evidence/official-tc3-1792776775333/contrast-annotated.png)<br>[official-report.json](./evidence/official-tc3-1792776775333/official-report.json) |
| **TC4** | `http://localhost:4000/tc4` | AA (keyboard-operability) | Initial audit against /tc4 (broken state) must detect custom button #add-to-cart is not keyboard operable and log a pending issue for human review. Following fix deployment, retesting the logged issue on the exact same page using the same check must report zero violations and transition the issue to resolved. | Initial audit detected 1 finding for WCAG 2.1.1 Keyboard on #add-to-cart: control is inoperable via keyboard. Created pending issue with screenshot evidence. Issue was approved. Following fix deployment, retest completed with 0 violations and transitioned issue status to resolved. | **PASS** | [operability-0.png](./evidence/audit_1f42942a-d599-49af-aa63-f40a7b2b6b9c/operability-0.png)<br>[keyboard-operability.webm](./evidence/audit_1f42942a-d599-49af-aa63-f40a7b2b6b9c/keyboard-operability.webm)<br>[official-report.json](./evidence/audit_1f42942a-d599-49af-aa63-f40a7b2b6b9c/official-report.json)<br>[official-report.json](./evidence/audit_b84e9ba4-c25e-412c-bade-82f93c97e472/official-report.json) |

---

## Detailed Test Case Breakdown

### TC1 (PASS)

- **Record ID:** `tr_tc1_1792776770971`
- **Started:** `2026-10-23T17:32:50.971Z` | **Completed:** `2026-10-23T17:32:52.783Z`
- **Status:** `pass`
- **Expected:** A page containing an open modal dialog creates a genuine keyboard trap. The auditor must detect the trap, prove that keyboard focus cannot exit the modal via Tab/Shift+Tab, confirm that the Escape key fails to dismiss the modal, capture an interaction recording (.webm), and verify that an accessible modal (control) passes with zero findings.
- **Actual:** Auditor successfully identified a genuine keyboard trap on /tc1/bad (#newsletter-modal), logging 1 critical finding for WCAG 2.1.2 No Keyboard Trap. Focus movement was tracked across 9 tab steps, detecting a loop of 3 elements (cycleDetected=true). Escape key was pressed but the modal remained open (modalStillOpenAfterEscape=true). Dismiss controls (#maybe-later-btn, #subscribe-btn) were activated via keyboard but failed to dismiss the dialog (dismissControlsWorked=false). Non-empty screenshot and .webm interaction recording were captured under /evidence/tc1-1792776770971/. The control page /tc1/good produced 0 findings with full keyboard exit support.
- **Evidence Artifacts:**
  - [`tc1-1792776770971/keyboard-trap.png`](./evidence/tc1-1792776770971/keyboard-trap.png)
  - [`tc1-1792776770971/keyboard-trap.webm`](./evidence/tc1-1792776770971/keyboard-trap.webm)
  - [`tc1-1792776770971/official-report.json`](./evidence/tc1-1792776770971/official-report.json)

### TC2 (PASS)

- **Record ID:** `tr_tc2_1792776773545`
- **Started:** `2026-10-23T17:32:53.545Z` | **Completed:** `2026-10-23T17:32:54.599Z`
- **Status:** `pass`
- **Expected:** axe-core automated scanning against /tc2 must report zero violations, while manual keyboard interaction testing identifies custom control #add-to-cart as inoperable via keyboard (unreachable by Tab, Enter/Space inactive, despite mouse click handler present).
- **Actual:** axe-core executed with 0 violations (15 rules passed). Keyboard interaction check identified 1 failure: control #add-to-cart responds to mouse clicks (hasClickHandler=true) but is unreachable by keyboard navigation (reachableByTab=false, tabsPressed=6) and cannot be activated via Enter or Space (enterActivated=false, spaceActivated=false). Captured screenshot and .webm interaction recording under /evidence/tc2-1792776773545/.
- **Evidence Artifacts:**
  - [`tc2-1792776773545/operability-0.png`](./evidence/tc2-1792776773545/operability-0.png)
  - [`tc2-1792776773545/keyboard-operability.webm`](./evidence/tc2-1792776773545/keyboard-operability.webm)
  - [`tc2-1792776773545/axe-summary.json`](./evidence/tc2-1792776773545/axe-summary.json)
  - [`tc2-1792776773545/official-report.json`](./evidence/tc2-1792776773545/official-report.json)

### TC3 (PASS)

- **Record ID:** `tr_tc3_1792776775983`
- **Started:** `2026-10-23T17:32:55.352Z` | **Completed:** `2026-10-23T17:32:55.983Z`
- **Status:** `pass`
- **Expected:** Grey text (#hero-caption) displayed over a photo background must be evaluated by sampling screenshot pixels. The measured contrast ratio must fall below the WCAG AA 4.5:1 threshold (~1.69:1) and log 1 contrast finding with pixel coordinates and screenshot evidence.
- **Actual:** Measured contrast ratio 1.693164014892572:1 against 4.5:1 threshold on #hero-caption using screenshot background pixel sampling. Produced 1 finding for WCAG 1.4.3 Contrast (Minimum) with screenshot and annotated screenshot evidence.
- **Evidence Artifacts:**
  - [`official-tc3-1792776775333/contrast.png`](./evidence/official-tc3-1792776775333/contrast.png)
  - [`official-tc3-1792776775333/contrast-annotated.png`](./evidence/official-tc3-1792776775333/contrast-annotated.png)
  - [`official-tc3-1792776775333/official-report.json`](./evidence/official-tc3-1792776775333/official-report.json)

### TC4 (PASS)

- **Record ID:** `tr_tc4_1792776777834`
- **Started:** `2026-10-23T17:32:56.801Z` | **Completed:** `2026-10-23T17:32:57.834Z`
- **Status:** `pass`
- **Expected:** Initial audit against /tc4 (broken state) must detect custom button #add-to-cart is not keyboard operable and log a pending issue for human review. Following fix deployment, retesting the logged issue on the exact same page using the same check must report zero violations and transition the issue to resolved.
- **Actual:** Initial audit detected 1 finding for WCAG 2.1.1 Keyboard on #add-to-cart: control is inoperable via keyboard. Created pending issue with screenshot evidence. Issue was approved. Following fix deployment, retest completed with 0 violations and transitioned issue status to resolved.
- **Explanation:** The fixture page had a real accessibility failure at the initial stage: custom button #add-to-cart was not keyboard operable (WCAG 2.1.1). Fix was applied, and the auditor successfully retested the control with 0 violations and marked the issue resolved.
- **Evidence Artifacts:**
  - [`audit_1f42942a-d599-49af-aa63-f40a7b2b6b9c/operability-0.png`](./evidence/audit_1f42942a-d599-49af-aa63-f40a7b2b6b9c/operability-0.png)
  - [`audit_1f42942a-d599-49af-aa63-f40a7b2b6b9c/keyboard-operability.webm`](./evidence/audit_1f42942a-d599-49af-aa63-f40a7b2b6b9c/keyboard-operability.webm)
  - [`audit_1f42942a-d599-49af-aa63-f40a7b2b6b9c/official-report.json`](./evidence/audit_1f42942a-d599-49af-aa63-f40a7b2b6b9c/official-report.json)
  - [`audit_b84e9ba4-c25e-412c-bade-82f93c97e472/official-report.json`](./evidence/audit_b84e9ba4-c25e-412c-bade-82f93c97e472/official-report.json)

