import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import pathModule from "node:path";
import initSqlJs, { type Database } from "sql.js";
import type { AuditFinding, AuditInput, AuditResult } from "../../engine/types";

export type IssueStatus = "pending_approval" | "approved_logged" | "rejected" | "retesting" | "resolved";
export type RetestStatus = "pass" | "fail" | "incomplete";

export interface RetestOutcome {
  status: RetestStatus;
  evidence?: unknown;
  screenshot?: string;
  recording?: string;
  completedAt?: string;
}

export interface StoredIssue {
  id: string;
  auditId: string;
  pageUrl: string;
  title: string;
  description: string;
  wcagRule: string;
  severity: AuditFinding["severity"];
  source: AuditFinding["source"];
  selector?: string;
  fingerprint: string;
  status: IssueStatus;
  evidence: unknown;
  screenshot?: string;
  recording?: string;
  createdAt: string;
  updatedAt: string;
}

export interface StoredAudit {
  auditId: string;
  url: string;
  wcagLevel: AuditInput["wcagLevel"];
  status: AuditResult["status"];
  input: AuditInput;
  result?: AuditResult;
  startedAt: string;
  completedAt?: string;
}

const schema = `
  PRAGMA foreign_keys = ON;
  CREATE TABLE IF NOT EXISTS audits (
    audit_id TEXT PRIMARY KEY, url TEXT NOT NULL,
    wcag_level TEXT NOT NULL CHECK (wcag_level IN ('A', 'AA', 'AAA')),
    status TEXT NOT NULL CHECK (status IN ('complete', 'incomplete', 'error')),
    input_json TEXT NOT NULL, result_json TEXT, started_at TEXT NOT NULL, completed_at TEXT
  );
  CREATE TABLE IF NOT EXISTS issues (
    id TEXT PRIMARY KEY, audit_id TEXT NOT NULL REFERENCES audits(audit_id),
    page_url TEXT NOT NULL, title TEXT NOT NULL, description TEXT NOT NULL,
    wcag_rule TEXT NOT NULL, severity TEXT NOT NULL CHECK (severity IN ('critical', 'serious', 'moderate', 'minor')),
    source TEXT NOT NULL, selector TEXT, fingerprint TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL CHECK (status IN ('pending_approval', 'approved_logged', 'rejected', 'retesting', 'resolved')),
    evidence_json TEXT NOT NULL, screenshot TEXT, recording TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS issue_status_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT, issue_id TEXT NOT NULL REFERENCES issues(id),
    from_status TEXT, to_status TEXT NOT NULL, changed_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS retests (
    id TEXT PRIMARY KEY, issue_id TEXT NOT NULL REFERENCES issues(id), audit_id TEXT NOT NULL REFERENCES audits(audit_id),
    status TEXT NOT NULL CHECK (status IN ('pass', 'fail', 'incomplete')), evidence_json TEXT,
    screenshot TEXT, recording TEXT, started_at TEXT NOT NULL, completed_at TEXT
  );
  CREATE TABLE IF NOT EXISTS test_runs (
    id TEXT PRIMARY KEY, test_case TEXT NOT NULL CHECK (test_case IN ('TC1', 'TC2', 'TC3', 'TC4')),
    input_json TEXT NOT NULL, expected_result TEXT NOT NULL, actual_result TEXT, evidence_json TEXT,
    status TEXT NOT NULL CHECK (status IN ('pass', 'fail', 'incomplete')), explanation TEXT,
    started_at TEXT NOT NULL, completed_at TEXT
  );
`;
type SqlParam = string | number | Uint8Array | null;

function json(value: unknown): string {
  return JSON.stringify(value ?? null);
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string") throw new Error(`SQLite row has invalid ${field}.`);
  return value;
}

export class AuditStore {
  private constructor(private readonly database: Database, private readonly filePath?: string) {}

  static async open(filePath = process.env.DATABASE_PATH ?? "data/auditor.sqlite"): Promise<AuditStore> {
    const SQL = await initSqlJs();
    let database: Database;
    if (filePath !== ":memory:" && existsSync(filePath)) database = new SQL.Database(new Uint8Array(readFileSync(filePath)));
    else database = new SQL.Database();
    const store = new AuditStore(database, filePath === ":memory:" ? undefined : filePath);
    store.database.run(schema);
    return store;
  }

