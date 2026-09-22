chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch(console.error);
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" });
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
});

const iconSet = (suffix) => ({
  16: `icons/icon${suffix}-16.png`,
  32: `icons/icon${suffix}-32.png`,
});
function setTheme(dark) {
  chrome.action.setIcon({ path: iconSet(dark ? "-dark" : "") });
}
chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type === "theme") setTheme(msg.dark);
});
// Service workers cannot read prefers-color-scheme, so an offscreen page watches it.
async function watchTheme() {
  const url = chrome.runtime.getURL("offscreen.html");
  const open = await chrome.runtime.getContexts({
    contextTypes: ["OFFSCREEN_DOCUMENT"],
    documentUrls: [url],
  });
  if (open.length) {
    const dark = await chrome.runtime
      .sendMessage({ type: "get-theme" })
      .catch(() => null);
    if (typeof dark === "boolean") setTheme(dark);
    return;
  }
  await chrome.offscreen.createDocument({
    url: "offscreen.html",
    reasons: ["MATCH_MEDIA"],
    justification: "Match the toolbar icon to Chrome's light or dark theme.",
  });
}
watchTheme().catch(() => {});
