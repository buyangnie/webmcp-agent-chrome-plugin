# WebMCP Agent — Engineering Handoff

Last updated: 2026-09-22  
Current release: **0.5.0**  
Repository: <https://github.com/buyangnie/webmcp-agent-chrome-plugin> (public, branch `main`)  
Workspace: `D:\_Working_Space\04. GTS - MS\Code\itsm-WebMCP`

## 1. Current state

The project contains a working, general-purpose Chrome side-panel agent and a separate ITSM WebMCP example. The extension discovers tools exposed by the selected webpage, supplies their schemas to an OpenAI-compatible model, executes model-requested calls, and returns their results to the conversation.

Version 0.5.0 is implemented and packaged in `dist/webmcp-agent-0.5.0.zip`. The source directory `extension/` can be loaded directly without a build step. Since 0.2 the extension gained page-text context, file and image attachments (0.3), then a floating window, session persistence, continuing across navigation, event-driven discovery, a dark-grey palette with a line icon that follows Chrome's theme, and English/Simplified Chinese UI (0.4), then skills, a front-most floating window, real titles on pages without tools, and a hidden model label (0.5). Unit tests, the native-browser integration test, and visual checks passed for 0.5.0; the live DeepSeek run was not repeated.

The most recent user requirements are complete. There is no additional feature request pending at handoff. Future work listed below is advisory, not approved scope.

## 2. Product requirements to preserve

- Product name: **WebMCP Agent**.
- General-purpose WebMCP client; do not hard-code ITSM concepts into the extension.
- Chrome side-panel experience that blends with Chrome's own UI: neutral surfaces, dark-grey primary buttons (light grey in dark mode), and a single-color agent-bubble line icon. The product is independent of Google.
- Works without page tools: page text, attachments, and chat are the baseline; WebMCP tools are an addition. A page with no tools is a normal state, not an error.
- UI strings live in `extension/_locales` (English default, Simplified Chinese). Source comments, documentation, and bundled example content are English.
- Configurable OpenAI-compatible Base URL, API key, model name, and system prompt. The model name is not displayed; the composer shows "Connect a model to get started" only while no key is configured.
- User-defined skills: picked with `/`, or loaded by the model through `load_skill` when marked Auto; managed in Settings; `SKILL.md` import/export. Three localized built-ins are seeded once and are ordinary, deletable skills.
- A page without tools shows its real title and `0 tools`. "Can't read" wording appears only in the tools list, only for pages Chrome forbids.
- Streaming responses, sanitized Markdown, tables, highlighted code, and copy actions.
- Automatic tool discovery and multi-step tool calling, with visible execution cards.
- Confirmation before consequential or insufficiently classified tool operations.
- One current conversation per side panel (or the floating window), kept in session storage until Chrome closes; no history list.
- Side panel and floating window are never open at the same time for the same conversation.
- New session clears conversation state while retaining settings; stop interrupts further execution.
- Keep the demo usable as a static site, without a CDN or build server. `file://` is supported by the demo, subject to browser API and extension permissions.

The user is actively using their Chrome profile. Do not inject keyboard or mouse actions into that browser without authorization. Use an independent test profile for automated verification. Do not change enterprise policies, install into their profile, or remove profiles as part of routine development.

## 3. Why this extension exists

The original question was whether Chrome's built-in Gemini sidebar actually called a page's WebMCP tools or merely used visible page information. Page-side native registration and execution worked, and Google's Model Context Tool Inspector successfully discovered and invoked the tools. The built-in sidebar did not demonstrate tool access in the tested configuration.

Enabling WebMCP browser/testing and DevTools flags did not establish that the built-in Gemini client consumed those tools. This extension supplies its own model-to-WebMCP adapter and side panel. It does **not** add tools to Chrome's built-in Gemini.

Treat observations about Google's client as historical, version-specific evidence. Recheck official documentation before making new claims about its current capabilities.

## 4. File map

