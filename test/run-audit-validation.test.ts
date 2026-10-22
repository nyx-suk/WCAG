import test from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { runAudit } from "../engine/runAudit";
import { ValidationError } from "../engine/errors";
import type { AuditInput, CheckId } from "../engine/types";

test("runAudit validation: auditId rules reject before launching Chromium", async (t) => {
  const launchSpy = t.mock.method(chromium, "launch");

  // Empty string
  await assert.rejects(
    () => runAudit({ auditId: "", url: "http://localhost:4000/tc2", wcagLevel: "AA" }),
    (err: unknown) => {
      assert.ok(err instanceof ValidationError, `Expected ValidationError, got ${err}`);
      assert.match((err as Error).message, /auditId/i);
      return true;
    }
  );

  // Whitespace only
  await assert.rejects(
    () => runAudit({ auditId: "   ", url: "http://localhost:4000/tc2", wcagLevel: "AA" }),
    (err: unknown) => {
      assert.ok(err instanceof ValidationError);
      assert.match((err as Error).message, /auditId/i);
      return true;
    }
  );

  // Untrimmed (leading/trailing spaces)
  await assert.rejects(
    () => runAudit({ auditId: " audit-1 ", url: "http://localhost:4000/tc2", wcagLevel: "AA" }),
    (err: unknown) => {
      assert.ok(err instanceof ValidationError);
      assert.match((err as Error).message, /auditId/i);
      return true;
    }
  );

  // Exceeds 100 characters
  const longId = "a".repeat(101);
  await assert.rejects(
    () => runAudit({ auditId: longId, url: "http://localhost:4000/tc2", wcagLevel: "AA" }),
    (err: unknown) => {
      assert.ok(err instanceof ValidationError);
      assert.match((err as Error).message, /100 characters/i);
      return true;
    }
  );

  // Disallowed characters (@, spaces, hashes, slashes)
  for (const badId of ["audit@1", "audit#1", "audit$1", "audit/1", "audit:1", "audit 1"]) {
    await assert.rejects(
      () => runAudit({ auditId: badId, url: "http://localhost:4000/tc2", wcagLevel: "AA" }),
      (err: unknown) => {
        assert.ok(err instanceof ValidationError);
        assert.match((err as Error).message, /auditId/i);
        return true;
      }
    );
  }

  // Confirm Chromium was never launched during any of these invalid calls
  assert.equal(launchSpy.mock.callCount(), 0, "Chromium must not be launched for invalid auditId");
});

test("runAudit validation: wcagLevel rules reject before launching Chromium", async (t) => {
  const launchSpy = t.mock.method(chromium, "launch");

  const invalidLevels = ["INVALID_LEVEL", "B", "AAAA", "", "AA ", "aa", "a"];
  for (const level of invalidLevels) {
    await assert.rejects(
      // @ts-expect-error Testing runtime rejection of invalid level
      () => runAudit({ auditId: "valid-id", url: "http://localhost:4000/tc2", wcagLevel: level }),
      (err: unknown) => {
        assert.ok(err instanceof ValidationError, `Expected ValidationError for level '${level}', got ${err}`);
        assert.match((err as Error).message, /wcagLevel/i);
        return true;
      }
    );
  }

  assert.equal(launchSpy.mock.callCount(), 0, "Chromium must not be launched for invalid wcagLevel");
});

test("runAudit validation: url rules reject before launching Chromium", async (t) => {
  const launchSpy = t.mock.method(chromium, "launch");

  // Malformed URLs
  const malformedUrls = ["not-a-valid-url", "<ftp://x>", "://missing-scheme", "just-text"];
  for (const url of malformedUrls) {
    await assert.rejects(
      () => runAudit({ auditId: "valid-id", url, wcagLevel: "AA" }),
      (err: unknown) => {
        assert.ok(err instanceof ValidationError, `Expected ValidationError for '${url}', got ${err}`);
        assert.match((err as Error).message, /URL/i);
        return true;
      }
    );
  }

  // Disallowed protocols (only http: and https: allowed)
  const nonHttpUrls = ["ftp://example.com", "file:///etc/passwd", "ws://localhost:4000", "gopher://host"];
  for (const url of nonHttpUrls) {
    await assert.rejects(
      () => runAudit({ auditId: "valid-id", url, wcagLevel: "AA" }),
      (err: unknown) => {
        assert.ok(err instanceof ValidationError, `Expected ValidationError for '${url}', got ${err}`);
        assert.match((err as Error).message, /protocol/i);
        return true;
      }
    );
  }

  assert.equal(launchSpy.mock.callCount(), 0, "Chromium must not be launched for invalid url");
});

test("runAudit validation: checks rules reject before launching Chromium", async (t) => {
  const launchSpy = t.mock.method(chromium, "launch");

  // Empty checks array
  await assert.rejects(
    () => runAudit({ auditId: "valid-id", url: "http://localhost:4000/tc2", wcagLevel: "AA", checks: [] }),
    (err: unknown) => {
      assert.ok(err instanceof ValidationError);
      assert.match((err as Error).message, /non-empty array/i);
      return true;
    }
  );

  // Unknown check ID
  await assert.rejects(
    // @ts-expect-error Testing unknown check ID
    () => runAudit({ auditId: "valid-id", url: "http://localhost:4000/tc2", wcagLevel: "AA", checks: ["unknown-check"] }),
    (err: unknown) => {
      assert.ok(err instanceof ValidationError);
      assert.match((err as Error).message, /Invalid check ID/i);
      return true;
    }
  );

  // Duplicate check IDs
  await assert.rejects(
    () => runAudit({
      auditId: "valid-id",
      url: "http://localhost:4000/tc2",
      wcagLevel: "AA",
      checks: ["axe", "keyboard-trap", "axe"] as CheckId[],
    }),
    (err: unknown) => {
      assert.ok(err instanceof ValidationError);
      assert.match((err as Error).message, /Duplicate check ID/i);
      return true;
    }
  );

  assert.equal(launchSpy.mock.callCount(), 0, "Chromium must not be launched for invalid checks");
});
