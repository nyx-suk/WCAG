// WCAG Accessibility Auditor - Frontend Application

function escapeHtml(text) {
  if (text === null || text === undefined) return "";
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

let activeIssueId = null;
let currentFixtureState = { tc2Fixed: false, tc4Fixed: false };
let publicBaseUrl = window.location.origin;

async function loadConfig() {
  try {
    const res = await fetch("/api/config");
    if (res.ok) {
      const cfg = await res.json();
      if (cfg.publicBaseUrl && cfg.publicBaseUrl.trim()) {
        publicBaseUrl = cfg.publicBaseUrl.trim().replace(/\/+$/, "");
      }
    }
  } catch {
    // fallback to window.location.origin
  }
}

// --- Navigation and Tabs ---
const tabs = Array.from(document.querySelectorAll(".nav-tab"));
const panels = Array.from(document.querySelectorAll(".tab-panel"));

function switchTab(tabId, pushHash = true) {
  const selectedTab = document.getElementById(tabId) || tabs[0];
  if (!selectedTab) return;

  tabs.forEach((tab) => {
    const isSelected = tab === selectedTab;
    tab.setAttribute("aria-selected", isSelected ? "true" : "false");
    tab.setAttribute("tabindex", isSelected ? "0" : "-1");
  });

  const targetPanelId = selectedTab.getAttribute("aria-controls");
  panels.forEach((panel) => {
    if (panel.id === targetPanelId) {
      panel.classList.add("active");
    } else {
      panel.classList.remove("active");
    }
  });

  if (pushHash) {
    const hash = tabId.replace("tab-", "");
    history.replaceState(null, "", `#${hash}`);
  }

  // Auto-refresh content for specific tabs
  if (tabId === "tab-proposed") {
    loadProposedFindings();
  } else if (tabId === "tab-issues") {
    loadIssues();
  } else if (tabId === "tab-test-runs") {
    loadTestRuns();
  } else if (tabId === "tab-issue-detail" && activeIssueId) {
    loadIssueDetail(activeIssueId);
  }
}

tabs.forEach((tab, index) => {
  tab.addEventListener("click", () => switchTab(tab.id));
  tab.addEventListener("keydown", (e) => {
    let targetIndex = null;
    if (e.key === "ArrowRight") targetIndex = (index + 1) % tabs.length;
    else if (e.key === "ArrowLeft") targetIndex = (index - 1 + tabs.length) % tabs.length;
    else if (e.key === "Home") targetIndex = 0;
    else if (e.key === "End") targetIndex = tabs.length - 1;

    if (targetIndex !== null) {
      e.preventDefault();
      tabs[targetIndex].focus();
      switchTab(tabs[targetIndex].id);
    }
  });
});

// Handle initial hash route
window.addEventListener("DOMContentLoaded", async () => {
  await loadConfig();
  const hash = window.location.hash.replace("#", "");
  const targetTab = document.getElementById(`tab-${hash}`);
  if (targetTab) {
    switchTab(targetTab.id, false);
  } else {
    switchTab("tab-new-audit", false);
  }
  refreshFixtureState();
  updateProposedCount();
});

// --- Fixture Controls & State Sync ---
async function refreshFixtureState() {
  try {
    const [res2, res4] = await Promise.all([
      fetch("/__state/tc2").then((r) => (r.ok ? r.json() : { fixed: false })),
      fetch("/__state/tc4").then((r) => (r.ok ? r.json() : { fixed: false })),
    ]);
    currentFixtureState.tc2Fixed = Boolean(res2.fixed);
    currentFixtureState.tc4Fixed = Boolean(res4.fixed);

    const tc2Badge = document.getElementById("tc2-state-badge");
    const tc4Badge = document.getElementById("tc4-state-badge");
    if (tc2Badge) {
      tc2Badge.textContent = `TC2: ${currentFixtureState.tc2Fixed ? "Fixed" : "Broken"}`;
      tc2Badge.className = `badge ${currentFixtureState.tc2Fixed ? "status-pass" : "status-fail"}`;
    }
    if (tc4Badge) {
      tc4Badge.textContent = `TC4: ${currentFixtureState.tc4Fixed ? "Fixed" : "Broken"}`;
      tc4Badge.className = `badge ${currentFixtureState.tc4Fixed ? "status-pass" : "status-fail"}`;
    }
  } catch {
    // ignore
  }
}

document.getElementById("btn-fill-tc1")?.addEventListener("click", () => {
  document.getElementById("audit-url").value = `${publicBaseUrl}/tc1/bad`;
  document.getElementById("audit-level").value = "AA";
});

document.getElementById("btn-fill-tc2")?.addEventListener("click", () => {
  document.getElementById("audit-url").value = `${publicBaseUrl}/tc2`;
  document.getElementById("audit-level").value = "AA";
});

document.getElementById("btn-fill-tc3")?.addEventListener("click", () => {
  document.getElementById("audit-url").value = `${publicBaseUrl}/tc3`;
  document.getElementById("audit-level").value = "AA";
});

document.getElementById("btn-fill-tc4")?.addEventListener("click", () => {
  document.getElementById("audit-url").value = `${publicBaseUrl}/tc4`;
  document.getElementById("audit-level").value = "AA";
});

document.getElementById("btn-toggle-tc2")?.addEventListener("click", async () => {
  const next = !currentFixtureState.tc2Fixed;
  await fetch("/api/demo/fix", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ target: "tc2", fixed: next }),
  }).catch(() => {
    return fetch("/__state/tc2", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fixed: next }),
    });
  });
  await refreshFixtureState();
});

