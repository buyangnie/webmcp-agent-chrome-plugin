# WebMCP Agent

A general-purpose Chrome side-panel agent connecting webpage WebMCP tools to OpenAI-compatible models. The ITSM workspace is a separate example. Version 0.2 uses an English interface, Google-inspired Material surfaces, and an original four-color tools icon. It is not affiliated with Google.

## Installation and upgrades

Enable Developer mode at `chrome://extensions`, select **Load unpacked**, and choose this directory. Pin the extension, open a supported webpage, and click the toolbar icon.

For an upgrade, reload the existing extension and reopen the side panel. Saved model settings are retained. The exact v0.1 default prompt migrates to English; custom prompts are preserved. Refresh any already-open example page to load its English version.

Open **Settings** to configure Base URL, API key, model name, and system instructions. **Test connection** verifies streaming responses and a valid model tool call without executing webpage tools. **Save changes** applies settings to the next new session.

Default Base URL: `https://api.deepseek.com`. Default model: `deepseek-flash`. The key is intentionally blank. Version-prefixed URLs such as `/v1` and full `/chat/completions` URLs are supported. The model must support Chat Completions SSE and `tools/tool_calls`; Responses API is not implemented.

## Conversation

- One current session; no saved chat history or conversation list.
- **New session** clears messages, results, and pending approvals while retaining settings.
- Enter sends; Shift+Enter adds a line. Input method composition is respected.
- Streaming Markdown includes tables, code highlighting, safe links, and copy actions.
- Tool cards show parameters, execution state, output, and failures.
- Only explicitly read-only, non-consequential tools run without confirmation. Other tools require approval. Tool annotations are page-supplied hints, not a security guarantee.
- Stop cancels model requests, prevents follow-up calls, and sends a best-effort abort signal to a running page tool. Completed actions are not rolled back. Tools that ignore cancellation may continue.
- Requests have a 12-step limit, model calls a 120-second timeout, and tools a 60-second timeout.
- Tool output sent to the model is limited to 32,000 characters, with an explicit truncation marker.

## Page context

Tools are discovered from the active main document. The list refreshes every five seconds while idle and can be refreshed manually. Execution binds to a specific tab and document, so navigation cannot redirect a pending operation to another document. Tool definitions are checked again before execution. Changing the target page requires a new session when previous conversation context exists.

The adapter supports `document.modelContext.getTools/executeTool` with JSON-string arguments and includes a compatibility path for `navigator.modelContextTesting`. It does not independently scan iframe documents. Ordinary chat remains available when no tools are found.

Native WebMCP may require an experimental browser flag, origin isolation, and the appropriate permissions policy. Browser-internal pages and the extension store prohibit script injection. For file URLs, enable **Allow access to file URLs** in the extension details.

## Privacy and storage

Conversations, page title/URL, tool definitions, and results are sent to the configured model endpoint. The extension does not automatically scrape the full DOM. API keys are never passed into webpage execution.

By default the key stays in Chrome session storage until the browser closes. **Remember key on this device** stores it in local extension storage, which is not an OS-encrypted credential vault. Other settings are saved locally. Chrome sync is not used. Conversation messages remain in side-panel memory; Chrome controls when closing the panel destroys that document. Sessions are not restored after unloading or restarting.

Host permissions cover HTTP(S) and file pages to support user-selected sites and model endpoints. Scripts run only for selected-page discovery or requested tool execution. The extension does not enumerate page contents in the background or accept external model-proxy requests from websites.

## Development

From the project root: `npm ci`, `npm run vendor`, `npm test`. For integration tests install Playwright Chromium and run `npm run test:e2e` with the example server active. A temporary `WEBMCP_TEST_KEY` environment variable enables real DeepSeek verification. Tests do not install into the user's active Chrome profile.

The SVG original is `icons/icon.svg`. Toolbar PNGs are included. Third-party runtime dependencies and licenses are vendored in `vendor/`; no remote scripts or CDN are used.

Voice, attachments, cross-page autonomous navigation, saved conversations, and adding tools to Chrome's built-in Gemini are outside this release.
