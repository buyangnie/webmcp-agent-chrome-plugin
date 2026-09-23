/* Simulated Datadog MCP tools for the WebMCP demo.
   createDatadogTools() returns definitions a page registers on
   document.modelContext. Nothing here calls Datadog. */
"use strict";
(() => {
  class DatadogInputError extends Error {
    name = "DatadogInputError";
  }
  const READ = { readOnlyHint: true };
  const LOGS = [
    {
      timestamp: "2026-09-23T09:38:12Z",
      service: "checkout-api",
      status: "error",
      host: "checkout-1",
      traceId: "7f3a2c",
      message: "upstream timeout calling payments POST /charge after 980ms",
    },
    {
      timestamp: "2026-09-23T09:38:11Z",
      service: "payments",
      status: "warn",
      host: "pay-1",
      traceId: "7f3a2c",
      message: "charge latency 980ms, threshold 400ms, card network slow",
    },
    {
      timestamp: "2026-09-23T09:37:40Z",
      service: "web-store",
      status: "error",
      host: "web-1",
      traceId: "7f3a2c",
      message: "checkout failed for cart 88421: checkout-api returned 504",
    },
    {
      timestamp: "2026-09-23T09:21:03Z",
      service: "checkout-api",
      status: "error",
      host: "checkout-1",
      traceId: "91bb04",
      message: "upstream timeout calling payments POST /charge after 1104ms",
    },
    {
      timestamp: "2026-09-23T09:05:44Z",
      service: "inventory",
      status: "error",
      host: "inv-1",
      traceId: "c01e77",
      message: "search query timed out in product index shard 3",
    },
    {
      timestamp: "2026-09-23T08:40:18Z",
      service: "web-store",
      status: "info",
      host: "web-2",
      traceId: "22aa10",
      message: "checkout completed in 210ms",
    },
    {
      timestamp: "2026-09-23T08:12:55Z",
      service: "payments",
      status: "info",
      host: "pay-1",
      traceId: "22aa10",
      message: "charge accepted in 86ms",
    },
  ];
  const SPANS = [
    {
      traceId: "7f3a2c",
      spanId: "a1",
      parentId: "",
      service: "web-store",
      resource: "POST /checkout",
      start: "2026-09-23T09:38:10.100Z",
      durationMs: 1210,
      status: "error",
    },
    {
      traceId: "7f3a2c",
      spanId: "a2",
      parentId: "a1",
      service: "checkout-api",
      resource: "POST /v1/orders",
      start: "2026-09-23T09:38:10.140Z",
      durationMs: 1160,
      status: "error",
    },
    {
      traceId: "7f3a2c",
      spanId: "a3",
      parentId: "a2",
      service: "payments",
      resource: "POST /charge",
      start: "2026-09-23T09:38:10.180Z",
      durationMs: 980,
      status: "error",
    },
    {
      traceId: "7f3a2c",
      spanId: "a4",
      parentId: "a2",
      service: "inventory",
      resource: "GET /stock",
      start: "2026-09-23T09:38:10.160Z",
      durationMs: 28,
      status: "ok",
    },
    {
      traceId: "91bb04",
      spanId: "b1",
      parentId: "",
      service: "checkout-api",
      resource: "POST /v1/orders",
      start: "2026-09-23T09:21:02.000Z",
      durationMs: 1280,
      status: "error",
    },
    {
      traceId: "91bb04",
      spanId: "b2",
      parentId: "b1",
      service: "payments",
      resource: "POST /charge",
      start: "2026-09-23T09:21:02.040Z",
      durationMs: 1104,
      status: "error",
    },
    {
      traceId: "c01e77",
      spanId: "c1",
      parentId: "",
      service: "inventory",
      resource: "GET /search",
      start: "2026-09-23T09:05:42.000Z",
      durationMs: 2500,
      status: "error",
    },
    {
      traceId: "22aa10",
      spanId: "d1",
      parentId: "",
      service: "web-store",
      resource: "POST /checkout",
      start: "2026-09-23T08:40:17.700Z",
      durationMs: 210,
      status: "ok",
    },
    {
      traceId: "22aa10",
      spanId: "d2",
      parentId: "d1",
      service: "payments",
      resource: "POST /charge",
      start: "2026-09-23T08:40:17.760Z",
      durationMs: 86,
      status: "ok",
    },
  ];
  const METRICS = {
    "trace.servlet.request.duration.p95": {
      unit: "ms",
      tags: "service:checkout-api",
      points: [180, 190, 210, 240, 260, 310, 480, 720, 890, 1040, 1180, 1240],
    },
    "trace.servlet.request.hits": {
      unit: "requests",
      tags: "service:checkout-api",
      points: [420, 430, 410, 440, 450, 460, 470, 455, 448, 430, 410, 390],
    },
    "trace.servlet.request.errors": {
      unit: "errors",
      tags: "service:checkout-api",
      points: [2, 1, 3, 2, 4, 6, 11, 18, 24, 29, 33, 31],
    },
    "system.cpu.user": {
      unit: "percent",
      tags: "host:checkout-1",
      points: [22, 24, 21, 28, 35, 48, 61, 70, 74, 77, 73, 71],
    },
  };
  const METRIC_START = Date.parse("2026-09-23T08:45:00Z");
  const METRIC_STEP = 5 * 60 * 1000;
  const MONITORS = [
    {
      id: 184422,
      name: "Checkout API p95 latency",
      type: "metric alert",
      status: "Alert",
      query:
        "avg(last_10m):p95:trace.servlet.request.duration{service:checkout-api} > 800",
      message: "Checkout p95 is above 800ms. Page payments and checkout-1.",
    },
    {
      id: 184501,
      name: "Payments error rate",
      type: "metric alert",
      status: "Warn",
      query:
        "sum(last_10m):trace.servlet.request.errors{service:payments}.as_rate() > 0.05",
      message:
        "Payments errors are climbing with the checkout latency incident.",
    },
    {
      id: 184088,
      name: "Web store availability",
      type: "service check",
      status: "OK",
      query: "http check on https://shop.example/health",
      message: "Storefront health check is passing.",
    },
    {
      id: 183902,
      name: "checkout-1 CPU",
      type: "metric alert",
      status: "Warn",
      query: "avg(last_15m):system.cpu.user{host:checkout-1} > 70",
      message: "CPU rose after the latency incident started.",
    },
  ];
  const HOSTS = [
    {
      name: "web-1",
      os: "Ubuntu 22.04",
      status: "up",
      cpu: 31,
      memory: 58,
      apps: ["web-store"],
    },
    {
      name: "web-2",
      os: "Ubuntu 22.04",
      status: "up",
      cpu: 27,
      memory: 54,
      apps: ["web-store"],
    },
    {
      name: "checkout-1",
      os: "Ubuntu 22.04",
      status: "up",
      cpu: 71,
      memory: 76,
      apps: ["checkout-api"],
    },
    {
      name: "pay-1",
      os: "Ubuntu 22.04",
      status: "up",
      cpu: 44,
      memory: 63,
      apps: ["payments"],
    },
    {
      name: "inv-1",
      os: "Ubuntu 22.04",
      status: "up",
      cpu: 38,
      memory: 81,
      apps: ["inventory"],
    },
  ];
  const INCIDENTS = [
    {
      id: "4821",
      title: "Checkout API latency elevated",
      severity: "SEV-2",
      status: "active",
      commander: "Priya Shah",
      created: "2026-09-23T09:12:00Z",
      services: ["checkout-api", "payments"],
      summary:
        "p95 latency crossed 800ms at 09:12 UTC. Failing traces stop in payments POST /charge. Customer checkout returns 504.",
      timeline: [
        "09:12 Monitor 184422 triggered.",
        "09:18 Priya Shah declared SEV-2.",
        "09:36 Traces 7f3a2c and 91bb04 confirm the slow span is payments POST /charge.",
      ],
    },
    {
      id: "4816",
      title: "Inventory search timeouts",
      severity: "SEV-3",
      status: "stable",
      commander: "Chris Adel",
      created: "2026-09-22T16:40:00Z",
      services: ["inventory"],
      summary:
        "Search timeouts on shard 3 are intermittent. Checkout does not depend on search.",
      timeline: [
        "16:40 Monitor fired.",
        "17:10 Mitigated by routing search away from shard 3.",
      ],
    },
    {
      id: "4790",
      title: "Web store deploy regression",
      severity: "SEV-3",
      status: "resolved",
      commander: "Sam Taylor",
      created: "2026-09-20T11:02:00Z",
      services: ["web-store"],
      summary: "Rolled back the 11:00 deploy. Error rate returned to baseline.",
      timeline: ["11:05 Rollback completed.", "11:30 Resolved."],
    },
  ];
  const DASHBOARDS = [
    {
      id: "d4k-checkout",
      title: "Checkout health",
      description:
        "Latency, hits, and errors for checkout-api, with the payments dependency.",
      widgets: ["p95 latency", "hits", "error count", "top slow traces"],
    },
    {
      id: "d4k-payments",
      title: "Payments overview",
      description: "Charge latency and error rate on pay-1.",
      widgets: ["charge latency", "error rate", "host CPU"],
    },
    {
      id: "d4k-hosts",
      title: "Host map",
      description:
        "CPU and memory for web, checkout, payments, and inventory hosts.",
      widgets: ["CPU by host", "memory by host", "host status"],
    },
  ];

  function str(args, name, { required = true, max = 200 } = {}) {
    const v = args[name];
    if (v === undefined || v === null || v === "") {
      if (required) throw new DatadogInputError(`${name} is required.`);
      return "";
    }
    if (typeof v !== "string")
      throw new DatadogInputError(`${name} must be a string.`);
    const t = v.trim();
    if (t.length > max)
      throw new DatadogInputError(`${name} must be at most ${max} characters.`);
    return t;
  }
  function limitOf(args, def = 20) {
    const v = args.limit ?? def;
    if (!Number.isInteger(v) || v < 1 || v > 50)
      throw new DatadogInputError("limit must be an integer from 1 to 50.");
    return v;
  }
  function parsed(query) {
    const tags = {},
      words = [];
    for (const token of query.split(/\s+/).filter(Boolean)) {
      const m = /^([A-Za-z_][\w]*):(.*)$/.exec(token);
      if (m && m[2]) tags[m[1]] = m[2].toLowerCase();
      else words.push(token.toLowerCase());
    }
    return { tags, words };
  }
  function select(items, query, tagFields, textFields) {
    const q = parsed(query);
    for (const key of Object.keys(q.tags))
      if (!(key in tagFields))
        throw new DatadogInputError(
          `Unknown filter "${key}". Use: ${Object.keys(tagFields).join(", ")}.`,
        );
    return items.filter((item) => {
      for (const [key, value] of Object.entries(q.tags))
        if (String(item[tagFields[key]] ?? "").toLowerCase() !== value)
          return false;
      const hay = textFields
        .map((f) => String(item[f] ?? ""))
        .join(" ")
        .toLowerCase();
      return q.words.every((w) => hay.includes(w));
    });
  }
  const lines = (rows) => rows.join("\n");
  const queryProp = {
    type: "string",
    description:
      "Space-separated filters such as service:checkout-api status:error, plus free text.",
  };

  function createDatadogTools() {
    return [
      {
        name: "get_logs",
        description:
          "Retrieves a list of logs based on query filters. Filters: service, status (info, warn, error), host, trace_id. Add free text to match the message. Newest first.",
        inputSchema: {
          type: "object",
          properties: {
            query: queryProp,
            limit: {
              type: "number",
              description: "Maximum logs, 1 to 50. Default: 20.",
            },
          },
        },
        annotations: READ,
        execute: async (args) => {
          const query = str(args, "query", { required: false });
          const hits = select(
            LOGS,
            query,
            {
              service: "service",
              status: "status",
              host: "host",
              trace_id: "traceId",
            },
            ["message", "service"],
          );
          const page = hits.slice(0, limitOf(args));
          return lines([
            `${hits.length} logs${query ? ` for ${query}` : ""}; showing ${page.length}.`,
            ...page.map(
              (l) =>
                `${l.timestamp} ${l.status.toUpperCase()} ${l.service} ${l.host} trace:${l.traceId} ${l.message}`,
            ),
          ]);
        },
      },
      {
        name: "list_spans",
        description:
          "Helps investigate spans relevant to your query. Filters: service, status (ok, error), trace_id, resource text.",
        inputSchema: {
          type: "object",
          properties: {
            query: queryProp,
            limit: {
              type: "number",
              description: "Maximum spans, 1 to 50. Default: 20.",
            },
          },
        },
        annotations: READ,
        execute: async (args) => {
          const query = str(args, "query", { required: false });
          const hits = select(
            SPANS,
            query,
            { service: "service", status: "status", trace_id: "traceId" },
            ["resource", "service"],
          );
          const page = hits.slice(0, limitOf(args));
          return lines(
            [
              `${hits.length} spans${query ? ` for ${query}` : ""}; showing ${page.length}.`,
              ...page.map(
                (s) =>
                  `${s.traceId}/${s.spanId} ${s.status} ${s.durationMs}ms ${s.service} ${s.resource}`,
              ),
              page.length
                ? "Use get_trace with a trace id for the full trace."
                : "",
            ].filter(Boolean),
          );
        },
      },
      {
        name: "get_trace",
        description:
          "Retrieves all spans from a specific trace, root first, with parent, duration, and status.",
        inputSchema: {
          type: "object",
          properties: {
            traceId: {
              type: "string",
              description: "Trace id, for example 7f3a2c.",
            },
          },
          required: ["traceId"],
        },
        annotations: READ,
        execute: async (args) => {
          const id = str(args, "traceId", { max: 64 });
          const spans = SPANS.filter((s) => s.traceId === id);
          if (!spans.length) {
            const ids = [...new Set(SPANS.map((s) => s.traceId))].join(", ");
            throw new DatadogInputError(
              `Trace ${id} was not found. Known traces: ${ids}.`,
            );
          }
          const byParent = new Map();
          for (const s of spans) {
            const list = byParent.get(s.parentId) || [];
            list.push(s);
            byParent.set(s.parentId, list);
          }
          const ordered = [];
          const walk = (parent, depth) => {
            for (const s of byParent.get(parent) || []) {
              ordered.push({ s, depth });
              walk(s.spanId, depth + 1);
            }
          };
          walk("", 0);
          return lines([
            `Trace ${id}: ${spans.length} spans, ${Math.max(...spans.map((s) => s.durationMs))}ms slowest.`,
            ...ordered.map(
              ({ s, depth }) =>
                `${"  ".repeat(depth)}${s.spanId} ${s.status} ${s.durationMs}ms ${s.service} ${s.resource} parent:${s.parentId || "-"}`,
            ),
          ]);
        },
      },
      {
        name: "list_metrics",
        description:
          "Retrieves a list of available metrics in your environment. Optional text matches the metric name.",
        inputSchema: {
          type: "object",
          properties: {
            query: {
              type: "string",
              description:
                "Text matched against the metric name, for example latency.",
            },
          },
        },
        annotations: READ,
        execute: async (args) => {
          const query = str(args, "query", { required: false }).toLowerCase();
          const names = Object.keys(METRICS).filter(
            (n) => !query || n.includes(query),
          );
          return lines([
            `${names.length} metrics.`,
            ...names.map(
              (n) => `${n} (${METRICS[n].unit}, ${METRICS[n].tags})`,
            ),
            "Use get_metrics with the metric name for points.",
          ]);
        },
      },
      {
        name: "get_metrics",
        description:
          "Queries timeseries metrics data. Returns 12 points at 5-minute intervals from 2026-09-23 08:45 UTC.",
        inputSchema: {
          type: "object",
          properties: {
            metric: {
              type: "string",
              description: "Exact metric name from list_metrics.",
            },
          },
          required: ["metric"],
        },
        annotations: READ,
        execute: async (args) => {
          const name = str(args, "metric", { max: 120 });
          const series = METRICS[name];
          if (!series)
            throw new DatadogInputError(
              `Unknown metric ${name}. Call list_metrics.`,
            );
          return lines([
            `${name} ${series.tags} unit:${series.unit}`,
            ...series.points.map(
              (v, i) =>
                `${new Date(METRIC_START + i * METRIC_STEP).toISOString()} ${v}`,
            ),
          ]);
        },
      },
      {
        name: "get_monitors",
        description:
          "Retrieves monitors and their configurations. Filter with status:Alert, status:Warn, or status:OK, or match the name.",
        inputSchema: {
          type: "object",
          properties: {
            query: {
              type: "string",
              description: "Optional status:Alert or name text.",
            },
          },
        },
        annotations: READ,
        execute: async (args) => {
          const query = str(args, "query", { required: false });
          const hits = select(
            MONITORS,
            query,
            { status: "status", type: "type" },
            ["name", "query"],
          );
          return lines([
            `${hits.length} monitors.`,
            ...hits.map(
              (m) =>
                `#${m.id} [${m.status}] ${m.type}: ${m.name}\n  query: ${m.query}\n  ${m.message}`,
            ),
          ]);
        },
      },
      {
        name: "list_hosts",
        description:
          "Provides detailed host information: OS, status, CPU, memory, and apps. Filter with name text or status:up.",
        inputSchema: {
          type: "object",
          properties: {
            query: {
              type: "string",
              description: "Optional host name text or status:up.",
            },
          },
        },
        annotations: READ,
        execute: async (args) => {
          const query = str(args, "query", { required: false });
          const hits = select(HOSTS, query, { status: "status" }, [
            "name",
            "apps",
          ]);
          return lines([
            `${hits.length} hosts.`,
            ...hits.map(
              (h) =>
                `${h.name} ${h.status} ${h.os} cpu:${h.cpu}% mem:${h.memory}% apps:${h.apps.join(",")}`,
            ),
          ]);
        },
      },
      {
        name: "list_incidents",
        description:
          "Retrieves a list of ongoing incidents (status active or stable). Pass status:resolved to include resolved incidents, or status:active for only active ones.",
        inputSchema: {
          type: "object",
          properties: {
            query: {
              type: "string",
              description:
                "Optional status filter or title text. Default: ongoing incidents.",
            },
          },
        },
        annotations: READ,
        execute: async (args) => {
          const query = str(args, "query", { required: false });
          const base = /(?:^|\s)status:/i.test(query)
            ? INCIDENTS
            : INCIDENTS.filter((i) => i.status !== "resolved");
          const hits = select(
            base,
            query,
            { status: "status", severity: "severity" },
            ["title", "id", "services"],
          );
          return lines([
            `${hits.length} incidents.`,
            ...hits.map(
              (i) =>
                `#${i.id} [${i.severity} ${i.status}] ${i.title} — ${i.services.join(", ")} — commander ${i.commander}`,
            ),
            "Use get_incident for the timeline.",
          ]);
        },
      },
      {
        name: "get_incident",
        description:
          "Retrieves details for a specific incident, including summary, affected services, and timeline.",
        inputSchema: {
          type: "object",
          properties: {
            incidentId: {
              type: "string",
              description: "Incident id, for example 4821.",
            },
          },
          required: ["incidentId"],
        },
        annotations: READ,
        execute: async (args) => {
          const id = str(args, "incidentId", { max: 32 }).replace(/^INC-/i, "");
          const incident = INCIDENTS.find((i) => i.id === id);
          if (!incident)
            throw new DatadogInputError(
              `Incident ${id} was not found. Known ids: ${INCIDENTS.map((i) => i.id).join(", ")}.`,
            );
          return lines([
            `Incident ${incident.id}: ${incident.title}`,
            `${incident.severity} | ${incident.status} | commander ${incident.commander} | created ${incident.created}`,
            `Services: ${incident.services.join(", ")}`,
            incident.summary,
            "Timeline:",
            ...incident.timeline.map((t) => `- ${t}`),
          ]);
        },
      },
      {
        name: "list_dashboards",
        description:
          "Discovers available dashboards and their context: description and widget names. Optional text matches the title.",
        inputSchema: {
          type: "object",
          properties: {
            query: {
              type: "string",
              description:
                "Optional text matched against the title and description.",
            },
          },
        },
        annotations: READ,
        execute: async (args) => {
          const query = str(args, "query", { required: false });
          const hits = select(DASHBOARDS, query, {}, ["title", "description"]);
          return lines([
            `${hits.length} dashboards.`,
            ...hits.map(
              (d) =>
                `${d.id}: ${d.title}\n  ${d.description}\n  widgets: ${d.widgets.join(", ")}`,
            ),
          ]);
        },
      },
    ];
  }
  Object.assign(globalThis, { createDatadogTools, DatadogInputError });
})();
