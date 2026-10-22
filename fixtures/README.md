# Audit Engine Fixtures

Testbed for validating automated scanning, keyboard operability, and trap detection.

## 1. Running the Server

Start the fixture server on `http://localhost:4000` (override with `FIXTURE_PORT`):
```bash
npm run fixtures
```

- **TC1 Bad:** `http://localhost:4000/tc1/bad`
- **TC1 Good:** `http://localhost:4000/tc1/good`
- **TC2:** `http://localhost:4000/tc2` (serves broken or fixed based on in-memory state)
- **TC3:** `http://localhost:4000/tc3`
- **TC4:** `http://localhost:4000/tc4` (serves broken or fixed based on in-memory state)

## 2. Fixture Mechanisms & Line References

### TC1: Modal Keyboard Trap vs. Accessible Modal
- **Bad (`tc1-bad.html`):**
  - **Trap loop:** L243–L259 traps `Tab`/`Shift+Tab` strictly within dialog elements.
  - **Escape ignored:** L260 intentionally omits `Escape` key handling.
  - **Mousedown dismissal:** L223–L231 binds button dismissal only to `mousedown`. Keyboard activation (`Enter`/`Space`) never triggers `mousedown`, preventing keyboard escape.
  - **Mouse exit:** L234–L238 allows mouse users to exit via backdrop `mousedown`.
- **Good (`tc1-good.html`):**
  - **Escape support:** L236–L240 dismisses modal on `Escape` and restores focus to opener (L215).
  - **Keyboard dismissal:** L222 binds standard `click` listener to "Maybe later", operable via `Enter`/`Space` and restoring opener focus (L215).

### TC2: Div Styled as Button vs. Native Button
- **Broken (`tc2-broken.html`):**
  - **Inaccessible control:** L208 defines `<div id="add-to-cart" class="btn btn-primary">`.
  - **Missing semantics:** L230–L232 attaches click handler to the `div`. Lacks `role="button"`, `tabindex="0"`, and key handlers. Yields 0 axe violations, yet is unreachable by keyboard.
- **Fixed (`tc2-fixed.html`):**
  - **Semantic button:** L206 uses native `<button type="button" id="add-to-cart" class="btn btn-primary">`, natively focusable and keyboard-operable.

## 3. Toggling TC2 State via cURL

```bash
# Toggle TC2 to fixed
curl -X POST http://localhost:4000/__state/tc2 -H "Content-Type: application/json" -d '{"fixed":true}'

# Check current state
curl http://localhost:4000/__state/tc2

# Reset back to broken
curl -X POST http://localhost:4000/__state/reset
```

## 4. Toggling TC4 State via cURL

```bash
# Toggle TC4 to fixed
curl -X POST http://localhost:4000/__state/tc4 -H "Content-Type: application/json" -d '{"fixed":true}'

# Check current state
curl http://localhost:4000/__state/tc4

# Reset back to broken
curl -X POST http://localhost:4000/__state/reset
```

## 5. Expected Auditor Findings

| Fixture Page | Expected Findings | Target WCAG Rules | Outcome |
| :--- | :--- | :--- | :--- |
| **TC1 Bad** (`/tc1/bad`) | 1 finding (Critical) | **WCAG 2.1.2** No Keyboard Trap | Failure with video recording |
| **TC1 Good** (`/tc1/good`) | 0 findings | — | Pass (containment + escape) |
| **TC2 Broken** (`/tc2`) | 2 findings (Serious) | **WCAG 2.1.1** Keyboard, **WCAG 4.1.2** Name, Role, Value | Failure with element evidence |
| **TC2 Fixed** (`/tc2`) | 0 findings | — | Pass (axe-clean & operable) |
| **TC3** (`/tc3`) | 1 finding (Serious) | **WCAG 1.4.3** Contrast (Minimum) | Failure with screenshot-pixel evidence |
| **TC4 Broken** (`/tc4`) | 1 finding (Serious) | **WCAG 2.1.1** Keyboard | Failure with keyboard evidence |
| **TC4 Fixed** (`/tc4`) | 0 findings | — | Pass after retest |
