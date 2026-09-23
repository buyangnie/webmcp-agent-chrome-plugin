/* Simulated Datadog workspace: registers datadog-tools.js with WebMCP.
   The extension has no dependency on this domain. */
"use strict";
const $ = (id) => document.getElementById(id);
const HISTORY_KEY = "datadog-webmcp-external-calls";
const MAX_OUTPUT = 12000;
const CATEGORIES = [
  ["Logs & Traces", ["get_logs", "list_spans", "get_trace"]],
  ["Metrics & Monitoring", ["list_metrics", "get_metrics", "get_monitors"]],
  ["Infrastructure Management", ["list_hosts"]],
  ["Incident Management", ["list_incidents", "get_incident"]],
  ["Dashboards", ["list_dashboards"]],
];
const counts = {},
  log = [],
  registrations = new Map();
let sequence = 0,
  externalCount = 0,
  internalInvoke = false,
  callController,
  modelContext,
  mode,
  reason;
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
  `#${++sequence}-${crypto.getRandomValues(new Uint32Array(1))[0].toString(16).toUpperCase()}`;
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
        throw new DatadogInputError("Arguments must be a JSON object.");
      result = await fn(args);
    } catch (e) {
      kind = "error";
      result =
        e instanceof DatadogInputError
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
const TOOL_DEFS = createDatadogTools().map((t) => ({
  ...t,
  execute: guard(t.name, t.execute),
}));
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
  try {
    const native = document.modelContext;
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
function renderBoard() {
  $("board").innerHTML = CATEGORIES.map(([name, tools]) => {
    const items = tools
      .map((n) => TOOL_DEFS.find((t) => t.name === n))
      .map(
        (t) =>
          `<li><code>${esc(t.name)}</code> ${esc(t.description.split(".")[0])}.</li>`,
      )
      .join("");
    return `<article class="ticket"><h3>${esc(name)}</h3><ul>${items}</ul></article>`;
  }).join("");
  $("boardStat").textContent = `${TOOL_DEFS.length} tools · simulated data`;
}
function renderRegistry() {
  $("registry").replaceChildren();
  for (const t of TOOL_DEFS) {
    const d = document.createElement("details"),
      s = document.createElement("summary"),
      p = document.createElement("p"),
      b = document.createElement("button");
    s.textContent = `${t.name} · ${counts[t.name] || 0} calls`;
    p.textContent = t.description;
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
  get_logs: { query: "service:checkout-api status:error", limit: 5 },
  list_spans: { query: "service:payments status:error" },
  get_trace: { traceId: "7f3a2c" },
  list_metrics: { query: "trace.servlet" },
  get_metrics: { metric: "trace.servlet.request.duration.p95" },
  get_monitors: { query: "status:Alert" },
  list_hosts: { query: "checkout" },
  list_incidents: {},
  get_incident: { incidentId: "4821" },
  list_dashboards: { query: "checkout" },
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
  $("env").innerHTML =
    `<span class="chip">${mode === "native" ? "Native document.modelContext" : "Local polyfill"}</span><span class="chip">originAgentCluster: ${window.originAgentCluster}</span><span class="chip">${esc(reason)}</span><span class="chip">Simulated Datadog data</span>`;
  renderBoard();
  await refreshTools();
  fillExample();
  $("mcpBannerDetail").textContent =
    `Loaded ${new Date().toLocaleString("en-GB")} · ${TOOL_DEFS.length} tools registered. External calls will appear here.`;
  window.__webmcpDemo = { mode, reason, nativeAvailable: mode === "native" };
})();
