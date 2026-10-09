import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const docsDir = join(root, "docs");
const contentDir = join(docsDir, "content");
const templateFile = join(root, "scripts", "docs-template.html");

const PAGES = [
  {
    out: "index.html",
    src: "index.html",
    title: "Introduction",
    desc: "Bedrock Builder docs. Create, generate, build, run, and ship Minecraft Bedrock add-ons.",
    page: "index",
    depth: 1,
    canonical: "docs/",
    edit: "index.html",
    prev: null,
    next: { href: "getting-started/", label: "Getting Started" },
  },
  {
    out: "getting-started/index.html",
    src: "getting-started.html",
    title: "Getting Started",
    desc: "Create, build, hot reload, and ship a Bedrock add-on in five minutes.",
    page: "getting-started",
    depth: 2,
    canonical: "docs/getting-started/",
    edit: "getting-started.html",
    prev: { href: "../", label: "Introduction" },
    next: { href: "../concepts/workspace-layout/", label: "Workspace Layout" },
  },
  {
    out: "concepts/workspace-layout/index.html",
    src: "workspace-layout.html",
    title: "Workspace Layout",
    desc: "What bb init writes and what each folder is for.",
    page: "workspace-layout",
    depth: 3,
    canonical: "docs/concepts/workspace-layout/",
    edit: "workspace-layout.html",
    prev: { href: "../../getting-started/", label: "Getting Started" },
    next: { href: "../packs-and-manifests/", label: "Packs and Manifests" },
  },
  {
    out: "concepts/packs-and-manifests/index.html",
    src: "packs-and-manifests.html",
    title: "Packs and Manifests",
    desc: "BP plus RP, UUIDs, versions, and the bb manifest and version commands.",
    page: "packs-and-manifests",
    depth: 3,
    canonical: "docs/concepts/packs-and-manifests/",
    edit: "packs-and-manifests.html",
    prev: { href: "../workspace-layout/", label: "Workspace Layout" },
    next: { href: "../pipeline/", label: "Build Pipeline" },
  },
  {
    out: "concepts/pipeline/index.html",
    src: "pipeline.html",
    title: "Build Pipeline",
    desc: "How bb build bundles, classifies, caches, and prunes pack files.",
    page: "pipeline",
    depth: 3,
    canonical: "docs/concepts/pipeline/",
    edit: "pipeline.html",
    prev: { href: "../packs-and-manifests/", label: "Packs and Manifests" },
    next: { href: "../extensions/", label: "Extensions" },
  },
  {
    out: "concepts/extensions/index.html",
    src: "extensions.html",
    title: "Extensions",
    desc: "User enabled processors with match plus remap, pre, transform, post hooks.",
    page: "extensions",
    depth: 3,
    canonical: "docs/concepts/extensions/",
    edit: "extensions.html",
    prev: { href: "../pipeline/", label: "Build Pipeline" },
    next: { href: "../comparison/", label: "Tool Comparison" },
  },
  {
    out: "concepts/comparison/index.html",
    src: "comparison.html",
    title: "Tool Comparison",
    desc: "Bedrock Builder versus mct, Regolith, and bridge. by band and feature.",
    page: "comparison",
    depth: 3,
    canonical: "docs/concepts/comparison/",
    edit: "comparison.html",
    prev: { href: "../extensions/", label: "Extensions" },
    next: { href: "../../guides/hot-reload/", label: "Hot Reload Setup" },
  },
  {
    out: "guides/hot-reload/index.html",
    src: "hot-reload.html",
    title: "Hot Reload Setup",
    desc: "Rebuild and redeploy into the game on every save with bb run --watch.",
    page: "hot-reload",
    depth: 3,
    canonical: "docs/guides/hot-reload/",
    edit: "hot-reload.html",
    prev: { href: "../../concepts/comparison/", label: "Tool Comparison" },
    next: { href: "../ship/", label: "Shipping a .mcaddon" },
  },
  {
    out: "guides/ship/index.html",
    src: "ship.html",
    title: "Shipping a .mcaddon",
    desc: "Release build plus manifest validation plus zip with bb ship.",
    page: "ship",
    depth: 3,
    canonical: "docs/guides/ship/",
    edit: "ship.html",
    prev: { href: "../hot-reload/", label: "Hot Reload Setup" },
    next: { href: "../custom-deploy/", label: "Custom Deploy Path" },
  },
  {
    out: "guides/custom-deploy/index.html",
    src: "custom-deploy.html",
    title: "Custom Deploy Path",
    desc: "Point bb at a nonstandard com.mojang folder.",
    page: "custom-deploy",
    depth: 3,
    canonical: "docs/guides/custom-deploy/",
    edit: "custom-deploy.html",
    prev: { href: "../ship/", label: "Shipping a .mcaddon" },
    next: { href: "../verify-check/", label: "Verify with bb check" },
  },
  {
    out: "guides/verify-check/index.html",
    src: "verify-check.html",
    title: "Verify with bb check",
    desc: "Inspect the project and fix what is missing with bb check --fix.",
    page: "verify-check",
    depth: 3,
    canonical: "docs/guides/verify-check/",
    edit: "verify-check.html",
    prev: { href: "../custom-deploy/", label: "Custom Deploy Path" },
    next: { href: "../preview-diff/", label: "Preview with bb diff" },
  },
  {
    out: "guides/preview-diff/index.html",
    src: "preview-diff.html",
    title: "Preview with bb diff",
    desc: "Show what changed since the last build with bb diff.",
    page: "preview-diff",
    depth: 3,
    canonical: "docs/guides/preview-diff/",
    edit: "preview-diff.html",
    prev: { href: "../verify-check/", label: "Verify with bb check" },
    next: { href: "../verify-harness/", label: "Verify with bb harness" },
  },
  {
    out: "guides/verify-harness/index.html",
    src: "verify-harness.html",
    title: "Verify with bb harness",
    desc: "Cross-check every icon, texture, recipe, and spawn reference in dist.",
    page: "verify-harness",
    depth: 3,
    canonical: "docs/guides/verify-harness/",
    edit: "verify-harness.html",
    prev: { href: "../preview-diff/", label: "Preview with bb diff" },
    next: { href: "../release-publish/", label: "Release with bb publish" },
  },
  {
    out: "guides/release-publish/index.html",
    src: "release-publish.html",
    title: "Release with bb publish",
    desc: "Bump, ship, harness, tag, and push in one bb publish run.",
    page: "release-publish",
    depth: 3,
    canonical: "docs/guides/release-publish/",
    edit: "release-publish.html",
    prev: { href: "../verify-harness/", label: "Verify with bb harness" },
    next: { href: "../troubleshooting/", label: "Troubleshooting" },
  },
  {
    out: "guides/troubleshooting/index.html",
    src: "troubleshooting.html",
    title: "Troubleshooting",
    desc: "Fix deploy target, UUID collisions, entry, ffmpeg, and config drift.",
    page: "troubleshooting",
    depth: 3,
    canonical: "docs/guides/troubleshooting/",
    edit: "troubleshooting.html",
    prev: { href: "../release-publish/", label: "Release with bb publish" },
    next: { href: "../../reference/cli/", label: "CLI: bb" },
  },
  {
    out: "reference/cli/index.html",
    src: "cli.html",
    title: "CLI: bb",
    desc: "Every bb command and flag.",
    page: "cli",
    depth: 3,
    canonical: "docs/reference/cli/",
    edit: "cli.html",
    prev: { href: "../../guides/troubleshooting/", label: "Troubleshooting" },
    next: { href: "../generators/", label: "CLI: bb new" },
  },
  {
    out: "reference/generators/index.html",
    src: "generators.html",
    title: "CLI: bb new",
    desc: "All 27 bb new generator types and flags.",
    page: "generators",
    depth: 3,
    canonical: "docs/reference/generators/",
    edit: "generators.html",
    prev: { href: "../cli/", label: "CLI: bb" },
    next: { href: "../config/", label: "Config Schema" },
  },
  {
    out: "reference/config/index.html",
    src: "config.html",
    title: "Config Schema",
    desc: "Every config.json key bb reads.",
    page: "config",
    depth: 3,
    canonical: "docs/reference/config/",
    edit: "config.html",
    prev: { href: "../generators/", label: "CLI: bb new" },
    next: { href: "../exit-codes/", label: "Exit Codes" },
  },
  {
    out: "reference/exit-codes/index.html",
    src: "exit-codes.html",
    title: "Exit Codes",
    desc: "What each bb exit code means for scripts and CI.",
    page: "exit-codes",
    depth: 3,
    canonical: "docs/reference/exit-codes/",
    edit: "exit-codes.html",
    prev: { href: "../config/", label: "Config Schema" },
    next: { href: "../api/", label: "API Reference" },
  },
  {
    out: "reference/api/index.html",
    src: "api.html",
    title: "API Reference",
    desc: "Programmatic API for builds, generators, checks, and extensions.",
    page: "api",
    depth: 3,
    canonical: "docs/reference/api/",
    edit: "api.html",
    prev: { href: "../exit-codes/", label: "Exit Codes" },
    next: { href: "../../changelog/", label: "Changelog" },
  },
  {
    out: "changelog/index.html",
    src: "changelog.html",
    title: "Changelog",
    desc: "History of Bedrock Builder by version.",
    page: "changelog",
    depth: 2,
    canonical: "docs/changelog/",
    edit: "changelog.html",
    prev: { href: "../reference/api/", label: "API Reference" },
    next: null,
  },
];

