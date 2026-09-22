# WebMCP Agent

A general-purpose Chrome assistant for the page you are on. It reads the page, accepts files and images, and uses the page's WebMCP tools when it has them, with a model you configure. It runs in the side panel or a floating window, in English or Simplified Chinese. This is an independent extension, not a Google product.

Version 0.7 draws Mermaid diagrams in answers, in the current theme, with enlarge, zoom, and SVG or PNG download. Version 0.6 added a WebMCP inspector (Settings → Developer): it diagnoses why a page has no tools, checks tool definitions, and calls tools directly without the model. Version 0.5 added skills: saved instructions you pick with `/` or that the model loads when they fit, managed in Settings and compatible with `SKILL.md` files. The floating window now opens in front, pages without tools show their real title, and the model name is no longer shown once configured. Version 0.4 added the floating window, conversations that survive closing the panel and navigating, a dark-grey Chrome-native look with a new icon, and a Chinese interface. See [PRIVACY.md](PRIVACY.md) and [STORE.md](STORE.md) for the privacy policy and Web Store listing.

## Screenshots

The WebMCP inspector next to the agent, with the Developer settings that turn it on:

![WebMCP inspector diagnosing a page and listing its tools, next to the agent's Developer settings](images/cws-screenshot-01-inspector-and-agent.jpg)

| Ask about the current page, or start from a skill                                                    | Manage skills                                                                                        |
| ---------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| ![Welcome screen in the floating window with skill suggestions](images/cws-screenshot-02-skills.jpg) | ![Skills settings with built-in skills and import](images/cws-screenshot-04-ask-about-this-page.jpg) |

Connect any OpenAI-compatible model and edit the instructions:

![Model settings with endpoint, API key, model name, and instructions](images/cws-screenshot-03-model-settings.jpg)

## Install

1. Open `chrome://extensions` and enable **Developer mode**.
2. Choose **Load unpacked** and select this project's `extension` directory.
3. Open any webpage and click the extension's toolbar icon. Pages with WebMCP tools also let the model act on them.
4. Open **Settings**, enter your API key, test the connection, and save.

Default endpoint: `https://api.deepseek.com`. Default model: `deepseek-flash`. Both are editable. No credentials are included in source or release packages.

Already installed? Reload the existing extension on `chrome://extensions`, then close and reopen its side panel. Settings are preserved. An unmodified built-in prompt from an earlier version is replaced with the current default; custom prompts remain unchanged.

## Project layout

- `extension/`: ready-to-load Manifest V3 extension; see its README for details.
- `extension/icons/`: vector icon sources with generated light and dark PNG assets.
- `extension/_locales/`: English and Simplified Chinese UI strings.
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

Browser tests use a temporary independent Chrome for Testing profile. They exercise the extension page and real scripting APIs against native WebMCP, including tool discovery, page text, execution, confirmation/decline, stopping, new sessions, continuing after navigation, session restore, pages without tools, skills (slash menu, manual and automatic use, settings), the inspector (diagnosis, lint, direct calls, tab following), Mermaid diagrams and their failure fallback, and sanitized Markdown. Controlled model responses make the main suite deterministic. Set the temporary `WEBMCP_TEST_KEY` environment variable for an additional real DeepSeek run; never commit credentials.

Run `npm run vendor` to update packaged runtime libraries. Run `node scripts/icons.mjs` to regenerate PNG icons using installed Chrome, or supply `CHROME_PATH`. No CDN or build server is required at runtime.

UI snapshots are written to `test-results/`. Release archives are published on [GitHub Releases](https://github.com/buyangnie/webmcp-agent-chrome-plugin/releases); build them into `dist/`, which is not tracked.
