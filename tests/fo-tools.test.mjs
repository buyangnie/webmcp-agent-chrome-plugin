import { test } from "node:test";
import assert from "node:assert/strict";
import "../demo-ops-factory/fo-tools.js";

const T = "INC-20260918-0007";
const CURRENT = { om_clc: "", solver_group: "" };
const SCRIPT = {
  scriptCode: "fs_collect",
  name: "Filesystem",
  enabled: true,
  inputParameters: [
    { name: "hostName", required: true },
    { name: "hostIp", required: true },
    { name: "topN", required: false },
  ],
};

function setup(overrides = {}, options = {}) {
  const calls = [];
  const responses = {
    queryIncidentDetail: {
      code: "0",
      data: {
        baseInfo: { title: "Disk", priority: "P4", current_phase: "Auto45" },
        currentInfo: CURRENT,
      },
    },
    queryCurrentOperator: { code: "0", data: "user:FOCopilot" },
    queryIncidentPriority: { code: "0", data: "P4" },
    queryIncidentAlarmDetail: { alarmName: "FS high", alarmCsn: "42" },
    getAlarmByCsn: "",
    listScripts: { scripts: [SCRIPT] },
    executeScript: { success: true, actionInsId: "abc-1", status: "submitted" },
    updateIncidentParam: { code: "0", data: { result: true } },
    setAiAttachment: JSON.stringify({ code: "0", data: "token-9" }),
    ...overrides,
  };
  const request = async (op, payload) => {
    calls.push([op, payload]);
    const r = responses[op] ?? { code: "0", data: null };
    if (r instanceof Error) throw r;
    return r;
  };
  const tools = Object.fromEntries(
    createFoTools({ request, ...options }).map((t) => [t.name, t]),
  );
  return { tools, calls };
}

test("every tool has a schema and read/write annotations", () => {
  const { tools } = setup();
  assert.equal(Object.keys(tools).length, 17);
  for (const t of Object.values(tools)) {
    assert.equal(t.inputSchema.type, "object");
    assert.equal(typeof t.annotations.readOnlyHint, "boolean");
    if (!t.annotations.readOnlyHint)
      assert.equal(t.annotations.consequentialHint, true);
  }
});

test("maps ticketId to each endpoint's ID field", async () => {
  const { tools, calls } = setup();
  await tools.get_incident_overview.execute({ ticketId: T.toLowerCase() });
  assert.deepEqual(Object.fromEntries(calls), {
    queryIncidentDetail: { orderId: T, tenantId: "1002" },
    queryCurrentOperator: { ticketId: T },
    queryIncidentPriority: { tenantId: "1002", ticketId: T },
    queryIncidentAlarmDetail: { orderId: T },
  });
  calls.length = 0;
  await tools.add_comment.execute({ ticketId: T, description: "done" });
  assert.deepEqual(calls, [
    [
      "ticketComment",
      { order_id: T, description: "done", operation_type: "Manual" },
    ],
  ]);
  calls.length = 0;
  await tools.query_bo_members.execute({});
  assert.deepEqual(calls, [
    ["queryBoCondition", { tenantId: 1002, groupName: "BO" }],
  ]);
});

test("overview stops automation when FO Copilot does not hold the ticket", async () => {
  const { tools } = setup({
    queryCurrentOperator: { code: "0", data: "user:a1" },
  });
  const out = await tools.get_incident_overview.execute({ ticketId: T });
  assert.match(out, /Stop: current operator is user:a1/);
  assert.doesNotMatch(out, /Next step/);
  const mine = await setup().tools.get_incident_overview.execute({
    ticketId: T,
  });
  assert.match(mine, /Allowed for Auto45/);
  assert.match(mine, /Next step for Auto45/);
});

test("process_incident sends currentInfo as originalFieldData", async () => {
  const { tools, calls } = setup();
  await tools.process_incident.execute({
    ticketId: T,
    fieldData: { om_clc: "To Next Level", assign_clcnl: "user:a1" },
  });
  assert.deepEqual(calls.at(-1), [
    "processIncident",
    {
      tenantId: "1002",
      ticketId: T,
      fieldData: { om_clc: "To Next Level", assign_clcnl: "user:a1" },
      originalFieldData: CURRENT,
    },
  ]);
  await assert.rejects(
    tools.process_incident.execute({ ticketId: T, fieldData: { om_clc: 1 } }),
    { name: "FoInputError" },
  );
});

