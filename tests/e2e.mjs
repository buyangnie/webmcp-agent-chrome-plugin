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
  args: [
    "--disable-gpu",
    `--disable-extensions-except=${extension}`,
    `--load-extension=${extension}`,
    "--enable-features=WebMCPTesting",
    "--enable-blink-features=WebMCP",
  ],
  viewport: { width: 440, height: 900 },
});
try {
  const sw =
    context.serviceWorkers()[0] ||
    (await context.waitForEvent("serviceworker"));
  const id = new URL(sw.url()).host;
  const demo = await context.newPage();
  await demo.goto("http://127.0.0.1:8124/");
  await demo.waitForFunction(() => window.__webmcpDemo);
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
    return tabs.find((t) => t.url?.startsWith("http://127.0.0.1:8124/")).id;
  });
  await sw.evaluate((id) => chrome.tabs.update(id, { active: true }), demoId);
  await panel.locator("#refresh").click();
  await panel.waitForFunction(
    () => document.getElementById("toolsButton").textContent === "3 tools",
  );
  await panel.locator("#settings").click();
  await panel.locator("#apiKey").fill("test-key");
  await panel.locator("#baseUrl").fill("https://mock.invalid/v1");
  await panel.locator("#model").fill("test-model");
  await panel
    .getByRole("button", { name: "Save changes", exact: true })
    .click();
  let requests = 0;
  await context.route(
    "https://mock.invalid/v1/chat/completions",
    async (route) => {
      requests++;
      const body = route.request().postDataJSON();
      const last = body.messages.at(-1);
      let delta;
      if (last.role === "tool") {
        delta = {
          content:
            '## Results\n\nTicket details retrieved.\n\n| Field | Result |\n|---|---|\n| Status | Read |\n\n```json\n{"ok": true}\n```\n\n<img src=x onerror="alert(1)">',
        };
      } else {
        const name = last.content.includes("Update")
          ? "update_ticket_status"
          : "get_ticket_detail";
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
                  name === "get_ticket_detail"
                    ? { ticketId: "INC-2026-0431" }
                    : {
                        ticketId: "INC-2026-0431",
                        status: "in_progress",
                        note: "Extension end-to-end test",
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
      "get_ticket_detail",
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
      "get_ticket_detail",
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
      "update_ticket_status",
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
  await panel.locator("#refresh").click();
  await panel.locator("#prompt").fill("Get ticket details");
  await panel.locator("#send").click();
  await panel
    .getByText("Start a new session with the + button to continue.", {
      exact: true,
    })
    .waitFor();
  assert.deepEqual(errors, []);
  console.log(
    "PASS: discovery, streamed chat, read tool, Markdown sanitization, write confirmation/rejection, write execution, new session, stop.",
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
        "Use the tools to retrieve INC-2026-0431, including internal guidance and the complete MCP call receipt.",
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
    assert.ok(proof.includes("get_ticket_detail"));
    await panel
      .locator(".tool-card")
      .first()
      .evaluate((el) => (el.open = true));
  }
} finally {
  await context.close();
}
