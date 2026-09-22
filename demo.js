/* Standalone ITSM example. The extension has no dependency on this domain. */
"use strict";
const $ = (id) => document.getElementById(id);
const STATUS = {
  open: "Open",
  in_progress: "In progress",
  resolved: "Resolved",
};
const TICKETS = [
  {
    id: "INC-2026-0431",
    title:
      "Core switch uplink flapping; intermittent connectivity in buildings A/B",
    status: "open",
    priority: "P1",
    category: "Network",
    ci: "SW-CORE-01",
    impact: "About 600 office users; dropped video calls",
    reporter: "Alex Chen",
    assignee: "Unassigned",
    updatedAt: "2026-09-21 08:42",
    description:
      "Te1/0/49 flapped four times in five minutes. Receive power is -19.8 dBm against a -16 dBm threshold. Suspect an aging transceiver or loose fiber.",
    internalNote:
      "A spare transceiver restored service. Replace it with an SFP-10G-SR this week and run a packet-loss baseline across buildings A/B.",
    notes: [
      "08:45 Confirmed the alert and requested an onsite fiber check.",
      "09:02 Replaced the transceiver; receive power recovered to -12.4 dBm.",
      "09:20 No further flapping observed.",
    ],
  },
  {
    id: "INC-2026-0432",
    title: "Order database replication lag exceeds 300 seconds",
    status: "in_progress",
    priority: "P2",
    category: "Database",
    ci: "DB-ORDER-PRIMARY",
    impact: "Stale order reports; settlement delayed by six minutes",
    reporter: "Jordan Lee",
    assignee: "Morgan Patel (DBA)",
    updatedAt: "2026-09-21 11:40",
    description:
      "Replica lag reached 320 seconds. Primary write throughput is normal and replica IO/SQL threads are running. Suspect a large transaction.",
    internalNote:
      "Run archival jobs off peak, limit each transaction to 50,000 rows, and add a 60-second replication-lag alert.",
    notes: [
      "10:28 Located a 1.2-million-row archival transaction.",
      "11:05 Enabled eight parallel replication workers; lag fell to 85 seconds.",
      "11:40 Split the archival job into 50,000-row batches.",
    ],
  },
  {
    id: "INC-2026-0433",
    title: "Intermittent portal 502 errors and increased login failures",
    status: "resolved",
    priority: "P3",
    category: "Application",
    ci: "APP-PORTAL-02",
    impact: "Approximately 3% of login requests affected",
    reporter: "Sam Taylor",
    assignee: "Jordan Lee",
    updatedAt: "2026-09-20 16:22",
    description:
      "The 502 rate rose from 0.1% to 3.2%. Gateway logs report prematurely closed upstream connections. Long JVM full-GC pauses caused failed health checks.",
    internalNote:
      "Increase the portal heap baseline from 2 GB to 4 GB, add it to the capacity dashboard, and alert on full-GC pauses.",
    notes: [
      "14:30 Confirmed 92% heap usage and 2.8-second full-GC pauses.",
      "15:10 Increased heap to 4 GB; the 502 rate returned to 0.1%.",
      "16:22 Added an 85% heap alert and resolved the incident.",
    ],
  },
];
const LOADED_AT = new Date().toLocaleString("en-GB");
const HISTORY_KEY = "itsm-webmcp-external-calls";
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
const secret = crypto
  .getRandomValues(new Uint32Array(1))[0]
  .toString(16)
  .toUpperCase();
const stamp = () => new Date().toISOString().replace("T", " ").slice(0, 19);
const esc = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const receipt = () =>
  `#${++sequence}-${secret}${crypto.getRandomValues(new Uint16Array(1))[0].toString(16).toUpperCase()}`;
