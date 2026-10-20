## PRODUCT REQUIREMENTS DOCUMENT (PRD)

## WCAG Accessibility Auditor

Event: Agentic AI Hackathon 2026 — Powered by Ziro.Digital

Industry: Developer & Enterprise AI

Project Type: AI-powered web accessibility auditing agent

Document Status: Draft for implementation

Version: 1.0

Prepared: October 20, 2026

Team: Two human builders with ChatGPT as technical copilot

## 1. Executive Summary

The WCAG Accessibility Auditor is an AI-assisted web accessibility auditing agent designed to identify accessibility issues on website pages, provide supporting evidence, and verify whether issues have been resolved after a fix.

The product combines automated accessibility checks with browser-based key- board interaction testing and visual contrast analysis. Unlike a solution that relies only on automated rule scanning, the auditor is designed to identify is- sues that require interaction or visual inspection, including keyboard-inoperable controls and text displayed over photographic backgrounds.

The agent follows a structured workflow: collect audit details, plan checks, inspect website pages, and present proposed findings for human approval before logging issues. Each finding should be traceable to its source and evidence.

The product must also support a retest workflow that audits the same page using the same checks after a fix. An issue should be marked resolved or closed only when the retest passes.

## 2. Problem Statement

Website accessibility issues can prevent people with disabilities from using essential website features. Automated accessibility scanners can identify many rule-based problems, but they may not detect every failure involving keyboard operation, interaction behavior, or text contrast over complex visual backgrounds.

The hackathon problem requires a working agent that audits website pages, produces an issue list with screenshots, and demonstrates retesting after a fix.

## 2.1 Product Opportunity

Build an auditor that: - Combines automated accessibility scanning with key- board interaction checks. - Examines visual contrast using screenshot pixels


when CSS values alone are insufficient. - Produces actionable findings with evidence. - Keeps a human in control of issue approval. - Verifies fixes through repeatable retests.

## 3. Product Goals and Success Criteria

## 3.1 Goals

- 1. Audit a website page against a selected WCAG conformance level.

- 2. Identify accessibility problems through automated, keyboard, and visual checks.

- 3. Capture evidence for detected issues.

- 4. Present findings for human review and approval.

- 5. Retest a previously reported issue after a fix.

- 6. Preserve test inputs, expected outcomes, actual outcomes, and evidence for TC1–TC4.

- 7. Provide a deployed, demonstrable working agent for the hackathon.

## 3.2 Success Criteria

The MVP is successful when: - All four official test cases can be executed and

their results demonstrated. - TC1 produces evidence of a genuine keyboard trap. - TC2 reports a keyboard failure even when axe-core reports no violations. -

TC3 measures contrast using actual screenshot background pixels. - TC4 retests the same page and checks, and closes an issue only when passing. - Findings and evidence remain accessible after an audit and can be reviewed. - The deployed application can be demonstrated from a clean start.

## 4. Target Users

## Primary User: Developer or Website Maintainer

A developer who wants to identify accessibility issues on a website, understand the evidence, and verify fixes.

## Secondary User: Hackathon Evaluator

A judge or evaluator who needs to inspect the working agent, understand how issues were detected, and verify the official test cases.

## 5. Scope

## 5.1 In Scope — MVP

- Website URL and WCAG level input.

- Audit run creation and tracking.

- Browser-based page inspection.

- axe-core automated accessibility checks.


- Keyboard interaction testing.

- Visual contrast analysis for text over images.

- Screenshot and recording evidence capture.

- Finding review and human approval.

- Issue persistence and status tracking.

- Retesting and before/after evidence.

- TC1, TC2, TC3, and TC4 test execution.

- Deployed application and project documentation.

## 5.2 Out of Scope

- Full remediation or automatic modification of third-party websites.

- Guaranteed auditing of every page on an entire website.

- Bypassing authentication, OTP, CAPTCHA, or access restrictions.

- Automatically closing issues without a passing retest.

- Claiming complete WCAG compliance based solely on a limited audit.

- Unreviewed actions that cannot easily be undone.

## 6. User Workflow

## Step 1 — Collect Audit Details

