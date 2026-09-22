# WebMCP Agent

A general-purpose Chrome assistant for the page you are on. It reads the page's visible text, accepts files and images, and uses the page's WebMCP tools when the page provides them. It talks to any OpenAI-compatible model you configure. The ITSM workspace in this repository is a separate example. The extension is not affiliated with Google.

## Installation and upgrades

Enable Developer mode at `chrome://extensions`, select **Load unpacked**, and choose this directory. Pin the extension, open a webpage, and click the toolbar icon.

For an upgrade, reload the existing extension and reopen the side panel. Saved model settings are retained. An unmodified built-in prompt from an earlier version is replaced with the current default; custom prompts are preserved.

Open **Settings** to configure Base URL, API key, model name, and system instructions. **Test connection** checks streaming and whether the model returns tool calls, without executing webpage tools. A model without tool calling still works for chat and page content; the test reports this as a warning, not a failure. **Save changes** applies settings to the next new session.

Default Base URL: `https://api.deepseek.com`. Default model: `deepseek-flash`. The key is intentionally blank. Version-prefixed URLs such as `/v1` and full `/chat/completions` URLs are supported. Remote endpoints must use HTTPS; plain HTTP is accepted only for `localhost` and `127.0.0.1`. The model must support Chat Completions SSE; Responses API is not implemented.

## Interface

- The header shows the current page's title, its tool count, and actions for a new session, the floating window, and settings. A green dot means the page provides tools. Pages without tools are a normal state and show `0 tools`; the tools list says "No WebMCP tools are available on this page", and only pages Chrome forbids add that they can't be read.
- The interface follows Chrome's language: Simplified Chinese for `zh-CN`, English otherwise. It follows Chrome's light or dark theme, and the toolbar icon switches with it.
- Until a model is configured, the composer shows **Connect a model to get started**, which opens Settings. The model name is not shown otherwise.
- **Floating window** moves the conversation into a separate, resizable window that follows whichever browser window you used last. **Move back to the side panel** returns it. Only one of the two is open at a time; opening the side panel closes the floating window and takes over its conversation. The floating window opens in front, but it is a normal window: clicking the browser window brings that to the front. Chrome does not let a side panel open an always-on-top (Document Picture-in-Picture) window.

## Skills

A skill is saved instructions for a recurring task. Three are preinstalled in the UI language (summarize, translate, extract a table); they can be edited or deleted.

- Type `/` in the message box to pick one. It appears as a chip; send with or without extra text. Backspace in an empty box removes it. The welcome screen shows the first three skills as one-click buttons.
- Skills marked **Auto** are listed to the model by name and description. The model can load one with the built-in `load_skill` tool; the conversation then shows "Used skill: …". Loading a skill needs no approval, because it only reads your own saved text.
- Manage skills under **Settings → Skills**: up to 50 skills, names without spaces (up to 40 characters), descriptions up to 200 characters, instructions up to 20,000.
- **Import SKILL.md** reads the `name` and `description` frontmatter and the body of Claude-style skill files. Scripts or other files a skill refers to are not imported. **Export** writes the same format.
- Skills are stored in `chrome.storage.local` on this device and are not synced.

## Conversation

- One conversation per side panel. It survives closing and reopening the panel, and moving between the side panel and the floating window, until Chrome closes. There is no saved history list.
- **New session** clears messages, results, and pending approvals while retaining settings.
- The current page is attached to each message by default and shown as a removable chip. Its visible text (up to 24,000 characters) is sent with the message.
- Attach up to 4 images (PNG, JPEG, GIF, WebP; up to 20 MB each, downscaled to 1600 px before sending) and up to 4 text or code files (100 KB each) with the paperclip, by drag and drop, or by pasting images. Only the two most recent messages with images keep their images in the model context.
- Enter sends; Shift+Enter adds a line. You can keep typing while a response streams.
- Streaming Markdown includes tables, code highlighting, safe links, and copy actions.
- Tool cards show parameters, execution state, output, and failures.
- Only explicitly read-only, non-consequential tools run without confirmation. Other tools require approval. Tool annotations are page-supplied hints, not a security guarantee.
- Stop cancels model requests, prevents follow-up calls, and sends a best-effort abort signal to a running page tool. Completed actions are not rolled back.
- Requests have a 12-step limit. A model stream fails after 90 seconds without data; tools time out after 60 seconds. Tool output sent to the model is limited to 32,000 characters.
- Long conversations send the most recent 12 turns within a size budget.

## Page context

Tools are discovered from the active main document when the tab changes, finishes loading, or reports a tool change, and before every message. There is no background polling. Execution binds to a specific tab and document, and definitions are checked again before execution.

Navigating keeps the conversation. A "Now on" divider marks the page change, and later messages use the new page and its tools. Earlier tool calls for tools the new page lacks are sent to the model as plain text.

The adapter supports `document.modelContext.getTools/executeTool` and includes a compatibility path for `navigator.modelContextTesting`. It does not scan iframe documents. Native WebMCP may require an experimental browser flag, origin isolation, and the appropriate permissions policy. Chrome's internal pages and the Web Store cannot be read; they show `0 tools`, and the tools list explains why. For file URLs, enable **Allow access to file URLs** in the extension details.

## Privacy and storage

See [PRIVACY.md](../PRIVACY.md). In short: messages, the page's title, URL, and visible text, attachments, tool definitions, and tool results go only to the model endpoint you configure. API keys are never passed into webpages.

By default the key stays in Chrome session storage until the browser closes. **Remember key on this device** stores it in local extension storage, which is not an OS-encrypted credential vault. Conversations are kept in session storage and cleared when Chrome closes. Skills are kept in local extension storage. Chrome sync is not used.

## Development

From the project root: `npm ci`, `npm run vendor`, `npm test`. For integration tests install Playwright Chromium and run `npm run test:e2e` with the example server active. A temporary `WEBMCP_TEST_KEY` environment variable enables real DeepSeek verification.

Icon sources are `icons/icon.svg` (48/128 px) and `icons/icon-small.svg` (16/32 px). `node scripts/icons.mjs` renders the light and `-dark` PNG sets. UI strings are in `_locales/`. Third-party runtime dependencies and licenses are vendored in `vendor/`; no remote scripts or CDN are used.
