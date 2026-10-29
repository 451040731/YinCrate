import { createCipheriv, createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fixtureHash, makeEkey, makeKgg, makeKgm, makeKwm, mapKey, rc4Key } from "./container-fixtures.mjs";

const coreKey = Buffer.from("hzHRAmso5kInbaxW");
const metaKey = Buffer.from("2331346c6a6b5f215c5d2630553c2728", "hex");
const u32 = (number) => {
  const value = Buffer.alloc(4);
  value.writeUInt32LE(number);
  return value;
};
function encrypt(input, key) {
  const cipher = createCipheriv("aes-128-ecb", key, null);
  return Buffer.concat([cipher.update(input), cipher.final()]);
}

// Independent fixture encoder using Node's native AES, not the browser decoder.
export function makeNcm(audio, format = "mp3", withMetadata = true, cover = Buffer.from([0xff, 0xd8, 0xff, 0xd9])) {
  const key = Buffer.from("yincrate-fixture-stream-key");
  const keyData = encrypt(
    Buffer.concat([Buffer.from("neteasecloudmusic"), key]),
    coreKey,
  ).map((x) => x ^ 0x64);
  const metadata = {
    musicName: "YinCrate test tone",
    artist: [["YinCrate", 1]],
    album: "Local fixtures",
    format,
    duration: 2200,
  };
  const metaData = withMetadata
    ? Buffer.from(
        `163 key(Don't modify):${encrypt(Buffer.from(`music:${JSON.stringify(metadata)}`), metaKey).toString("base64")}`,
      ).map((x) => x ^ 0x63)
    : Buffer.alloc(0);
  const box = Array.from({ length: 256 }, (_, i) => i);
  let j = 0;
  for (let i = 0; i < 256; i++) {
    j = (j + box[i] + key[i % key.length]) & 255;
    [box[i], box[j]] = [box[j], box[i]];
  }
  const encrypted = Buffer.from(audio);
  for (let i = 0; i < encrypted.length; i++) {
    const pos = (i + 1) & 255;
    encrypted[i] ^= box[(box[pos] + box[(box[pos] + pos) & 255]) & 255];
  }
  const coverSpace = Math.max(132, cover.length);
  return Buffer.concat([
    Buffer.from("CTENFDAM"),
    Buffer.alloc(2),
    u32(keyData.length),
    keyData,
    u32(metaData.length),
    metaData,
    Buffer.alloc(5),
    u32(coverSpace),
    u32(cover.length),
    cover,
    Buffer.alloc(coverSpace - cover.length),
    encrypted,
  ]);
}