| File or directory                   | Responsibility                                                                                                        |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `extension/manifest.json`           | Manifest V3 metadata, version, permissions, CSP, side-panel entry point, toolbar icons                                |
| `extension/background.js`           | Opens the side panel from the toolbar, restricts storage access, switches the toolbar icon with the theme             |
| `extension/offscreen.*`             | Hidden document that reports Chrome's light/dark color scheme to the service worker                                   |
| `extension/_locales/`               | English and Simplified Chinese UI strings, read through `chrome.i18n`                                                 |
| `extension/panel.html`              | Conversation, settings, and tool-list UI (side panel, or floating window with `?mode=float&from=<windowId>`)          |
| `extension/panel.css`               | Light/dark styling, responsive layout, Markdown and execution-card presentation                                       |
| `extension/panel.js`                | Conversation state, settings, prompt migration, discovery refresh, agent loop, confirmations, and rendering           |
| `extension/core.js`                 | Default prompt, endpoint normalization, SSE parsing, streamed tool-call assembly, schema aliases, confirmation policy |
| `extension/bridge.js`               | Main-world tool discovery/execution, document binding, definition checks, cancellation                                |
| `extension/skills.js`               | Skill limits, `SKILL.md` parse/export, validation, slash matching, the `load_skill` tool and model catalog            |
| `extension/icons/`                  | Original SVG and generated 16/32/48/128-pixel PNG icons                                                               |
| `extension/vendor/`                 | Packaged Markdown, HTML sanitization, syntax-highlighting libraries, and licenses                                     |
| `index.html`, `demo.js`, `demo.css` | Standalone ITSM example with three tools and external-call evidence                                                   |
| `client.html`                       | Parent-document client calling the embedded example as an external caller                                             |
| `serve.py`                          | Static server adding `Origin-Agent-Cluster: ?1`                                                                       |
| `tests/core.test.mjs`               | Protocol and confirmation-policy tests                                                                                |
| `tests/skills.test.mjs`             | `SKILL.md` parsing/export, validation, matching, and `load_skill` exposure                                            |
| `tests/e2e.mjs`                     | Extension/native-page integration with deterministic model responses; optional live model verification                |
| `scripts/preview.mjs`               | UI-only visual checks with a mocked Chrome API; not evidence of real tool execution                                   |
| `scripts/icons.mjs`                 | SVG-to-PNG icon generation using headless Chrome                                                                      |
| `scripts/vendor.mjs`                | Copies/bundles runtime libraries into the extension                                                                   |
| `README.md`, `extension/README.md`  | Quick start and detailed operational documentation                                                                    |
| `test-results/`                     | Generated English light/dark UI screenshots at 320, 440, and 650 pixels                                               |
| `dist/`                             | Distributable extension archive                                                                                       |

The workspace is now a Git repository: branch `main`, remote `origin` at <https://github.com/buyangnie/webmcp-agent-chrome-plugin>. The initial commit is the state this document describes.

## 5. Runtime architecture

```text
User message in the side panel
  -> panel.js captures session settings and target document
  -> bridge.js discovers page tool definitions
  -> core.js maps tools to OpenAI function schemas
  -> configured model endpoint returns streamed text / tool_calls
  -> panel.js requests approval where needed
  -> bridge.js executes the tool in the pinned page document
  -> tool result is displayed and appended to model context
  -> agent continues or produces its final response
```

Model requests run in the extension page, not in the target webpage. The background service worker is not the conversation runtime.

### Sessions and the floating window

