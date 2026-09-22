const scheme = matchMedia("(prefers-color-scheme: dark)");
const report = () =>
  chrome.runtime
    .sendMessage({ type: "theme", dark: scheme.matches })
    .catch(() => {});
scheme.addEventListener("change", report);
chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  if (msg?.type === "get-theme") reply(scheme.matches);
});
report();
