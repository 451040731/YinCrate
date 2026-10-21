import { createCipheriv, createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import path from "node:path";

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
export function makeNcm(audio, format = "mp3", withMetadata = true) {
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
  const cover = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
  return Buffer.concat([
    Buffer.from("CTENFDAM"),
    Buffer.alloc(2),
    u32(keyData.length),
    keyData,
    u32(metaData.length),
    metaData,
    Buffer.alloc(5),
    u32(132),
    u32(cover.length),
    cover,
    Buffer.alloc(132 - cover.length),
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