document.getElementById("btn-toggle-tc4")?.addEventListener("click", async () => {
  const next = !currentFixtureState.tc4Fixed;
  await fetch("/api/demo/fix", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ target: "tc4", fixed: next }),
  }).catch(() => {
    return fetch("/__state/tc4", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fixed: next }),
    });
  });
  await refreshFixtureState();
});

document.getElementById("btn-reset-fixtures")?.addEventListener("click", async () => {
  await fetch("/__state/reset", { method: "POST" });
  await refreshFixtureState();
});

// --- Badge Count Helper ---
async function updateProposedCount() {
  try {
    const res = await fetch("/api/issues?status=pending_approval");
    if (!res.ok) return;
    const issues = await res.json();
    const countBadge = document.getElementById("badge-proposed-count");
    if (countBadge) {
      if (issues.length > 0) {
        countBadge.textContent = issues.length;
        countBadge.style.display = "inline-block";
      } else {
        countBadge.style.display = "none";
      }
    }
  } catch {
    // ignore
  }
}

// --- 4-Step Agent Workflow Timeline (§9.1) ---
function renderWorkflowTimeline(audit, issues = [], targetContainerId = "workflow-timeline-list") {
  const container = document.getElementById(targetContainerId);
  if (!container) return;

  const result = audit.result || {};
  const plan = result.plan || { summary: "Standard audit plan", checks: [] };
  const executed = result.checksExecuted || [];
  const findings = issues.length > 0 ? issues : (result.findings || []);

  const pendingCount = findings.filter(i => i.status === "pending_approval" || !i.status).length;
  const approvedCount = findings.filter(i => i.status === "approved_logged").length;
  const resolvedCount = findings.filter(i => i.status === "resolved").length;

  let actBadge = `<span class="badge status-pass">Complete (0 findings)</span>`;
  let actSummary = "Audit completed with 0 findings; no issues requiring human approval.";
  if (pendingCount > 0) {
    actBadge = `<span class="badge status-pending_approval">Awaiting Approval (${pendingCount})</span>`;
    actSummary = `Presented ${pendingCount} proposed finding(s) for human review and approval before logging (PRD Step 4 & FR-06).`;
  } else if (resolvedCount > 0) {
    actBadge = `<span class="badge status-resolved">Verified Resolved</span>`;
    actSummary = "Issue retested and marked resolved after passing verification.";
  } else if (approvedCount > 0) {
    actBadge = `<span class="badge status-approved_logged">Approved & Logged (${approvedCount})</span>`;
    actSummary = `${approvedCount} issue(s) approved and logged for remediation and retest.`;
  }

  container.innerHTML = `
    <!-- Step 1: Collect -->
    <div class="workflow-step step-collect">
      <div class="workflow-step-num">1</div>
      <div class="workflow-step-content">
        <div class="workflow-step-title">Step 1 — Collect Audit Details</div>
        <div class="workflow-step-desc">
          Target: <a href="${escapeHtml(audit.url)}" target="_blank" rel="noopener" style="color:var(--color-primary); font-weight:600;">${escapeHtml(audit.url)}</a> &bull;
          WCAG Level: <strong>${escapeHtml(audit.wcagLevel)}</strong> &bull;
          Audit ID: <code>${escapeHtml(audit.auditId)}</code>
        </div>
      </div>
    </div>

    <!-- Step 2: Plan -->
    <div class="workflow-step step-plan">
      <div class="workflow-step-num">2</div>
      <div class="workflow-step-content">
        <div class="workflow-step-title">Step 2 — Plan Checks & Rationale</div>
        <div class="workflow-step-desc">${escapeHtml(plan.summary)}</div>
        <div class="workflow-chips">
          ${(plan.checks || []).map(c => `
            <div class="workflow-chip">
              <strong>${escapeHtml(c.checkId)}:</strong> ${escapeHtml(c.reason)}
            </div>
          `).join("")}
        </div>
      </div>
    </div>

    <!-- Step 3: Find -->
    <div class="workflow-step step-find">
      <div class="workflow-step-num">3</div>
      <div class="workflow-step-content">
        <div class="workflow-step-title">Step 3 — Inspect & Find Violations</div>
        <div class="workflow-step-desc">
          Identified <strong>${findings.length} finding(s)</strong> across ${executed.length} executed check(s).
        </div>
        <div class="workflow-chips" style="margin-top:0.4rem;">
          ${executed.map(e => {
            const statusClass = e.status === "executed" ? "status-pass" : "status-fail";
            const durations = result.checkDurations || {};
            const durationMs = typeof e.durationMs === "number" ? e.durationMs : durations[e.checkId];
            const durationText = typeof durationMs === "number" ? ` (${durationMs}ms)` : "";
            return `
              <span class="badge ${statusClass}">
                ${escapeHtml(e.checkId)}: ${escapeHtml(e.status)}${durationText}
              </span>
            `;
          }).join("")}
        </div>
      </div>
    </div>

    <!-- Step 4: Act -->
    <div class="workflow-step step-act">
      <div class="workflow-step-num">4</div>
      <div class="workflow-step-content">
        <div class="workflow-step-title">Step 4 — Act (Human Review & Persistence)</div>
        <div class="workflow-step-desc" style="margin-bottom:0.35rem;">${escapeHtml(actSummary)}</div>
        ${actBadge}
      </div>
    </div>
  `;
}

