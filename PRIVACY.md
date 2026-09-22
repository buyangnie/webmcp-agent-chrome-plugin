# WebMCP Agent privacy policy

Last updated: September 22, 2026

WebMCP Agent is a Chrome extension that answers questions about the page you are viewing, using an AI model endpoint that you configure. It has no server of its own, no accounts, no analytics, and no advertising.

## What the extension handles

When you send a message, the extension sends the following to the model endpoint you configured in Settings, and nowhere else:

- your message and the earlier messages of the current conversation;
- unless you remove the page chip, the current page's title, URL, and visible text;
- files and images you attach;
- the names, descriptions, and input schemas of WebMCP tools the page provides, and the results of tools you allow the model to run.

That endpoint is operated by the provider you chose (for example DeepSeek or OpenAI), and its own privacy policy governs what it does with the data.

The extension reads a page only when you open it on that page or send a message. It does not read pages in the background, and it does not send your browsing history anywhere.

## What is stored, and where

- **Settings** (endpoint, model name, instructions) are stored locally in Chrome's extension storage on your device.
- **API key**: kept in Chrome session storage by default and erased when Chrome closes. If you turn on "Remember key on this device", it is stored in local extension storage on your device.
- **Conversations**: kept in Chrome session storage so they survive closing the panel, and erased when Chrome closes.

Nothing is synced through your Google account. Your API key is never exposed to webpages.

## Sharing

The extension does not sell, share, or transfer your data to anyone other than the model endpoint you configure, and does not use it for any purpose unrelated to answering your requests.

## Contact

Questions or concerns: open an issue at <https://github.com/buyangnie/webmcp-agent-chrome-plugin/issues>.
