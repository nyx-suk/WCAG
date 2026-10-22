## Phase-Wise Person Assignment

## Project: WCAG Accessibility Auditor — Ziro.Digital Agen- tic AI Hackathon 2026

This assignment divides work by project phases, not by frontend/backend own- ership. Person A and Person B should coordinate through the shared interface below.

## Phase 1 — Project Setup and Testbed

Person A - Create or prepare the TC1 and TC2 test pages. - Set up Playwright

browser automation for keyboard interactions and recordings. - Document how each fixture should reproduce the expected accessibility failure.

Person B - Set up the repository structure, dependencies, and basic run

instructions. - Prepare TC3 and TC4 test pages and define the SQLite schema for audit runs and findings. - Agree with Person A on the data contract before implementation.

Together - Confirm the official test cases, expected outcomes, and evidence

required. - Keep the fixtures reproducible and easy to run locally.

## Phase 2 — Build the Audit Capabilities

Person A - Implement axe-core automated checks. - Implement keyboard checks

for focus movement, modal behavior, and genuine keyboard traps. - Capture relevant keyboard recordings or screenshots for TC1 and TC2.

Person B - Implement screenshot-based contrast sampling for TC3, including

pixel sampling over the actual image background. - Define a consistent evidence format for findings. - Plan how TC4 retests will compare the same page and checks before and after a fix.

Together - Review findings so they are understandable and traceable to evidence.

\- Remember: focus containment inside an open modal is normally expected; TC1 must show a genuine inability to exit the trap.

## Phase 3 — Assemble the Auditor

Person A - Combine the automated and keyboard checks into the audit runner.

\- Implement the runAudit flow and handle browser/check failures clearly. - Return findings in the agreed format.

Person B - Connect audit runs and findings to SQLite persistence. - Implement

issue review/status handling and the approval step before logging issues. - Add the retest flow and preserve the link between original and retest results.

## Shared interface proposal


```
type AuditInput = {
url: string;
wcagLevel: "A" | "AA" | "AAA";
auditId: string;
};
type AuditFinding = {
title: string;
description: string;
wcagRule: string;
severity: string;
source: string;
screenshot?: string;
recording?: string;
evidence: unknown;
};
function runAudit(input: AuditInput): Promise<AuditFinding[]>;
```

This is a proposed contract to coordinate implementation; it is not a claim that the code already exists.

## Phase 4 — Run the Official Test Cases

Person A - Run TC1: keyboard trap/modal focus scenario and capture the required recording. - Run TC2: axe-core-clean page with a manual keyboard failure, such as a non-interactive div styled as a button. - Record input, expected result, actual result, and evidence.

Person B - Run TC3: grey text over a photo and verify contrast using screenshot pixel sampling. - Run TC4: deploy the fix, retest the same page and checks, and close the issue only if it passes. - Record input, expected result, actual result, and evidence.

Together - Review all four cases against the official requirements. - Fix false positives, missing evidence, or incorrect pass/fail decisions.

## Phase 5 — Integration, Demo, and Submission

Person A - Fix critical audit-engine issues. - Freeze the engine only after the test cases are reproducible. - Rehearse explaining how each finding was detected and evidenced.

Person B - Verify the complete application flow, README, presentation, and deployment. - Ensure the submission includes source evidence and TC1–TC4 inputs/results/evidence.

Together - Run the complete demo from a clean start. - Confirm the deployed


agent works and the retest workflow is demonstrated. - Package the source, presentation, and required evidence.

## Shared Working Rules

- Work phase-by-phase and agree on interfaces before parallel implementa- tion.

- Keep evidence attached to each finding and test run.

- Do not mark TC4 resolved unless the same page/checks pass after the fix.

- The hackathon blueprint does not specify a final submission cutoff; confirm the portal deadline separately.
