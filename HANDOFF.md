# WebMCP Agent — Engineering Handoff

Last updated: 2026-09-22  
Current release: **0.2.0**  
Repository: <https://github.com/buyangnie/webmcp-agent-chrome-plugin> (public, branch `main`)  
Workspace: `D:\_Working_Space\04. GTS - MS\Code\itsm-WebMCP`

## 1. Current state

The project contains a working, general-purpose Chrome side-panel agent and a separate ITSM WebMCP example. The extension discovers tools exposed by the selected webpage, supplies their schemas to an OpenAI-compatible model, executes model-requested calls, and returns their results to the conversation.

Version 0.2.0 is implemented and packaged in `dist/webmcp-agent-0.2.0.zip`. The source directory `extension/` can be loaded directly without a build step. Protocol tests, native-browser integration tests, responsive visual checks, and a real DeepSeek tool-calling conversation passed during the preceding implementation session. This handoff is documentation-only; tests were not rerun solely to create it.

The most recent user requirements are complete. There is no additional feature request pending at handoff. Future work listed below is advisory, not approved scope.

## 2. Product requirements to preserve

- Product name: **WebMCP Agent**.
- General-purpose WebMCP client; do not hard-code ITSM concepts into the extension.
- Chrome side-panel experience with Google-inspired Material styling and an original four-color icon. The product is independent of Google.
- All maintained project UI, source comments, documentation, and bundled example content are English.
- Configurable OpenAI-compatible Base URL, API key, model name, and system prompt.
- Streaming responses, sanitized Markdown, tables, highlighted code, and copy actions.
- Automatic tool discovery and multi-step tool calling, with visible execution cards.
- Confirmation before consequential or insufficiently classified tool operations.
- One current conversation only: no history list or persistent chat transcripts.
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
| `extension/background.js`           | Opens the side panel from the toolbar and restricts local-storage access to trusted extension contexts                |
| `extension/panel.html`              | English conversation, settings, and tool-list UI                                                                      |
| `extension/panel.css`               | Light/dark styling, responsive layout, Markdown and execution-card presentation                                       |
| `extension/panel.js`                | Conversation state, settings, prompt migration, discovery refresh, agent loop, confirmations, and rendering           |
| `extension/core.js`                 | Default prompt, endpoint normalization, SSE parsing, streamed tool-call assembly, schema aliases, confirmation policy |
| `extension/bridge.js`               | Main-world tool discovery/execution, document binding, definition checks, cancellation                                |
| `extension/icons/`                  | Original SVG and generated 16/32/48/128-pixel PNG icons                                                               |
| `extension/vendor/`                 | Packaged Markdown, HTML sanitization, syntax-highlighting libraries, and licenses                                     |
| `index.html`, `demo.js`, `demo.css` | Standalone ITSM example with three tools and external-call evidence                                                   |
| `client.html`                       | Parent-document client calling the embedded example as an external caller                                             |
| `serve.py`                          | Static server adding `Origin-Agent-Cluster: ?1`                                                                       |
| `tests/core.test.mjs`               | Protocol and confirmation-policy tests                                                                                |
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

Model requests run in the extension page, not in the target webpage. The background service worker is not the conversation runtime. Unloading the side-panel document loses in-memory conversation state.

### Discovery and execution

- Idle discovery refreshes every five seconds and on relevant tab events; manual refresh is available.
- The preferred interface is `document.modelContext.getTools()` and `executeTool(tool, JSON.stringify(args), { signal })`.
- A compatibility adapter for `navigator.modelContextTesting` exists but was not the primary acceptance path.
- Chrome scripting runs the bridge in the target document's `MAIN` world. The injected function must remain self-contained: it cannot refer to module imports or extension lexical variables.
- Target identity includes `tabId` and `documentId`. Executions must not silently switch to a new document after navigation.
- Tool identity includes name and origin. Definitions are compared again before execution using canonical key ordering; ordinary JSON serialization order caused a false mismatch during development and was fixed.
- Model-visible names use stable aliases for the current run (`webmcp_0`, etc.); the actual page tool name remains in its description and UI.
- The API key is never passed to the page bridge.

### Agent loop and controls

- `panel.js` retains a working message history and a snapshot of session configuration.
- Configuration changes apply to a new session; they do not silently alter an existing conversation.
- Tool calls are executed sequentially. Results are returned as tool messages before the next model request.
- Read-only calls bypass confirmation only when `readOnlyHint === true` and `consequentialHint !== true`.
- Declined or stopped operations are reported to the model. Completed actions cannot be rolled back by stopping.
- The bridge uses a cancellation event plus a short-lived canceled-token set to handle cancellation arriving before execution begins.
- Limits: 12 model rounds per user turn, 120 seconds per model request, 60 seconds per tool, and 32,000 characters of tool output forwarded to the model.

### Streaming and rendering

