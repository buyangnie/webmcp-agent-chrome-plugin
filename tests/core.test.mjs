import { test } from "node:test";
import assert from "node:assert/strict";
import {
  endpoint,
  sse,
  completion,
  requiresConfirmation,
  prepareTools,
  prepareHistory,
  dropOldImages,
} from "../extension/core.js";
test("HTTP is only allowed for localhost", () => {
  assert.throws(() => endpoint("http://api.example.com/v1"), /HTTPS/);
  assert.equal(
    endpoint("http://127.0.0.1:11434/v1"),
    "http://127.0.0.1:11434/v1/chat/completions",
  );
});
test("tool aliases keep readable names and stay unique", () => {
  const tools = prepareTools([
    { name: "get_ticket" },
    { name: "get ticket" },
    { name: "工单" },
  ]);
  assert.deepEqual(
    tools.map((t) => t.alias),
    ["get_ticket", "get_ticket_2", "__"],
  );
});
test("history keeps recent turns and drops old images", () => {
  const image = (n) => ({
    role: "user",
    content: [
      { type: "text", text: "look " + n },
      { type: "image_url", image_url: { url: "data:image/png;base64,AA" } },
    ],
  });
  const msgs = [];
  for (let i = 0; i < 15; i++)
    msgs.push(image(i), { role: "assistant", content: "ok " + i });
  const out = prepareHistory(msgs);
  assert.equal(out.length, 24);
  assert.equal(out[0].content, "look 3\n[Image omitted]");
  assert.ok(Array.isArray(out.at(-2).content));
  assert.ok(Array.isArray(out.at(-4).content));
  assert.equal(typeof out.at(-6).content, "string");
  assert.equal(dropOldImages(msgs, 0)[0].content, "look 0\n[Image omitted]");
});
test("history over the size budget drops whole oldest turns", () => {
  const big = "x".repeat(1000);
  const msgs = [
    { role: "user", content: big },
    { role: "assistant", content: big },
    { role: "user", content: "latest" },
  ];
  const out = prepareHistory(msgs, new Set(), { maxChars: 500 });
  assert.deepEqual(out, [{ role: "user", content: "latest" }]);
});
test("tool calls for tools that are gone become plain text", () => {
  const msgs = [
    { role: "user", content: "check" },
    {
      role: "assistant",
      content: null,
      tool_calls: [
        {
          id: "c1",
          type: "function",
          function: { name: "old", arguments: "{}" },
        },
      ],
    },
    { role: "tool", tool_call_id: "c1", content: "42" },
    { role: "assistant", content: "It is 42." },
  ];
  const kept = prepareHistory(msgs, new Set(["old"]));
  assert.equal(kept[1].tool_calls[0].id, "c1");
  const flat = prepareHistory(msgs, new Set());
  assert.equal(flat.length, 3);
  assert.equal(flat[1].role, "assistant");
  assert.equal(flat[1].tool_calls, undefined);
  assert.match(
    flat[1].content,
    /Earlier tool call old[\s\S]*Result of old\]\n42/,
  );
});
test("a silent stream fails after the idle timeout", async () => {
  const original = global.fetch;
  try {
    global.fetch = async (_url, { signal }) =>
      new Response(
        new ReadableStream({
          start(c) {
            c.enqueue(new TextEncoder().encode('data: {"choices":[]}\n\n'));
            signal.addEventListener("abort", () => c.error(signal.reason));
          },
        }),
        { headers: { "content-type": "text/event-stream" } },
      );
    await assert.rejects(
      () =>
        completion(
          { baseUrl: "https://x", apiKey: "k", model: "m", idleTimeoutMs: 50 },
          [],
          [],
          new AbortController().signal,
        ),
      /sent nothing for 0 seconds/,
    );
  } finally {
    global.fetch = original;
  }
});
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
