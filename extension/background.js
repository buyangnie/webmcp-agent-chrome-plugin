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
// The side panel can't do this itself: closing it ends its script and hands
// focus back to the browser window, which buries the new float.
async function popOut({ windowId, bounds }) {
  const { floatWindow } = await chrome.storage.session.get("floatWindow");
  if (floatWindow) await chrome.windows.remove(floatWindow).catch(() => {});
  const url = `panel.html?mode=float&from=${windowId}`;
  const win = await chrome.windows
    .create({ url, type: "popup", focused: true, ...bounds })
    .catch(() =>
      chrome.windows.create({
        url,
        type: "popup",
        focused: true,
        width: bounds.width,
        height: bounds.height,
      }),
    );
  await chrome.storage.session.set({ floatWindow: win.id });
  await chrome.sidePanel?.close?.({ windowId }).catch(() => {});
  for (const delay of [100, 400])
    setTimeout(
      () =>
        chrome.windows
          .update(win.id, { focused: true, state: "normal" })
          .catch(() => {}),
      delay,
    );
  return win.id;
}
chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  if (msg?.type === "theme") setTheme(msg.dark);
  if (msg?.type === "pop-out") {
    popOut(msg).then(
      (id) => reply({ ok: true, id }),
      (e) => reply({ ok: false, error: e.message }),
    );
    return true;
  }
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