The user provides: - Target website URL or page URLs. - Desired WCAG conformance level: A, AA, or AAA. - Optional crawl scope or depth, if supported.

The system creates a unique audit run.

## Step 2 — Plan the Audit

The agent selects applicable checks based on the requested audit and available page features. The planned checks include: - axe-core rule scanning. - Keyboard interaction testing. - Visual contrast analysis for text over images. The system should record which checks were planned and which were actually

executed.

## Step 3 — Inspect the Website

The browser automation layer navigates the target page and collects relevant information. It may: - Inspect the DOM. - Identify interactive elements. - Simulate keyboard input. - Capture screenshots. - Record browser interactions. - Identify text

elements requiring visual contrast analysis.


## Step 4 — Present Findings for Human Approval

The auditor displays proposed issues with descriptions and evidence. The user can: - Approve a proposed issue. - Reject a proposed issue. - Edit or clarify a finding before logging it. Issues should not be committed to the approved issue log before human approval.

## Step 5 — Retest After a Fix

The user selects a logged issue and triggers a retest. The agent re-audits the same page using the same relevant checks. - If the issue passes the retest, mark it RESOLVED or CLOSED. - If the issue still fails, keep it OPEN and attach updated evidence. The product should preserve the initial result, retest result, and status transition history.

## 7. Functional Requirements

## FR-01 — Audit Input

The system shall accept a website URL and a WCAG conformance level of A, AA, or AAA. The system shall create a unique identifier for each audit run.

## FR-02 — Automated Accessibility Checks

The system shall execute axe-core checks through browser automation. For each finding, the system should capture: - Rule identifier or WCAG reference, where available. - Description. - Severity. - Source of detection. - Relevant page and element information. - Supporting evidence.

## FR-03 — Keyboard Interaction Testing

The system shall simulate keyboard navigation using relevant keys, including Tab, Shift+Tab, Enter, and Escape. The system shall track focus movement and determine whether relevant controls can be operated using a keyboard. It shall distinguish a genuine keyboard trap from expected focus containment inside a modal. A modal that correctly contains focus while open is not auto- matically a failure.


## FR-04 — Visual Contrast Analysis

The system shall identify text elements that appear over image backgrounds and capture a screenshot of the relevant page.

For the contrast check, it shall: 1. Identify the text element and its bounding box. 2. Sample pixels from the actual background behind the text. 3. Calculate relative luminance and contrast ratio. 4. Compare the measured ratio with the applicable threshold. 5. Capture evidence showing the sampled region and computed result.

The system shall not rely only on CSS background-color when the actual background is a photograph.

For WCAG AA checks, the implementation shall use these thresholds: - Normal text: at least 4.5:1. - Large text: at least 3:1.

## FR-05 — Evidence Collection

The system shall collect relevant evidence for findings, including: - Screenshots.

- \- Browser recordings where required. - Source URL. - Audit or test run identifier.

- \- Relevant detection details. - Contrast samples and computed ratios, where applicable.

Evidence should be linked to the finding and remain available for review.

## FR-06 — Finding Review and Approval

The system shall display proposed findings before logging them.

The user shall be able to approve or reject a proposed finding. The system shall avoid duplicate issue logging when an audit or approval action is retried.

## FR-07 — Issue Dashboard

The system shall display issues with information such as: - Title and description. - WCAG rule or reference. - Severity. - Detection source. - Current status. - Evidence preview. - Associated audit run.

## FR-08 — Retest and Verification

The system shall allow a user to trigger a retest for a logged issue.

The retest shall use: - The same target page. - The same relevant checks. - The original issue as the comparison reference.

The system shall store before-and-after results and evidence.

The system shall not close an issue if the retest fails or cannot be completed successfully.


## FR-09 — Test Case Tracking

The system shall support four labelled test case runs: TC1, TC2, TC3, and TC4. For each run, it shall preserve: - Input. - Expected result. - Actual result. - Evidence. - Pass/fail status. - Explanation when actual results differ from expected results.

## 8. Official Test Case Requirements

## TC1 — Modal Traps Keyboard Focus

Scenario: A page contains a modal or interaction that creates a genuine keyboard trap.

Expected behavior: The auditor identifies the keyboard trap and logs a finding

