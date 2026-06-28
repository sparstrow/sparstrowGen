// Decode a Claude Design export (single self-contained .html) into its source modules.
//
// Claude Design ships a prototype as ONE .html with a `<script type="__bundler/manifest">`
// holding a JSON map of { uuid: { mime, compressed, data } } where `data` is base64-encoded
// gzip per module. This unpacks them to disk so the design can be read as reference source.
//
//   node scripts/ds-unpack.mjs <export.html> [outDir]
//
// outDir defaults to "<export-dir>/decoded". Authored modules (text/jsx, small JS) are the
// reference; the large modules + woff2 are vendor/assets. A manifest.json index is written
// alongside so you can tell authored from vendor by size/mime without opening each file.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const [, , htmlPath, outArg] = process.argv;
if (!htmlPath) {
  console.error("usage: node scripts/ds-unpack.mjs <export.html> [outDir]");
  process.exit(1);
}

const html = readFileSync(htmlPath, "utf8");
const m = html.match(/<script type="__bundler\/manifest">\s*([\s\S]*?)\s*<\/script>/);
if (!m) {
  console.error("no __bundler/manifest found — is this a Claude Design export?");
  process.exit(1);
}

const zlib = await import("node:zlib");
const manifest = JSON.parse(m[1]);
const outDir = resolve(outArg ?? join(dirname(resolve(htmlPath)), "decoded"));
mkdirSync(outDir, { recursive: true });

const ext = (mime) =>
  mime.includes("jsx") ? "jsx"
  : mime.includes("javascript") ? "js"
  : mime.includes("woff2") ? "woff2"
  : mime.includes("css") ? "css"
  : "bin";

const index = [];
let i = 0;
for (const [id, e] of Object.entries(manifest)) {
  let buf = Buffer.from(e.data, "base64");
  if (e.compressed) {
    try { buf = zlib.gunzipSync(buf); }
    catch { try { buf = zlib.inflateSync(buf); } catch { /* leave raw */ } }
  }
  const name = `mod-${String(i).padStart(2, "0")}.${ext(e.mime)}`;
  writeFileSync(join(outDir, name), buf);
  // authored source heuristic: jsx, or JS under ~120KB (vendor bundles are much larger)
  const authored = e.mime.includes("jsx") || (e.mime.includes("javascript") && buf.length < 120_000);
  index.push({ file: name, mime: e.mime, bytes: buf.length, authored, id: id.slice(0, 8) });
  i++;
}
writeFileSync(join(outDir, "manifest.json"), JSON.stringify(index, null, 2));

const authored = index.filter((x) => x.authored);
console.log(`${i} modules → ${outDir}`);
console.log(`authored (read these): ${authored.map((x) => x.file).join(", ")}`);
