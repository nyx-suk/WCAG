# Audit Engine Scope & Limitations

This document outlines the architectural boundaries, discovery heuristics, and explicit non-claims of the WCAG Accessibility Auditor engine.

---

## 1. No Claim of Full WCAG Compliance

> [!IMPORTANT]
> **This system does NOT claim full WCAG 2.1 or 2.2 compliance.**  
> Automated and assisted accessibility evaluation can only verify a subset of machine-testable success criteria. Comprehensive digital accessibility requires human assistive technology testing (screen readers such as NVDA, JAWS, VoiceOver), speech-to-text input, and cognitive walkthroughs. Only the specific checks executed by this engine are reported and claimed.

---

## 2. Heuristic Control & Opener Discovery

- **Keyboard Operability (WCAG 2.1.1):** Candidate interactive controls are discovered through DOM heuristics:
  - Native interactive elements (`<button>`, `<a>`, `<input>`, `<select>`, `<textarea>`).
  - ARIA interactive roles (`role="button"`, `role="link"`, `role="menuitem"`, `role="tab"`).
  - Visual/CSS indicators (e.g. `cursor: pointer`).
  - Elements with bound event listeners.
- **Boundaries:** Custom clickable controls injected dynamically after audit navigation without standard ARIA roles, pointer styles, or discoverable DOM properties may not be identified.

---

## 3. Keyboard Trap Detection Scope (WCAG 2.1.2)

- **Targeted Patterns:** Focus loops and containment are evaluated primarily on dialogs, modal overlays, flyouts, and interactive popups discovered via standard DOM dialog markers (`<dialog>`, `role="dialog"`, `aria-modal="true"`, or popup containers).
- **Distinction from Accessible Modals:** The engine explicitly tests `Escape` dismissal and control buttons. Accessible modals that trap focus while open but close cleanly on `Escape` and restore focus to opener controls are verified as compliant and not flagged as traps.
- **Boundaries:** Focus traps created inside non-dialog embedded objects (e.g. `<canvas>`, third-party `<iframe>` widgets, WebGL contexts, or Flash/Silverlight legacy embeds) fall outside standard DOM traversal.

---

## 4. Visual Contrast Pixel Sampling Scope (WCAG 1.4.3)

- **Targeted Patterns:** Designed specifically to audit text elements rendered over complex backgrounds, SVG graphics, or photographic images that automated DOM tools (such as static CSS color analyzers) cannot accurately compute.
- **Methodology:** Captures element screenshots, samples 5x5 pixel grids at computed foreground and background coordinates, and derives relative luminance using standard sRGB transfer functions.
- **Boundaries:** Contrast verification is limited to the identified target text elements and their immediate background sample coordinates. It does not perform continuous full-screen contrast profiling across CSS animated gradients, rotating video backgrounds, or canvas animations.

---

## 5. Partial AAA axe-core Coverage

- Conformance Level AAA coverage relies on the rule mappings available in `@axe-core/playwright`.
- While Levels A and AA have robust automated coverage, many WCAG AAA success criteria (such as reading level, sign language, pronunciation, and contextual help) require editorial, pedagogical, and cognitive human review and cannot be evaluated deterministically by automated scanners.

---

## 6. Execution Truth & Traceability

- Every audit result explicitly separates `checksPlanned` from `checksExecuted`.
- If a check fails, times out, or cannot run, the overall audit status is marked as `incomplete` or `error`.
- An incomplete or failed audit never resolves an open issue during retests.
