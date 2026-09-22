# Chrome Web Store submission

Copy these fields into the Chrome Web Store developer dashboard. Upload `dist/webmcp-agent-<version>.zip`.

## Store listing

**Name:** WebMCP Agent

**Category:** Productivity (Tools)

**Summary (English, max 132 characters):**
Ask about the page you're on, attach files and images, and let your own AI model use the page's WebMCP tools with your approval.

**Summary (简体中文):**
询问当前页面，附加文件和图片，并在你批准后让你自己的 AI 模型使用页面的 WebMCP 工具。

**Description (English):**

WebMCP Agent is a browser assistant in Chrome's side panel that works with the AI model you choose.

• Ask about the current page. It reads the page's visible text, so you can summarize, explain, or extract information.
• Attach files and images, or paste a screenshot straight into the message box.
• Use page tools. On sites that provide WebMCP tools, the model can look things up and take actions for you. Anything that changes the page asks for your approval first.
• Bring your own model. Connect any OpenAI-compatible Chat Completions endpoint, such as DeepSeek or OpenAI, with your own API key.
• Side panel or floating window. Move the conversation into its own window and back whenever you like.
• Follows Chrome's light and dark themes, in English and Simplified Chinese.

Privacy: there is no server of its own. Your messages, page content, and attachments go only to the model endpoint you configure. Conversations are cleared when Chrome closes.

**Description (简体中文):**

WebMCP Agent 是 Chrome 侧边栏里的浏览器助手，使用你自己选择的 AI 模型。

• 询问当前页面：读取页面上的可见文字，帮你总结、解释或提取信息。
• 附加文件和图片，也可以直接把截图粘贴到输入框。
• 使用页面工具：在提供 WebMCP 工具的网站上，模型可以帮你查询和操作；任何会修改页面的操作都会先请你批准。
• 自带模型：可连接任何兼容 OpenAI Chat Completions 的接口（如 DeepSeek、OpenAI），使用你自己的 API 密钥。
• 侧边栏或悬浮窗口：随时把对话移到独立窗口，也可以移回侧边栏。
• 跟随 Chrome 的浅色和深色主题，支持英文和简体中文。

隐私：没有自己的服务器。你的消息、页面内容和附件只发送给你配置的模型接口；关闭 Chrome 后对话即清除。

## Privacy practices tab

**Single purpose:**
Help the user understand and act on the webpage they are viewing, by sending their question, the page's content, and their attachments to an AI model they configure, and running the page's WebMCP tools with their approval.

**Permission justifications:**

| Permission                                                  | Justification                                                                                                                                                                                                  |
| ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `sidePanel`                                                 | The assistant's interface is shown in Chrome's side panel.                                                                                                                                                     |
| `storage`                                                   | Saves the user's model settings locally, and keeps the API key and current conversation in session storage until Chrome closes.                                                                                |
| `scripting`                                                 | Reads the visible text of the page the user asks about, and discovers and runs that page's WebMCP tools when the user sends a message.                                                                         |
| `activeTab`                                                 | Grants access to the current tab when the user opens the extension from the toolbar.                                                                                                                           |
| `tabs`                                                      | Shows the current tab's title in the panel and notices when the user switches tabs or the page finishes loading, so the context stays correct.                                                                 |
| `offscreen`                                                 | A hidden document detects Chrome's light or dark theme so the toolbar icon stays visible. Service workers cannot read the color scheme.                                                                        |
| Host permissions (`http://*/*`, `https://*/*`, `file:///*`) | The user can ask about any page they open, so the extension must be able to read that page and run its WebMCP tools. It sends requests to the model endpoint the user configures, which can be any HTTPS host. |

**Remote code:** No. All scripts are packaged with the extension.

**Data usage (check these):**

- Website content (page text, title, URL, and tool results sent to the user's model endpoint)
- User activity is **not** collected.
- Personally identifiable information, health, financial, authentication, personal communications, location, and web history: **not** collected. The API key is stored only on the device and sent only to the endpoint the user configured.

Certify all three: not sold to third parties; not used for purposes unrelated to the single purpose; not used for creditworthiness or lending.

**Privacy policy URL:**
<https://github.com/buyangnie/webmcp-agent-chrome-plugin/blob/main/PRIVACY.md>

## Assets

- Icon: `extension/icons/icon-128.png`
- Screenshots: 1280×800 captures of the side panel on a real page (light and dark), the floating window, and a tool approval card.
