import { test } from "node:test";
import assert from "node:assert/strict";
import { fenceOpen } from "../extension/diagrams.js";

test("detects a code fence that is still streaming", () => {
  assert.equal(fenceOpen("text"), false);
  assert.equal(fenceOpen("```mermaid\nflowchart TD\n  A-->B"), true);
  assert.equal(fenceOpen("```mermaid\nflowchart TD\n  A-->B\n```"), false);
  assert.equal(fenceOpen("```mermaid\nA\n```\n\n```js\nx"), true);
  assert.equal(fenceOpen("~~~\ncode\n~~~"), false);
  assert.equal(
    fenceOpen("````md\n```inner\n````"),
    false,
    "longer fence closes only with a fence at least as long",
  );
  assert.equal(
    fenceOpen("```\ncode\n``` trailing"),
    true,
    "a closing fence can't carry text",
  );
});