class ValidationError extends Error {}
function validateEnum(value, choices, name) {
  if (value !== undefined && !choices.includes(value))
    throw new ValidationError(`${name} must be one of: ${choices.join(", ")}.`);
  return value;
}
function ticketId(args) {
  if (typeof args.ticketId !== "string" || !args.ticketId.trim())
    throw new ValidationError(
      "ticketId is required, for example INC-2026-0431.",
    );
  return args.ticketId.trim().toUpperCase();
}
function findTicket(id) {
  return TICKETS.find((t) => t.id === id);
}
const missing = (id) =>
  `Ticket ${id} was not found. Call list_tickets for valid IDs: ${TICKETS.map((t) => t.id).join(", ")}.`;
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
        throw new ValidationError("Arguments must be a JSON object.");
      result = await fn(args);
    } catch (e) {
      kind = "error";
      result =
        e instanceof ValidationError
          ? `Invalid arguments: ${e.message}`
          : `Tool error: ${e.message}`;
    }
    const suffix = `\n[MCP call receipt ${token} · ${name} · ${stamp()}]`;
    result = String(result);
    if (result.length + suffix.length > 1500)
      result =
        result.slice(0, 1500 - suffix.length - 20) + "\n[Output truncated]";
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
const TOOL_DEFS = [
  {
    name: "list_tickets",
    description:
      "List incidents filtered by status, priority, or keyword. Returns IDs, titles, affected systems, and status. Use get_ticket_detail for full details and internal guidance.",
    inputSchema: {
      type: "object",
      properties: {
        status: {
          type: "string",
          enum: Object.keys(STATUS),
          description: "Filter by status; omit to include all statuses.",
        },
        priority: {
          type: "string",
          enum: ["P1", "P2", "P3"],
          description:
            "P1 is the highest priority. Omit to include all priorities.",
        },
        keyword: {
          type: "string",
          description: "Match text in the ID, title, system, or category.",
        },
        limit: {
          type: "number",
          description: "Maximum results, an integer from 1 to 50. Default: 10.",
        },
      },
    },
    annotations: { readOnlyHint: true },
    execute: guard("list_tickets", async (args) => {
      validateEnum(args.status, Object.keys(STATUS), "status");
      validateEnum(args.priority, ["P1", "P2", "P3"], "priority");
      if (args.keyword !== undefined && typeof args.keyword !== "string")
        throw new ValidationError("keyword must be a string.");
      const limit = args.limit ?? 10;
      if (!Number.isInteger(limit) || limit < 1 || limit > 50)
        throw new ValidationError("limit must be an integer from 1 to 50.");
      const hits = TICKETS.filter(
        (t) =>
          (!args.status || t.status === args.status) &&
          (!args.priority || t.priority === args.priority) &&
          (!args.keyword ||
            [t.id, t.title, t.ci, t.category]
              .join(" ")
              .toLowerCase()
              .includes(args.keyword.toLowerCase())),
      ).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      return (
        `${hits.length} matching incidents:\n` +
        hits
          .slice(0, limit)
          .map(
            (t) =>
              `${t.id} | ${t.priority} | ${STATUS[t.status]} | ${t.title}\nSystem: ${t.ci} | Assignee: ${t.assignee}`,
          )
          .join("\n\n") +
        "\nUse get_ticket_detail for full details."
      );
    }),
  },
  {
    name: "get_ticket_detail",
    description:
      "Get full incident details by ticket ID, including impact, internal guidance, and activity notes. If the ID is unknown, call list_tickets first.",
    inputSchema: {
      type: "object",
      properties: {
        ticketId: {
          type: "string",
          description: "Exact ticket ID, for example INC-2026-0431.",
        },
      },
      required: ["ticketId"],
    },
    annotations: { readOnlyHint: true },
    execute: guard("get_ticket_detail", async (args) => {
      const id = ticketId(args),
        t = findTicket(id);
      if (!t) return missing(id);
      return `Incident ${id}\nTitle: ${t.title}\nStatus: ${t.status} | Priority: ${t.priority}\nSystem: ${t.ci}\nImpact: ${t.impact}\nReporter: ${t.reporter} | Assignee: ${t.assignee}\nDescription: ${t.description}\nInternal guidance (tool-only): ${t.internalNote}\nActivity:\n${t.notes.join("\n")}`;
    }),
  },
  {
    name: "update_ticket_status",
    description:
      "Change an incident status and optionally append a note. This is a consequential operation. Confirm the ticket ID and target status with the user before executing.",
    inputSchema: {
      type: "object",
      properties: {
        ticketId: {
          type: "string",
          description: "Exact ticket ID, for example INC-2026-0431.",
        },
        status: {
          type: "string",
          enum: Object.keys(STATUS),
          description: "Target status: open, in_progress, or resolved.",
        },
        note: {
          type: "string",
          description: "Optional activity note explaining the change.",
        },
      },
      required: ["ticketId", "status"],
    },
    annotations: { readOnlyHint: false, consequentialHint: true },
    execute: guard("update_ticket_status", async (args) => {
      const id = ticketId(args);
      if (!args.status) throw new ValidationError("status is required.");
      validateEnum(args.status, Object.keys(STATUS), "status");
      if (args.note !== undefined && typeof args.note !== "string")
        throw new ValidationError("note must be a string.");
      const t = findTicket(id);
      if (!t) return missing(id);
      if (t.status === args.status)
        return `${id} is already ${args.status}. No change was made. Choose a different status to update it.`;
      const previous = t.status;
      t.status = args.status;
      t.updatedAt = stamp();
      t.notes.push(
        `${t.updatedAt} Agent: ${args.note || `${previous} → ${args.status}`}`,
      );
      renderBoard();
      return `Updated ${id}: ${previous} → ${t.status}. An activity note was added. The incident board now reflects this change.`;
    }),
  },
];
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
function renderBoard() {
  $("board").innerHTML = TICKETS.map(
    (t) =>
      `<article class="ticket"><div class="ticket-top"><code>${t.id}</code><span class="chip">${STATUS[t.status]}</span><span class="chip priority">${t.priority}</span></div><h3>${esc(t.title)}</h3><dl><dt>System</dt><dd>${esc(t.ci)}</dd><dt>Assignee</dt><dd>${esc(t.assignee)}</dd><dt>Activity</dt><dd>${t.notes.length} entries</dd><dt>Updated</dt><dd>${esc(t.updatedAt)}</dd></dl><p>${esc(t.description)}</p><p class="toolonly">Internal guidance is available only through <code>get_ticket_detail</code>.</p></article>`,
  ).join("");
  $("boardStat").textContent =
    `${TICKETS.length} incidents · ${TICKETS.filter((t) => t.status === "open").length} open`;
}
function renderRegistry() {
  $("registry").replaceChildren();
  for (const t of TOOL_DEFS) {
    const d = document.createElement("details"),
      s = document.createElement("summary"),
      p = document.createElement("p");
    s.textContent = `${t.name} · ${counts[t.name] || 0} calls`;
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
  list_tickets: { status: "open" },
  get_ticket_detail: { ticketId: "INC-2026-0431" },
  update_ticket_status: {
    ticketId: "INC-2026-0432",
    status: "resolved",
    note: "Replication lag has recovered.",
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
  try {
    $("callOut").textContent = await invoke(
      $("toolSel").value,
      JSON.parse($("argsBox").value),
    );
  } catch (e) {
    $("callOut").textContent = e.message;
  }
};
$("agentRun").onclick = async () => {
  const p = $("agentInput").value,
    id = p.match(/INC-\d{4}-\d{4}/i)?.[0];
  let name = "list_tickets",
    args = {};
  if (id) {
    name = "get_ticket_detail";
    args = { ticketId: id };
    if (/update|resolve|reopen|start|change/i.test(p)) {
      name = "update_ticket_status";
      args.status = /resolve/i.test(p)
        ? "resolved"
        : /reopen/i.test(p)
          ? "open"
          : "in_progress";
    }
  } else {
    if (/open|pending/i.test(p)) args.status = "open";
    else if (/progress/i.test(p)) args.status = "in_progress";
    else if (/resolved/i.test(p)) args.status = "resolved";
    const priority = p.match(/P[123]/i)?.[0];
    if (priority) args.priority = priority.toUpperCase();
  }
  try {
    $("agentOut").textContent =
      `${name}(${JSON.stringify(args)})\n\n` + (await invoke(name, args));
  } catch (e) {
    $("agentOut").textContent = e.message;
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
    `<span class="chip">${mode === "native" ? "Native document.modelContext" : "Local polyfill"}</span><span class="chip">originAgentCluster: ${window.originAgentCluster}</span><span class="chip">${esc(reason)}</span>`;
  renderBoard();
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
})();