// --- Screen 1: New Audit Execution ---
const auditForm = document.getElementById("audit-form");
const auditStatusCard = document.getElementById("audit-status-card");
const auditStatusBanner = document.getElementById("audit-status-banner");
const auditStatusText = document.getElementById("audit-status-text");
const auditPlanSummary = document.getElementById("audit-plan-summary");
const auditResultActions = document.getElementById("audit-result-actions");
const btnRunAudit = document.getElementById("btn-run-audit");

auditForm?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const url = document.getElementById("audit-url").value.trim();
  const wcagLevel = document.getElementById("audit-level").value;
  const checkBoxes = Array.from(document.querySelectorAll('input[name="checks"]:checked'));
  const checks = checkBoxes.map((c) => c.value);

  if (!url) {
    alert("Please enter a valid website URL.");
    return;
  }

  btnRunAudit.disabled = true;
  btnRunAudit.textContent = "Running Audit...";
  auditStatusCard.style.display = "block";
  auditStatusBanner.className = "banner banner-info";
  auditStatusText.textContent = `Executing accessibility checks on ${url}...`;
  auditPlanSummary.innerHTML = "";
  auditResultActions.style.display = "none";

  try {
    const res = await fetch("/api/audits", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url, wcagLevel, checks }),
    });

    const body = await res.json();

    if (!res.ok) {
      auditStatusBanner.className = "banner banner-error";
      auditStatusText.textContent = `Audit Failed: ${body.error || "Execution error"}`;
      return;
    }

    const audit = body.audit;
    const issues = body.issues || [];
    const findingsCount = issues.length;

    auditStatusBanner.className =
      audit.status === "complete" ? "banner banner-success" : "banner banner-error";
    auditStatusText.innerHTML = `<strong>Audit ${audit.status.toUpperCase()}</strong>: Identified ${findingsCount} finding(s) on ${escapeHtml(audit.url)}.`;

    renderWorkflowTimeline(audit, issues);

    if (findingsCount > 0) {
      auditResultActions.style.display = "block";
      updateProposedCount();
    }
  } catch (err) {
    auditStatusBanner.className = "banner banner-error";
    auditStatusText.textContent = `Error connecting to audit service: ${err.message}`;
  } finally {
    btnRunAudit.disabled = false;
    btnRunAudit.textContent = "Run Audit";
  }
});