with a browser recording.

Test procedure: 1. Navigate to the test page. 2. Open the modal or relevant interaction using the keyboard. 3. Press Tab repeatedly and track the active element. 4. Determine whether keyboard focus is genuinely trapped. 5. Check whether Escape or another supported keyboard action allows the user to exit. 6. Capture the interaction recording. 7. Present the finding and evidence for approval.

Acceptance criterion: The finding must demonstrate inability to leave the

trap through keyboard interaction, not merely correct focus containment within an open modal.

## TC2 — Automated Tool Passes but Manual Check Fails

Scenario: axe-core reports zero violations, but a keyboard interaction reveals a failure.

Expected behavior: The auditor still reports the failure.

Test procedure: 1. Run axe-core against the fixture page. 2. Confirm that the automated scan reports zero violations. 3. Simulate keyboard interaction. 4. Identify a control, such as a non-interactive div styled as a button, that cannot be activated by keyboard. 5. Capture the keyboard failure. 6. Present the automated pass and keyboard failure together.

Acceptance criterion: The auditor reports the keyboard failure despite the

clean automated scan, with evidence supporting the discrepancy.

## TC3 — Grey Text on Photo Background

Scenario: Grey text is displayed over a photographic background.

Expected behavior: The auditor measures contrast against the actual back- ground pixels and reports the result.


Test procedure: 1. Identify text elements overlaying an image. 2. Capture

a screenshot. 3. Obtain the text bounding box. 4. Sample pixels from the background region behind the text. 5. Calculate the contrast ratio. 6. Compare the ratio against the applicable WCAG AA threshold. 7. Capture an annotated screenshot and computed contrast result.

Acceptance criterion: The result must be based on screenshot pixel sampling

rather than only CSS background properties.

## TC4 — Fix Deployed and Retested

Scenario: A previously logged accessibility issue has been fixed.

Expected behavior: The issue is retested on the same page and closed only if

it passes.

Test procedure: 1. Run an initial audit and log an approved issue. 2. Apply

a fix to the test page. 3. Trigger a retest from the issue dashboard. 4. Re-audit the exact same page using the same relevant checks. 5. Compare the initial and retest results. 6. Store the evidence and status transition.

Acceptance criterion: - Passing retest: issue becomes RESOLVED or CLOSED. -

Failing retest: issue remains OPEN with updated evidence. - Incomplete or failed retest: issue must not be marked resolved.

## 9. Proposed Technical Architecture

## 9.1 Components

## Dashboard

Provides the audit input form, issue viewer, human approval interface, and retest view.

## Backend API

Receives audit requests, coordinates the workflow, stores findings, and exposes audit and issue status.

## Agent Orchestrator

Coordinates the four-step process: collect, plan, find, and act.

## Audit Engine

Includes: - axe-core scanner. - Keyboard interaction agent. - Visual contrast analyzer. - Evidence collector. - Retest runner.

## Persistence Layer

Stores audit runs, findings, retests, and test case runs.


## 9.2 Proposed Technology Stack

| Layer | Proposed Technology |
| --- | --- |
| Runtime | Node.js |
| Language | TypeScript |
| Browser automation | Playwright with Chromium |
| Accessibility scanner | axe-core / @axe-core/playwright |
| Backend | Express.js |
| Dashboard | React / Next.js |
| Styling | Tailwind CSS |
| Database | SQLite |
| Pixel analysis | Canvas API or Sharp |
| Optional AI integration OpenAI or Gemini API |   |
| Deployment | Docker or a suitable web deployment platform |

The stack is a proposed implementation choice based on the blueprint’s suggested tools. Optional AI integration should not be treated as a prerequisite for the core checks.

## 10. Data Requirements

## 10.1 Audit Run

An audit record should contain: - Audit ID. - Target URL. - WCAG level. - Status. - Start and completion timestamps.

## 10.2 Issue

An issue record should contain: - Issue ID. - Associated audit ID. - Title and description. - WCAG rule or reference. - Severity. - Detection source. - Status. - Evidence. - Screenshot or recording reference. - Approval information. - Creation timestamp.

## 10.3 Retest

