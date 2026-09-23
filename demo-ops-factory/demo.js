/* FO Copilot workspace: registers fo-tools.js with WebMCP; tools reach GDE
   and Gateway through the serve.py proxy at /api.
   The extension has no dependency on this domain. */
"use strict";
const $ = (id) => document.getElementById(id);
const LOADED_AT = new Date().toLocaleString("en-GB");
const HISTORY_KEY = "fo-webmcp-external-calls";
const TICKETS_KEY = "fo-webmcp-tickets";
const SAMPLE_TICKET = "INC-20260918-0007";
const MAX_OUTPUT = 12000;
const counts = {},
  log = [],
  registrations = new Map(),
  cards = new Map();
let sequence = 0,
  externalCount = 0,
  internalInvoke = false,
  callController,
  modelContext,
  mode,
  reason,
  proxy = {};
const secret = crypto
  .getRandomValues(new Uint32Array(1))[0]
  .toString(16)
  .toUpperCase();
const stamp = () => new Date().toISOString().replace("T", " ").slice(0, 19);
const esc = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const receipt = () =>
  `#${++sequence}-${secret}${crypto.getRandomValues(new Uint16Array(1))[0].toString(16).toUpperCase()}`;
async function request(operation, payload) {
  const r = await fetch(`/api/${operation}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-FO-Proxy": "1" },
    body: JSON.stringify(payload ?? {}),
  });
  const text = await r.text();
  let body = text;
  try {
    body = text ? JSON.parse(text) : "";
  } catch {
    /* Some upstream endpoints answer with plain text. */
  }
  if (!r.ok)
    throw Error(
      `${operation}: HTTP ${r.status} ${body?.error || body?.errorMessage || String(text).slice(0, 300)}`,
    );
  return body;
}
function addLog(entry) {
  log.unshift(entry);
  log.splice(50);
  $("log").replaceChildren();
  for (const e of log) {
    const n = document.createElement("div");
    n.className = "log-entry";
    const title = document.createElement("strong");
    title.textContent = `${e.name} · ${e.external ? "External client" : "In-page call"} · ${e.kind}`;
    const pre = document.createElement("pre");
    pre.textContent = JSON.stringify(e.args) + "\n" + e.result;
    n.append(title, pre);
    $("log").append(n);
  }
  if (entry.external) {
    externalCount++;
    $("mcpBanner").classList.add("hot");
    $("mcpBannerTitle").textContent =
      `External WebMCP call: ${entry.name} (${entry.kind})`;
    $("mcpBannerDetail").textContent =
      `Arguments: ${JSON.stringify(entry.args)} · ${entry.ms} ms · ${entry.at} · ${externalCount} external calls this load`;
    $("mcpBannerToken").textContent = `Receipt ${entry.token}`;
    try {
      const history = JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
      history.unshift({ tool: entry.name, at: entry.at, token: entry.token });
      localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, 50)));
    } catch {
      /* Storage may be unavailable in private mode. */
    }
  }
}
function guard(name, fn) {
  return async (args) => {
    const external = !internalInvoke,
      start = performance.now();
    const token = receipt();
    let result,
      kind = "returned";
    try {
      if (!args || typeof args !== "object" || Array.isArray(args))
        throw new FoInputError("Arguments must be a JSON object.");
      result = await fn(args);
    } catch (e) {
      kind = "error";
      result =
        e instanceof FoInputError
          ? `Invalid arguments: ${e.message}`
          : `Tool error: ${e.message}`;
    }
    const suffix = `\n[MCP call receipt ${token} · ${name} · ${stamp()}]`;
    result = String(result);
    if (result.length + suffix.length > MAX_OUTPUT)
      result =
        result.slice(0, MAX_OUTPUT - suffix.length - 20) +
        "\n[Output truncated]";
    result += suffix;
    counts[name] = (counts[name] || 0) + 1;
    addLog({
      name,
      args,
      external,
      result,
      kind,
      token,
      at: stamp(),
      ms: Math.round(performance.now() - start),
    });
    renderRegistry();
    return result;
  };
}
const TOOL_DEFS = createFoTools({ request }).map((t) => ({
  ...t,
  execute: guard(t.name, t.execute),
}));
/* The fallback only supports this demo; native browser discovery is preferred. */
class LocalModelContext extends EventTarget {
  tools = new Map();
  registerTool(def, options = {}) {
    if (!def.name || typeof def.execute !== "function")
      throw Error("Invalid tool definition");
    this.tools.set(def.name, def);
    options.signal?.addEventListener(
      "abort",
      () => this.tools.delete(def.name),
      { once: true },
    );
  }
  getTools() {
    return [...this.tools.values()].map(({ execute, ...t }) => ({
      ...t,
      origin: location.origin,
    }));
  }
  async executeTool(tool, input, options = {}) {
    options.signal?.throwIfAborted();
    const t = this.tools.get(typeof tool === "string" ? tool : tool.name);
    if (!t) throw Error("Tool not registered");
    return t.execute(typeof input === "string" ? JSON.parse(input) : input, {
      signal: options.signal,
    });
  }
}
async function resolveContext() {
  let native;
  try {
    native = document.modelContext;
    if (!native?.getTools || !native?.executeTool)
      throw Error("Native API unavailable");
    const signal = new AbortController();
    const probeName = "webmcp_probe_" + Math.random().toString(36).slice(2, 9);
    try {
      await native.registerTool(
        {
          name: probeName,
          description: "Probe native WebMCP availability.",
          inputSchema: { type: "object", properties: {} },
          execute: async () => "ok",
        },
        { signal: signal.signal },
      );
      const probe = (await native.getTools()).find((t) => t.name === probeName);
      if (!probe || (await native.executeTool(probe, "{}")) !== "ok")
        throw Error("Native round-trip failed");
    } finally {
      signal.abort();
    }
    mode = "native";
    reason =
      "Native discovery, registration, execution, and removal are available.";
    return native;
  } catch (e) {
    mode = "polyfill";
    reason = `Local fallback: ${e.message}`;
    const fallback = new LocalModelContext();
    try {
      Object.defineProperty(document, "modelContext", {
        value: fallback,
        configurable: true,
      });
    } catch {
      /* A protected native property may prevent external fallback discovery. */
    }
    return fallback;
  }
}
function savedTickets() {
  try {
    const ids = JSON.parse(localStorage.getItem(TICKETS_KEY) || "[]");
    return Array.isArray(ids) && ids.length ? ids : [SAMPLE_TICKET];
  } catch {
    return [SAMPLE_TICKET];
  }
}
function saveTickets() {
  try {
    localStorage.setItem(TICKETS_KEY, JSON.stringify([...cards.keys()]));
  } catch {
    /* Storage may be unavailable in private mode. */
  }
}
async function loadTicket(id) {
  cards.set(id, { loading: true });
  renderBoard();
  const settle = (p) => p.then((v) => v?.data ?? v).catch((e) => e);
  const [detail, operator, alarm] = await Promise.all([
    settle(request("queryIncidentDetail", { orderId: id, tenantId: "1002" })),
    settle(request("queryCurrentOperator", { ticketId: id })),
    settle(request("queryIncidentAlarmDetail", { orderId: id })),
  ]);
  cards.set(id, { detail, operator, alarm, at: stamp() });
  saveTickets();
  renderBoard();
}
function renderBoard() {
  $("board").innerHTML = [...cards]
    .map(([id, c]) => {
      if (c.loading)
        return `<article class="ticket"><div class="ticket-top"><code>${esc(id)}</code><span class="chip">Loading…</span></div></article>`;
      const failed = c.detail instanceof Error || !c.detail?.baseInfo;
      const remove = `<button class="secondary" data-remove="${esc(id)}">Remove</button>`;
      if (failed)
        return `<article class="ticket"><div class="ticket-top"><code>${esc(id)}</code><span class="chip priority">Not loaded</span>${remove}</div><p>${esc(c.detail?.message || c.detail?.errorMessage || JSON.stringify(c.detail))}</p></article>`;
      const b = c.detail.baseInfo,
        a = c.alarm instanceof Error ? null : c.alarm,
        op =
          c.operator instanceof Error
            ? `unavailable: ${c.operator.message}`
            : c.operator;
      const filled = Object.entries(c.detail.currentInfo || {}).filter(
        ([, v]) => v !== "",
      ).length;
      return `<article class="ticket"><div class="ticket-top"><code>${esc(id)}</code><span class="chip">${esc(b.current_phase)}</span><span class="chip priority">${esc(b.priority)}</span>${remove}</div><h3>${esc(b.title)}</h3><dl><dt>Operator</dt><dd>${esc(op)}</dd><dt>Category</dt><dd>${esc(b.n_category)} / ${esc(b.subcategory)}</dd><dt>Impact</dt><dd>${esc(b.impact)} · urgency ${esc(b.urgency)}</dd><dt>Alarm</dt><dd>${a ? `${esc(a.alarmName)} (${esc(a.alarmSeverity)})` : "unavailable"}</dd><dt>NE / CSN</dt><dd>${a ? `${esc(a.alarmNeName)} / ${esc(a.alarmCsn)}` : "—"}</dd><dt>Phase fields</dt><dd>${filled} of ${Object.keys(c.detail.currentInfo || {}).length} filled</dd><dt>Created</dt><dd>${esc(b.date)}</dd><dt>Loaded</dt><dd>${esc(c.at)}</dd></dl><p class="toolonly">Work logs, scripts, and write actions are available only through the registered tools.</p></article>`;
    })
    .join("");
  $("boardStat").textContent = `${cards.size} incidents`;
}
async function renderStatus() {
  try {
    const r = await fetch("/api/status", { cache: "no-store" });
    if (!r.ok) throw Error(`HTTP ${r.status}`);
    proxy = await r.json();
  } catch (e) {
    proxy = { error: e.message };
  }
  const chip = (ok, label) =>
    `<span class="chip${ok ? "" : " priority"}">${esc(label)}</span>`;
  $("env").innerHTML = [
    `<span class="chip">${mode === "native" ? "Native document.modelContext" : "Local polyfill"}</span>`,
    `<span class="chip">originAgentCluster: ${window.originAgentCluster}</span>`,
    `<span class="chip">${esc(reason)}</span>`,
    proxy.error
      ? chip(false, `serve.py proxy unavailable (${proxy.error})`)
      : [
          chip(proxy.gde, `GDE ${proxy.gde ? "configured" : "not configured"}`),
          chip(
            proxy.gateway,
            `Gateway ${proxy.gateway ? "configured" : "not configured"}`,
          ),
          chip(
            proxy.allowWrite,
            `Writes ${proxy.allowWrite ? "enabled" : "disabled (serve.py --allow-write)"}`,
          ),
        ].join(""),
  ].join("");
}
function renderRegistry() {
  $("registry").replaceChildren();
  for (const t of TOOL_DEFS) {
    const d = document.createElement("details"),
      s = document.createElement("summary"),
      p = document.createElement("p");
    s.textContent = `${t.name} · ${t.annotations.readOnlyHint ? "read" : "write"} · ${counts[t.name] || 0} calls`;
    p.textContent = t.description;
    const b = document.createElement("button");
    b.className = "secondary";
    b.textContent = registrations.has(t.name) ? "Unregister" : "Register";
    b.onclick = async () => {
      if (registrations.has(t.name)) {
        registrations.get(t.name).abort();
        registrations.delete(t.name);
      } else await register(t);
      await refreshTools();
    };
    d.append(s, p, b);
    $("registry").append(d);
  }
}
async function register(t) {
  const c = new AbortController();
  await modelContext.registerTool(t, { signal: c.signal });
  registrations.set(t.name, c);
}
const EXAMPLES = {
  get_incident_overview: { ticketId: SAMPLE_TICKET },
  get_incident_detail: { ticketId: SAMPLE_TICKET },
  get_incident_alarms: { ticketId: SAMPLE_TICKET },
  get_alarm_by_csn: { alarmCsn: "2193676" },
  get_current_operator: { ticketId: SAMPLE_TICKET },
  get_incident_priority: { ticketId: SAMPLE_TICKET },
  get_work_logs: { ticketId: SAMPLE_TICKET, limit: 3 },
  query_bo_members: {},
  list_scripts: { keyword: "filesystem" },
  list_hosts: {},
  get_script_result: {
    actionInsId: "00000000-0000-4000-8000-000000000001",
    maxChars: 2000,
  },
  run_diagnostic_script: {
    ticketId: SAMPLE_TICKET,
    scriptCode: "filesystem_usage_evidence_collect",
    parameters: {
      hostName: "host-1",
      hostIp: "10.0.0.31",
      fileSystem: "/",
      mountPoint: "/",
      alarmUsage: "90",
      alarmThreshold: "80",
    },
  },
  write_initial_diagnosis: {
    ticketId: SAMPLE_TICKET,
    diagnosis: "AI initial diagnosis ...",
  },
  update_incident_fields: { ticketId: SAMPLE_TICKET, priority: "P4" },
  add_comment: {
    ticketId: SAMPLE_TICKET,
    description: "FO Copilot recorded AI initial diagnosis.",
  },
  transfer_incident: { ticketId: SAMPLE_TICKET, transferTo: "group:FO Leader" },
  process_incident: {
    ticketId: SAMPLE_TICKET,
    fieldData: { om_clc: "To Next Level", assign_clcnl: "user:example" },
  },
};
async function refreshTools() {
  const tools = await modelContext.getTools();
  $("toolsJson").textContent = JSON.stringify(
    tools.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
      annotations: t.annotations,
      origin: t.origin,
    })),
    null,
    2,
  );
  const current = $("toolSel").value;
  $("toolSel").replaceChildren(
    ...tools.map((t) => {
      const option = document.createElement("option");
      option.value = t.name;
      option.textContent = t.name;
      return option;
    }),
  );
  if (tools.some((t) => t.name === current)) $("toolSel").value = current;
  renderRegistry();
}
function fillExample() {
  $("argsBox").value = JSON.stringify(
    EXAMPLES[$("toolSel").value] || {},
    null,
    2,
  );
}
async function invoke(name, args) {
  const tool = (await modelContext.getTools()).find((t) => t.name === name);
  if (!tool) throw Error("Tool is not registered");
  callController = new AbortController();
  internalInvoke = true;
  try {
    return await modelContext.executeTool(tool, JSON.stringify(args), {
      signal: callController.signal,
    });
  } finally {
    internalInvoke = false;
  }
}
$("fillExample").onclick = fillExample;
$("toolSel").onchange = fillExample;
$("abortBtn").onclick = () => callController?.abort();
$("callRun").onclick = async () => {
  $("callOut").textContent = "Running…";
  try {
    $("callOut").textContent = await invoke(
      $("toolSel").value,
      JSON.parse($("argsBox").value),
    );
  } catch (e) {
    $("callOut").textContent = e.message;
  }
};
$("ticketForm").onsubmit = (e) => {
  e.preventDefault();
  const id = $("ticketInput").value.trim().toUpperCase();
  if (id) loadTicket(id);
};
$("board").onclick = (e) => {
  const id = e.target.dataset?.remove;
  if (!id) return;
  cards.delete(id);
  saveTickets();
  renderBoard();
};
(async () => {
  modelContext = await resolveContext();
  try {
    for (const t of TOOL_DEFS) await register(t);
    const tools = await modelContext.getTools();
    if (TOOL_DEFS.some((t) => !tools.some((x) => x.name === t.name)))
      throw Error("Registration verification failed");
  } catch (e) {
    $("env").textContent = e.message;
    return;
  }
  await renderStatus();
  await refreshTools();
  fillExample();
  $("mcpBannerDetail").textContent =
    `Loaded ${LOADED_AT} · ${TOOL_DEFS.length} tools registered. External calls will appear here.`;
  try {
    const h = JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
    if (h.length)
      $("mcpBannerDetail").textContent +=
        ` Historical calls: ${h.length}; latest receipt: ${h[0].token}.`;
  } catch {
    /* Ignore unavailable storage. */
  }
  window.__webmcpDemo = { mode, reason, nativeAvailable: mode === "native" };
  if (!proxy.error && proxy.gde) savedTickets().forEach(loadTicket);
})();