export async function createFixtures(dir) {
  await mkdir(dir, { recursive: true });
  const run = (args) =>
    execFileSync(
      "ffmpeg",
      ["-hide_banner", "-loglevel", "error", "-y", ...args],
      { stdio: "pipe" },
    );
  run([
    "-f",
    "lavfi",
    "-i",
    "sine=frequency=440:duration=60:sample_rate=44100",
    "-c:a",
    "pcm_s16le",
    path.join(dir, "long.wav"),
  ]);
  run([
    "-f",
    "lavfi",
    "-i",
    "sine=frequency=440:duration=2.2:sample_rate=44100",
    "-c:a",
    "pcm_f32le",
    path.join(dir, "float32.wav"),
  ]);
  run([
    "-f",
    "lavfi",
    "-i",
    "sine=frequency=440:duration=2.2:sample_rate=44100",
    "-c:a",
    "pcm_s16le",
    path.join(dir, "tone.wav"),
  ]);
  run([
    "-f",
    "lavfi",
    "-i",
    "sine=frequency=587.33:duration=2.2:sample_rate=48000",
    "-c:a",
    "pcm_s24le",
    path.join(dir, "precision24.wav"),
  ]);
  run([
    "-f",
    "lavfi",
    "-i",
    "sine=frequency=660:duration=2.2:sample_rate=96000",
    "-c:a",
    "pcm_s32le",
    path.join(dir, "precision32.wav"),
  ]);
  run([
    "-i",
    path.join(dir, "precision24.wav"),
    "-c:a",
    "flac",
    path.join(dir, "tone.flac"),
  ]);
  run([
    "-i",
    path.join(dir, "tone.wav"),
    "-c:a",
    "libmp3lame",
    "-b:a",
    "192k",
    path.join(dir, "tone.mp3"),
  ]);
  run([
    "-i",
    path.join(dir, "tone.wav"),
    "-c:a",
    "libvorbis",
    path.join(dir, "tone.ogg"),
  ]);
  run([
    "-i",
    path.join(dir, "tone.wav"),
    "-c:a",
    "aac",
    path.join(dir, "tone.m4a"),
  ]);
  await writeFile(
    path.join(dir, "from-mp3.ncm"),
    makeNcm(await readFile(path.join(dir, "tone.mp3")), "mp3"),
  );
  await writeFile(
    path.join(dir, "from-flac.ncm"),
    makeNcm(await readFile(path.join(dir, "tone.flac")), "flac"),
  );
  await writeFile(
    path.join(dir, "broken.ncm"),
    Buffer.from("CTENFDAM\0\0\xff\xff\xff\xff"),
  );
  await writeFile(
    path.join(dir, "encrypted.ogg"),
    Buffer.from("This is not a valid OGG audio file."),
  );
  const { default: sharp } = await import("sharp");
  const artwork = sharp({ create: { width: 64, height: 64, channels: 3, background: "#2879f4" } });
  const png = await artwork.clone().png().toBuffer();
  const jpeg = await artwork.clone().jpeg().toBuffer();
  await writeFile(path.join(dir, "cover.png"), png);
  await writeFile(path.join(dir, "cover.jpg"), jpeg);
  for (const [format, image] of [["mp3", "cover.jpg"], ["flac", "cover.png"], ["m4a", "cover.png"]]) {
    run(["-i", path.join(dir, `tone.${format}`), "-i", path.join(dir, image),
      "-map", "0:a:0", "-map", "1:v:0", "-c", "copy", "-disposition:v:0", "attached_pic",
      path.join(dir, `covered.${format}`)]);
  }
  await writeFile(path.join(dir, "external-cover.ncm"),
    makeNcm(await readFile(path.join(dir, "tone.mp3")), "mp3", true, png));
  await writeFile(path.join(dir, "embedded-cover.ncm"),
    makeNcm(await readFile(path.join(dir, "covered.mp3")), "mp3", true, jpeg));
  const flac = await readFile(path.join(dir, "tone.flac"));
  const mp3 = await readFile(path.join(dir, "covered.mp3"));
  await writeFile(path.join(dir, "from-flac.kgm"), makeKgm(flac));
  await writeFile(path.join(dir, "from-mp3.kwm"), makeKwm(mp3));
  await writeFile(path.join(dir, "from-flac.kgg"), makeKgg(flac));
  await writeFile(path.join(dir, "from-rc4.kgg"), makeKgg(flac, rc4Key));
  await writeFile(path.join(dir, "from-v5.kgm"), makeKgg(flac));
  await writeFile(path.join(dir, "kugou-keys.json"), JSON.stringify({ [fixtureHash]: makeEkey(mapKey) }));
  await writeFile(path.join(dir, "kugou-rc4-keys.json"), JSON.stringify({ [fixtureHash]: makeEkey(rc4Key, true) }));
  return dir;
}
export function probe(file) {
  return JSON.parse(
    execFileSync(
      "ffprobe",
      ["-v", "error", "-show_streams", "-show_format", "-of", "json", file],
      { encoding: "utf8" },
    ),
  );
}
export function pcmHash(file) {
  return createHash("sha256")
    .update(
      execFileSync(
        "ffmpeg",
        [
          "-v",
          "error",
          "-i",
          file,
          "-map",
          "0:a:0",
          "-c:a",
          "pcm_s32le",
          "-f",
          "s32le",
          "-",
        ],
        { maxBuffer: 16 * 1024 * 1024 },
      ),
    )
    .digest("hex");
}