- Each surface saves `{ history, transcript, contextKey, attachPage, sessionConfig }` to `chrome.storage.session` under `chat:<windowId>` (side panel) or `chat:float`. The API key is stripped from the saved `sessionConfig`. `transcript` is a list of display entries (user, assistant, tool, notice, divider) replayed on load; in-flight tool states restore as "Interrupted".
- Pop-out copies the side panel's session to `chat:float` and sends `pop-out` to the service worker, which opens the `popup` window, records its id as `floatWindow`, closes the side panel, and then focuses the float twice (100 and 400 ms) because closing the panel returns focus to the browser window. The float also focuses itself once on load. It follows the last focused normal browser window. It is not always-on-top.
- Document Picture-in-Picture was evaluated for always-on-top: it works from an extension tab or popup, but `requestWindow()` from the real side panel never settles and freezes the panel (Chromium, 2026-09). A viable variant would open PiP from the float window after a second click, with the float minimized as its owner; not implemented.
- Any side panel that loads while `floatWindow` or `chat:float` exists closes the float and adopts its session. Docking calls `chrome.sidePanel.open` inside the click gesture, then sends `adopt-float` so an already-open panel reloads with the session.
- History sent to the model is trimmed by `prepareHistory`: last 12 turns, 160,000 JSON characters, images only in the last two image turns, and tool calls for tools missing from the current page flattened to text.

### Discovery and execution

- There is no polling. Discovery runs on tab activation, load completion, title change, panel visibility, before each message, and when a page's `document.modelContext` fires `toolchange`. The main-world bridge re-posts that event; an isolated-world relay forwards it with `chrome.runtime.sendMessage`.
- Pages without a WebMCP API, or whose `getTools()` throws, return `mode: "none"` with zero tools. Pages Chrome forbids (internal pages, Web Store) show the tab's title and `0 tools`; the tools list adds that Chrome doesn't allow reading them.

### Skills

- Stored as `skills` in `chrome.storage.local`: `{ id, name, description, instructions, auto }`. Built-ins are seeded only when the key is absent, so deleting them sticks. Panels sync through `storage.onChanged`.
- A manual skill is sent as a `[Skill: name] … [End of skill]` block at the start of the user message; the transcript records `skill` for the bubble tag.
- Auto skills are listed (name and description only) in the system context, and `load_skill` is added to the tools with an `enum` of their names. Page tools can't take that alias (`prepareTools(tools, reserved)`). `load_skill` runs locally, without a tool card or approval, and records a `skill` transcript entry.
- Before each message, the bridge's `read` action returns `document.body.innerText`, capped at 24,000 characters, unless the user removed the page chip.
- The preferred interface is `document.modelContext.getTools()` and `executeTool(tool, JSON.stringify(args), { signal })`.
- A compatibility adapter for `navigator.modelContextTesting` exists but was not the primary acceptance path.
- Chrome scripting runs the bridge in the target document's `MAIN` world. The injected function must remain self-contained: it cannot refer to module imports or extension lexical variables.
- Target identity includes `tabId` and `documentId`. A run pins its target at the start; executions must not silently switch to a new document mid-run. Between messages, navigation is allowed: a "Now on" divider is inserted and the next message uses the new page.
- Tool identity includes name and origin. Definitions are compared again before execution using canonical key ordering; ordinary JSON serialization order caused a false mismatch during development and was fixed.
- Model-visible names are the tool names sanitized to `[a-zA-Z0-9_-]`, with `_2`, `_3` suffixes for collisions; the actual page tool name remains in its description and UI.
- The API key is never passed to the page bridge.

### Agent loop and controls

- `panel.js` retains a working message history and a snapshot of session configuration.
- Configuration changes apply to a new session; they do not silently alter an existing conversation.
- Tool calls are executed sequentially. Results are returned as tool messages before the next model request.
- Read-only calls bypass confirmation only when `readOnlyHint === true` and `consequentialHint !== true`.
- Declined or stopped operations are reported to the model. Completed actions cannot be rolled back by stopping.
- The bridge uses a cancellation event plus a short-lived canceled-token set to handle cancellation arriving before execution begins.
- Limits: 12 model rounds per user turn, a 90-second idle timeout between stream events (not a total cap), 60 seconds per tool, and 32,000 characters of tool output forwarded to the model.
- The composer stays editable while a response streams; Enter is ignored until the run ends, and the send button becomes Stop.

### Streaming and rendering

