// Runs only in the selected document's MAIN world; no credentials are passed here.
// Injected as source text, so it must not reference anything outside itself.
export async function pageBridge(action, payload = {}) {
  try {
    if (action === "read") {
      const PAGE_TEXT_LIMIT = 24000;
      const text = (document.body?.innerText || "")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
      const truncated = text.length > PAGE_TEXT_LIMIT;
      return {
        ok: true,
        text: truncated ? text.slice(0, PAGE_TEXT_LIMIT) : text,
        truncated,
      };
    }
    const cancellations = (window[Symbol.for("webmcp-agent.cancelled")] ??=
      new Set());
    if (action === "cancel") {
      cancellations.add(payload.event);
      setTimeout(() => cancellations.delete(payload.event), 65000);
      window.dispatchEvent(new Event(payload.event));
      return { ok: true };
    }
    const mc = document.modelContext;
    const legacy = navigator.modelContextTesting;
    const api = mc && typeof mc.getTools === "function" ? mc : legacy;
    if (!api) {
      if (action === "discover")
        return {
          ok: true,
          title: document.title,
          url: location.href,
          mode: "none",
          tools: [],
        };
      throw Error(
        "WebMCP is unavailable on this page. Check the browser version, WebMCP flag, and origin isolation.",
      );
    }
    const watched = Symbol.for("webmcp-agent.watch");
    if (api === mc && !window[watched] && mc.addEventListener) {
      window[watched] = true;
      mc.addEventListener("toolchange", () =>
        window.postMessage({ webmcpAgent: "toolchange" }, "*"),
      );
    }
    const list = api.getTools ? await api.getTools() : await api.listTools();
    const clean = (t) => ({
      name: t.name,
      description: t.description || "",
      inputSchema:
        typeof t.inputSchema === "string"
          ? JSON.parse(t.inputSchema)
          : t.inputSchema,
      annotations: t.annotations || {},
      origin: t.origin || location.origin,
    });
    if (action === "discover")
      return {
        ok: true,
        title: document.title,
        url: location.href,
        mode:
          api === mc
            ? "document.modelContext"
            : "navigator.modelContextTesting",
        tools: list.map(clean),
      };
    const tool = list.find(
      (t) =>
        t.name === payload.tool.name &&
        (t.origin || location.origin) === payload.tool.origin,
    );
    if (!tool)
      throw Error(
        "The tool was removed or the page changed. Refresh the tools.",
      );
    const canonical = (value) =>
      JSON.stringify(value, (_, v) =>
        v && typeof v === "object" && !Array.isArray(v)
          ? Object.fromEntries(
              Object.keys(v)
                .sort()
                .map((k) => [k, v[k]]),
            )
          : v,
      );
    if (canonical(clean(tool)) !== canonical(payload.tool))
      throw Error(
        "The tool definition changed. Refresh the tools before retrying.",
      );
    if (cancellations.has(payload.event))
      throw Error("Canceled before execution");
    const controller = new AbortController();
    const cancel = () => controller.abort();
    window.addEventListener(payload.event, cancel, { once: true });
    const timer = setTimeout(cancel, 60000);
    try {
      const result = await Promise.race([
        api.executeTool(
          api === mc ? tool : tool.name,
          JSON.stringify(payload.args),
          { signal: controller.signal },
        ),
        new Promise((_, reject) =>
          controller.signal.addEventListener(
            "abort",
            () =>
              reject(
                Error(
                  "Tool canceled or timed out. Completed actions cannot be undone.",
                ),
              ),
            { once: true },
          ),
        ),
      ]);
      return {
        ok: true,
        value:
          typeof result === "string" ? result : JSON.stringify(result ?? null),
      };
    } finally {
      clearTimeout(timer);
      window.removeEventListener(payload.event, cancel);
    }
  } catch (e) {
    return { ok: false, error: e.message || String(e) };
  }
}
export async function readPage(target) {
  const [r] = await chrome.scripting.executeScript({
    target: target.documentId
      ? { tabId: target.tabId, documentIds: [target.documentId] }
      : { tabId: target.tabId },
    world: "MAIN",
    func: pageBridge,
    args: ["read"],
  });
  if (!r?.result?.ok)
    throw Error(r?.result?.error || "Could not read the page");
  return { text: r.result.text, truncated: r.result.truncated };
}
// Runs in the isolated world, which can reach the extension; the page cannot.
function relayToolChanges() {
  if (globalThis.__webmcpAgentRelay) return;
  globalThis.__webmcpAgentRelay = true;
  addEventListener("message", (e) => {
    if (e.source === window && e.data?.webmcpAgent === "toolchange")
      chrome.runtime.sendMessage({ type: "toolchange" }).catch(() => {});
  });
}
export async function discover(tabId) {
  const [r] = await chrome.scripting.executeScript({
    target: { tabId },
    world: "MAIN",
    func: pageBridge,
    args: ["discover"],
  });
  if (!r?.result?.ok)
    throw Error(r?.result?.error || "Could not discover page tools");
  if (r.result.mode === "document.modelContext")
    await chrome.scripting
      .executeScript({
        target: { tabId, documentIds: [r.documentId] },
        func: relayToolChanges,
      })
      .catch(() => {});
  return { ...r.result, tabId, documentId: r.documentId };
}
export async function execute(target, tool, args, signal) {
  signal.throwIfAborted();
  const event = "webmcp-agent-cancel-" + crypto.randomUUID();
  const dest = { tabId: target.tabId, documentIds: [target.documentId] };
  const cancel = () =>
    chrome.scripting
      .executeScript({
        target: dest,
        world: "MAIN",
        func: pageBridge,
        args: ["cancel", { event }],
      })
      .catch(() => {});
  signal.addEventListener("abort", cancel, { once: true });
  let rejectAbort;
  try {
    const result = chrome.scripting.executeScript({
      target: dest,
      world: "MAIN",
      func: pageBridge,
      args: ["execute", { tool, args, event }],
    });
    const [r] = await Promise.race([
      result,
      new Promise((_, reject) => {
        rejectAbort = () => reject(new DOMException("Stopped", "AbortError"));
        signal.addEventListener("abort", rejectAbort, { once: true });
        if (signal.aborted) rejectAbort();
      }),
    ]);
    signal.throwIfAborted();
    if (!r?.result?.ok)
      throw Error(r?.result?.error || "The page was closed or navigated");
    return r.result.value;
  } finally {
    signal.removeEventListener("abort", cancel);
    if (rejectAbort) signal.removeEventListener("abort", rejectAbort);
  }
}
