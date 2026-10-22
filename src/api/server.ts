import express, { type Express, type Request, type Response } from "express";
import { randomUUID } from "node:crypto";
import type { AuditInput, AuditResult, CheckId, RunAudit } from "../../engine/types";
import { AuditStore, type RetestOutcome } from "../persistence/sqlite";

const checkIds: CheckId[] = ["axe", "keyboard-trap", "keyboard-operability", "contrast"];

export interface AuditApiOptions {
  store: AuditStore;
  runAudit: RunAudit;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseAuditInput(body: unknown): Omit<AuditInput, "auditId"> {
  if (!isRecord(body) || typeof body.url !== "string" || !body.url.trim()) {
    throw new Error("Request body must contain a non-empty 'url'.");
  }
  if (body.wcagLevel !== "A" && body.wcagLevel !== "AA" && body.wcagLevel !== "AAA") {
    throw new Error("Request body must contain wcagLevel 'A', 'AA', or 'AAA'.");
  }
  if (body.checks !== undefined &&
      (!Array.isArray(body.checks) || body.checks.some((check) => !checkIds.includes(check as CheckId)))) {
    throw new Error("Request body contains an unsupported check.");
  }
  return {
    url: body.url,
    wcagLevel: body.wcagLevel,
    ...(body.checks === undefined ? {} : { checks: body.checks as CheckId[] }),
  };
}

function sendError(res: Response, status: number, message: string): void {
  res.status(status).json({ error: message });
}

function routeParam(req: Request, name: string): string {
  const value = req.params[name];
  return Array.isArray(value) ? value[0] : value;
}

function errorResult(input: AuditInput, error: unknown): AuditResult {
  const now = new Date().toISOString();
  return {
    auditId: input.auditId,
    url: input.url,
    status: "error",
    findings: [],
    checksPlanned: input.checks ?? checkIds,
    checksExecuted: [],
    startedAt: now,
    completedAt: now,
    ...(error instanceof Error ? { error: error.message } : {}),
  } as AuditResult;
}

export function createAuditApp(options: AuditApiOptions): Express {
  const app = express();
  app.use(express.json());

  app.post("/api/audits", async (req: Request, res: Response) => {
    let partial: Omit<AuditInput, "auditId">;
    try {
      partial = parseAuditInput(req.body);
    } catch (error) {
      sendError(res, 400, error instanceof Error ? error.message : "Invalid audit input.");
      return;
    }
    const input: AuditInput = { ...partial, auditId: `audit_${randomUUID()}` };
    options.store.createAudit(input);
    try {
      const result = await options.runAudit(input);
      options.store.saveAuditResult(result);
      res.status(201).json({ audit: options.store.getAudit(result.auditId), issues: options.store.listIssues(result.auditId) });
    } catch (error) {
      const result = errorResult(input, error);
      options.store.saveAuditResult(result);
      sendError(res, 502, error instanceof Error ? error.message : "Audit execution failed.");
    }
  });

  app.get("/api/audits", (_req: Request, res: Response) => {
    res.json(options.store.listAudits().map((audit) => ({ audit, issues: options.store.listIssues(audit.auditId) })));
  });

  app.get("/api/audits/:id/issues", (req: Request, res: Response) => {
    const auditId = routeParam(req, "id");
    if (!options.store.getAudit(auditId)) {
      sendError(res, 404, "Audit was not found.");
      return;
    }
    res.json(options.store.listIssues(auditId));
  });

  app.post("/api/issues/:id/approve", (req: Request, res: Response) => {
    const issueId = routeParam(req, "id");
    try {
      options.store.updateIssueStatus(issueId, "approved_logged");
      res.json(options.store.getIssue(issueId));
    } catch (error) {
      sendError(res, options.store.getIssue(issueId) ? 409 : 404, error instanceof Error ? error.message : "Unable to approve issue.");
    }
  });

  app.post("/api/issues/:id/reject", (req: Request, res: Response) => {
    const issueId = routeParam(req, "id");
    try {
      options.store.updateIssueStatus(issueId, "rejected");
      res.json(options.store.getIssue(issueId));
    } catch (error) {
      sendError(res, options.store.getIssue(issueId) ? 409 : 404, error instanceof Error ? error.message : "Unable to reject issue.");
    }
  });

  app.post("/api/issues/:id/retest", async (req: Request, res: Response) => {
    const issue = options.store.getIssue(routeParam(req, "id"));
    if (!issue) {
      sendError(res, 404, "Issue was not found.");
      return;
    }
    const original = options.store.getAudit(issue.auditId);
    if (!original) {
      sendError(res, 409, "The issue's source audit is unavailable.");
      return;
    }
    const retestInput: AuditInput = {
      ...original.input,
      auditId: `audit_${randomUUID()}`,
      checks: [issue.source],
    };
    options.store.createAudit(retestInput);
    let result: AuditResult;
    try {
      result = await options.runAudit(retestInput);
    } catch (error) {
      result = errorResult(retestInput, error);
    }
    options.store.saveAuditResult(result);
    const matchingFinding = result.findings.some((finding) => finding.fingerprint === issue.fingerprint);
    const outcome: RetestOutcome = {
      status: result.status !== "complete" ? "incomplete" : matchingFinding ? "fail" : "pass",
      evidence: result,
      screenshot: result.findings[0]?.screenshot,
      recording: result.findings[0]?.recording,
    };
    try {
      options.store.recordRetest(issue.id, retestInput.auditId, outcome);
    } catch (error) {
      sendError(res, 409, error instanceof Error ? error.message : "Unable to record retest.");
      return;
    }
    res.json({ audit: options.store.getAudit(retestInput.auditId), issue: options.store.getIssue(issue.id), outcome });
  });

  return app;
}
