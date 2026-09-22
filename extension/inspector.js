import { discover, execute } from "./bridge.js";
import { requiresConfirmation } from "./core.js";
import {
  diagnose,
  lintTools,
  schemaTemplate,
  validateArgs,
} from "./inspect.js";

const $ = (id) => document.getElementById(id);
const t = (key, ...args) =>
  (chrome.i18n?.getMessage(key) || key).replace(
    /\{(\d)\}/g,
    (_, i) => args[i] ?? "",
  );
document.documentElement.lang = chrome.i18n?.getUILanguage?.() || "en";
for (const el of document.querySelectorAll("[data-i18n]"))
  el.textContent = t(el.dataset.i18n);
document.title = t("inspectorTitle");

const windowId = Number(new URLSearchParams(location.search).get("window"));
const ICONS = {
  ok: ["M5 12.5 10 17 19 7"],
  error: ["m7 7 10 10M7 17 17 7"],
  warn: ["M12 7v6", "M12 16.5v.01"],
  info: ["M12 11v5", "M12 7.5v.01"],
};
const LABEL = { ok: "OK", error: "ERROR", warn: "WARN", info: "INFO" };

let currentTab = null;
let data = null;
let checks = [];
let lint = [];
let events = [];
let calls = [];
let controller = null;
let windowGone = false;

function svgIcon(paths) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  for (const d of paths) {
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", d);
    svg.append(path);
  }
  return svg;
}
function el(tag, props = {}, ...children) {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children.filter((c) => c !== null && c !== undefined));
  return node;
}
const say = (finding) => t(finding.key, ...finding.args);
const detail = (finding) => t(finding.key + "Detail", ...finding.args);

function log(text) {
  events.unshift({ at: new Date(), text });
  events = events.slice(0, 100);
  renderEvents();
}
function renderEvents() {
  const host = $("events");
  host.replaceChildren();
  if (!events.length) host.append(el("li", { textContent: t("eventsEmpty") }));
  for (const e of events)
    host.append(
      el(
        "li",
        {},
        el("time", {
          dateTime: e.at.toISOString(),
          textContent: e.at.toLocaleTimeString(),
        }),
        el("span", { textContent: e.text }),
      ),
    );
}

function render() {
  const noPage = !currentTab;
  $("emptyState").hidden = !noPage && !windowGone;
  $("emptyState").textContent = windowGone
    ? t("inspectorWindowClosed")
    : t("inspectorNoPage");
  $("pageInfo").textContent = currentTab
    ? `${currentTab.title || ""} · ${currentTab.url || ""}`
    : "";
  for (const id of ["diagnosis", "toolsSection", "callSection"])
    $(id).hidden = noPage;
  if (noPage) return;

  const host = $("checks");
  host.replaceChildren();
  for (const c of checks)
    host.append(
      el(
        "li",
        { className: "level-" + c.level },
        svgIcon(ICONS[c.level]),
        el(
          "div",
          {},
          el("strong", { textContent: say(c) }),
          el("small", { textContent: detail(c) }),
        ),
      ),
    );

  const tools = data?.tools || [];
  $("toolsHeading").textContent = t("sectionTools", tools.length);
  $("toolsSection").hidden = !tools.length;
  const cards = $("toolCards");
  cards.replaceChildren();
  tools.forEach((tool, i) => cards.append(toolCard(tool, lint[i] || [])));
  renderCallTools();
}

