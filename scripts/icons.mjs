import { chromium } from "playwright";
import { readFile, mkdir } from "node:fs/promises";
const browser = await chromium.launch({
  headless: true,
  executablePath:
    process.env.CHROME_PATH ||
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
});
const page = await browser.newPage();
const svg = await readFile("extension/icons/icon.svg", "utf8");
for (const size of [16, 32, 48, 128]) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(
    "<style>body{margin:0}svg{width:100vw;height:100vh;display:block}</style>" +
      svg,
  );
  await page.screenshot({
    path: `extension/icons/icon-${size}.png`,
    omitBackground: true,
  });
}
await mkdir("test-results", { recursive: true });
await browser.close();
