import test from "node:test";
import assert from "node:assert/strict";
import { makeFingerprint } from "../engine/fingerprint";

test("makeFingerprint produces deterministic 16-hex fingerprints", () => {
  const fp1 = makeFingerprint("axe", "https://example.com/test", "#submit-btn");
  const fp2 = makeFingerprint("axe", "https://example.com/test", "#submit-btn");

  // Identical inputs produce identical fingerprints
  assert.equal(fp1, fp2);
  assert.match(fp1, /^[0-9a-f]{16}$/);
});

test("makeFingerprint ignores URL hash fragments", () => {
  const fpWithoutHash = makeFingerprint("keyboard-trap", "http://localhost:4000/tc1", ".modal");
  const fpWithHash = makeFingerprint("keyboard-trap", "http://localhost:4000/tc1#open", ".modal");

  assert.equal(fpWithoutHash, fpWithHash);
});

test("changing selector changes the fingerprint", () => {
  const fpA = makeFingerprint("axe", "https://example.com/test", "#button-a");
  const fpB = makeFingerprint("axe", "https://example.com/test", "#button-b");

  assert.notEqual(fpA, fpB);
});

test("changing checkId changes the fingerprint", () => {
  const fpA = makeFingerprint("axe", "https://example.com/test", "#button");
  const fpB = makeFingerprint("keyboard-operability", "https://example.com/test", "#button");

  assert.notEqual(fpA, fpB);
});
