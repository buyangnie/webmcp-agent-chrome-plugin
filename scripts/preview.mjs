import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
await mkdir("test-results", { recursive: true });
const b = await chromium.launch({
  headless: true,
  executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
});
try {
  const p = await b.newPage({ viewport: { width: 440, height: 900 } });
  p.on("pageerror", (e) => console.log("ERROR", e.message));
  await p.addInitScript(() => {
    window.chrome = {
      windows: { getCurrent: async () => ({ id: 1 }) },
      storage: {
        local: { get: async () => ({}), set: async () => {} },
        session: { get: async () => ({}), set: async () => {} },
      },
      tabs: {
        query: async () => [{ id: 1 }],
        onActivated: { addListener() {} },
        onUpdated: { addListener() {} },
      },
      scripting: {
        executeScript: async () => [
          {
            documentId: "test",
            result: {
              ok: true,
              title: "ITSM incidents · WebMCP demo",
              url: "http://127.0.0.1:8124/",
              mode: "document.modelContext",
              tools: [
                { name: "list_tickets" },
                { name: "get_ticket_detail" },
                { name: "update_ticket_status" },
              ],
            },
          },
        ],
      },
    };
  });
  await p.goto("http://127.0.0.1:8124/extension/panel.html");
  await p.waitForFunction(
    () => document.getElementById("toolsButton").textContent === "3 tools",
  );
  for (const width of [320, 440, 650]) {
    await p.setViewportSize({ width, height: 980 });
    for (const colorScheme of ["light", "dark"]) {
      await p.emulateMedia({ colorScheme, reducedMotion: "reduce" });
      assert.ok(
        await p.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      );
      await p.screenshot({
        path: `test-results/agent-welcome-${width}-${colorScheme}.png`,
      });
      await p.locator("#settings").click();
      assert.ok(
        await p
          .locator("#settingsDialog")
          .evaluate((el) => el.scrollWidth <= el.clientWidth),
      );
      await p.screenshot({
        path: `test-results/agent-settings-${width}-${colorScheme}.png`,
      });
      await p
        .getByRole("button", { name: "Close settings", exact: true })
        .click();
    }
  }
  console.log(
    "PASS: light/dark layouts at 320, 440, and 650 pixels; no horizontal overflow.",
  );
} finally {
  await b.close();
}
