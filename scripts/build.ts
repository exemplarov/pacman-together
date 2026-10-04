/**
 * Static distribution builds (specs/005):
 *   dist/                        — index.html + hashed assets (any static host/CDN)
 *   dist-single/pacman-together.html — one self-contained file (works from file://)
 */
import { readFileSync } from "node:fs";
import { rm } from "node:fs/promises";

interface Artifact {
  path: string;
  size: number;
}

function human(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} kB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

async function artifacts(dir: string): Promise<Artifact[]> {
  const out: Artifact[] = [];
  for (const p of new Bun.Glob("**/*").scanSync({ cwd: dir })) {
    const file = Bun.file(`${dir}/${p}`);
    if (file.size > 0) out.push({ path: `${dir}/${p}`, size: file.size });
  }
  return out.sort((a, b) => b.size - a.size);
}

/** Make asset URLs relative so the build works under any base path (D42).
 *  Skips protocol-relative URLs (`//cdn…`). */
async function relativizeAssets(distDir: string): Promise<void> {
  const index = Bun.file(`${distDir}/index.html`);
  if (!(await index.exists())) return;
  let html = await index.text();
  const before = html;
  html = html
    .replace(
      /(src|href)="(\/[^/"][^"]*)"/g,
      (_m, attr: string, path: string) => `${attr}=".${path}"`,
    )
    .replace(
      /url\((['"]?)(\/[^/'"][^'")]*)\1\)/g,
      (_m, q: string, path: string) => `url(${q}.${path}${q})`,
    );
  if (html !== before) await Bun.write(index, html);
}

console.log("building dist/ …");
await rm("dist", { recursive: true, force: true });
const dist = await Bun.build({
  entrypoints: ["src/client/index.html"],
  outdir: "dist",
  minify: true,
});
if (!dist.success) {
  for (const log of dist.logs) console.error(log);
  process.exit(1);
}
await relativizeAssets("dist");

console.log("building dist-single/pacman-together.html …");
await rm("dist-single", { recursive: true, force: true });
/* NOTE: `Bun.build({compile: true, target: "browser"})` is broken in Bun 1.3.9 on
   Windows ("No entry point found for compilation" — fails even on a minimal repro),
   so we inline the dist bundle into a single HTML ourselves (D43). */
{
  const html = await Bun.file("dist/index.html").text();
  let inlined = html;
  let found = 0;
  // inline every stylesheet…
  inlined = inlined.replace(
    /<link[^>]*rel="stylesheet"[^>]*href="(\.\/[^"]+\.css)"[^>]*>/g,
    (_m, cssPath: string) => {
      found++;
      const css = readFileSync(`dist/${cssPath.slice(2)}`, "utf8");
      return `<style>\n${css.replaceAll("</style", "<\\/style")}\n</style>`;
    },
  );
  // …and every module script
  inlined = inlined.replace(
    /<script[^>]*type="module"[^>]*src="(\.\/[^"]+\.js)"[^>]*><\/script>/g,
    (_m, jsPath: string) => {
      found++;
      const js = readFileSync(`dist/${jsPath.slice(2)}`, "utf8");
      return `<script type="module">\n${js.replaceAll("</script", "<\\/script")}\n</script>`;
    },
  );
  if (found === 0) {
    console.error("no bundle references found in dist/index.html — inliner regex stale?");
    process.exit(1);
  }
  // the result must be truly self-contained (no relative file references left)
  if (/(?:src|href)="\.\/[^"]*"/.test(inlined)) {
    console.error("single-file build still references external local assets — aborting");
    process.exit(1);
  }
  await Bun.write("dist-single/pacman-together.html", inlined);
}

console.log("\nartifacts:");
for (const a of [...(await artifacts("dist")), ...(await artifacts("dist-single"))]) {
  console.log(`  ${human(a.size).padStart(10)}  ${a.path}`);
}
console.log("\ndone — deploy dist/ to any static host, or share the single html file.");