- Protocol: Chat Completions with `stream: true` and `tools/tool_calls`.
- SSE handling supports split UTF-8 data, CRLF boundaries, and fragmented function arguments.
- An incomplete stream must not produce an executable partial tool call.
- Markdown is rendered with Marked, sanitized with DOMPurify, and highlighted with Highlight.js. Remote images and unsafe link protocols are excluded from rendered messages.
- Internal reasoning deltas are not displayed as fabricated reasoning or used as the final answer.
- Streaming Markdown re-renders at most once per animation frame. A three-dot indicator shows until the first token.

## 6. Configuration, credentials, and migration

Default Base URL: `https://api.deepseek.com`  
Default model: `deepseek-flash`

A user-supplied API key was used successfully for live verification. Its value is intentionally absent from this document, source, screenshots, and release package. Obtain it through the user's settings or an approved secret channel when needed; do not copy it from conversation history into a file.

| Data                                            | Storage / behavior                                                          |
| ----------------------------------------------- | --------------------------------------------------------------------------- |
| Base URL, model, instructions, preference flags | `chrome.storage.local`, under `config`                                      |
| Skills                                          | `chrome.storage.local`, under `skills`                                      |
| API key, default mode                           | `chrome.storage.session`; survives panel recreation but not browser restart |
| API key with Remember enabled                   | Local extension storage; not an OS-encrypted credential vault               |
| Conversation (`chat:<windowId>`, `chat:float`)  | `chrome.storage.session`; cleared when Chrome closes                        |
| Floating window id (`floatWindow`)              | `chrome.storage.session`                                                    |
| Demo external-call history                      | Page `localStorage`, key `itsm-webmcp-external-calls`, up to 50 entries     |

The default prompt migration compares the saved prompt's SHA-256 hash with `LEGACY_PROMPT_HASHES` in `core.js` (the v0.1, v0.2, and v0.3 built-in prompts). Only those exact defaults are replaced. Custom instructions are deliberately preserved. When changing `DEFAULT_PROMPT`, add the old prompt's hash to that list.

The manifest grants HTTP(S) and file host access to support arbitrary user-selected pages. Model endpoints must be HTTPS except `localhost` and `127.0.0.1`, enforced by `endpoint()` and the CSP `connect-src`. There is no external website messaging entry point for proxying model requests. Conversations, the page's title, URL, and visible text, attachments, tool definitions, and tool results are sent to the configured provider. See `PRIVACY.md`.

## 7. Local operation

From the workspace root:

```powershell
python serve.py 8124
```

Open `http://127.0.0.1:8124/`. If port 8124 is already serving the project, reuse it; do not start a second server. Server availability should be checked when resuming work rather than assumed from this handoff.

Load the `extension` directory through **Load unpacked** at `chrome://extensions`, then open the extension from its toolbar icon. Test the model connection in Settings and save.

For an upgrade, reload the existing extension, close/reopen the side panel, and refresh the example page. Do not load another copy unnecessarily. Browser internal pages and extension-store pages cannot accept normal script injection. For file pages, the user must enable **Allow access to file URLs** in extension details.

The tested enterprise Chrome environment had `OriginAgentClusterDefaultEnabled=0`. The local server's explicit isolation header allowed native WebMCP to work. Do not remove that header or change the enterprise policy to work around it. For deployment, inspect origin isolation and permissions policy on the actual site.

## 8. Example tools and evidence

| Tool                   | Inputs                                     | Behavior                                                                               |
| ---------------------- | ------------------------------------------ | -------------------------------------------------------------------------------------- |
| `list_tickets`         | Optional status, priority, keyword, limit  | Filters three incidents; limit must be an integer from 1 to 50                         |
| `get_ticket_detail`    | Required `ticketId`                        | Returns incident details, activity, internal guidance, and a receipt                   |
| `update_ticket_status` | Required `ticketId`, status; optional note | Updates to open/in_progress/resolved and appends activity; unchanged status is a no-op |

Ticket IDs are `INC-2026-0431`, `INC-2026-0432`, and `INC-2026-0433`. Data is simulated and resets on reload. Internal guidance is not initially rendered as page text, but appears in results/logs after a call. It is not a secret protected from someone able to inspect the page's JavaScript.

