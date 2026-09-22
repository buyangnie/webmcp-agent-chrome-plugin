import { mkdir, copyFile } from "node:fs/promises";
await mkdir("extension/vendor", { recursive: true });
for (const [a, b] of [
  ["marked/lib/marked.esm.js", "marked.js"],
  ["dompurify/dist/purify.es.mjs", "purify.js"],
  ["highlight.js/es/common.js", "unused"],
  ["marked/LICENSE", "marked-LICENSE.md"],
  ["dompurify/LICENSE", "dompurify-LICENSE"],
  ["dompurify/LICENSE-MPL", "dompurify-LICENSE-MPL"],
  ["highlight.js/LICENSE", "highlight-LICENSE"],
]) {
  if (b !== "unused")
    await copyFile("node_modules/" + a, "extension/vendor/" + b);
}
// Bundle highlight.js's CommonJS distribution without remote scripts or runtime eval.
const { createRequire } = await import("node:module");
const require = createRequire(import.meta.url);
const { readFile, writeFile } = await import("node:fs/promises");
const langs = [
  "javascript",
  "json",
  "python",
  "bash",
  "xml",
  "css",
  "sql",
  "markdown",
  "plaintext",
];
const core = await readFile(require.resolve("highlight.js/lib/core"), "utf8");
let bundle =
  "const hljs = (() => { const module={exports:{}};\n" +
  core +
  "\nreturn module.exports;})();\n";
for (const lang of langs) {
  const src = await readFile(
    require.resolve("highlight.js/lib/languages/" + lang),
    "utf8",
  );
  bundle +=
    "hljs.registerLanguage(" +
    JSON.stringify(lang) +
    ", (()=>{const module={exports:{}};\n" +
    src +
    "\nreturn module.exports;})());\n";
}
await writeFile(
  "extension/vendor/highlight.js",
  bundle + "export default hljs;\n",
);