document.getElementById("btn-goto-proposed")?.addEventListener("click", () => {
  switchTab("tab-proposed");
});

// --- Screen 2: Proposed Findings Review ---
async function loadProposedFindings() {
  const container = document.getElementById("proposed-findings-list");
  if (!container) return;

  container.innerHTML = `<p style="color:var(--color-text-muted);">Fetching proposed findings...</p>`;

  try {
    const res = await fetch("/api/issues?status=pending_approval");
    if (!res.ok) throw new Error("Failed to load proposed issues.");
    const issues = await res.json();
    updateProposedCount();

    if (issues.length === 0) {
      container.innerHTML = `
        <div class="banner banner-info" style="margin-top:1rem;">
          No pending proposed findings. Run an audit on a fixture or website to detect issues for review.
        </div>
      `;
      return;
    }

    container.innerHTML = issues
      .map((issue) => {
        const severityClass = `badge-${issue.severity || "minor"}`;
        const screenshotHtml = issue.screenshot
          ? `
          <div class="evidence-media-box">
            <div class="evidence-media-title">Screenshot Evidence</div>
            <img src="/evidence/${escapeHtml(issue.screenshot)}" alt="Defect preview for ${escapeHtml(issue.title)}" class="evidence-image">
          </div>
        `
          : "";

        const recordingHtml = issue.recording
          ? `
          <div class="evidence-media-box">
            <div class="evidence-media-title">Interaction Recording (.webm)</div>
            <video controls preload="metadata" class="evidence-video" aria-label="Keyboard interaction recording">
              <source src="/evidence/${escapeHtml(issue.recording)}" type="video/webm">
              Your browser does not support HTML5 video playback.
            </video>
          </div>
        `
          : "";

        return `
        <article class="finding-card" id="card-${escapeHtml(issue.id)}">
          <div class="finding-header">
            <div>
              <span class="badge ${severityClass}">${escapeHtml(issue.severity)}</span>
              <span class="badge badge-minor" style="margin-left:6px;">Source: ${escapeHtml(issue.source)}</span>
              <h3 class="finding-title" style="margin-top:0.4rem;">${escapeHtml(issue.title)}</h3>
            </div>
            <span class="badge status-pending_approval">Pending Approval</span>
          </div>

          <div class="finding-rule">WCAG ${escapeHtml(issue.wcagRule)}</div>
          <p style="margin-bottom:0.75rem;">${escapeHtml(issue.description)}</p>

          ${
            issue.selector
              ? `<div style="margin-bottom:0.75rem;"><strong style="font-size:0.85rem;">Selector:</strong> <span class="finding-selector">${escapeHtml(issue.selector)}</span></div>`
              : ""
          }

          <div class="evidence-preview-container">
            ${screenshotHtml}
            ${recordingHtml}
          </div>

          <details class="details-toggle">
            <summary>View Technical Evidence JSON</summary>
            <pre class="code-block"><code>${escapeHtml(JSON.stringify(issue.evidence, null, 2))}</code></pre>
          </details>

          <div class="btn-group" style="margin-top:1.25rem;">
            <button type="button" class="btn btn-success btn-approve" data-id="${escapeHtml(issue.id)}">
              Approve Finding
            </button>
            <button type="button" class="btn btn-danger btn-reject" data-id="${escapeHtml(issue.id)}">
              Reject Finding
            </button>
          </div>
        </article>
      `;
      })
      .join("");

    // Wire approve / reject buttons with in-flight disablement
    container.querySelectorAll(".btn-approve").forEach((btn) => {
      btn.addEventListener("click", () => handleApproval(btn.getAttribute("data-id"), true, btn));
    });

    container.querySelectorAll(".btn-reject").forEach((btn) => {
      btn.addEventListener("click", () => handleApproval(btn.getAttribute("data-id"), false, btn));
    });
  } catch (err) {
    container.innerHTML = `<div class="banner banner-error">${escapeHtml(err.message)}</div>`;
  }
}

