import { chromium } from "playwright";
import { readFile } from "node:fs/promises";
const browser = await chromium.launch({
  headless: true,
  executablePath:
    process.env.CHROME_PATH ||
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
});
const page = await browser.newPage();
const sources = {
  small: await readFile("extension/icons/icon-small.svg", "utf8"),
  large: await readFile("extension/icons/icon.svg", "utf8"),
};
const themes = { "": "#2f2f2f", "-dark": "#e3e3e3" };
for (const [suffix, color] of Object.entries(themes))
  for (const size of [16, 32, 48, 128]) {
    const svg = sources[size <= 32 ? "small" : "large"].replaceAll(
      "#2f2f2f",
      color,
    );
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(
      "<style>body{margin:0}svg{width:100vw;height:100vh;display:block}</style>" +
        svg,
    );
    await page.screenshot({
      path: `extension/icons/icon${suffix}-${size}.png`,
      omitBackground: true,
    });
  }
await browser.close();