function toolCard(tool, findings) {
  const problems = findings.filter((f) => f.level !== "info").length;
  const readOnly = !requiresConfirmation(tool);
  const head = el(
    "div",
    { className: "inspect-tool-head" },
    el("strong", { textContent: tool.name || "?" }),
    el("span", {
      className: readOnly ? "badge" : "badge warn",
      textContent: readOnly ? t("badgeReadOnly") : t("badgeApproval"),
    }),
    el("span", {
      className: "summary" + (problems ? " has-issues" : ""),
      textContent: problems ? t("issuesCount", problems) : t("noIssues"),
    }),
    el("span", { className: "spacer" }),
  );
  if (!tool.schemaError) {
    const tryIt = el("button", {
      type: "button",
      className: "text-button",
      textContent: t("tryTool"),
    });
    tryIt.onclick = () => {
      $("callTool").value = tool.name;
      resetArgs();
      $("callSection").scrollIntoView({ behavior: "smooth", block: "start" });
      $("callArgs").focus({ preventScroll: true });
    };
    head.append(tryIt);
  }
  const card = el("article", { className: "inspect-tool" }, head);
  if (tool.description)
    card.append(
      el("p", { className: "description", textContent: tool.description }),
    );
  if (findings.length) {
    const list = el("ul", { className: "issues" });
    for (const f of findings)
      list.append(
        el(
          "li",
          { className: "level-" + f.level },
          svgIcon(ICONS[f.level]),
          el("span", { textContent: say(f) }),
        ),
      );
    card.append(list);
  }
  const schema = tool.inputSchema;
  const hasInput =
    schema &&
    (typeof schema !== "object" || Object.keys(schema.properties || {}).length);
  card.append(
    hasInput
      ? el(
          "details",
          {},
          el("summary", { textContent: t("showSchema") }),
          el("pre", {
            textContent:
              typeof schema === "string"
                ? schema
                : JSON.stringify(schema, null, 2),
          }),
        )
      : el("p", { className: "hint", textContent: t("noSchema") }),
  );
  return card;
}

function callable() {
  return (data?.tools || []).filter((tool) => tool.name && !tool.schemaError);
}
function selectedTool() {
  return callable().find((tool) => tool.name === $("callTool").value);
}
function renderCallTools() {
  const tools = callable();
  const select = $("callTool");
  const previous = select.value;
  select.replaceChildren(
    ...tools.map((tool) =>
      el("option", { value: tool.name, textContent: tool.name }),
    ),
  );
  $("callEmpty").hidden = Boolean(tools.length);
  $("callForm").hidden = !tools.length;
  if (tools.some((tool) => tool.name === previous)) select.value = previous;
  else if (tools.length) resetArgs();
}
function resetArgs() {
  const tool = selectedTool();
  $("callArgs").value = tool
    ? JSON.stringify(
        schemaTemplate(tool.inputSchema || { type: "object" }),
        null,
        2,
      )
    : "";
  $("callNotes").replaceChildren();
}

function prettify(value) {
  try {
    return JSON.stringify(JSON.parse(value), null, 2);
  } catch {
    return value;
  }
}
function notesWith(text, items, action, run) {
  const notes = $("callNotes");
  notes.replaceChildren(el("div", { textContent: text }));
  if (items.length) {
    const list = el("ul");
    for (const item of items) list.append(el("li", { textContent: item }));
    notes.append(list);
  }
  if (action) {
    const b = el("button", {
      type: "button",
      className: "secondary",
      textContent: action,
    });
    b.onclick = run;
    notes.append(b);
  }
}
async function call({ force = false, confirmed = false } = {}) {
  if (controller) {
    controller.abort();
    return;
  }
  const tool = selectedTool();
  if (!tool) return;
  let args;
  try {
    args = JSON.parse($("callArgs").value || "{}");
    if (!args || typeof args !== "object" || Array.isArray(args))
      throw Error("{ … }");
  } catch (e) {
    notesWith(t("argsNotJson", e.message), []);
    return;
  }
  const problems = validateArgs(tool.inputSchema, args);
  if (problems.length && !force) {
    notesWith(t("argsInvalid"), problems.map(say), t("callAnyway"), () =>
      call({ force: true }),
    );
    return;
  }
  if (requiresConfirmation(tool) && !confirmed) {
    notesWith(t("callConfirm"), [], t("callTool"), () =>
      call({ force: true, confirmed: true }),
    );
    return;
  }
  $("callNotes").replaceChildren();
  controller = new AbortController();
  $("callButton").textContent = t("stopCall");
  $("callStatus").className = "call-status";
  $("callStatus").textContent = "…";
  $("callResult").hidden = true;
  const { schemaError, ...definition } = tool;
  const started = performance.now();
  const entry = {
    at: new Date().toISOString(),
    url: currentTab?.url,
    tool: tool.name,
    args,
  };
  try {
    const value = await execute(data, definition, args, controller.signal);
    entry.ok = true;
    entry.result = value;
  } catch (e) {
    entry.ok = false;
    entry.error = e.message;
  }
  entry.ms = Math.round(performance.now() - started);
  controller = null;
  $("callButton").textContent = t("callTool");
  $("callStatus").className = "call-status" + (entry.ok ? "" : " error");
  $("callStatus").textContent = entry.ok
    ? t("callSucceeded", entry.ms)
    : t("callFailed", entry.ms);
  $("callResult").textContent = entry.ok ? prettify(entry.result) : entry.error;
  $("callResult").hidden = false;
  calls.push(entry);
  log(t("eventCall", tool.name, entry.ok ? t("eventOk") : t("eventError")));
}