Native exceptions can obscure useful validation details. Demo input validation therefore returns readable error text with a receipt rather than relying on an exception reaching the model unchanged. Tool descriptions are kept within 500 characters, parameter descriptions within 150, names within 30, and returned text including receipts within 1,500.

External calls increment the current-load counter and update the banner with the returned receipt. Match that receipt to the client response to verify execution. A receipt does not authenticate which AI product initiated the call, and a missing receipt does not by itself prove DOM scraping. The in-page simulator is keyword routing, not an LLM, and should not be presented as model-driven behavior.

## 9. Verification and release procedure

```powershell
npm ci
npm test
npx playwright install chromium
# Keep the demo server running in another terminal.
npm run test:e2e
node scripts/preview.mjs
```

For an optional live run, set `WEBMCP_TEST_KEY` temporarily in the environment, run the E2E suite, then remove the variable. The live path currently targets the default DeepSeek endpoint and model.

Verified for v0.5.0:

- Eighteen unit tests passed, including the new skills tests.
- The E2E suite passed with the v0.4 coverage plus skills: slash menu and keyboard selection, a manual skill reaching the model, `load_skill` called by the model, the welcome skill buttons, duplicate-name validation, and creating a skill in Settings. The model label is hidden once configured.
- Pop-out through the service worker was checked with the scripted float test. Front-most focus in a real side panel needs a real browser session; the ordering is designed for it but was not observed in automation.
- English and Chinese screenshots of the welcome skills, slash menu, skill chip, and skills settings were inspected.

Verified for v0.4.0:

- Thirteen unit tests passed (protocol, HTTPS rule, tool naming, history trimming, idle timeout, page read, no-tools discovery).
- The E2E suite passed, including page text reaching the model, continuing after a reload, restoring the transcript after the panel reloads, and a page without tools. It pins the browser to `--lang=en-US` because assertions use English strings.
- Pop-out, float session handoff, and float closing when a side panel opens were checked with a scripted isolated profile. Docking back to the side panel (`chrome.sidePanel.open`) needs a real user gesture and was not automated.
- Screenshots of the real extension (English and Chinese, light and dark) were captured through a floating window, which avoids the inactive-tab screenshot stall described below.

Verified during the v0.2 implementation session:

- Five core tests passed.
- Independent Chrome for Testing 153.0.8010.12 exercised native discovery, reads, approved writes, declined writes, stopping, new sessions, and navigation isolation.
- Live DeepSeek streaming, tool-call capability testing, and an actual detail-query conversation passed.
- Example tool/schema budgets, initially hidden internal guidance, invalid-argument handling, HTTP native operation, file fallback, and the external iframe client were checked.
- Light/dark settings and welcome views passed horizontal-overflow checks at 320, 440, and 650 pixels and were visually inspected.
- Maintained files were scanned for remaining Chinese text, old visible product names, and accidental credential literals.

E2E opens the actual extension page as a tab in an isolated profile to exercise extension APIs. It does not operate the user's Chrome side-panel host. Screenshots of an inactive extension tab intermittently stalled in this Windows setup, so functional E2E no longer captures them. Visual screenshots are generated separately by `scripts/preview.mjs` with mocked Chrome APIs. Keep this distinction explicit in test reports.

For a release:

1. Update `extension/manifest.json` and relevant documentation.
2. If dependencies changed, run `npm run vendor` and retain licenses.
3. If an SVG changed, run `node scripts/icons.mjs`; it renders light and `-dark` PNGs. Its default Chrome path is Windows-specific and can be overridden with `CHROME_PATH`.
4. Run checks appropriate to the changes and inspect UI output where necessary.
5. Package the extension folder, excluding credentials and development artifacts:

```powershell
Compress-Archive -Path extension\* -DestinationPath dist/webmcp-agent-0.5.0.zip -Force
```

