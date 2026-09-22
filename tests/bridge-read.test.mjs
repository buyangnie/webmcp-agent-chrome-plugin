import { test } from "node:test";
import assert from "node:assert/strict";
import { pageBridge } from "../extension/bridge.js";

test("read returns visible page text and marks truncation", async () => {
  globalThis.document = {
    body: { innerText: "  Incident\n\n\n\nopen  " },
  };
  const page = await pageBridge("read");
  assert.equal(page.ok, true);
  assert.equal(page.text, "Incident\n\nopen");
  assert.equal(page.truncated, false);

  globalThis.document = { body: { innerText: "x".repeat(24001) } };
  const long = await pageBridge("read");
  assert.equal(long.text.length, 24000);
  assert.equal(long.truncated, true);
});

test("discover reports a page without WebMCP as zero tools, not an error", async () => {
  globalThis.window = {};
  globalThis.document = { title: "Plain page" };
  globalThis.navigator ??= {};
  globalThis.location = {
    href: "https://example.com/",
    origin: "https://example.com",
  };
  const page = await pageBridge("discover");
  assert.equal(page.ok, true);
  assert.equal(page.mode, "none");
  assert.deepEqual(page.tools, []);
  assert.equal(page.title, "Plain page");
});