function paint(code) {
  const out = [];
  for (const line of code.split("\n")) {
    const stripped = line.trim();
    let next = line;
    if (/^(bb|\$ bb|npm|npx|cd|git)\s/.test(stripped)) {
      next = next.replace(/\bbb(\s+)([a-z-]+)/, 'bb$1<span class="f">$2</span>');
      next = next.replace(/(--[a-z-]+)/g, '<span class="k">$1</span>');
      next = `<span class="prompt" data-copy-skip>$ </span>${next}`;
    } else if (/^\s*(create|update)\s/.test(next)) {
      next = next.replace(/^(\s*)(create|update)/, '$1<span class="n">$2</span>');
    }
    out.push(next);
  }
  return out.join("\n");
}

const COPY_BTN = `<button class="copy-btn" type="button" aria-label="Copy code"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="5.5" y="5.5" width="8" height="8" rx="1.5"/><path d="M10.5 5.5v-2a1.5 1.5 0 0 0-1.5-1.5H4A1.5 1.5 0 0 0 2.5 3.5v5A1.5 1.5 0 0 0 4 10h1.5"/></svg></button>`;
const DOTS = `<div class="codeblock-bar"><span></span><span></span><span></span>${COPY_BTN}</div>`;

function wrapBlocks(html) {
  return html.replace(
    /<pre><code>([\s\S]*?)<\/code><\/pre>/g,
    `<div class="codeblock">${DOTS}$&</div>`,
  );
}

