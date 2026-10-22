import test from "node:test";
import assert from "node:assert/strict";
import { startFixtureServer, stopFixtureServer, resetFixtureState } from "../fixtures/server";
import { runAudit, setContrastModuleStub, resetContrastModulePath } from "../engine/runAudit";
import { makeFingerprint } from "../engine/fingerprint";
import type { AuditFinding } from "../engine/types";

const port = 4131;

test("runAudit fingerprints: all checks produce stable 16-hex fingerprints across repeated runs", async (t) => {
  const server = startFixtureServer(port);
  await new Promise((resolve) => setTimeout(resolve, 50));
  t.after(async () => {
    resetFixtureState();
    await stopFixtureServer(server);
  });

  resetFixtureState(); // tc2 broken

  // 1. Repeated runs on TC2 (keyboard-operability)
  const tc2Run1 = await runAudit({
    auditId: "tc2-fp-run1",
    url: `http://localhost:${port}/tc2`,
    wcagLevel: "AA",
    checks: ["keyboard-operability"],
  });
  const tc2Run2 = await runAudit({
    auditId: "tc2-fp-run2",
    url: `http://localhost:${port}/tc2`,
    wcagLevel: "AA",
    checks: ["keyboard-operability"],
  });

  assert.equal(tc2Run1.findings.length, 1);
  assert.equal(tc2Run2.findings.length, 1);
  const tc2Fp1 = tc2Run1.findings[0]!.fingerprint;
  const tc2Fp2 = tc2Run2.findings[0]!.fingerprint;

  assert.match(tc2Fp1, /^[0-9a-f]{16}$/, "Fingerprint must be 16-character hex string");
  assert.equal(tc2Fp1, tc2Fp2, "Repeated TC2 runs must yield identical fingerprints");

  // 2. Repeated runs on TC1 Bad (keyboard-trap)
  const tc1Run1 = await runAudit({
    auditId: "tc1-fp-run1",
    url: `http://localhost:${port}/tc1/bad`,
    wcagLevel: "AA",
    checks: ["keyboard-trap"],
  });
  const tc1Run2 = await runAudit({
    auditId: "tc1-fp-run2",
    url: `http://localhost:${port}/tc1/bad`,
    wcagLevel: "AA",
    checks: ["keyboard-trap"],
  });

  assert.equal(tc1Run1.findings.length, 1);
  assert.equal(tc1Run2.findings.length, 1);
  const tc1Fp1 = tc1Run1.findings[0]!.fingerprint;
  const tc1Fp2 = tc1Run2.findings[0]!.fingerprint;

  assert.match(tc1Fp1, /^[0-9a-f]{16}$/, "Keyboard trap fingerprint must be 16-character hex string");
  assert.equal(tc1Fp1, tc1Fp2, "Repeated TC1 runs must yield identical fingerprints");

  // 3. Repeated runs on TC3 (contrast)
  const tc3Run1 = await runAudit({
    auditId: "tc3-fp-run1",
    url: `http://localhost:${port}/tc3`,
    wcagLevel: "AA",
    checks: ["contrast"],
  });
  const tc3Run2 = await runAudit({
    auditId: "tc3-fp-run2",
    url: `http://localhost:${port}/tc3`,
    wcagLevel: "AA",
    checks: ["contrast"],
  });

  assert.equal(tc3Run1.findings.length, 1);
  assert.equal(tc3Run2.findings.length, 1);
  const tc3Fp1 = tc3Run1.findings[0]!.fingerprint;
  const tc3Fp2 = tc3Run2.findings[0]!.fingerprint;

  assert.match(tc3Fp1, /^[0-9a-f]{16}$/, "Contrast fingerprint must be 16-character hex string");
  assert.equal(tc3Fp1, tc3Fp2, "Repeated TC3 runs must yield identical fingerprints");

  // 4. Distinct fingerprints for different checks / selectors
  assert.notEqual(tc2Fp1, tc1Fp1, "Different checks/pages must produce distinct fingerprints");
  assert.notEqual(tc2Fp1, tc3Fp1, "Different checks/pages must produce distinct fingerprints");
  assert.notEqual(tc1Fp1, tc3Fp1, "Different checks/pages must produce distinct fingerprints");
});

test("runAudit fingerprints: deduplicates duplicate findings while preserving first occurrence and order", async (t) => {
  const server = startFixtureServer(port + 1);
  await new Promise((resolve) => setTimeout(resolve, 50));
  t.after(async () => {
    resetContrastModulePath();
    await stopFixtureServer(server);
  });

  const fpA = makeFingerprint("contrast", `http://localhost:${port + 1}/tc3`, "#hero-caption");
  const fpB = makeFingerprint("contrast", `http://localhost:${port + 1}/tc3`, "#other-caption");

  // Stub contrast check to return three findings with a duplicate of fpA
  setContrastModuleStub({
    runContrastCheck: async (): Promise<AuditFinding[]> => [
      {
        title: "First finding A",
        description: "Original finding A description",
        wcagRule: "1.4.3 Contrast (Minimum)",
        severity: "serious",
        source: "contrast",
        checkId: "contrast",
        fingerprint: fpA,
        selector: "#hero-caption",
        evidence: {},
      },
      {
        title: "Finding B",
        description: "Distinct finding B",
        wcagRule: "1.4.3 Contrast (Minimum)",
        severity: "moderate",
        source: "contrast",
        checkId: "contrast",
        fingerprint: fpB,
        selector: "#other-caption",
        evidence: {},
      },
      {
        title: "Duplicate finding A",
        description: "Duplicate finding with same fpA should be omitted",
        wcagRule: "1.4.3 Contrast (Minimum)",
        severity: "minor",
        source: "contrast",
        checkId: "contrast",
        fingerprint: fpA,
        selector: "#hero-caption",
        evidence: {},
      },
    ],
  });

  const result = await runAudit({
    auditId: "dedup-test",
    url: `http://localhost:${port + 1}/tc3`,
    wcagLevel: "AA",
    checks: ["contrast"],
  });

  // Verify deduplication: 3 findings reduced to 2 unique findings
  assert.equal(result.findings.length, 2, "Duplicate findings must be filtered out");
  assert.equal(result.findings[0]?.fingerprint, fpA);
  assert.equal(result.findings[0]?.title, "First finding A", "Must preserve the first occurrence");
  assert.equal(result.findings[1]?.fingerprint, fpB);
  assert.equal(result.findings[1]?.title, "Finding B", "Must preserve the second distinct finding");
});