  close(): void {
    if (this.filePath) {
      mkdirSync(pathModule.dirname(this.filePath), { recursive: true });
      writeFileSync(this.filePath, Buffer.from(this.database.export()));
    }
    this.database.close();
  }

  private run(sql: string, params: SqlParam[] = []): void {
    const statement = this.database.prepare(sql);
    try {
      statement.bind(params);
      statement.step();
    } finally {
      statement.free();
    }
  }

  private one(sql: string, params: SqlParam[] = []): Record<string, unknown> | undefined {
    const statement = this.database.prepare(sql);
    try {
      statement.bind(params);
      return statement.step() ? (statement.getAsObject() as Record<string, unknown>) : undefined;
    } finally {
      statement.free();
    }
  }

  private many(sql: string, params: SqlParam[] = []): Record<string, unknown>[] {
    const statement = this.database.prepare(sql);
    const rows: Record<string, unknown>[] = [];
    try {
      statement.bind(params);
      while (statement.step()) rows.push(statement.getAsObject() as Record<string, unknown>);
      return rows;
    } finally {
      statement.free();
    }
  }

  createAudit(input: AuditInput, startedAt = new Date().toISOString()): void {
    this.run(
      "INSERT INTO audits (audit_id, url, wcag_level, status, input_json, started_at) VALUES (?, ?, ?, 'incomplete', ?, ?)",
      [input.auditId, input.url, input.wcagLevel, json(input), startedAt],
    );
  }

  saveAuditResult(result: AuditResult): void {
    this.database.run("BEGIN");
    try {
      this.run("UPDATE audits SET status = ?, result_json = ?, completed_at = ? WHERE audit_id = ?", [
        result.status, json(result), result.completedAt, result.auditId,
      ]);
      for (const finding of result.findings) {
        this.run(
          `INSERT OR IGNORE INTO issues
           (id, audit_id, page_url, title, description, wcag_rule, severity, source, selector, fingerprint,
            status, evidence_json, screenshot, recording, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending_approval', ?, ?, ?, ?, ?)`,
          [
            `fnd_${finding.fingerprint}`, result.auditId, result.url, finding.title, finding.description,
            finding.wcagRule, finding.severity, finding.source, finding.selector ?? null, finding.fingerprint,
            json(finding.evidence), finding.screenshot ?? null, finding.recording ?? null, result.startedAt, result.completedAt,
          ],
        );
      }
      this.database.run("COMMIT");
    } catch (error) {
      this.database.run("ROLLBACK");
      throw error;
    }
  }

  getAudit(auditId: string): StoredAudit | undefined {
    const value = this.one("SELECT * FROM audits WHERE audit_id = ?", [auditId]);
    if (!value) return undefined;
    const input = JSON.parse(requiredString(value.input_json, "input_json")) as AuditInput;
    const resultJson = typeof value.result_json === "string" ? value.result_json : undefined;
    return {
      auditId: requiredString(value.audit_id, "audit_id"),
      url: requiredString(value.url, "url"),
      wcagLevel: requiredString(value.wcag_level, "wcag_level") as AuditInput["wcagLevel"],
      status: requiredString(value.status, "status") as AuditResult["status"],
      input,
      result: resultJson ? JSON.parse(resultJson) as AuditResult : undefined,
      startedAt: requiredString(value.started_at, "started_at"),
      completedAt: typeof value.completed_at === "string" ? value.completed_at : undefined,
    };
  }

  listAudits(): StoredAudit[] {
    return this.many("SELECT audit_id FROM audits ORDER BY started_at DESC")
      .map((row) => this.getAudit(requiredString(row.audit_id, "audit_id")))
      .filter((audit): audit is StoredAudit => audit !== undefined);
  }

  listIssues(auditId?: string): StoredIssue[] {
    const rows = auditId
      ? this.many("SELECT id FROM issues WHERE audit_id = ? ORDER BY created_at", [auditId])
      : this.many("SELECT id FROM issues ORDER BY created_at");
    return rows
      .map((row) => this.getIssue(requiredString(row.id, "id")))
      .filter((issue): issue is StoredIssue => issue !== undefined);
  }