function sidebarRoot(page) {
  return "../".repeat(page.depth - 1);
}

function pager(page) {
  const fix = (href) => (href.startsWith(".") || href.startsWith("/") ? href : `./${href}`);
  const left = page.prev
    ? `<a href="${fix(page.prev.href)}"><span>Previous</span>${page.prev.label}</a>`
    : "<span></span>";
  const right = page.next
    ? `<a href="${fix(page.next.href)}" style="text-align:right"><span>Next</span>${page.next.label}</a>`
    : "<span></span>";
  return `<nav class="pager">${left}${right}</nav>`;
}

const template = await readFile(templateFile, "utf8");
for (const page of PAGES) {
  const rootPath = "../".repeat(page.depth);
  const sidebarPath = sidebarRoot(page);
  const raw = await readFile(join(contentDir, page.src), "utf8");
  const docsPath = "../".repeat(page.depth - 1);
  const body = wrapBlocks(
    paint(raw).replaceAll("{{ROOT}}", rootPath).replaceAll("{{DOCS}}", docsPath),
  );
  const html = template
    .replaceAll("{{TITLE}}", page.title)
    .replaceAll("{{DESC}}", page.desc)
    .replaceAll("{{ROOT}}", rootPath)
    .replaceAll("{{SIDEBAR}}", sidebarPath)
    .replaceAll("{{PAGE}}", page.page)
    .replaceAll("{{CANONICAL}}", page.canonical)
    .replaceAll("{{BODY}}", body)
    .replaceAll("{{PAGER}}", pager(page))
    .replaceAll("{{EDIT}}", page.edit);
  const dest = join(docsDir, "docs", page.out);
  await mkdir(dirname(dest), { recursive: true });
  await writeFile(dest, html);
  console.log(`wrote docs/docs/${page.out}`);
}