- Protocol: Chat Completions with `stream: true` and `tools/tool_calls`.
- SSE handling supports split UTF-8 data, CRLF boundaries, and fragmented function arguments.
- An incomplete stream must not produce an executable partial tool call.
- Markdown is rendered with Marked, sanitized with DOMPurify, and highlighted with Highlight.js. Remote images and unsafe link protocols are excluded from rendered messages.
- Internal reasoning deltas are not displayed as fabricated reasoning or used as the final answer.

## 6. Configuration, credentials, and migration

Default Base URL: `https://api.deepseek.com`  
Default model: `deepseek-flash`

A user-supplied API key was used successfully for live verification. Its value is intentionally absent from this document, source, screenshots, and release package. Obtain it through the user's settings or an approved secret channel when needed; do not copy it from conversation history into a file.

| Data                                            | Storage / behavior                                                          |
| ----------------------------------------------- | --------------------------------------------------------------------------- |
| Base URL, model, instructions, preference flags | `chrome.storage.local`, under `config`                                      |
| API key, default mode                           | `chrome.storage.session`; survives panel recreation but not browser restart |
| API key with Remember enabled                   | Local extension storage; not an OS-encrypted credential vault               |
| Chat messages and pending approvals             | Side-panel memory only                                                      |
| Demo external-call history                      | Page `localStorage`, key `itsm-webmcp-external-calls`, up to 50 entries     |

The default prompt migration compares the saved prompt's SHA-256 hash with the exact v0.1 built-in prompt. Only that known default is replaced with English. Custom instructions, including instructions in another language, are deliberately preserved.

The manifest currently grants HTTP(S) and file host access to support arbitrary user-selected pages and model endpoints. There is no external website messaging entry point for proxying model requests. Conversations, page title/URL, tool definitions, and tool results are sent to the configured provider; full-page DOM content is not automatically scraped.

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
3. If the SVG changed, run `node scripts/icons.mjs`; its default Chrome path is Windows-specific and can be overridden with `CHROME_PATH`.
4. Run checks appropriate to the changes and inspect UI output where necessary.
5. Package the extension folder, excluding credentials and development artifacts:

```powershell
Compress-Archive -Path extension -DestinationPath dist/webmcp-agent-0.2.0.zip -Force
```

Use the new release version in the archive filename. The archive contains an `extension` folder; users load that folder after extraction, not the archive itself.

## 10. Troubleshooting

| Symptom                          | First checks                                                                                         |
| -------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Tools unavailable                | Open a normal webpage; inspect its native API, isolation header, WebMCP flag, and registration state |
| Built-in Gemini cannot see tools | Use this extension's side panel; it is a separate client with its own tool adapter                   |
| Settings appear unchanged        | Save, then create a new session; reload the extension after source changes                           |
| Old name or icon remains         | Reload the existing extension in Chrome and reopen the panel                                         |
| Old default prompt remains       | Compare against the exact legacy default; do not overwrite a custom prompt                           |
| HTTP 401 / model error           | Check key, endpoint, model availability, and provider tool-call compatibility                        |
| Stream or tool calling fails     | Use Test connection to distinguish streaming support from valid function calling                     |
| Tool definition changed          | Refresh discovery; retain canonical comparisons and document binding                                 |
| Page changed warning             | Start a new session; do not bypass document isolation to reuse stale context                         |
| Stop did not undo an action      | Expected: completed operations are not reversible through cancellation                               |
| File URL fails                   | Check extension file access and whether the page's native API/fallback is available                  |

## 11. Known limits and recommended next work

These are follow-up candidates, not claims that the current release implements them:

- Review the manifest's declared minimum Chrome version (`120`) against APIs used, including `AbortSignal.any` and experimental WebMCP. It is not a claim that Chrome 120 supports the tested native path.
- Compatibility with the legacy discovery interface and other model providers needs broader testing.
- No independent iframe enumeration, Responses API, attachments, voice, persistent conversation history, or autonomous cross-page navigation.
- Cancellation is best effort. Page code can ignore abort signals, and tool annotations originate from the page.
- A long session can reach a provider's context limit; there is no automatic summarization or token budgeting.
- `panel.js` concentrates UI and agent state; consider splitting it before large new features.
- `panel.css` contains initial styling plus later redesign overrides. Consolidating those rules would reduce maintenance risk without changing appearance.
- Host permissions are broad. Optional per-origin permissions and a production credential-proxy strategy would need a separate design decision.
- The demo's internal/external distinction uses a shared in-page invocation flag. It is suitable for this sequential demonstration, not an authenticated provenance mechanism under concurrent calls.
- The extension bridge reports an API shape, not cryptographic proof that a page is using a native implementation; consult the demo's explicit native/fallback indicator during testing.
- The end-to-end suite has been observed to time out once at its first run-status wait (1 of 3 consecutive runs on 2026-09-22). No deterministic cause was found; consider a single timeout retryable, but record it.
- There is no production backend, Chrome Web Store listing, or enterprise distribution package. Releases are still assembled manually per section 9; the public repository only provides the Git history and remotes.

Start by reading this document, `extension/README.md`, and the files relevant to the requested change. Preserve the general-purpose boundary between the extension and example, and validate new browser behavior in an isolated profile.
