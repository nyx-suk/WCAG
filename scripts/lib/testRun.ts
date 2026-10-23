import { recordOfficialTestRun, type RecordOfficialTestRunOptions } from "../../engine/evidence";
import type { TestCaseId, TestRunRecord, TestRunStatus } from "../../engine/types";

export { recordOfficialTestRun, type RecordOfficialTestRunOptions };

export interface WriteTestRunInput {
  id: string;
  test_case: TestCaseId;
  auditId?: string;
  input: unknown;
  expected: string;
  actual: string;
  evidence: unknown;
  status: TestRunStatus;
  explanation?: string | null;
  started_at: string;
  completed_at: string;
  store?: { recordTestRun: (record: TestRunRecord) => void };
}

/**
 * Writes an official test run record via recordOfficialTestRun.
 */
export async function writeTestRun(data: WriteTestRunInput): Promise<string> {
  const record: TestRunRecord & { expected: string; actual: string } = {
    id: data.id,
    test_case: data.test_case,
    input: data.input,
    expected_result: data.expected,
    expected: data.expected,
    actual_result: data.actual,
    actual: data.actual,
    evidence: data.evidence,
    status: data.status,
    explanation: data.explanation ?? null,
    started_at: data.started_at,
    completed_at: data.completed_at,
  };

  return await recordOfficialTestRun({
    record,
    auditId: data.auditId,
    store: data.store,
  });
}