async function inspect() {
  if (windowGone) return render();
  const [tab] = await chrome.tabs
    .query({ active: true, windowId })
    .catch(() => []);
  currentTab = tab || null;
  if (!tab) {
    data = null;
    return render();
  }
  data = await discover(tab.id, "inspect").catch(() => null);
  checks = diagnose(data);
  lint = data ? lintTools(data.tools) : [];
  log(t("eventInspected", tab.title || tab.url || "", data?.tools.length ?? 0));
  render();
}
let timer;
function inspectSoon() {
  clearTimeout(timer);
  timer = setTimeout(inspect, 250);
}

function report() {
  const lines = [
    "# WebMCP inspection",
    "",
    `- Page: ${currentTab?.title || ""}`,
    `- URL: ${currentTab?.url || ""}`,
    `- Time: ${new Date().toISOString()}`,
    `- Interface: ${data?.mode || "unavailable"}`,
    `- Browser: ${navigator.userAgent}`,
    "",
    "## Diagnosis",
    "",
    ...checks.map((c) => `- [${LABEL[c.level]}] ${say(c)}. ${detail(c)}`),
  ];
  const tools = data?.tools || [];
  if (tools.length) lines.push("", `## Tools (${tools.length})`);
  tools.forEach((tool, i) => {
    lines.push("", `### ${tool.name}`, "");
    lines.push(requiresConfirmation(tool) ? "Needs approval." : "Read-only.");
    for (const f of lint[i] || [])
      lines.push(`- [${LABEL[f.level]}] ${say(f)}`);
  });
  return lines.join("\n") + "\n";
}
async function copy(button, text) {
  await navigator.clipboard.writeText(text);
  const label = button.textContent;
  button.textContent = t("copied");
  setTimeout(() => (button.textContent = label), 1200);
}

$("reinspect").onclick = inspect;
$("callTool").onchange = resetArgs;
$("resetArgs").onclick = resetArgs;
$("callButton").onclick = () => call();
$("copyReport").onclick = (e) => copy(e.currentTarget, report());
$("copyTools").onclick = (e) =>
  copy(e.currentTarget, JSON.stringify(data?.tools || [], null, 2));
$("copyCalls").onclick = (e) =>
  copy(e.currentTarget, JSON.stringify(calls, null, 2));

chrome.tabs.onActivated.addListener((info) => {
  if (info.windowId === windowId) inspectSoon();
});
chrome.tabs.onUpdated.addListener((id, change) => {
  if (id === currentTab?.id && (change.status === "complete" || change.title))
    inspectSoon();
});
chrome.windows.onRemoved.addListener((id) => {
  if (id !== windowId) return;
  windowGone = true;
  currentTab = null;
  render();
});
chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg?.type === "toolchange" && sender.tab?.id === currentTab?.id) {
    log(t("eventToolChange"));
    inspectSoon();
  }
});

renderEvents();
await inspect();