  getIssue(id: string): StoredIssue | undefined {
    const value = this.one("SELECT * FROM issues WHERE id = ?", [id]);
    if (!value) return undefined;
    return {
      id: requiredString(value.id, "id"), auditId: requiredString(value.audit_id, "audit_id"),
      pageUrl: requiredString(value.page_url, "page_url"), title: requiredString(value.title, "title"),
      description: requiredString(value.description, "description"), wcagRule: requiredString(value.wcag_rule, "wcag_rule"),
      severity: requiredString(value.severity, "severity") as StoredIssue["severity"],
      source: requiredString(value.source, "source") as StoredIssue["source"],
      selector: typeof value.selector === "string" ? value.selector : undefined,
      fingerprint: requiredString(value.fingerprint, "fingerprint"),
      status: requiredString(value.status, "status") as IssueStatus,
      evidence: JSON.parse(requiredString(value.evidence_json, "evidence_json")) as unknown,
      screenshot: typeof value.screenshot === "string" ? value.screenshot : undefined,
      recording: typeof value.recording === "string" ? value.recording : undefined,
      createdAt: requiredString(value.created_at, "created_at"), updatedAt: requiredString(value.updated_at, "updated_at"),
    };
  }

  updateIssueStatus(id: string, toStatus: IssueStatus, changedAt = new Date().toISOString()): void {
    const issue = this.getIssue(id);
    if (!issue) throw new Error(`Issue '${id}' was not found.`);
    const allowed: Record<IssueStatus, IssueStatus[]> = {
      pending_approval: ["approved_logged", "rejected"], approved_logged: ["retesting"],
      rejected: [], retesting: ["approved_logged", "resolved"], resolved: [],
    };
    if (!allowed[issue.status].includes(toStatus)) {
      throw new Error(`Cannot change issue '${id}' from ${issue.status} to ${toStatus}.`);
    }
    this.database.run("BEGIN");
    try {
      this.run("UPDATE issues SET status = ?, updated_at = ? WHERE id = ?", [toStatus, changedAt, id]);
      this.run("INSERT INTO issue_status_history (issue_id, from_status, to_status, changed_at) VALUES (?, ?, ?, ?)",
        [id, issue.status, toStatus, changedAt]);
      this.database.run("COMMIT");
    } catch (error) {
      this.database.run("ROLLBACK");
      throw error;
    }
  }

  recordRetest(id: string, auditId: string, outcome: RetestOutcome, startedAt = new Date().toISOString()): string {
    const issue = this.getIssue(id);
    if (!issue) throw new Error(`Issue '${id}' was not found.`);
    if (issue.status !== "approved_logged") throw new Error(`Issue '${id}' must be approved_logged before retesting.`);
    const retestId = `rst_${randomUUID()}`;
    const completedAt = outcome.completedAt ?? new Date().toISOString();
    this.database.run("BEGIN");
    try {
      this.run("UPDATE issues SET status = 'retesting', updated_at = ? WHERE id = ?", [startedAt, id]);
      this.run(
        `INSERT INTO retests (id, issue_id, audit_id, status, evidence_json, screenshot, recording, started_at, completed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [retestId, id, auditId, outcome.status, outcome.evidence === undefined ? null : json(outcome.evidence),
          outcome.screenshot ?? null, outcome.recording ?? null, startedAt, completedAt],
      );
      const finalStatus: IssueStatus = outcome.status === "pass" ? "resolved" : "approved_logged";
      this.run("UPDATE issues SET status = ?, updated_at = ? WHERE id = ?", [finalStatus, completedAt, id]);
      this.run("INSERT INTO issue_status_history (issue_id, from_status, to_status, changed_at) VALUES (?, 'approved_logged', 'retesting', ?)",
        [id, startedAt]);
      this.run("INSERT INTO issue_status_history (issue_id, from_status, to_status, changed_at) VALUES (?, 'retesting', ?, ?)",
        [id, finalStatus, completedAt]);
      this.database.run("COMMIT");
      return retestId;
    } catch (error) {
      this.database.run("ROLLBACK");
      throw error;
    }
  }
}
