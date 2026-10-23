import fs from "node:fs/promises";
import path from "node:path";
import type { TestCaseId, TestRunRecord, TestRunStatus } from "../../engine/types";

export interface WriteTestRunInput {
  id: string;
  test_case: TestCaseId;
  input: unknown;
  expected: string;
  actual: string;
  evidence: unknown;
  status: TestRunStatus;
  explanation?: string | null;
  started_at: string;
  completed_at: string;
}

/**
 * Writes an official test run record to /evidence/test-runs/<test_case>.json
 * conforming to PRD §10.4 and TestRunRecord.
 */
export async function writeTestRun(data: WriteTestRunInput): Promise<string> {
  const record: TestRunRecord = {
    id: data.id,
    test_case: data.test_case,
    input: data.input,
    expected_result: data.expected,
    actual_result: data.actual,
    evidence: data.evidence,
    status: data.status,
    explanation: data.explanation ?? null,
    started_at: data.started_at,
    completed_at: data.completed_at,
  };

  // Provide both expected_result / expected and actual_result / actual for full compatibility
  const serialized = {
    ...record,
    expected: data.expected,
    actual: data.actual,
  };

  const targetDir = path.resolve("evidence", "test-runs");
  await fs.mkdir(targetDir, { recursive: true });
  const targetFile = path.join(targetDir, `${data.test_case}.json`);
  await fs.writeFile(targetFile, JSON.stringify(serialized, null, 2), "utf8");
  return targetFile;
}
