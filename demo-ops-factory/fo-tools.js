/* FO Copilot WebMCP tools over the GDE and Gateway HTTP protocol.
   A host page calls createFoTools({ request }) and registers the returned
   definitions with document.modelContext. request(operation, payload) must
   resolve to the upstream response body (parsed JSON, or text when not JSON);
   operation names match OPERATIONS in serve.py. */
"use strict";
(() => {
  class FoInputError extends Error {
    name = "FoInputError";
  }
  const SAFE_VALUE = /^[A-Za-z0-9._:/+-]+$/;
  const SAFE_ID = /^[A-Za-z0-9-]{3,64}$/;
  const FIELD_KEY = /^[A-Za-z][A-Za-z0-9_]{0,63}$/;
  const ASSIGNEE = /^(group|user):\S.{0,99}$/;
  const PRIORITIES = ["P1", "P2", "P3", "P4"];
  const AUTOMATED = [
    "Auto40",
    "Auto45",
    "Auto56",
    "Auto15",
    "Auto18",
    "Auto21",
  ];
  const PHASE_GUIDE = {
    Auto40: "transfer_incident to group:FO Leader.",
    Auto18: "transfer_incident to group:FO Leader.",
    Auto45:
      "Optionally correct priority/title (update_incident_fields) and diagnose. If work logs lack information: process_incident {om_clc: 'More Information'}. P1/P2: {om_clc: 'Accept', assign_clca: 'group:FO Leader'}. P3/P4: query_bo_members, then {om_clc: 'To Next Level', assign_clcnl: 'user:<id>'}.",
    Auto56:
      "P1/P2: transfer_incident to group:FO Leader. P3/P4: process_incident {om_flied: 'To Next Level', assign_flidnl: 'user:<id>'}.",
    Auto15:
      "process_incident {des_ve: '<problem description / solution / self-verification>'}.",
    Auto21:
      "Close only when work logs show the user is satisfied: process_incident {closure_type: 'Confirmed with user', des_ci: '...'}. Otherwise transfer_incident to group:FO.",
  };
  const LOG_META = new Set(
    "app_name module_name process_key process_name process_type ticket_id workdetailsid id keycode active change_time order_id order_status creator last_updater last_update_time create_time title current_phase current_phase_name operate_phase operate_phase_name operate_type business_status current_operator".split(
      " ",
    ),
  );

  const clip = (text, max) => {
    text = String(text ?? "");
    return text.length > max
      ? `${text.slice(0, max)}… [${text.length - max} more chars]`
      : text;
  };
  function unwrap(value) {
    if (typeof value === "string") {
      const s = value.trim();
      if (s.startsWith("{") || s.startsWith("[")) {
        try {
          return unwrap(JSON.parse(s));
        } catch {
          /* Plain text that merely starts with a bracket. */
        }
      }
      return value;
    }
    if (value && typeof value === "object" && typeof value.data === "string")
      return { ...value, data: unwrap(value.data) };
    return value;
  }
  function check(response, what) {
    const r = unwrap(response);
    if (r && typeof r === "object" && !Array.isArray(r)) {
      if (r.errorCode || r.errorMessage)
        throw Error(`${what} failed: ${r.errorMessage || r.errorCode}`);
      if ("code" in r && String(r.code) !== "0")
        throw Error(
          `${what} failed: code ${r.code}${r.message ? ` · ${r.message}` : ""}`,
        );
      if (r.success === false)
        throw Error(
          `${what} failed: ${r.message || r.error || "success=false"}`,
        );
    }
    return r;
  }
  const dataOf = (r) =>
    r && typeof r === "object" && "data" in r ? r.data : r;

  function str(args, name, { required = true, max = 200 } = {}) {
    const v = args[name];
    if (v === undefined || v === null || v === "") {
      if (required) throw new FoInputError(`${name} is required.`);
      return undefined;
    }
    if (typeof v !== "string")
      throw new FoInputError(`${name} must be a string.`);
    const t = v.trim();
    if (!t) throw new FoInputError(`${name} must not be blank.`);
    if (t.length > max)
      throw new FoInputError(`${name} must be at most ${max} characters.`);
    return t;
  }
  function ticketOf(args) {
    const id = str(args, "ticketId").toUpperCase();
    if (!SAFE_ID.test(id))
      throw new FoInputError(
        "ticketId must look like INC-20260918-0007 (letters, digits, hyphens).",
      );
    return id;
  }
  function int(args, name, def, min, max) {
    const v = args[name] ?? def;
    if (!Number.isInteger(v) || v < min || v > max)
      throw new FoInputError(
        `${name} must be an integer from ${min} to ${max}.`,
      );
    return v;
  }
  function stringMap(value, name) {
    if (!value || typeof value !== "object" || Array.isArray(value))
      throw new FoInputError(`${name} must be a JSON object.`);
    const entries = Object.entries(value);
    if (!entries.length) throw new FoInputError(`${name} must not be empty.`);
    for (const [k, v] of entries) {
      if (!FIELD_KEY.test(k))
        throw new FoInputError(`${name} key "${k}" is not a valid field name.`);
      if (typeof v !== "string")
        throw new FoInputError(`${name}.${k} must be a string.`);
    }
    return value;
  }
  const ticketProp = {
    type: "string",
    description: "Incident ID, for example INC-20260918-0007.",
  };
  const READ = { readOnlyHint: true };
  const WRITE = { readOnlyHint: false, consequentialHint: true };

  function createFoTools({
    request,
    tenantId = "1002",
    operator = "FOCopilot",
    maxWritesPerTicket = 8,
    attachmentThreshold = 3000,
  }) {
    if (typeof request !== "function")
      throw TypeError(
        "createFoTools needs a request(operation, payload) function.",
      );
    const writes = new Map();
    const executions = new Map();
    let scriptCache;

    const call = async (op, payload, what = op) =>
      check(await request(op, payload), what);
    async function write(ticket, op, payload) {
      const used = writes.get(ticket) || 0;
      if (used >= maxWritesPerTicket)
        throw Error(
          `Write limit reached: ${maxWritesPerTicket} writes for ${ticket} in this page session. Stop and hand over to a person.`,
        );
      const r = await call(op, payload);
      writes.set(ticket, used + 1);
      return r;
    }
    const writesLeft = (ticket) =>
      `${maxWritesPerTicket - (writes.get(ticket) || 0)} of ${maxWritesPerTicket} writes left for ${ticket}.`;
    const detail = async (ticket) =>
      dataOf(
        await call("queryIncidentDetail", { orderId: ticket, tenantId }),
      ) || {};
    async function scripts() {
      scriptCache ??= call("listScripts", {}).then((r) => r?.scripts || []);
      try {
        return await scriptCache;
      } catch (e) {
        scriptCache = undefined;
        throw e;
      }
    }
    function confirmResult(r, what) {
      const d = dataOf(r);
      const result = r?.result ?? d?.result;
      if (result === false || result === "false")
        throw Error(`${what} returned result=false.`);
      return result === undefined ? "" : ` (result: ${result})`;
    }

    return [
      {
        name: "get_incident_overview",
        description:
          "Start here. Summarize an incident: title, phase, priority, current operator, alarm (NE, CSN), impact, non-empty current-phase fields, whether FO Copilot automation may act, and the next step for the phase.",
        inputSchema: {
          type: "object",
          properties: { ticketId: ticketProp },
          required: ["ticketId"],
        },
        annotations: READ,
        execute: async (args) => {
          const ticket = ticketOf(args);
          const [d, op, pr, al] = await Promise.allSettled([
            detail(ticket),
            call("queryCurrentOperator", { ticketId: ticket }),
            call("queryIncidentPriority", { tenantId, ticketId: ticket }),
            call("queryIncidentAlarmDetail", { orderId: ticket }),
          ]);
          if (d.status === "rejected") throw d.reason;
          const b = d.value.baseInfo || {},
            c = d.value.currentInfo || {};
          const pick = (s) =>
            s.status === "fulfilled" ? dataOf(s.value) : null;
          const operatorNow = pick(op),
            priority = pick(pr) || b.priority,
            alarm = al.status === "fulfilled" ? al.value : null;
          const filled = Object.entries(c).filter(
            ([, v]) => v !== "" && v != null,
          );
          const phase = b.current_phase || "unknown";
          const mine = operatorNow === `user:${operator}`;
          const automation = !operatorNow
            ? "Unknown: current operator could not be read."
            : !mine
              ? `Stop: current operator is ${operatorNow}, not user:${operator}. Read and diagnose only.`
              : AUTOMATED.includes(phase)
                ? `Allowed for ${phase}.`
                : `Stop: ${phase} is not an automated phase. Read and diagnose only.`;
          return [
            `Incident ${ticket}`,
            `Title: ${b.title ?? ""}`,
            `Phase: ${phase} | Priority: ${priority ?? "unknown"} | Current operator: ${operatorNow ?? `unavailable (${op.reason?.message})`}`,
            `Category: ${b.n_category ?? ""} / ${b.subcategory ?? ""} | Type: ${b.ticket_type ?? ""} | Source: ${b.ticket_source ?? ""}`,
            `Impact: ${b.impact ?? ""} | Urgency: ${b.urgency ?? ""} | Impacted CI: ${b.impact_ci ?? ""} | Created: ${b.date ?? ""}`,
            alarm && typeof alarm === "object"
              ? `Alarm: ${alarm.alarmName} (${alarm.alarmSeverity}) | NE ${alarm.alarmNeName} | CSN ${alarm.alarmCsn} | alarm ID ${alarm.alarmId} | first ${alarm.alarmFirstOccurTime} | last ${alarm.alarmOccurTime}`
              : `Alarm: unavailable${al.reason ? ` (${al.reason.message})` : ""}`,
            `Current-phase fields: ${filled.length ? filled.map(([k, v]) => `${k}=${clip(v, 120)}`).join("; ") : "all empty"}`,
            `Automation: ${automation}`,
            mine && PHASE_GUIDE[phase]
              ? `Next step for ${phase}: ${PHASE_GUIDE[phase]}`
              : "",
            `Description (des_rl):\n${clip(b.des_rl, 1500)}`,
          ]
            .filter(Boolean)
            .join("\n");
        },
      },
      {
        name: "get_incident_detail",
        description:
          "Return the raw incident record: baseInfo (title, priority, current_phase, des_rl, ...) and currentInfo (fields of the current phase). process_incident uses currentInfo automatically.",
        inputSchema: {
          type: "object",
          properties: { ticketId: ticketProp },
          required: ["ticketId"],
        },
        annotations: READ,
        execute: async (args) =>
          JSON.stringify(await detail(ticketOf(args)), null, 1),
      },
      {
        name: "get_incident_alarms",
        description:
          "Return the alarm linked to an incident (NE name, alarm ID, CSN, severity, cause) and, when it has a CSN, the matching alarm record from getAlarmByCsn.",
        inputSchema: {
          type: "object",
          properties: { ticketId: ticketProp },
          required: ["ticketId"],
        },
        annotations: READ,
        execute: async (args) => {
          const ticket = ticketOf(args);
          const alarm = await call("queryIncidentAlarmDetail", {
            orderId: ticket,
          });
          let out = `Alarm detail for ${ticket}:\n${JSON.stringify(alarm, null, 1)}`;
          const csn =
            alarm && typeof alarm === "object" ? alarm.alarmCsn : null;
          if (csn) {
            const byCsn = await call("getAlarmByCsn", {
              tenantId: "",
              alarmCsn: String(csn),
            });
            out +=
              byCsn === "" || byCsn == null
                ? `\ngetAlarmByCsn(${csn}) returned no data.`
                : `\ngetAlarmByCsn(${csn}):\n${JSON.stringify(dataOf(byCsn), null, 1)}`;
          }
          return out;
        },
      },
      {
        name: "get_alarm_by_csn",
        description:
          "Look up an alarm record by its CSN (alarm serial number).",
        inputSchema: {
          type: "object",
          properties: {
            alarmCsn: {
              type: "string",
              description: "Alarm CSN, digits only, for example 2193676.",
            },
          },
          required: ["alarmCsn"],
        },
        annotations: READ,
        execute: async (args) => {
          const csn = str(args, "alarmCsn", { max: 32 });
          if (!/^\d+$/.test(csn))
            throw new FoInputError("alarmCsn must contain digits only.");
          const r = await call("getAlarmByCsn", {
            tenantId: "",
            alarmCsn: csn,
          });
          return r === "" || r == null
            ? `getAlarmByCsn(${csn}) returned no data.`
            : JSON.stringify(dataOf(r), null, 1);
        },
      },
      {
        name: "get_current_operator",
        description:
          "Return who currently holds the incident, for example user:FOCopilot or group:FO Leader. FO Copilot may only advance incidents it holds.",
        inputSchema: {
          type: "object",
          properties: { ticketId: ticketProp },
          required: ["ticketId"],
        },
        annotations: READ,
        execute: async (args) => {
          const ticket = ticketOf(args);
          const who = dataOf(
            await call("queryCurrentOperator", { ticketId: ticket }),
          );
          return `Current operator of ${ticket}: ${who}${who === `user:${operator}` ? " (FO Copilot holds it)" : ""}`;
        },
      },
      {
        name: "get_incident_priority",
        description: "Return the incident priority, for example P4.",
        inputSchema: {
          type: "object",
          properties: { ticketId: ticketProp },
          required: ["ticketId"],
        },
        annotations: READ,
        execute: async (args) => {
          const ticket = ticketOf(args);
          return `Priority of ${ticket}: ${dataOf(await call("queryIncidentPriority", { tenantId, ticketId: ticket }))}`;
        },
      },
      {
        name: "get_work_logs",
        description:
          "Page through the incident work logs, newest first. Each entry shows time, operation, phase, status, operator, and the fields it changed (for example ai_initial_diagnosis). Long values are clipped unless fullText is true.",
        inputSchema: {
          type: "object",
          properties: {
            ticketId: ticketProp,
            offset: {
              type: "number",
              description: "Entries to skip. Default: 0.",
            },
            limit: {
              type: "number",
              description: "Entries to return, 1 to 20. Default: 5.",
            },
            fullText: {
              type: "boolean",
              description:
                "Return field values up to 4,000 characters instead of 300. Use with a small limit.",
            },
          },
          required: ["ticketId"],
        },
        annotations: READ,
        execute: async (args) => {
          const ticket = ticketOf(args);
          const offset = int(args, "offset", 0, 0, 10000),
            limit = int(args, "limit", 5, 1, 20);
          if (args.fullText !== undefined && typeof args.fullText !== "boolean")
            throw new FoInputError("fullText must be a boolean.");
          const logs =
            dataOf(
              await call("queryIncidentWorkLogs", {
                tenantId,
                orderId: ticket,
              }),
            ) || [];
          if (!Array.isArray(logs)) return JSON.stringify(logs, null, 1);
          const page = logs.slice(offset, offset + limit);
          const max = args.fullText ? 4000 : 300;
          const lines = [
            `${logs.length} work log entries for ${ticket}; showing ${page.length ? `${offset + 1}–${offset + page.length}` : "none"}, newest first.`,
          ];
          page.forEach((e, i) => {
            lines.push(
              `\n[${offset + i + 1}] ${e.create_time ?? ""} · ${e.operate_type ?? ""} @ ${e.operate_phase ?? ""} (${e.operate_phase_name ?? ""}) → phase ${e.current_phase ?? ""} · status ${e.business_status ?? ""} · operator ${e.current_operator ?? ""} · by ${e.last_updater ?? ""}`,
            );
            for (const [k, v] of Object.entries(e))
              if (!LOG_META.has(k) && v !== "" && v != null)
                lines.push(
                  `  ${k}: ${clip(typeof v === "string" ? v : JSON.stringify(v), max)}`,
                );
          });
          if (offset + limit < logs.length)
            lines.push(
              `\nCall again with offset=${offset + limit} for older entries.`,
            );
          return lines.join("\n");
        },
      },
      {
        name: "query_bo_members",
        description:
          "List members of the BO group with skills and current workload, lightest workload first. Use a member as user:<id> for assign_clcnl or assign_flidnl.",
        inputSchema: { type: "object", properties: {} },
        annotations: READ,
        execute: async () => {
          const members = dataOf(
            await call("queryBoCondition", {
              tenantId: Number(tenantId),
              groupName: "BO",
            }),
          );
          if (!Array.isArray(members)) return JSON.stringify(members, null, 1);
          return (
            `${members.length} BO members:\n` +
            [...members]
              .sort((a, b) => (a.userWork ?? 0) - (b.userWork ?? 0))
              .map(
                (m) =>
                  `user:${m.user} | workload ${m.userWork} | ${m.userSkill || "no skills listed"}`,
              )
              .join("\n")
          );
        },
      },
      {
        name: "list_scripts",
        description:
          "List predefined diagnostic scripts on the Gateway with their scriptCode, risk level, required and optional parameters, and trigger conditions. Filter by keyword to find the script matching an alarm.",
        inputSchema: {
          type: "object",
          properties: {
            keyword: {
              type: "string",
              description:
                "Match text in the name, description, scenarios, or trigger conditions, for example filesystem.",
            },
          },
        },
        annotations: READ,
        execute: async (args) => {
          const keyword = str(args, "keyword", {
            required: false,
            max: 100,
          })?.toLowerCase();
          const all = await scripts();
          const hits = all.filter(
            (s) =>
              !keyword ||
              [
                s.scriptCode,
                s.name,
                s.description,
                ...(s.scenarios || []),
                ...(s.triggerConditions || []),
              ]
                .join(" ")
                .toLowerCase()
                .includes(keyword),
          );
          return (
            `${hits.length} of ${all.length} scripts:\n` +
            hits
              .map((s) => {
                const p = s.inputParameters || [];
                return `\n${s.scriptCode} — ${s.name} [${s.riskLevel ?? "unknown risk"}${s.enabled === false ? ", disabled" : ""}]\n  ${clip(s.description, 200)}\n  Required: ${
                  p
                    .filter((x) => x.required)
                    .map((x) => x.name)
                    .join(", ") || "none"
                } | Optional: ${
                  p
                    .filter((x) => !x.required)
                    .map((x) => x.name)
                    .join(", ") || "none"
                }\n  Triggers: ${(s.triggerConditions || []).join("; ")}`;
              })
              .join("\n")
          );
        },
      },
      {
        name: "list_hosts",
        description:
          "List hosts registered on the Gateway. The list may be empty; then a person must supply the host IP for run_diagnostic_script.",
        inputSchema: { type: "object", properties: {} },
        annotations: READ,
        execute: async () => {
          const r = await call("listHosts", {});
          const hosts = r?.hosts ?? dataOf(r);
          return Array.isArray(hosts) && !hosts.length
            ? "The Gateway has no registered hosts. Ask a person for the host IP; do not guess it from the NE name."
            : JSON.stringify(hosts, null, 1);
        },
      },
      {
        name: "get_script_result",
        description:
          "Poll a script execution by actionInsId. Status is running, completed, failed, or timeout; success is true only when completed. Read long stdout in pages with offset.",
        inputSchema: {
          type: "object",
          properties: {
            actionInsId: {
              type: "string",
              description: "Execution ID returned by run_diagnostic_script.",
            },
            offset: {
              type: "number",
              description: "Stdout character offset. Default: 0.",
            },
            maxChars: {
              type: "number",
              description:
                "Stdout characters to return, 500 to 9,000. Default: 6,000.",
            },
          },
          required: ["actionInsId"],
        },
        annotations: READ,
        execute: async (args) => {
          const id = str(args, "actionInsId", { max: 64 });
          if (!SAFE_ID.test(id))
            throw new FoInputError(
              "actionInsId must contain only letters, digits, and hyphens.",
            );
          const offset = int(args, "offset", 0, 0, 10_000_000),
            maxChars = int(args, "maxChars", 6000, 500, 9000);
          const r = unwrap(await request("getExecution", { actionInsId: id }));
          if (r?.errorMessage || r?.error)
            throw Error(`getExecution failed: ${r.errorMessage || r.error}`);
          const stdout = String(r?.result?.stdout ?? ""),
            stderr = String(r?.result?.stderr ?? "");
          const hosts = (r?.hostStateList || [])
            .map((h) =>
              `${h.ip ?? h.hostIp ?? "?"}: ${h.errorCode ?? ""} ${h.errorMessage ?? ""}`.trim(),
            )
            .join("; ");
          const end = Math.min(stdout.length, offset + maxChars);
          return [
            `Execution ${id}: status ${r?.status} | success ${r?.success} | executeState ${r?.executeState ?? ""} | exitCode ${r?.result?.exitCode ?? ""}`,
            hosts ? `Hosts: ${hosts}` : "",
            stderr ? `stderr: ${clip(stderr, 1000)}` : "",
            stdout
              ? `stdout characters ${offset}–${end} of ${stdout.length}:\n${stdout.slice(offset, end)}`
              : "stdout is empty.",
            end < stdout.length
              ? `\nCall again with offset=${end} for more stdout.`
              : "",
          ]
            .filter(Boolean)
            .join("\n");
        },
      },
      {
        name: "run_diagnostic_script",
        description:
          "Run a predefined diagnostic script on a host through the Gateway. Pass every required parameter from list_scripts and always hostIp or ipList. Values may contain only letters, digits, and . _ : / + -. Each ticket, script, and host runs at most once per page session; poll get_script_result instead of re-running. Confirm with the user first.",
        inputSchema: {
          type: "object",
          properties: {
            ticketId: ticketProp,
            scriptCode: {
              type: "string",
              description:
                "scriptCode from list_scripts, for example filesystem_usage_evidence_collect.",
            },
            parameters: {
              type: "object",
              description:
                'Script parameters, for example {"hostName":"host-1","hostIp":"10.0.0.31","fileSystem":"/","mountPoint":"/","alarmUsage":"90","alarmThreshold":"80"}.',
            },
          },
          required: ["ticketId", "scriptCode", "parameters"],
        },
        annotations: WRITE,
        execute: async (args) => {
          const ticket = ticketOf(args);
          const code = str(args, "scriptCode", { max: 100 });
          if (!/^[A-Za-z0-9_.-]+$/.test(code))
            throw new FoInputError("scriptCode contains invalid characters.");
          const raw = args.parameters;
          if (!raw || typeof raw !== "object" || Array.isArray(raw))
            throw new FoInputError("parameters must be a JSON object.");
          const params = {};
          for (const [k, v] of Object.entries(raw)) {
            if (!FIELD_KEY.test(k))
              throw new FoInputError(`Parameter name "${k}" is invalid.`);
            const values = Array.isArray(v) ? v : [v];
            for (const x of values)
              if (
                (typeof x !== "string" && typeof x !== "number") ||
                !SAFE_VALUE.test(String(x))
              )
                throw new FoInputError(
                  `Parameter ${k} may contain only letters, digits, and . _ : / + -.`,
                );
            params[k] = Array.isArray(v) ? v.map(String) : String(v);
          }
          if (!params.hostIp && !params.ipList)
            throw new FoInputError("parameters must include hostIp or ipList.");
          const script = (await scripts()).find((s) => s.scriptCode === code);
          if (!script)
            throw new FoInputError(
              `Unknown scriptCode ${code}. Call list_scripts.`,
            );
          if (script.enabled === false)
            throw new FoInputError(`${code} is disabled.`);
          const missing = (script.inputParameters || [])
            .filter(
              (p) =>
                p.required &&
                p.source !== "chat_attachment" &&
                !(p.name in params),
            )
            .map((p) => p.name);
          if (missing.length)
            throw new FoInputError(
              `Missing required parameters for ${code}: ${missing.join(", ")}.`,
            );
          const key = `${ticket}|${code}|${[].concat(params.hostIp || params.ipList).join(",")}`;
          if (executions.has(key))
            return `Already executed ${code} for ${ticket} on this host: actionInsId ${executions.get(key)}. Poll get_script_result; do not re-run.`;
          const r = await call("executeScript", {
            scriptCode: code,
            parameters: params,
          });
          if (!r?.actionInsId)
            throw Error(
              `executeScript returned no actionInsId: ${clip(JSON.stringify(r), 300)}`,
            );
          executions.set(key, r.actionInsId);
          return `Submitted ${code} for ${ticket}: actionInsId ${r.actionInsId}, status ${r.status}. Poll get_script_result until status is completed, failed, or timeout. If it fails, record a qualitative diagnosis instead of re-running.`;
        },
      },
      {
        name: "write_initial_diagnosis",
        description:
          "Write the AI initial diagnosis to the incident (ai_initial_diagnosis). Text longer than the attachment threshold is also uploaded with setAiAttachment and linked via initial_diagnosis_attach. The incident detail does not echo the diagnosis; result: true confirms it. Does not change the phase. Confirm with the user first.",
        inputSchema: {
          type: "object",
          properties: {
            ticketId: ticketProp,
            diagnosis: {
              type: "string",
              description:
                "Diagnosis text: evidence, assessment, and next steps.",
            },
          },
          required: ["ticketId", "diagnosis"],
        },
        annotations: WRITE,
        execute: async (args) => {
          const ticket = ticketOf(args);
          const text = str(args, "diagnosis", { max: 200_000 });
          const form = { ai_initial_diagnosis: text };
          let note = "";
          if (text.length > attachmentThreshold) {
            const r = await write(ticket, "setAiAttachment", {
              orderId: ticket,
              message: text,
            });
            const d = dataOf(r);
            const token = typeof d === "string" ? d : (d?.token ?? d?.data);
            if (!token)
              throw Error(
                `setAiAttachment returned no token: ${clip(JSON.stringify(r), 300)}`,
              );
            form.ai_initial_diagnosis = `${text.slice(0, attachmentThreshold)}\n[Full diagnosis attached: initial_diagnosis_attach]`;
            form.initial_diagnosis_attach = String(token);
            note = ` Uploaded ${text.length} characters as an attachment.`;
          }
          const r = await write(ticket, "updateIncidentParam", {
            order_id: ticket,
            operator,
            form_data: form,
          });
          return `Wrote the initial diagnosis to ${ticket}${confirmResult(r, "updateIncidentParam")}.${note} ${writesLeft(ticket)}`;
        },
      },
      {
        name: "update_incident_fields",
        description:
          "Correct the incident title or priority (updateIncidentParam). Does not change the phase. Confirm with the user first.",
        inputSchema: {
          type: "object",
          properties: {
            ticketId: ticketProp,
            title: { type: "string", description: "New title." },
            priority: {
              type: "string",
              enum: PRIORITIES,
              description: "New priority.",
            },
          },
          required: ["ticketId"],
        },
        annotations: WRITE,
        execute: async (args) => {
          const ticket = ticketOf(args);
          const form = {};
          const title = str(args, "title", { required: false, max: 300 });
          if (title) form.title = title;
          if (args.priority !== undefined) {
            if (!PRIORITIES.includes(args.priority))
              throw new FoInputError(
                `priority must be one of: ${PRIORITIES.join(", ")}.`,
              );
            form.priority = args.priority;
          }
          if (!Object.keys(form).length)
            throw new FoInputError("Provide title, priority, or both.");
          const r = await write(ticket, "updateIncidentParam", {
            order_id: ticket,
            operator,
            form_data: form,
          });
          return `Updated ${Object.keys(form).join(" and ")} of ${ticket}${confirmResult(r, "updateIncidentParam")}. ${writesLeft(ticket)}`;
        },
      },
      {
        name: "add_comment",
        description:
          "Add a comment to the incident timeline (ticketComment). Use after each action to record what FO Copilot did. Confirm with the user first.",
        inputSchema: {
          type: "object",
          properties: {
            ticketId: ticketProp,
            description: { type: "string", description: "Comment text." },
          },
          required: ["ticketId", "description"],
        },
        annotations: WRITE,
        execute: async (args) => {
          const ticket = ticketOf(args);
          const description = str(args, "description", { max: 4000 });
          await write(ticket, "ticketComment", {
            order_id: ticket,
            description,
            operation_type: "Manual",
          });
          return `Added a comment to ${ticket}. ${writesLeft(ticket)}`;
        },
      },
      {
        name: "transfer_incident",
        description:
          "Transfer the incident to another group or user (incidentTransfer), for example group:FO Leader. FO Copilot loses the incident afterwards. Confirm with the user first.",
        inputSchema: {
          type: "object",
          properties: {
            ticketId: ticketProp,
            transferTo: {
              type: "string",
              description:
                "Target as group:<name> or user:<id>, for example group:FO Leader.",
            },
          },
          required: ["ticketId", "transferTo"],
        },
        annotations: WRITE,
        execute: async (args) => {
          const ticket = ticketOf(args);
          const to = str(args, "transferTo", { max: 100 });
          if (!ASSIGNEE.test(to))
            throw new FoInputError(
              "transferTo must be group:<name> or user:<id>.",
            );
          await write(ticket, "incidentTransfer", {
            tenantId,
            ticketId: ticket,
            transferTo: to,
          });
          return `Transferred ${ticket} to ${to}. Call get_current_operator to confirm. ${writesLeft(ticket)}`;
        },
      },
      {
        name: "process_incident",
        description:
          "Submit the current phase with the given field values (processIncident), for example {om_clc: 'To Next Level', assign_clcnl: 'user:example'}. The tool reads currentInfo from the incident detail and sends it as originalFieldData. See get_incident_overview for the fields each phase expects. Confirm with the user first.",
        inputSchema: {
          type: "object",
          properties: {
            ticketId: ticketProp,
            fieldData: {
              type: "object",
              description: "Phase fields to submit; every value is a string.",
            },
          },
          required: ["ticketId", "fieldData"],
        },
        annotations: WRITE,
        execute: async (args) => {
          const ticket = ticketOf(args);
          const fieldData = stringMap(args.fieldData, "fieldData");
          const current = (await detail(ticket)).currentInfo;
          if (!current || typeof current !== "object")
            throw Error(
              `Incident detail for ${ticket} has no currentInfo; not submitting.`,
            );
          await write(ticket, "processIncident", {
            tenantId,
            ticketId: ticket,
            fieldData,
            originalFieldData: current,
          });
          return `Submitted ${ticket} with ${Object.keys(fieldData).join(", ")}. Call get_incident_overview to see the new phase and operator. ${writesLeft(ticket)}`;
        },
      },
    ];
  }
  Object.assign(globalThis, { createFoTools, FoInputError });
})();
