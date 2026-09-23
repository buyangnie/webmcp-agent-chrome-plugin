import { test } from "node:test";
import assert from "node:assert/strict";
import "../demo-datadog/datadog-tools.js";

const tools = Object.fromEntries(createDatadogTools().map((t) => [t.name, t]));

test("registers the Datadog MCP tool set as read-only", () => {
  assert.deepEqual(Object.keys(tools), [
    "get_logs",
    "list_spans",
    "get_trace",
    "list_metrics",
    "get_metrics",
    "get_monitors",
    "list_hosts",
    "list_incidents",
    "get_incident",
    "list_dashboards",
  ]);
  for (const t of Object.values(tools))
    assert.equal(t.annotations.readOnlyHint, true);
});

test("get_logs filters by service and status", async () => {
  const out = await tools.get_logs.execute({
    query: "service:checkout-api status:error",
    limit: 5,
  });
  assert.match(out, /2 logs/);
  assert.match(out, /trace:7f3a2c/);
  assert.doesNotMatch(out, /web-store/);
  await assert.rejects(tools.get_logs.execute({ query: "env:prod" }), {
    name: "DatadogInputError",
  });
});

test("get_trace returns the span tree and rejects unknown ids", async () => {
  const out = await tools.get_trace.execute({ traceId: "7f3a2c" });
  assert.match(out, /4 spans/);
  assert.match(out, /payments POST \/charge/);
  await assert.rejects(
    tools.get_trace.execute({ traceId: "missing" }),
    /Known traces/,
  );
});

test("metrics, monitors, hosts, incidents, and dashboards answer from the sample", async () => {
  assert.match(
    await tools.list_metrics.execute({ query: "cpu" }),
    /system\.cpu\.user/,
  );
  const series = await tools.get_metrics.execute({
    metric: "trace.servlet.request.duration.p95",
  });
  assert.match(series, /1240/);
  await assert.rejects(
    tools.get_metrics.execute({ metric: "nope" }),
    /list_metrics/,
  );
  assert.match(
    await tools.get_monitors.execute({ query: "status:Alert" }),
    /184422/,
  );
  assert.match(
    await tools.list_hosts.execute({ query: "checkout" }),
    /checkout-1/,
  );
  const ongoing = await tools.list_incidents.execute({});
  assert.match(ongoing, /4821/);
  assert.doesNotMatch(ongoing, /4790/);
  assert.match(
    await tools.list_incidents.execute({ query: "status:resolved" }),
    /4790/,
  );
  assert.match(
    await tools.get_incident.execute({ incidentId: "INC-4821" }),
    /SEV-2/,
  );
  assert.match(
    await tools.list_dashboards.execute({ query: "checkout" }),
    /d4k-checkout/,
  );
});
