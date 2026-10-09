import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const docsDir = "docs";
const contentDir = join(docsDir, "content");
const files = [];
function walk(d) {
  for (const f of readdirSync(d)) {
    const p = join(d, f);
    if (p === contentDir) continue;
    if (statSync(p).isDirectory()) {
      walk(p);
      continue;
    }
    if (f.endsWith(".html")) files.push(p);
  }
}
walk(docsDir);

let bad = 0;
for (const file of files) {
  const t = readFileSync(file, "utf8");
  if (t.includes("{{") || t.includes("}}")) {
    console.log("LEFTOVER", file);
    bad++;
  }
  for (const m of t.matchAll(/href="([^"#]+)"/g)) {
    let href = m[1];
    if (/^(https?:|mailto:)/.test(href)) continue;
    if (href.startsWith("./")) href = href.slice(2);
    // resolve against the page dir. directory hrefs serve index.html.
    const base = href.endsWith("/") ? join(href, "index.html") : href;
    const target = resolve(dirname(file), base);
    if (!existsSync(target)) {
      console.log("BROKEN", file, "->", href);
      bad++;
    }
  }
  if (!t.includes('data-page="') || !t.includes("docs-wrap")) {
    if (file.includes("docs\\docs") || file.includes("docs/docs")) {
      console.log("NO-DOCS-SHELL", file);
      bad++;
    }
  }
}
console.log(files.length + " pages checked");
console.log(bad === 0 ? "docs ok" : "docs FAIL");
process.exit(bad === 0 ? 0 : 1);
