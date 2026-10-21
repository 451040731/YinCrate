import { mkdir, cp, readFile, readdir } from "node:fs/promises";
import sharp from "sharp";

await mkdir("public/engine", { recursive: true });
await cp(
  "node_modules/@ffmpeg/core/dist/esm/ffmpeg-core.js",
  "public/engine/ffmpeg-core.js",
);
await cp(
  "node_modules/@ffmpeg/core/dist/esm/ffmpeg-core.wasm",
  "public/engine/ffmpeg-core.wasm",
);
// Keep the worker and its relative imports together; every executable asset is local.
await cp("node_modules/@ffmpeg/ffmpeg/dist/esm", "public/engine/bridge", {
  recursive: true,
});
const logo = await readFile("public/icons/logo.svg");
await Promise.all(
  [16, 32, 48, 128].map((size) =>
    sharp(logo).resize(size, size).png().toFile(`public/icons/${size}.png`),
  ),
);
const packages = [
  "@ffmpeg/ffmpeg",
  "@ffmpeg/core",
  "@noble/ciphers",
  "react",
  "react-dom",
  "lucide-react",
  "jszip",
  "pako",
  "lie",
  "immediate",
  "setimmediate",
];
for (const pkg of packages) {
  const dir = `node_modules/${pkg}`,
    target = `public/licenses/${pkg.replace("/", "-")}`;
  await mkdir(target, { recursive: true });
  for (const file of await readdir(dir)) {
    if (/^(license|copying)/i.test(file))
      await cp(`${dir}/${file}`, `${target}/${file}`, { recursive: true });
  }
}
console.log("Local audio engine and extension icons prepared.");
await cp("licenses/FFmpeg-GPL-2.0.txt", "public/licenses/FFmpeg-GPL-2.0.txt");
