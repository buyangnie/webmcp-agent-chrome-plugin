// Sandboxed page: opaque origin, no extension APIs. It turns Mermaid source
// into an SVG string and nothing else.
let queue = Promise.resolve();
let seq = 0;
const FONT = '"Segoe UI", system-ui, sans-serif';

function configure(theme) {
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: "strict",
    theme: theme === "dark" ? "dark" : "neutral",
    fontFamily: FONT,
    htmlLabels: false,
    flowchart: { htmlLabels: false },
    maxTextSize: 50000,
    suppressErrorRendering: true,
  });
}

// Gives the SVG explicit pixel dimensions so it has an intrinsic size as an <img>.
function sized(svg) {
  const root = new DOMParser().parseFromString(
    svg,
    "image/svg+xml",
  ).documentElement;
  if (root.nodeName !== "svg") throw Error("Renderer returned no SVG");
  const [, , w, h] = (root.getAttribute("viewBox") || "")
    .split(/[\s,]+/)
    .map(Number);
  const width = Math.ceil(w || parseFloat(root.getAttribute("width")) || 600);
  const height = Math.ceil(h || parseFloat(root.getAttribute("height")) || 400);
  root.setAttribute("width", width);
  root.setAttribute("height", height);
  root.removeAttribute("style");
  return { svg: new XMLSerializer().serializeToString(root), width, height };
}

async function render(code, theme) {
  configure(theme);
  const id = "m" + ++seq;
  try {
    const { svg } = await mermaid.render(id, code);
    return sized(svg);
  } finally {
    document.getElementById(id)?.remove();
    document.getElementById("d" + id)?.remove();
  }
}

addEventListener("message", (e) => {
  if (e.source !== parent || e.data?.type !== "mermaid-render") return;
  const { id, code, theme } = e.data;
  queue = queue.then(async () => {
    let reply;
    try {
      reply = { id, ...(await render(code, theme)) };
    } catch (err) {
      reply = { id, error: String(err?.message || err).slice(0, 2000) };
    }
    parent.postMessage({ type: "mermaid-result", ...reply }, "*");
  });
});
parent.postMessage({ type: "mermaid-ready" }, "*");
