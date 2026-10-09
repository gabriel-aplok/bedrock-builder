import { writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const docsDir = join(here, "..", "docs");
const base = "https://bedrock.trenbankai.dev";

const routes = [
  "",
  "docs/",
  "docs/getting-started/",
  "docs/concepts/workspace-layout/",
  "docs/concepts/packs-and-manifests/",
  "docs/concepts/pipeline/",
  "docs/concepts/extensions/",
  "docs/concepts/comparison/",
  "docs/guides/hot-reload/",
  "docs/guides/ship/",
  "docs/guides/custom-deploy/",
  "docs/guides/verify-check/",
  "docs/guides/preview-diff/",
  "docs/guides/verify-harness/",
  "docs/guides/release-publish/",
  "docs/guides/troubleshooting/",
  "docs/reference/cli/",
  "docs/reference/generators/",
  "docs/reference/config/",
  "docs/reference/exit-codes/",
  "docs/reference/api/",
  "docs/changelog/",
];

const urls = routes.map((route) => `  <url><loc>${base}/${route}</loc></url>`).join("\n");
await writeFile(
  join(docsDir, "sitemap.xml"),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`,
);
console.log("wrote docs/sitemap.xml");