async function handleApproval(issueId, isApprove, clickedBtn) {
  const card = document.getElementById(`card-${issueId}`);
  const actionButtons = card ? Array.from(card.querySelectorAll("button")) : [clickedBtn];

  actionButtons.forEach((b) => {
    b.disabled = true;
    b.textContent = "Processing...";
  });

  const endpoint = isApprove ? `/api/issues/${issueId}/approve` : `/api/issues/${issueId}/reject`;

  try {
    const res = await fetch(endpoint, { method: "POST" });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || "Action failed.");
    }

    if (card) {
      card.style.transition = "opacity 0.3s";
      card.style.opacity = "0.4";
    }

    // Refresh proposed findings
    setTimeout(() => {
      loadProposedFindings();
      updateProposedCount();
    }, 400);
  } catch (err) {
    alert(`Error: ${err.message}`);
    actionButtons.forEach((b) => {
      b.disabled = false;
      b.textContent = b.classList.contains("btn-approve") ? "Approve Finding" : "Reject Finding";
    });
  }
}

// --- Screen 3: Issues Dashboard ---
const statusFilter = document.getElementById("issue-status-filter");
statusFilter?.addEventListener("change", () => loadIssues());

async function loadIssues() {
  const container = document.getElementById("issues-list");
  if (!container) return;

  container.innerHTML = `<p style="color:var(--color-text-muted);">Loading issues...</p>`;

  const filterVal = statusFilter?.value || "";
  const query = filterVal ? `?status=${encodeURIComponent(filterVal)}` : "";

  try {
    const res = await fetch(`/api/issues${query}`);
    if (!res.ok) throw new Error("Failed to load issues.");
    const issues = await res.json();

    if (issues.length === 0) {
      container.innerHTML = `
        <div class="banner banner-info">
          No issues found matching the selected filter.
        </div>
      `;
      return;
    }

    container.innerHTML = `
      <div class="table-responsive">
        <table class="data-table">
          <thead>
            <tr>
              <th>Title / Description</th>
              <th>WCAG Rule</th>
              <th>Severity</th>
              <th>Source</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            ${issues
              .map((issue) => {
                const statusClass = `status-${issue.status}`;
                const severityClass = `badge-${issue.severity || "minor"}`;
                return `
                <tr>
                  <td>
                    <strong>${escapeHtml(issue.title)}</strong>
                    <div style="font-size:0.85rem; color:var(--color-text-muted);">${escapeHtml(issue.description)}</div>
                    ${
                      issue.selector
                        ? `<span class="finding-selector" style="font-size:0.75rem;">${escapeHtml(issue.selector)}</span>`
                        : ""
                    }
                  </td>
                  <td>${escapeHtml(issue.wcagRule)}</td>
                  <td><span class="badge ${severityClass}">${escapeHtml(issue.severity)}</span></td>
                  <td><span class="badge badge-minor">${escapeHtml(issue.source)}</span></td>
                  <td><span class="badge ${statusClass}">${escapeHtml(issue.status)}</span></td>
                  <td>
                    <button type="button" class="btn btn-secondary btn-view-detail" data-id="${escapeHtml(issue.id)}" style="padding:0.35rem 0.75rem; font-size:0.85rem;">
                      View & Retest
                    </button>
                  </td>
                </tr>
              `;
              })
              .join("")}
          </tbody>
        </table>
      </div>
    `;

    container.querySelectorAll(".btn-view-detail").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-id");
        activeIssueId = id;
        switchTab("tab-issue-detail");
        loadIssueDetail(id);
      });
    });
  } catch (err) {
    container.innerHTML = `<div class="banner banner-error">${escapeHtml(err.message)}</div>`;
  }
}

