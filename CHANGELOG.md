# Changelog

All notable changes to the **WCAG Accessibility Auditor** project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.0.0-submission] - 2026-10-23

### Added
- **Core Audit Engine (`engine/`):**
  - Central `runAudit` orchestrator supporting WCAG conformance levels A, AA, and AAA.
  - Automated `axe-core` scanner mapping rule tags to standard WCAG rule numbers with 16-hex deterministic SHA-256 fingerprints.
  - Dynamic keyboard trap detection (WCAG 2.1.2) distinguishing legitimate modal focus containment from genuine traps via `Escape` key and control dismissal testing.
  - Manual keyboard operability verification (WCAG 2.1.1) simulating Tab, Enter, and Space navigation against custom controls and button-styled elements.
  - Visual contrast pixel sampler (WCAG 1.4.3) computing real relative luminance and contrast ratios over photographic and SVG backgrounds.
  - 4-step agent workflow (§9.1): Collect, Plan, Find, and Act with human review.
- **REST API & Dual Persistence (`src/`):**
  - Standalone Express server integrating API, dashboard UI, and fixture endpoints on a single port.
  - SQLite persistence via `sql.js` (`data/auditor.sqlite`) tracking audits, issues, status transitions, and test runs.
  - JSON evidence synchronization (`test-runs.json`, `/evidence/<auditId>/official-report.json`).
  - Proposed findings gate (FR-06) requiring explicit Approve/Reject before logging issues.
  - Retest workflow (FR-08) supporting isolated check execution and side-by-side before/after comparison.
- **Single-Container Dashboard (`public/`):**
  - Lightweight, dependency-free web dashboard with 0 axe violations.
  - Live 4-step workflow timeline, video player for `.webm` recordings, and screenshot preview.
  - 1-click quick-fill fixture buttons with dynamic `PUBLIC_BASE_URL` resolution.
- **Official Test Cases & Verification Suite (`scripts/`):**
  - TC1: Modal keyboard trap detection with `.webm` interaction recording.
  - TC2: Custom div button missed by axe-core (0 violations) detected by manual keyboard operability check.
  - TC3: Text contrast failure (1.69:1 vs 4.5:1) detected over photographic background with annotated evidence.
  - TC4: Retest lifecycle verification ensuring failed/broken retests keep issues open and fixed pages resolve them.
  - Flake hardening suite (`scripts/repeat.ts`) achieving 10/10 PASS across all test cases with 0% metric variance.
- **Deployment & Containerization:**
  - Production `Dockerfile` based on `mcr.microsoft.com/playwright:v1.49.1-jammy` with non-root security (`pwuser`) and `/health` healthcheck.
  - Hardened Chromium flags (`--no-sandbox`, `--disable-dev-shm-usage`) for containerized video capture.
  - Production `fly.toml` pre-configured for Fly.io with 2048 MB RAM.

### Fixed
- Aligned TC4 test run status semantics: detecting defects on broken pages is recorded as `pass` for the auditor, with clear failure explanations.
- Added cross-device `copyFile` fallback in `finalizeVideo` to eliminate filesystem race conditions during video recording capture.

### Security & Boundaries
- Published honest scope and boundaries in `engine/LIMITATIONS.md`.
- Explicitly stated that only executed checks are reported and no claim of full WCAG compliance is made.
