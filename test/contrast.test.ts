import test from "node:test";
import assert from "node:assert/strict";
import { contrastRatio, getAaThreshold } from "../engine/contrast";

test("black and white have a 21:1 contrast ratio", () => {
  assert.equal(contrastRatio({ r: 0, g: 0, b: 0 }, { r: 255, g: 255, b: 255 }), 21);
});

test("identical colors have a 1:1 contrast ratio", () => {
  assert.equal(contrastRatio({ r: 128, g: 128, b: 128 }, { r: 128, g: 128, b: 128 }), 1);
});

test("AA thresholds distinguish large and normal text", () => {
  assert.equal(getAaThreshold("large"), 3);
  assert.equal(getAaThreshold("normal"), 4.5);
});