test("long diagnoses go through setAiAttachment and unwrap its string envelope", async () => {
  const { tools, calls } = setup({}, { attachmentThreshold: 10 });
  const out = await tools.write_initial_diagnosis.execute({
    ticketId: T,
    diagnosis: "x".repeat(25),
  });
  assert.deepEqual(calls[0], [
    "setAiAttachment",
    { orderId: T, message: "x".repeat(25) },
  ]);
  const [op, body] = calls[1];
  assert.equal(op, "updateIncidentParam");
  assert.equal(body.operator, "FOCopilot");
  assert.equal(body.form_data.initial_diagnosis_attach, "token-9");
  assert.match(out, /result: true/);
});

test("updateIncidentParam result false is an error", async () => {
  const { tools } = setup({
    updateIncidentParam: { code: "0", data: { result: false } },
  });
  await assert.rejects(
    tools.write_initial_diagnosis.execute({ ticketId: T, diagnosis: "short" }),
    /result=false/,
  );
});

test("caps successful writes per ticket", async () => {
  const { tools } = setup({}, { maxWritesPerTicket: 2 });
  await tools.add_comment.execute({ ticketId: T, description: "1" });
  const second = await tools.add_comment.execute({
    ticketId: T,
    description: "2",
  });
  assert.match(second, /0 of 2 writes left/);
  await assert.rejects(
    tools.add_comment.execute({ ticketId: T, description: "3" }),
    /Write limit reached/,
  );
  const other = await tools.add_comment.execute({
    ticketId: "INC-1-2",
    description: "ok",
  });
  assert.match(other, /1 of 2 writes left/);
});

test("failed writes do not use the budget", async () => {
  const { tools } = setup(
    { ticketComment: new Error("HTTP 403") },
    { maxWritesPerTicket: 1 },
  );
  await assert.rejects(
    tools.add_comment.execute({ ticketId: T, description: "1" }),
    /403/,
  );
  await assert.rejects(
    tools.add_comment.execute({ ticketId: T, description: "1" }),
    /403/,
  );
});

test("run_diagnostic_script validates parameters and runs each job once", async () => {
  const { tools, calls } = setup();
  const run = (parameters) =>
    tools.run_diagnostic_script.execute({
      ticketId: T,
      scriptCode: "fs_collect",
      parameters,
    });
  await assert.rejects(run({ hostName: "h" }), /hostIp or ipList/);
  await assert.rejects(
    run({ hostName: "h;rm", hostIp: "1.2.3.4" }),
    /may contain only/,
  );
  await assert.rejects(
    run({ hostIp: "1.2.3.4" }),
    /Missing required parameters for fs_collect: hostName/,
  );
  await assert.rejects(
    tools.run_diagnostic_script.execute({
      ticketId: T,
      scriptCode: "nope",
      parameters: { hostIp: "1.2.3.4" },
    }),
    /Unknown scriptCode/,
  );
  assert.match(
    await run({ hostName: "h", hostIp: "1.2.3.4" }),
    /actionInsId abc-1/,
  );
  assert.match(
    await run({ hostName: "h", hostIp: "1.2.3.4", topN: 5 }),
    /Already executed/,
  );
  assert.equal(calls.filter(([op]) => op === "executeScript").length, 1);
  assert.equal(calls.filter(([op]) => op === "listScripts").length, 1);
});

test("get_script_result pages stdout and reports host failures", async () => {
  const { tools } = setup({
    getExecution: {
      success: false,
      status: "failed",
      executeState: "FAILED",
      result: { stdout: "a".repeat(1200), stderr: "", exitCode: 0 },
      hostStateList: [
        { ip: "10.0.0.1", errorCode: 1, errorMessage: "Host Off Line" },
      ],
    },
  });
  const out = await tools.get_script_result.execute({
    actionInsId: "abc-1",
    maxChars: 500,
  });
  assert.match(out, /status failed \| success false/);
  assert.match(out, /10\.0\.0\.1: 1 Host Off Line/);
  assert.match(out, /stdout characters 0–500 of 1200/);
  assert.match(out, /offset=500/);
});

test("reports GDE error envelopes and empty CSN lookups", async () => {
  const { tools } = setup({
    queryIncidentDetail: { errorCode: "PARSE", errorMessage: "bad body" },
  });
  await assert.rejects(
    tools.get_incident_detail.execute({ ticketId: T }),
    /bad body/,
  );
  assert.match(
    await tools.get_alarm_by_csn.execute({ alarmCsn: "42" }),
    /no data/,
  );
  await assert.rejects(tools.get_alarm_by_csn.execute({ alarmCsn: "4a" }), {
    name: "FoInputError",
  });
  await assert.rejects(
    tools.get_incident_detail.execute({ ticketId: "bad id!" }),
    { name: "FoInputError" },
  );
});
