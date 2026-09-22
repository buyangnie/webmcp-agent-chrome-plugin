import { test } from "node:test";
import assert from "node:assert/strict";
import {
  endpoint,
  sse,
  completion,
  requiresConfirmation,
} from "../extension/core.js";
test("endpoint preserves custom version prefixes and full endpoint", () => {
  assert.equal(
    endpoint("https://api.deepseek.com"),
    "https://api.deepseek.com/chat/completions",
  );
  assert.equal(
    endpoint("http://localhost:1234/v1/"),
    "http://localhost:1234/v1/chat/completions",
  );
  assert.equal(
    endpoint("https://x/v1/chat/completions"),
    "https://x/v1/chat/completions",
  );
  assert.throws(() => endpoint("https://user:secret@x"));
});
test("unknown or consequential tools require confirmation", () => {
  assert.equal(requiresConfirmation({}), true);
  assert.equal(
    requiresConfirmation({ annotations: { readOnlyHint: true } }),
    false,
  );
  assert.equal(
    requiresConfirmation({
      annotations: { readOnlyHint: true, consequentialHint: true },
    }),
    true,
  );
});
test("SSE handles split UTF-8, CRLF and multiple events", async () => {
  const b = new TextEncoder().encode(
    'data: {"text":"Hello 🌍"}\r\n\r\ndata: [DONE]\n\n',
  );
  const body = new ReadableStream({
    start(c) {
      for (const x of b) c.enqueue(Uint8Array.of(x));
      c.close();
    },
  });
  const out = [];
  for await (const d of sse(body)) out.push(d);
  assert.deepEqual(out, ['{"text":"Hello 🌍"}', "[DONE]"]);
});
test("stream merges fragmented function arguments and ignores reasoning-only deltas", async () => {
  const original = global.fetch;
  try {
    global.fetch = async () =>
      new Response(
        [
          {
            choices: [
              {
                delta: {
                  reasoning_content: "private",
                  tool_calls: [
                    {
                      index: 0,
                      id: "c1",
                      function: { name: "webmcp_0", arguments: '{"x":' },
                    },
                  ],
                },
              },
            ],
          },
          {
            choices: [
              {
                delta: {
                  tool_calls: [{ index: 0, function: { arguments: "1}" } }],
                },
                finish_reason: "tool_calls",
              },
            ],
          },
        ]
          .map((x) => "data: " + JSON.stringify(x) + "\n\n")
          .join("") + "data: [DONE]\n\n",
        { headers: { "content-type": "text/event-stream" } },
      );
    const r = await completion(
      { baseUrl: "https://test", apiKey: "k", model: "m" },
      [],
      [],
      new AbortController().signal,
    );
    assert.equal(r.tool_calls[0].function.arguments, '{"x":1}');
    assert.equal(r.content, null);
  } finally {
    global.fetch = original;
  }
});
test("truncated stream never returns executable calls", async () => {
  const original = global.fetch;
  try {
    global.fetch = async () =>
      new Response(
        'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"c","function":{"name":"t","arguments":"{}"}}]}}]}\n\n',
        { headers: { "content-type": "text/event-stream" } },
      );
    await assert.rejects(
      () =>
        completion(
          { baseUrl: "https://x", apiKey: "k", model: "m" },
          [],
          [],
          new AbortController().signal,
        ),
      /ended early/,
    );
  } finally {
    global.fetch = original;
  }
});