// --- Screen 4: Issue Detail & Retest ---
async function loadIssueDetail(issueId) {
  const container = document.getElementById("issue-detail-content");
  if (!container) return;

  container.innerHTML = `<p style="color:var(--color-text-muted);">Loading issue details...</p>`;

  try {
    const res = await fetch(`/api/issues/${issueId}`);
    if (!res.ok) throw new Error("Issue not found.");
    const data = await res.json();
    const issue = data.issue;
    const history = data.history || [];
    const retests = data.retests || [];

    const canRetest = issue.status === "approved_logged";
    const statusClass = `status-${issue.status}`;
    const severityClass = `badge-${issue.severity || "minor"}`;

    const screenshotHtml = issue.screenshot
      ? `
      <div class="evidence-media-box">
        <div class="evidence-media-title">Original Screenshot</div>
        <img src="/evidence/${escapeHtml(issue.screenshot)}" alt="Defect preview" class="evidence-image">
      </div>
    `
      : "";

    const recordingHtml = issue.recording
      ? `
      <div class="evidence-media-box">
        <div class="evidence-media-title">Original Recording (.webm)</div>
        <video controls preload="metadata" class="evidence-video" aria-label="Original interaction recording">
          <source src="/evidence/${escapeHtml(issue.recording)}" type="video/webm">
          Video playback not supported.
        </video>
      </div>
    `
      : "";

    const timelineHtml = history
      .map((h) => {
        const dateStr = new Date(h.changedAt).toLocaleString();
        return `
        <li class="timeline-item">
          <div class="timeline-dot"></div>
          <div class="timeline-time">${escapeHtml(dateStr)}</div>
          <div class="timeline-content">
            Status transitioned: <code>${escapeHtml(h.from || "initial")}</code> &rarr; <code>${escapeHtml(h.to)}</code>
          </div>
        </li>
      `;
      })
      .join("");

    container.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:1rem; margin-bottom:1rem;">
        <div>
          <span class="badge ${severityClass}">${escapeHtml(issue.severity)}</span>
          <span class="badge badge-minor" style="margin-left:6px;">Check: ${escapeHtml(issue.source)}</span>
          <h2 class="card-title" style="margin-top:0.4rem;">${escapeHtml(issue.title)}</h2>
          <div style="font-size:0.9rem; color:var(--color-text-muted);">
            Issue ID: <code>${escapeHtml(issue.id)}</code> &bull; Page: <a href="${escapeHtml(issue.pageUrl)}" target="_blank" rel="noopener">${escapeHtml(issue.pageUrl)}</a>
          </div>
        </div>
        <div>
          <span class="badge badge-status ${statusClass}" style="font-size:0.95rem; padding:0.45rem 1rem;">${escapeHtml(issue.status)}</span>
        </div>
      </div>

      <p style="margin-bottom:1rem;">${escapeHtml(issue.description)}</p>

      ${
        issue.selector
          ? `<div style="margin-bottom:1.25rem;"><strong style="font-size:0.85rem;">Selector:</strong> <span class="finding-selector">${escapeHtml(issue.selector)}</span></div>`
          : ""
      }

      <div class="evidence-preview-container">
        ${screenshotHtml}
        ${recordingHtml}
      </div>

      <!-- Status History Timeline -->
      <div style="margin:2rem 0;">
        <h3 style="font-size:1.15rem; margin-bottom:0.75rem;">Status History Timeline</h3>
        <ul class="timeline">
          ${timelineHtml}
        </ul>
      </div>

      <!-- Source Audit 4-Step Workflow Timeline -->
      <div style="margin:2rem 0;">
        <h3 style="font-size:1.15rem; margin-bottom:0.75rem;">Source Audit Workflow (§9.1)</h3>
        <div id="issue-workflow-timeline-list" class="workflow-timeline"></div>
      </div>

      <!-- Retest Control Box -->
      <div class="card" style="background-color:#f8fafc; border-style:dashed;">
        <h3 style="font-size:1.15rem; margin-bottom:0.5rem;">Verification & Retesting (FR-08)</h3>
        <p class="card-description" style="margin-bottom:1rem;">
          Retesting re-audits the exact same target page strictly using the isolated check (${escapeHtml(issue.source)}).
          <strong>Rule:</strong> Incomplete or failing retests NEVER close an issue.
        </p>

        ${
          canRetest
            ? `
          <button type="button" class="btn btn-primary" id="btn-retest-now" data-id="${escapeHtml(issue.id)}">
            Trigger Retest on ${escapeHtml(issue.pageUrl)}
          </button>
        `
            : issue.status === "pending_approval"
            ? `
          <div class="banner banner-info" style="margin-bottom:0;">
            This issue is still in <strong>pending_approval</strong>. Please approve the finding before triggering a retest.
          </div>
        `
            : issue.status === "resolved"
            ? `
          <div class="banner banner-success" style="margin-bottom:0;">
            This issue is marked <strong>RESOLVED</strong>. The passing retest verified that 0 violations remain.
          </div>
        `
            : `
          <div class="banner banner-info" style="margin-bottom:0;">
            Current status is <strong>${escapeHtml(issue.status)}</strong>.
          </div>
        `
        }
      </div>

      <!-- Side-by-side Before / After comparison slot -->
      <div id="retest-comparison-slot"></div>
    `;

    fetch(`/api/audits/${issue.auditId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((auditData) => {
        if (auditData?.audit) {
          renderWorkflowTimeline(auditData.audit, auditData.issues || [], "issue-workflow-timeline-list");
        }
      })
      .catch(() => {});

    document.getElementById("btn-retest-now")?.addEventListener("click", async (e) => {
      const btn = e.target;
      btn.disabled = true;
      btn.textContent = "Running Isolated Retest...";

      const comparisonSlot = document.getElementById("retest-comparison-slot");
      if (comparisonSlot) {
        comparisonSlot.innerHTML = `
          <div class="banner banner-info" style="margin-top:1.5rem;">
            Executing isolated retest (${escapeHtml(issue.source)}) against ${escapeHtml(issue.pageUrl)}...
          </div>
        `;
      }

      try {
        const retestRes = await fetch(`/api/issues/${issue.id}/retest`, { method: "POST" });
        const retestData = await retestRes.json();

        if (!retestRes.ok) {
          throw new Error(retestData.error || "Retest execution failed.");
        }

        renderBeforeAfterComparison(issue, retestData);
        // Refresh fixture state badges in case state changed
        refreshFixtureState();
      } catch (retestErr) {
        if (comparisonSlot) {
          comparisonSlot.innerHTML = `<div class="banner banner-error" style="margin-top:1.5rem;">${escapeHtml(retestErr.message)}</div>`;
        }
      } finally {
        btn.disabled = false;
        btn.textContent = `Trigger Retest on ${issue.pageUrl}`;
      }
    });
  } catch (err) {
    container.innerHTML = `<div class="banner banner-error">${escapeHtml(err.message)}</div>`;
  }
}

function renderBeforeAfterComparison(originalIssue, retestResponse) {
  const slot = document.getElementById("retest-comparison-slot");
  if (!slot) return;

  const outcome = retestResponse.outcome || {};
  const status = outcome.status || "incomplete";
  const updatedIssue = retestResponse.issue || originalIssue;

  let outcomeClass = "after-incomplete";
  let outcomeTitle = "INCOMPLETE (Issue Stays Open)";
  let outcomeDesc = "The retest encountered an error or could not complete. The issue remains OPEN.";

  if (status === "pass") {
    outcomeClass = "after-pass";
    outcomeTitle = "PASS (Issue Resolved)";
    outcomeDesc = "Zero violations detected for the original control. The issue has transitioned to RESOLVED.";
  } else if (status === "fail") {
    outcomeClass = "after-fail";
    outcomeTitle = "FAIL (Issue Stays Open)";
    outcomeDesc = "The violation is still present on the page. The issue remains approved_logged (OPEN).";
  }

  slot.innerHTML = `
    <div style="margin-top:2rem;">
      <h3 style="font-size:1.25rem; margin-bottom:0.5rem;">Retest Outcome & Comparison</h3>
      <div class="comparison-grid">
        <!-- Before Column -->
        <div class="comparison-column before">
          <span class="badge badge-minor" style="margin-bottom:0.5rem;">BEFORE (Original Audit)</span>
          <h4 style="font-size:1.1rem; margin-bottom:0.5rem;">${escapeHtml(originalIssue.title)}</h4>
          <p style="font-size:0.9rem; margin-bottom:0.75rem;">Status: <span class="badge status-approved_logged">approved_logged</span></p>
          <div style="font-size:0.85rem; color:var(--color-text-muted); margin-bottom:0.75rem;">
            Check: <code>${escapeHtml(originalIssue.source)}</code> &bull; Rule: ${escapeHtml(originalIssue.wcagRule)}
          </div>
          ${
            originalIssue.screenshot
              ? `<img src="/evidence/${escapeHtml(originalIssue.screenshot)}" alt="Before defect" class="evidence-image" style="max-height:220px; object-fit:contain;">`
              : ""
          }
        </div>

        <!-- After Column -->
        <div class="comparison-column ${outcomeClass}">
          <span class="badge ${status === "pass" ? "status-pass" : status === "fail" ? "status-fail" : "status-incomplete"}" style="margin-bottom:0.5rem;">
            AFTER (Retest Result: ${escapeHtml(status.toUpperCase())})
          </span>
          <h4 style="font-size:1.1rem; margin-bottom:0.5rem;">${escapeHtml(outcomeTitle)}</h4>
          <p style="font-size:0.9rem; margin-bottom:0.75rem;">
            Current Status: <span class="badge status-${escapeHtml(updatedIssue.status)}">${escapeHtml(updatedIssue.status)}</span>
          </p>
          <p style="font-size:0.9rem; margin-bottom:0.75rem;">${escapeHtml(outcomeDesc)}</p>

          <details class="details-toggle">
            <summary>View Retest Audit Result</summary>
            <pre class="code-block"><code>${escapeHtml(JSON.stringify(outcome, null, 2))}</code></pre>
          </details>
        </div>
      </div>
    </div>
  `;

  // Update status badge in the issue header in place
  const statusBadge = document.querySelector("#issue-detail-content .badge-status");
  if (statusBadge) {
    statusBadge.textContent = updatedIssue.status;
    statusBadge.className = `badge badge-status status-${updatedIssue.status}`;
  }
}

// --- Screen 5: Official Test Runs ---
async function loadTestRuns() {
  const container = document.getElementById("test-runs-container");
  if (!container) return;

  container.innerHTML = `<p style="color:var(--color-text-muted);">Fetching official evaluation test runs...</p>`;

  try {
    const res = await fetch("/api/test-runs");
    if (!res.ok) throw new Error("Failed to load official test runs.");
    const runs = await res.json();

    if (!Array.isArray(runs) || runs.length === 0) {
      container.innerHTML = `<div class="banner banner-info">No test run records found.</div>`;
      return;
    }

    container.innerHTML = `
      <table class="data-table">
        <thead>
          <tr>
            <th>Test Case</th>
            <th>Verdict</th>
            <th>Expected Result</th>
            <th>Actual Result</th>
            <th>Explanation & Evidence</th>
          </tr>
        </thead>
        <tbody>
          ${runs
            .map((tr) => {
              const statusClass = tr.status === "pass" ? "status-pass" : "status-fail";
              const evidenceLink = `/evidence/test-runs/${escapeHtml(tr.test_case)}.json`;
              return `
              <tr>
                <td><strong>${escapeHtml(tr.test_case)}</strong></td>
                <td><span class="badge ${statusClass}">${escapeHtml(tr.status)}</span></td>
                <td style="font-size:0.85rem; max-width:280px;">${escapeHtml(tr.expected_result || tr.expected)}</td>
                <td style="font-size:0.85rem; max-width:280px;">${escapeHtml(tr.actual_result || tr.actual)}</td>
                <td style="font-size:0.85rem;">
                  ${tr.explanation ? `<div style="margin-bottom:0.4rem; color:var(--color-text-muted);">${escapeHtml(tr.explanation)}</div>` : ""}
                  <a href="${evidenceLink}" target="_blank" rel="noopener" style="color:var(--color-primary); font-weight:600;">View Report JSON</a>
                </td>
              </tr>
            `;
            })
            .join("")}
        </tbody>
      </table>
    `;
  } catch (err) {
    container.innerHTML = `<div class="banner banner-error">${escapeHtml(err.message)}</div>`;
  }
}
