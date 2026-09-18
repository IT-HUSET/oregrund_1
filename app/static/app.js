function escapeHtml(s) {
  if (s === null || s === undefined) return "";
  return String(s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function qs(name) {
  return new URLSearchParams(window.location.search).get(name);
}

async function api(path, options) {
  const res = await fetch(path, options);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `HTTP ${res.status}`);
  }
  return res.json();
}

// ---------------------------------------------------------------------
// index.html — case queue
// ---------------------------------------------------------------------

async function loadCaseList() {
  const tbody = document.getElementById("case-tbody");
  try {
    const cases = await api("/api/cases");
    if (!cases.length) {
      tbody.innerHTML = `<tr><td colspan="5" class="empty">Inga ärenden.</td></tr>`;
      return;
    }
    tbody.innerHTML = cases.map(c => `
      <tr onclick="window.location='/case.html?id=${encodeURIComponent(c.case_id)}'">
        <td>${escapeHtml(c.diarienummer)}</td>
        <td>${escapeHtml(c.arende_titel)}</td>
        <td>${escapeHtml(c.dokument_titel)}${c.source === "generated" ? ' <span class="badge kind-judgment">AI-genererad</span>' : ""}</td>
        <td><span class="badge ${c.status === "godkänd" ? "godkand" : "flaggad"}">${escapeHtml(c.status)}</span></td>
        <td>${c.finding_count}</td>
      </tr>
    `).join("");
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="5" class="empty">Fel: ${escapeHtml(e.message)}</td></tr>`;
  }

  const btn = document.getElementById("gen-submit");
  if (btn) btn.addEventListener("click", submitGenerate);
}

async function submitGenerate() {
  const arende_titel = document.getElementById("gen-arende-titel").value;
  const process = document.getElementById("gen-process").value;
  const dokumenttext = document.getElementById("gen-text").value;
  if (!dokumenttext.trim()) {
    alert("Ange handlingens text.");
    return;
  }
  try {
    const result = await api("/api/cases/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ arende: { titel: arende_titel, process: process }, dokumenttext }),
    });
    window.location = `/case.html?id=${encodeURIComponent(result.case.case_id)}`;
  } catch (e) {
    alert("Fel vid generering: " + e.message);
  }
}

// ---------------------------------------------------------------------
// case.html — case detail / audit view
// ---------------------------------------------------------------------

const KIND_LABEL = { deterministic: "Regelmotor", judgment: "AI-bedömning", policy: "Policy" };
const ENGINE_LABEL = {
  "claude-api": "Claude Sonnet 5",
  "heuristic-fallback": "Fallback (heuristik)",
  "redacted-not-evaluated": "Ej utvärderad (sekretess)",
};
const ENGINE_CLASS = {
  "claude-api": "kind-judgment",
  "heuristic-fallback": "kind-policy",
  "redacted-not-evaluated": "kind-policy",
};

function renderMeta(detail) {
  const c = detail.case;
  return `
    <div class="grid2">
      <div class="panel">
        <h2 style="margin-top:0;">Ärende</h2>
        <dl class="meta">
          <dt>Diarienummer</dt><dd>${escapeHtml(c.arende.diarienummer)}</dd>
          <dt>Titel</dt><dd>${escapeHtml(c.arende.titel)}</dd>
          <dt>Process</dt><dd>${escapeHtml(c.arende.process)}</dd>
          <dt>Kontakt</dt><dd>${escapeHtml(c.arende.kontakt || "—")}</dd>
          <dt>Status</dt><dd>${escapeHtml(c.arende.status)}</dd>
        </dl>
      </div>
      <div class="panel">
        <h2 style="margin-top:0;">Ärendedokument</h2>
        <dl class="meta">
          <dt>Titel</dt><dd>${escapeHtml(c.arendedokument.titel)}</dd>
          <dt>Handlingstyp</dt><dd>${escapeHtml(c.arendedokument.handlingstyp)}</dd>
          <dt>Kategori</dt><dd>${escapeHtml(c.arendedokument.dokumentkategori)}</dd>
          <dt>Skyddskod</dt><dd>${escapeHtml(c.arendedokument.skyddskod)}</dd>
          <dt>Avsändare</dt><dd>${escapeHtml(c.arendedokument.avsandare || "—")}</dd>
          <dt>Mottagare</dt><dd>${escapeHtml(c.arendedokument.mottagare || "—")}</dd>
          <dt>Kopia till</dt><dd>${escapeHtml(c.arendedokument.kopia_till || "—")}</dd>
          <dt>Ankomst/dok.datum</dt><dd>${escapeHtml(c.arendedokument.ankomstdatum || c.arendedokument.dokumentdatum || "—")}</dd>
          <dt>Filer</dt><dd>${escapeHtml((c.fil.filer || []).join(", ") || "—")}</dd>
        </dl>
      </div>
    </div>
  `;
}

function renderChecks(results, caseId) {
  const rows = results.map(r => `
    <div class="check-row ${r.passed ? "passed" : "failed"}">
      <div class="rule-head">
        <span class="status-icon">${r.passed ? "✓" : "!"}</span>
        <span>${escapeHtml(r.rule_id)}</span>
        <span class="badge kind-${r.kind}">${KIND_LABEL[r.kind] || r.kind}</span>
        ${r.engine ? `<span class="badge ${ENGINE_CLASS[r.engine] || "kind-policy"}">${ENGINE_LABEL[r.engine] || r.engine}</span>` : ""}
        ${r.confidence !== null && r.confidence !== undefined ? `<span style="color:var(--muted); font-size:0.75rem;">konfidens ${Math.round(r.confidence * 100)}%</span>` : ""}
      </div>
      <p class="reasoning">${escapeHtml(r.reasoning)}</p>
      ${r.evidence ? `<p class="evidence">underlag: ${escapeHtml(r.evidence)}</p>` : ""}
      ${!r.passed && r.kind !== "policy" ? `
        <div style="margin-top:8px;">
          ${r.acknowledged
            ? `<span class="ack">✓ Granskad av registrator</span>`
            : `<button onclick="reviewFinding('${caseId}', '${r.rule_id}', 'approve')">Markera som granskad</button>`}
        </div>` : ""}
    </div>
  `).join("");
  return `<h2>Fullständig kontrollogg (${results.length} regler kontrollerade)</h2>${rows}`;
}

function renderFixes(fixes, caseId, anyAutoApplied) {
  if (!fixes.length) return "";
  const cards = fixes.map(f => `
    <div class="fix-card">
      <div class="rule-head" style="font-weight:600; font-size:0.85rem;">
        ${escapeHtml(f.rule_id)}
        <span class="badge ${f.status === "auto_applied" ? "kind-deterministic" : "kind-policy"}">
          ${f.status === "auto_applied" ? "Kan auto-rättas" : "Kräver människa"}
        </span>
      </div>
      ${f.after !== null ? `
        <div class="diff">
          <div class="before">− ${escapeHtml(f.before)}</div>
          <div class="after">+ ${escapeHtml(f.after)}</div>
        </div>` : ""}
      <p class="reasoning">${escapeHtml(f.reasoning)}</p>
    </div>
  `).join("");
  return `
    <h2>Föreslagna rättningar (Steg 2)</h2>
    <div class="panel">
      ${cards}
      <button class="primary" onclick="runAutofix('${caseId}')">Kör automatisk rättning</button>
    </div>
  `;
}

function renderAudit(events) {
  if (!events.length) return `<h2>Granskningshistorik</h2><p class="empty">Inga händelser ännu.</p>`;
  const items = events.map(e => `
    <div class="audit-item">
      <span class="ts">${escapeHtml(e.timestamp)}</span> —
      <span class="actor">${escapeHtml(e.actor)}</span>: ${escapeHtml(e.summary)}
    </div>
  `).join("");
  return `<h2>Granskningshistorik (${events.length} händelser)</h2><div class="panel">${items}</div>`;
}

let CURRENT_CASE_ID = null;

async function loadCaseDetail() {
  CURRENT_CASE_ID = qs("id");
  const content = document.getElementById("content");
  if (!CURRENT_CASE_ID) {
    content.innerHTML = `<p class="empty">Inget ärende-id angivet.</p>`;
    return;
  }
  try {
    const detail = await api(`/api/cases/${encodeURIComponent(CURRENT_CASE_ID)}`);
    document.getElementById("case-heading").textContent = detail.case.arende.diarienummer || detail.case.case_id;
    document.getElementById("case-sub").innerHTML =
      `<span class="badge ${detail.report.status === "godkänd" ? "godkand" : "flaggad"}">${escapeHtml(detail.report.status)}</span>`;
    content.innerHTML =
      renderMeta(detail) +
      renderFixes(detail.proposed_fixes, CURRENT_CASE_ID) +
      renderChecks(detail.report.results, CURRENT_CASE_ID) +
      renderAudit(detail.audit);
  } catch (e) {
    content.innerHTML = `<p class="empty">Fel: ${escapeHtml(e.message)}</p>`;
  }
}

async function runAutofix(caseId) {
  try {
    await api(`/api/cases/${encodeURIComponent(caseId)}/autofix`, { method: "POST" });
    loadCaseDetail();
  } catch (e) {
    alert("Fel vid rättning: " + e.message);
  }
}

async function reviewFinding(caseId, ruleId, action) {
  try {
    await api(`/api/cases/${encodeURIComponent(caseId)}/review`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rule_id: ruleId, action }),
    });
    loadCaseDetail();
  } catch (e) {
    alert("Fel: " + e.message);
  }
}