Use the new release version in the archive filename. `manifest.json` sits at the archive root, which the Chrome Web Store requires. For a manual install, extract it into a folder and load that folder, not the archive itself.

## 10. Troubleshooting

| Symptom                          | First checks                                                                                       |
| -------------------------------- | -------------------------------------------------------------------------------------------------- |
| `0 tools` on a page with tools   | Inspect its native API, isolation header, WebMCP flag, and registration state; open the tools list |
| Tools list says it can't read    | Expected on Chrome internal pages and the Web Store; for file URLs enable file access              |
| Float window goes behind         | Expected after clicking the browser window; it is a normal window, not always-on-top               |
| Skill not used automatically     | Check its Auto flag and description; the model decides, and only models with tool calling can      |
| Toolbar icon wrong for theme     | Check the offscreen document exists (`chrome.runtime.getContexts`) and the panel's `theme` message |
| Built-in Gemini cannot see tools | Use this extension's side panel; it is a separate client with its own tool adapter                 |
| Settings appear unchanged        | Save, then create a new session; reload the extension after source changes                         |
| Old name or icon remains         | Reload the existing extension in Chrome and reopen the panel                                       |
| Old default prompt remains       | Compare against the exact legacy default; do not overwrite a custom prompt                         |
| HTTP 401 / model error           | Check key, endpoint, model availability, and provider tool-call compatibility                      |
| Stream or tool calling fails     | Use Test connection to distinguish streaming support from valid function calling                   |
| Tool definition changed          | Refresh discovery; retain canonical comparisons and document binding                               |
| Stop did not undo an action      | Expected: completed operations are not reversible through cancellation                             |
| File URL fails                   | Check extension file access and whether the page's native API/fallback is available                |

## 11. Known limits and recommended next work

These are follow-up candidates, not claims that the current release implements them:

- Review the manifest's declared minimum Chrome version (`120`) against APIs used, including `AbortSignal.any` and experimental WebMCP. It is not a claim that Chrome 120 supports the tested native path.
- Compatibility with the legacy discovery interface and other model providers needs broader testing.
- No independent iframe enumeration, Responses API, PDF attachments, voice, conversation history across browser restarts, or autonomous cross-page navigation.
- Cancellation is best effort. Page code can ignore abort signals, and tool annotations originate from the page.
- History trimming is character-based, not token-based, and there is no summarization. Page text (24,000 characters) is sent on every message while the page chip is attached.
- `chrome.storage.session` has a 10 MB quota shared by all windows. Images are downscaled and only recent ones kept, but many image-heavy sessions can still exceed it; the panel then shows a notice and the conversation lives only in memory.
- Some providers may reject historical tool messages when the current request has no `tools`; flattening covers tools missing from the current page but was only verified against the mock.
- `panel.js` concentrates UI and agent state (now including the skills settings and slash menu); consider splitting it before large new features.
- Skills hold instructions only. `SKILL.md` bundles with scripts or reference files import without them; skills are not synced across devices.
- `panel.css` contains initial styling plus later redesign overrides. Consolidating those rules would reduce maintenance risk without changing appearance.
- Host permissions are broad. Optional per-origin permissions and a production credential-proxy strategy would need a separate design decision.
- The demo's internal/external distinction uses a shared in-page invocation flag. It is suitable for this sequential demonstration, not an authenticated provenance mechanism under concurrent calls.
- The extension bridge reports an API shape, not cryptographic proof that a page is using a native implementation; consult the demo's explicit native/fallback indicator during testing.
- The end-to-end suite has been observed to time out once at its first run-status wait (1 of 3 consecutive runs on 2026-09-22). No deterministic cause was found; consider a single timeout retryable, but record it.
- There is no production backend or enterprise distribution package. Web Store listing text, permission justifications, and the privacy policy are prepared in `STORE.md` and `PRIVACY.md`; submission is manual through the developer dashboard.

Start by reading this document, `extension/README.md`, and the files relevant to the requested change. Preserve the general-purpose boundary between the extension and example, and validate new browser behavior in an isolated profile.
