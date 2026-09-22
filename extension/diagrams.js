export const DIAGRAM_LIMIT = 50000;
const TIMEOUT_MS = 10000;

// True when the Markdown ends inside an unclosed code fence, i.e. the last
// code block is still streaming.
export function fenceOpen(markdown) {
  let open = null;
  for (const line of markdown.split("\n")) {
    const m = line.match(/^ {0,3}(`{3,}|~{3,})/);
    if (!m) continue;
    if (!open) open = m[1];
    else if (
      m[1][0] === open[0] &&
      m[1].length >= open.length &&
      !line.slice(m.index + m[0].length).trim()
    )
      open = null;
  }
  return Boolean(open);
}

let frame = null;
let ready = null;
let seq = 0;
const pending = new Map();
const results = new Map();
const inflight = new Map();

function ensureFrame() {
  if (ready) return ready;
  ready = new Promise((resolve) => {
    addEventListener("message", (e) => {
      if (!frame || e.source !== frame.contentWindow) return;
      const msg = e.data || {};
      if (msg.type === "mermaid-ready") resolve();
      if (msg.type !== "mermaid-result" || !pending.has(msg.id)) return;
      const { done, fail } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) fail(Error(msg.error));
      else done(msg);
    });
    frame = document.createElement("iframe");
    frame.className = "mermaid-frame";
    frame.src = "mermaid.html";
    frame.tabIndex = -1;
    frame.setAttribute("aria-hidden", "true");
    document.body.append(frame);
  });
  return ready;
}

const keyOf = (code, theme) => theme + "\n" + code;
export function cachedDiagram(code, theme) {
  return results.get(keyOf(code, theme));
}
// Resolves to { svg, url, width, height }; failures are cached as { error }.
export function renderDiagram(code, theme) {
  const key = keyOf(code, theme);
  if (inflight.has(key)) return inflight.get(key);
  const job = (async () => {
    if (code.length > DIAGRAM_LIMIT)
      throw Error(`Diagram source is over ${DIAGRAM_LIMIT} characters`);
    await ensureFrame();
    const { svg, width, height } = await new Promise((done, fail) => {
      const id = ++seq;
      pending.set(id, { done, fail });
      frame.contentWindow.postMessage(
        { type: "mermaid-render", id, code, theme },
        "*",
      );
      setTimeout(() => {
        if (!pending.delete(id)) return;
        fail(Error("Rendering timed out"));
      }, TIMEOUT_MS);
    });
    if (typeof svg !== "string" || !(width > 0) || !(height > 0))
      throw Error("Renderer returned no SVG");
    return {
      svg,
      url: "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg),
      width,
      height,
    };
  })().then(
    (value) => (results.set(key, value), value),
    (e) => {
      const value = { error: e.message };
      results.set(key, value);
      return value;
    },
  );
  inflight.set(key, job);
  return job;
}
