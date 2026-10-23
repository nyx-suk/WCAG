import express, { type Express, type Request, type Response } from "express";
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ValidationError } from "../../engine/errors";
import type { AuditInput, AuditResult, CheckId, RunAudit } from "../../engine/types";
import { createFixtureApp, getFixtureState, setFixtureState, resetFixtureState } from "../../fixtures/server";
import { AuditStore, type RetestOutcome } from "../persistence/sqlite";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const checkIds: CheckId[] = ["axe", "keyboard-trap", "keyboard-operability", "contrast"];

export interface AuditApiOptions {
  store: AuditStore;
  runAudit: RunAudit;
  mountFixtures?: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseAuditInput(body: unknown): Omit<AuditInput, "auditId"> {
  if (!isRecord(body) || typeof body.url !== "string" || !body.url.trim()) {
    throw new ValidationError("Request body must contain a non-empty 'url'.");
  }
  try {
    const parsedUrl = new URL(body.url);
    if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
      throw new ValidationError("Request body 'url' must use the http: or https: protocol.");
    }
  } catch (error) {
    if (error instanceof ValidationError) throw error;
    throw new ValidationError("Request body 'url' must be a valid HTTP or HTTPS URL.");
  }
  if (body.wcagLevel !== "A" && body.wcagLevel !== "AA" && body.wcagLevel !== "AAA") {
    throw new ValidationError("Request body must contain wcagLevel 'A', 'AA', or 'AAA'.");
  }
  if (body.checks !== undefined &&
      (!Array.isArray(body.checks) || body.checks.some((check) => !checkIds.includes(check as CheckId)))) {
    throw new ValidationError("Request body contains an unsupported check.");
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
  const planned = input.checks ?? checkIds;
  const plan = {
    summary: `Audit execution aborted for ${input.url}`,
    checks: planned.map((checkId) => ({ checkId, reason: "Planned check aborted." })),
  };
  const steps = [
    { step: "collect" as const, status: "complete" as const, timestamp: now, summary: `Collected URL ${input.url} and level ${input.wcagLevel}` },
    { step: "plan" as const, status: "complete" as const, timestamp: now, summary: plan.summary, details: { plan } },
    { step: "find" as const, status: "failed" as const, timestamp: now, summary: error instanceof Error ? error.message : "Execution failure." },
    { step: "act" as const, status: "failed" as const, timestamp: now, summary: "Audit aborted due to execution error." },
  ];
  return {
    auditId: input.auditId,
    url: input.url,
    status: "error",
    findings: [],
    checksPlanned: planned,
    checksExecuted: planned.map((checkId) => ({ checkId, status: "failed", error: error instanceof Error ? error.message : String(error) })),
    plan,
    steps,
    startedAt: now,
    completedAt: now,
    ...(error instanceof Error ? { error: error.message } : {}),
  } as AuditResult;
}

export function createAuditApp(options: AuditApiOptions): Express {
  const app = express();
  app.use(express.json());

  // Root health check for container orchestration and uptime monitors
  app.get("/health", (_req: Request, res: Response) => {
    res.status(200).json({ status: "ok", timestamp: new Date().toISOString() });
  });

  // Public runtime config endpoint
  app.get("/api/config", (_req: Request, res: Response) => {
    const publicBaseUrl = process.env.PUBLIC_BASE_URL?.trim() || "";
    res.json({
      publicBaseUrl,
      port: Number(process.env.PORT) || 3000,
    });
  });

  // Protected demo reset admin endpoint
  app.post("/api/admin/reset", (req: Request, res: Response) => {
    const token = req.headers["x-admin-token"] || req.query.token;
    const expected = process.env.ADMIN_TOKEN || process.env.DEMO_RESET_TOKEN;
    if (!expected || token !== expected) {
      sendError(res, 401, "Unauthorized: valid admin token required (set ADMIN_TOKEN or DEMO_RESET_TOKEN).");
      return;
    }
    options.store.reset();
    resetFixtureState();
    res.json({ success: true, message: "Demo data and fixture states reset to clean initial state." });
  });

  // Server-side demo fix helper
  app.post("/api/demo/fix", (req: Request, res: Response) => {
    const { target, fixed } = req.body ?? {};
    if (typeof fixed !== "boolean") {
      sendError(res, 400, "Request body must contain boolean 'fixed' property.");
      return;
    }
    if (target === "tc2") {
      setFixtureState({ tc2Fixed: fixed });
      res.json({ target: "tc2", fixed });
    } else if (target === "tc4") {
      setFixtureState({ tc4Fixed: fixed });
      res.json({ target: "tc4", fixed });
    } else {
      sendError(res, 400, "Unsupported target. Must be 'tc2' or 'tc4'.");
    }
  });

  const publicDir = path.resolve(__dirname, "../../public");
  const evidenceDir = path.resolve(__dirname, "../../evidence");

  // Static public assets
  if (existsSync(publicDir)) {
    app.use(express.static(publicDir));
  }

  // Static evidence serving with path-traversal protection
  app.use("/evidence", (req: Request, res: Response, next) => {
    if (req.method !== "GET" && req.method !== "HEAD") return next();
    let rawPath = req.url.split("?")[0] ?? "";
    if (rawPath.startsWith("/")) rawPath = rawPath.slice(1);
    let decoded = rawPath;
    try {
      decoded = decodeURIComponent(rawPath);
      if (decoded.includes("%")) {
        try { decoded = decodeURIComponent(decoded); } catch { /* ignore */ }
      }
    } catch {
      sendError(res, 400, "Malformed URI.");
      return;
    }
    if (decoded.includes("..") || rawPath.includes("..") || req.originalUrl.includes("..")) {
      sendError(res, 403, "Access denied.");
      return;
    }
    const safePath = path.resolve(evidenceDir, decoded);
    if (!safePath.startsWith(evidenceDir)) {
      sendError(res, 403, "Access denied.");
      return;
    }
    if (!existsSync(safePath) || !statSync(safePath).isFile()) {
      sendError(res, 404, "Evidence file not found.");
      return;
    }
    const ext = path.extname(safePath).toLowerCase();
    const mimeTypes: Record<string, string> = {
      ".png": "image/png",
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".webp": "image/webp",
      ".webm": "video/webm",
      ".mp4": "video/mp4",
      ".json": "application/json",
      ".svg": "image/svg+xml",
      ".txt": "text/plain",
    };
    if (mimeTypes[ext]) {
      res.setHeader("Content-Type", mimeTypes[ext]);
    }
    res.sendFile(safePath);
  });

  // Mount fixture server routes on main host so audit engine and browser can access them
  if (options.mountFixtures !== false) {
    app.use(createFixtureApp());
    app.use("/fixtures", createFixtureApp());
  }

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
      if (error instanceof ValidationError || (isRecord(error) && error.name === "ValidationError")) {
        sendError(res, 400, error instanceof Error ? error.message : "Invalid audit input.");
        return;
      }
      const result = errorResult(input, error);
      options.store.saveAuditResult(result);
      sendError(res, 502, error instanceof Error ? error.message : "Audit execution failed.");
    }
  });

  app.get("/api/audits", (_req: Request, res: Response) => {
    res.json(options.store.listAudits().map((audit) => ({ audit, issues: options.store.listIssues(audit.auditId) })));
  });

  app.get("/api/audits/:id", (req: Request, res: Response) => {
    const auditId = routeParam(req, "id");
    const audit = options.store.getAudit(auditId);
    if (!audit) {
      sendError(res, 404, "Audit was not found.");
      return;
    }
    res.json({ audit, issues: options.store.listIssues(auditId) });
  });

  app.get("/api/audits/:id/issues", (req: Request, res: Response) => {
    const auditId = routeParam(req, "id");
    if (!options.store.getAudit(auditId)) {
      sendError(res, 404, "Audit was not found.");
      return;
    }
    res.json(options.store.listIssues(auditId));
  });

  app.get("/api/issues", (req: Request, res: Response) => {
    const statusQuery = typeof req.query.status === "string" ? req.query.status.trim() : undefined;
    let issues = options.store.listIssues();
    if (statusQuery) {
      if (statusQuery === "open") {
        issues = issues.filter((i) => i.status === "approved_logged");
      } else {
        issues = issues.filter((i) => i.status === statusQuery);
      }
    }
    res.json(issues);
  });

  app.get("/api/issues/:id", (req: Request, res: Response) => {
    const issueId = routeParam(req, "id");
    const issue = options.store.getIssue(issueId);
    if (!issue) {
      sendError(res, 404, "Issue was not found.");
      return;
    }
    const history = options.store.getIssueStatusHistory(issueId);
    const retests = options.store.getIssueRetests(issueId);
    res.json({ issue, history, retests });
  });

  app.get("/api/test-runs", (_req: Request, res: Response) => {
    const runs = options.store.listTestRuns();
    if (runs.length > 0) {
      res.json(runs);
      return;
    }
    try {
      const rootTestRuns = path.resolve(__dirname, "../../test-runs.json");
      if (existsSync(rootTestRuns)) {
        res.json(JSON.parse(readFileSync(rootTestRuns, "utf-8")));
        return;
      }
    } catch {
      // ignore
    }
    res.json([]);
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

  // SPA fallback for HTML routes
  app.get("*", (req: Request, res: Response, next) => {
    if (req.method !== "GET") return next();
    if (
      req.path.startsWith("/api/") ||
      req.path.startsWith("/evidence/") ||
      req.path.startsWith("/fixtures/") ||
      req.path.startsWith("/__state/")
    ) {
      return next();
    }
    const indexPath = path.join(publicDir, "index.html");
    if (existsSync(indexPath)) {
      res.sendFile(indexPath);
    } else {
      next();
    }
  });

  return app;
}