A retest record should contain: - Retest ID. - Associated issue ID. - Result: PASS or FAIL. - Evidence. - Screenshot reference. - Timestamp.

## 10.4 Test Run

A test run should contain: - Test run ID. - Test case identifier. - Input. - Expected result. - Actual result. - Evidence. - Status. - Explanation of any discrepancy.


## 11. Proposed API Requirements

| Method Endpoint |   | Purpose |
| --- | --- | --- |
| POST | /api/audit | Start a new audit |
| GET | /api/audit/:id | Retrieve audit status and summary |
| GET | /api/audit/:id/issues | List issues from an audit |
| POST | /api/issues/:id/approve | Approve an issue |
| POST | /api/issues/:id/reject | Reject a proposed issue |
| POST | /api/issues/:id/retest | Trigger issue retest |
| GET | /api/test-runs | List TC1–TC4 runs |
| POST | /api/test-runs/:tc/execute | Execute a test case scenario |

These endpoints describe the intended API surface and must be implemented and verified during development.

## 12. Non-Functional Requirements

## Reliability

- The system should handle browser navigation failures and timeouts without reporting them as successful audits.

- Failed or incomplete checks should be clearly identified.

- Repeated requests should not create misleading duplicate findings.

## Traceability

- Each finding must be linked to an audit run and its evidence.

- Each retest must be linked to the original issue.

- Status changes should preserve an audit trail.

## Usability

- Audit inputs should be clear and simple.

- Findings should explain the issue and why it matters.

- Evidence should be viewable from the issue dashboard.

- Test results should clearly distinguish pass, fail, and incomplete execution.

## Safety

- Human approval is required before committing proposed issues.

- Use mock or synthetic data when a workflow involves personal or sensitive information.

- Do not bypass OTP or CAPTCHA.

- Do not claim full WCAG compliance from a limited set of checks.


## 13. MVP Acceptance Criteria

The MVP shall be considered ready for demonstration when:

- The deployed application accepts a URL and WCAG level.

- A unique audit run is created.

- axe-core checks execute and return findings.

- Keyboard checks execute and produce evidence.

- TC1 demonstrates and records a genuine keyboard trap.

- TC2 reports a keyboard failure even when axe-core is clean.

- TC3 samples screenshot pixels and calculates contrast.

- Findings are presented for human approval.

- Approved findings are persisted and visible in the dashboard.

- TC4 retests the same page and checks after a fix.

- TC4 closes an issue only when the retest passes.

- Inputs, expected outcomes, actual outcomes, and evidence are preserved for TC1–TC4.

- A complete end-to-end demo can be run and explained.

## 14. Risks and Mitigations

| Risk | Impact | Mitigation |
| --- | --- | --- |
| axe-core misses a | Medium | Add keyboard |
| keyboard failure |   | interaction checks |
| Browser automation | High | Add timeouts, error |
| fails on complex pages |   | handling, and |
|   |   | reproducible local |
|   |   | fixtures |
| Contrast analysis is | Medium | Sample multiple relevant |
| inaccurate on complex |   | background pixels and |
| backgrounds |   | preserve the sampled |
|   |   | evidence |
| Website access is | Medium | Use the local demo |
| blocked |   | testbed and permitted |
|   |   | targets |
| Time pressure | High | Prioritize official test |
|   |   | cases and working |
|   |   | evidence before visual |
|   |   | polish |
| Optional LLM service is | Medium | Keep core audit checks |
| unavailable |   | functional without LLM |
|   |   | calls |

## 15. Hackathon Deliverables

The final submission must include:


- 1. A deployed, working AI agent.

- 2. Source evidence.

- 3. A presentation.

- 4. TC1–TC4 test inputs, results, and evidence.

The presentation should explain the problem, agent workflow, technical imple- mentation, official test case results, and the retest demonstration.

## 16. Project Completion Definition

The project is complete when the auditor is deployed and demonstrable, the four official test cases have been executed with evidence, human approval is implemented for issue logging, and the retest workflow correctly verifies fixes without closing unresolved issues.

The product must show not only that an accessibility issue can be detected, but also how it was detected, what evidence supports it, and whether the same check passes after a fix.
