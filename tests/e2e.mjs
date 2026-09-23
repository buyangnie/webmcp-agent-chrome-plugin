import { chromium } from "playwright";
import { resolve } from "node:path";
import { mkdir, mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import assert from "node:assert/strict";
const extension = resolve("extension");
const profile = await mkdtemp(resolve(tmpdir(), "webmcp-agent-test-"));
await mkdir("test-results", { recursive: true });
const context = await chromium.launchPersistentContext(profile, {
  headless: true,
  channel: "chromium",
  locale: "en-US",
  args: [
    "--lang=en-US",
    "--disable-gpu",
    `--disable-extensions-except=${extension}`,
    `--load-extension=${extension}`,
    "--enable-features=WebMCPTesting",
    "--enable-blink-features=WebMCP",
  ],
  viewport: { width: 440, height: 900 },
});
const TICKET = "INC-20260918-0007";
const TOOL_COUNT = "17 tools";
const API = {
  status: { gde: true, gateway: true, allowWrite: true },
  queryIncidentDetail: {
    code: "0",
    data: {
      baseInfo: {
        title: "Mock filesystem usage high",
        priority: "P3",
        current_phase: "Auto45",
        des_rl: "Mock alarm text",
      },
      currentInfo: { om_clc: "" },
    },
  },
  queryCurrentOperator: { code: "0", data: "user:FOCopilot" },
  queryIncidentPriority: { code: "0", data: "P3" },
  queryIncidentAlarmDetail: {
    alarmName: "High file system usage",
    alarmSeverity: "Critical",
    alarmNeName: "MOCKVM",
    alarmCsn: "1",
  },
};
// The demo proxies to live GDE/Gateway; keep the extension suite hermetic.
await context.route("http://127.0.0.1:8124/api/**", (route) => {
  const op = new URL(route.request().url()).pathname.slice("/api/".length);
  route.fulfill({ json: API[op] ?? { code: "0", data: [] } });
});
try {
  const sw =
    context.serviceWorkers()[0] ||
    (await context.waitForEvent("serviceworker"));
  const id = new URL(sw.url()).host;
  const demo = await context.newPage();
  await demo.goto("http://127.0.0.1:8124/demo-ops-factory/");
  await demo.waitForFunction(() => window.__webmcpDemo);
  await demo.locator(".ticket h3", { hasText: "Mock filesystem" }).waitFor();
  console.log(
    "Demo mode:",
    await demo.evaluate(() => window.__webmcpDemo.mode),
  );
  const panel = await context.newPage();
  await panel.goto(`chrome-extension://${id}/panel.html`);
  const errors = [];
  panel.on("pageerror", (e) => errors.push(e.message));
  const demoId = await sw.evaluate(async () => {
    const tabs = await chrome.tabs.query({});
    return tabs.find((t) => t.url?.includes("/demo-ops-factory/")).id;
  });
  const toolCount = async (text) => {
    await panel.locator("#toolsButton").click();
    await panel.waitForFunction(
      (text) => document.getElementById("toolsButton").textContent === text,
      text,
    );
    await panel.keyboard.press("Escape");
  };
  await sw.evaluate((id) => chrome.tabs.update(id, { active: true }), demoId);
  await toolCount(TOOL_COUNT);
  assert.equal(await panel.locator("#dot.tools").count(), 1);
  await panel.locator("#settings").click();
  await panel.locator("#apiKey").fill("test-key");
  await panel.locator("#baseUrl").fill("https://mock.invalid/v1");
  await panel.locator("#model").fill("test-model");
  await panel
    .getByRole("button", { name: "Save changes", exact: true })
    .click();
  let requests = 0;
  let sawPageText = false;
  let sawSkillBlock = false;
  let sawSkillTool = false;
  await context.route(
    "https://mock.invalid/v1/chat/completions",
    async (route) => {
      requests++;
      const body = route.request().postDataJSON();
      if (body.messages[0].content.includes("\nPage content (untrusted"))
        sawPageText = true;
      const last = body.messages.at(-1);
      if (body.tools?.some((t) => t.function.name === "load_skill"))
        sawSkillTool = true;
      let delta;
      if (last.role === "user" && last.content === "Draw the flow") {
        delta = {
          content:
            "```mermaid\nflowchart LR\n  A[Ask] --> B{Tools?}\n  B --> C[Answer]\n```\n\n```mermaid\nflowchart LR\n  A -->\n  ((broken\n```",
        };
      } else if (
        last.role === "user" &&
        last.content.includes("[Skill: summarize]")
      ) {
        sawSkillBlock = true;
        delta = { content: "Summary done." };
      } else if (
        last.role === "user" &&
        last.content.includes("automatically")
      ) {
        delta = {
          tool_calls: [
            {
              index: 0,
              id: "skill-" + requests,
              type: "function",
              function: {
                name: "load_skill",
                arguments: JSON.stringify({ name: "summarize" }),
              },
            },
          ],
        };
      } else if (last.role === "tool") {
        delta = {
          content:
            '## Results\n\nTicket details retrieved.\n\n| Field | Result |\n|---|---|\n| Status | Read |\n\n```json\n{"ok": true}\n```\n\n<img src=x onerror="alert(1)">',
        };
      } else {
        const name = last.content.includes("Update")
          ? "add_comment"
          : "get_incident_overview";
        const t = body.tools.find((t) =>
          t.function.description.startsWith(name),
        );
        delta = {
          tool_calls: [
            {
              index: 0,
              id: "test-" + requests,
              type: "function",
              function: {
                name: t.function.name,
                arguments: JSON.stringify(
                  name === "get_incident_overview"
                    ? { ticketId: TICKET }
                    : {
                        ticketId: TICKET,
                        description: "Extension end-to-end test",
                      },
                ),
              },
            },
          ],
        };
      }
      const event = JSON.stringify({
        choices: [
          { delta, finish_reason: delta.tool_calls ? "tool_calls" : "stop" },
        ],
      });
      await route.fulfill({
        contentType: "text/event-stream",
        body: "data: " + event + "\n\ndata: [DONE]\n\n",
      });
    },
  );
  await panel.locator("#prompt").fill("Get ticket details");
  await panel.locator("#send").click();
  await panel.waitForFunction(
    () => document.getElementById("runStatus").textContent === "Completed",
  );
  assert.equal(await panel.locator(".tool-card.done").count(), 1);
  assert.equal(await panel.locator(".body table").count(), 1);
  assert.equal(await panel.locator(".body img").count(), 0);
  assert.ok(
    (await demo.locator("#mcpBanner").innerText()).includes(
      "get_incident_overview",
    ),
  );
  await panel.locator("#prompt").fill("Update ticket status");
  await panel.locator("#send").click();
  await panel.getByRole("button", { name: "Allow", exact: true }).waitFor();
  await panel.waitForFunction(() => {
    const b = [...document.querySelectorAll("button")].find(
      (b) => b.textContent === "Allow",
    );
    return (
      b &&
      b.getBoundingClientRect().bottom <=
        document.querySelector("footer").getBoundingClientRect().top
    );
  });
  await panel.getByRole("button", { name: "Decline", exact: true }).click();
  await panel.waitForFunction(
    () => document.getElementById("runStatus").textContent === "Completed",
  );
  assert.ok(
    (await demo.locator("#mcpBanner").innerText()).includes(
      "get_incident_overview",
    ),
  );
  await panel.locator("#prompt").fill("Update ticket status");
  await panel.locator("#send").click();
  await panel.getByRole("button", { name: "Allow", exact: true }).click();
  await panel.waitForFunction(
    () => document.getElementById("runStatus").textContent === "Completed",
  );
  assert.ok(
    (await demo.locator("#mcpBanner").innerText()).includes(
      "add_comment (returned)",
    ),
  );
  await panel.locator("#newSession").click();
  await panel.locator("#welcome").waitFor();
  assert.equal(await panel.locator(".message").count(), 0);
  await panel.locator("#prompt").fill("Update ticket status");
  await panel.locator("#send").click();
  await panel.getByRole("button", { name: "Allow", exact: true }).waitFor();
  await panel.locator("#send").click();
  await panel.waitForFunction(
    () => document.getElementById("runStatus").textContent === "Stopped",
  );
  assert.equal(
    await panel.getByRole("button", { name: "Allow", exact: true }).count(),
    0,
  );
  await demo.reload();
  await demo.waitForFunction(() => window.__webmcpDemo);
  await toolCount(TOOL_COUNT);
  await panel.locator(".divider").waitFor();
  await panel.locator("#prompt").fill("Get ticket details");
  await panel.locator("#send").click();
  await panel.waitForFunction(
    () => document.getElementById("runStatus").textContent === "Completed",
  );
  const transcript = () =>
    panel.evaluate(() =>
      [...document.getElementById("messages").children].map(
        (n) => n.className + ":" + n.textContent,
      ),
    );
  const before = await transcript();
  assert.equal(before.filter((x) => x.startsWith("notice error")).length, 0);
  await panel.reload();
  await panel.locator("#messages .message.assistant").waitFor();
  assert.deepEqual(await transcript(), before);
  const plain = await context.newPage();
  await plain.goto("http://127.0.0.1:8124/tests/");
  const plainId = await sw.evaluate(async () => {
    const tabs = await chrome.tabs.query({});
    return tabs.find((t) => t.url?.endsWith("/tests/")).id;
  });
  await sw.evaluate((id) => chrome.tabs.update(id, { active: true }), plainId);
  await toolCount("0 tools");
  assert.equal(await panel.locator("#dot.tools").count(), 0);
  assert.equal(await panel.locator("#attachments .chip").count(), 1);
  assert.ok(sawPageText, "page text should reach the model");

  const done = () =>
    panel.waitForFunction(
      () => document.getElementById("runStatus").textContent === "Completed",
    );
  await panel.locator("#newSession").click();
  assert.equal(await panel.locator("#skillSuggestions button").count(), 3);
  await panel.locator("#prompt").fill("/sum");
  await panel.locator(".slash-item").first().waitFor();
  assert.equal(
    await panel.locator(".slash-item strong").first().textContent(),
    "/summarize",
  );
  await panel.keyboard.press("Enter");
  assert.equal(
    await panel.locator("#attachments .chip.skill").textContent(),
    "/summarize",
  );
  assert.equal(await panel.locator("#prompt").inputValue(), "");
  await panel.locator("#prompt").fill("focus on pricing");
  await panel.locator("#send").click();
  await panel.getByText("Summary done.").waitFor();
  await done();
  assert.ok(sawSkillBlock, "manual skill instructions should reach the model");
  assert.equal(await panel.locator(".skill-tag").textContent(), "/summarize");
  assert.equal(await panel.locator("#attachments .chip.skill").count(), 0);

  await panel.locator("#prompt").fill("Pick a skill automatically");
  await panel.locator("#send").click();
  await panel.locator(".skill-used").waitFor();
  await panel.locator("#messages .body table").waitFor();
  await done();
  assert.ok(sawSkillTool, "auto skills should be offered as load_skill");
  assert.equal(await panel.locator(".skill-used").count(), 1);
  assert.equal(await panel.locator(".tool-card").count(), 0);

  await panel.locator("#settings").click();
  await panel.locator("#tabSkills").click();
  assert.equal(await panel.locator(".skill-item").count(), 3);
  await panel.locator("#newSkill").click();
  await panel.locator("#skillName").fill("summarize");
  await panel.locator("#skillDescription").fill("Duplicate");
  await panel.locator("#skillInstructions").fill("Nope");
  await panel.locator("#saveSkill").click();
  assert.match(await panel.locator("#skillError").textContent(), /already/);
  await panel.locator("#skillName").fill("/e2e-check");
  await panel.locator("#saveSkill").click();
  await panel.locator(".skill-item").nth(3).waitFor();
  assert.equal(await panel.locator(".skill-item").count(), 4);
  await panel.keyboard.press("Escape");
  await panel.locator("#prompt").fill("/e2e");
  assert.equal(
    await panel.locator(".slash-item strong").first().textContent(),
    "/e2e-check",
  );
  await panel.keyboard.press("Escape");
  assert.ok(await panel.locator("#slashMenu").isHidden());
  await panel.locator("#prompt").fill("");
  assert.ok(await panel.locator("#modelLabel").isHidden());

  await panel.locator("#prompt").fill("Draw the flow");
  await panel.locator("#send").click();
  await panel.locator("figure.diagram .diagram-view img").waitFor();
  await panel.locator("figure.diagram .diagram-error").waitFor();
  assert.match(
    await panel.locator("figure.diagram .diagram-view img").getAttribute("src"),
    /^data:image\/svg\+xml/,
  );
  await panel.locator("figure.diagram .diagram-view").click();
  await panel.locator("#diagramDialog[open]").waitFor();
  await panel.keyboard.press("Escape");

  assert.equal(await panel.locator("#inspect[hidden]").count(), 1);
  await panel.locator("#settings").click();
  await panel.locator("#tabDeveloper").click();
  await panel.locator("#inspectorEnabled").check();
  await panel.keyboard.press("Escape");
  await sw.evaluate((id) => chrome.tabs.update(id, { active: true }), demoId);
  await toolCount(TOOL_COUNT);
  await panel.locator("#toolsButton").click();
  const opened = context.waitForEvent("page");
  await panel.locator("#inspect").click();
  const inspector = await opened;
  inspector.on("pageerror", (e) => errors.push("inspector: " + e.message));
  await inspector.locator(".inspect-tool").nth(2).waitFor();
  assert.equal(await inspector.locator(".inspect-tool").count(), 17);
  assert.equal(await inspector.locator(".checks .level-error").count(), 0);
  assert.match(
    await inspector.locator(".checks").innerText(),
    /WebMCP is available/,
  );
  assert.match(
    await inspector
      .locator(".inspect-tool", { hasText: "add_comment" })
      .innerText(),
    /Needs approval/,
  );
  await inspector.locator("#callTool").selectOption("get_incident_overview");
  await inspector.locator("#callArgs").fill("{}");
  await inspector.locator("#callButton").click();
  assert.match(
    await inspector.locator("#callNotes").innerText(),
    /don't match/,
  );
  await inspector
    .locator("#callArgs")
    .fill(JSON.stringify({ ticketId: TICKET }));
  await inspector.locator("#callButton").click();
  await inspector.waitForFunction(() =>
    document.getElementById("callStatus").textContent.startsWith("Succeeded"),
  );
  assert.match(
    await inspector.locator("#callResult").innerText(),
    new RegExp(TICKET),
  );
  await inspector.locator("#callTool").selectOption("add_comment");
  await inspector
    .locator("#callArgs")
    .fill(JSON.stringify({ ticketId: TICKET, description: "x" }));
  await inspector.locator("#callButton").click();
  assert.match(
    await inspector.locator("#callNotes").innerText(),
    /may change data/,
  );
  await sw.evaluate((id) => chrome.tabs.update(id, { active: true }), plainId);
  await inspector
    .locator(".checks .level-warn", {
      hasText: "The page hasn't registered any tools",
    })
    .waitFor();
  assert.match(await inspector.locator("#pageInfo").innerText(), /\/tests\//);
  assert.ok(await inspector.locator("#toolsSection").isHidden());
  assert.match(
    await inspector.locator("#events").innerText(),
    /Called get_incident_overview: succeeded/,
  );

  assert.deepEqual(errors, []);
  console.log(
    "PASS: discovery, streamed chat, read tool, Markdown sanitization, write confirmation/rejection, write execution, new session, stop, navigation, session restore, no-tools page, skills (slash, manual, auto, settings), inspector (diagnosis, lint, manual call, validation, approval, tab follow), Mermaid diagrams (render, fallback, enlarge).",
  );
  if (process.env.WEBMCP_TEST_KEY) {
    await panel.locator("#newSession").click();
    await panel.locator("#settings").click();
    await panel.locator("#baseUrl").fill("https://api.deepseek.com");
    await panel.locator("#apiKey").fill(process.env.WEBMCP_TEST_KEY);
    await panel.locator("#model").fill("deepseek-flash");
    await panel.locator("#testConnection").click();
    await panel.waitForFunction(
      () => !document.getElementById("testConnection").disabled,
      {},
      { timeout: 60000 },
    );
    console.log(
      "Live connection:",
      await panel.locator("#testResult").innerText(),
    );
    await panel
      .getByRole("button", { name: "Save changes", exact: true })
      .click();
    await panel
      .locator("#prompt")
      .fill(
        `Use the tools to get an overview of ${TICKET}, including the complete MCP call receipt.`,
      );
    await panel.locator("#send").click();
    await panel.waitForFunction(
      () =>
        document.getElementById("send").getAttribute("aria-label") === "Send",
      {},
      { timeout: 90000 },
    );
    console.log("Live run:", await panel.locator("#runStatus").innerText());
    console.log(
      "Live tool cards:",
      await panel.locator(".tool-card.done").count(),
    );
    assert.equal(await panel.locator("#runStatus").innerText(), "Completed");
    assert.ok((await panel.locator(".tool-card.done").count()) > 0);
    const proof = await demo.locator("#mcpBanner").innerText();
    assert.ok(proof.includes("get_incident_overview"));
    await panel
      .locator(".tool-card")
      .first()
      .evaluate((el) => (el.open = true));
  }
} finally {
  await context.close();
}
