# WebMCP Agent

A general-purpose Chrome side-panel agent for WebMCP-enabled pages. Version 0.2 introduces an English-only project and a Google-inspired Material visual design with an original four-color icon. This is an independent extension, not a Google product.

## Install

1. Open `chrome://extensions` and enable **Developer mode**.
2. Choose **Load unpacked** and select this project's `extension` directory.
3. Open a WebMCP-enabled page and click the extension's toolbar icon.
4. Open **Settings**, enter your API key, test the connection, and save.

Default endpoint: `https://api.deepseek.com`. Default model: `deepseek-flash`. Both are editable. No credentials are included in source or release packages.

Already installed? Reload the existing extension on `chrome://extensions`, then close and reopen its side panel. The product name and toolbar icon update when Chrome reloads the extension. Settings are preserved. Only the exact previous built-in prompt is automatically migrated to English; custom prompts remain unchanged.

## Project layout

- `extension/`: ready-to-load Manifest V3 extension; see its README for details.
- `extension/icons/icon.svg`: original vector icon, with generated Chrome PNG assets.
- `index.html`, `demo.js`, `demo.css`: standalone English ITSM example, not part of the extension's business logic.
- `client.html`: external-caller control page.
- `serve.py`: local static server with `Origin-Agent-Cluster: ?1`.
- `tests/`: protocol and browser integration tests.
- `scripts/`: dependency vendoring, icon generation, and visual preview helpers.

## Try the example

Run `python serve.py 8124` and open `http://127.0.0.1:8124/`. If the server is already running, refresh the page.

Ask: **Get INC-2026-0431, including internal guidance and its MCP call receipt.** Then ask: **Change it to in progress and add a note that the network team is investigating.** The second request requires approval. Compare the returned receipt with the page banner.

The example prefers the native WebMCP API and falls back to a local implementation if unavailable. It keeps three simulated incidents, parameter validation, status updates, registration controls, a local keyword simulator, manual calls, and external-call receipts. Internal guidance is kept in the script rather than rendered as page text.

## Development and verification

Run `npm ci`, `npm test`, then `npx playwright install chromium`. With the demo server running, run `npm run test:e2e`.

Browser tests use a temporary independent Chrome for Testing profile. They exercise the extension page and real scripting APIs against native WebMCP, including tool discovery, execution, confirmation/decline, stopping, new sessions, navigation isolation, and sanitized Markdown. Controlled model responses make the main suite deterministic. Set the temporary `WEBMCP_TEST_KEY` environment variable for an additional real DeepSeek run; never commit credentials.

Run `npm run vendor` to update packaged runtime libraries. Run `node scripts/icons.mjs` to regenerate PNG icons using installed Chrome, or supply `CHROME_PATH`. No CDN or build server is required at runtime.

UI snapshots are written to `test-results/`. Release archives are in `dist/`.
