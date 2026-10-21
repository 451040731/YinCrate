import {
  mkdir,
  readdir,
  readFile,
  writeFile,
  copyFile,
} from "node:fs/promises";
import path from "node:path";
import JSZip from "jszip";

const zip = new JSZip();
async function add(dir, prefix = "") {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const relative = path.posix.join(prefix, entry.name);
    if (entry.isDirectory()) await add(path.join(dir, entry.name), relative);
    else zip.file(relative, await readFile(path.join(dir, entry.name)));
  }
}
await copyFile("THIRD_PARTY_NOTICES.md", "dist/THIRD_PARTY_NOTICES.md");
await copyFile("README.md", "dist/README.md");
await mkdir("dist/docs", { recursive: true });
await copyFile("docs/preview.png", "dist/docs/preview.png");
await add("dist");
await mkdir("release", { recursive: true });
await writeFile(
  "release/YinCrate-v1.0.0-edge.zip",
  await zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  }),
);
console.log("Edge extension: dist/ · ZIP: release/YinCrate-v1.0.0-edge.zip");
