import test from "node:test";
import assert from "node:assert/strict";
import { unwrapNcm } from "../src/lib/ncm.js";
import { outputArgs, safeName, uniqueName } from "../src/lib/formats.js";
import { makeNcm } from "./fixtures.mjs";

test("NCM extraction retains exact embedded MP3 bytes across stream periods and cover padding", () => {
  const original = Uint8Array.from(
    { length: 85000 },
    (_, i) => (i * 73 + 19) % 256,
  );
  original.set(new TextEncoder().encode("ID3"));
  const result = unwrapNcm(makeNcm(original));
  assert.deepEqual(result.audio, original);
  assert.equal(result.format, "mp3");
  assert.equal(result.metadata.musicName, "YinCrate test tone");
  assert.equal(result.cover.length, 4);
});
test("NCM without optional metadata retains exact FLAC bytes", () => {
  const original = Uint8Array.from([
    ...new TextEncoder().encode("fLaC"),
    ...new Array(3000).fill(121),
  ]);
  const result = unwrapNcm(makeNcm(original, "flac", false));
  assert.deepEqual(result.audio, original);
  assert.equal(result.format, "flac");
  assert.deepEqual(result.metadata, {});
});
test("truncated, impossible lengths and invalid NCM are rejected", () => {
  assert.throws(() => unwrapNcm(new Uint8Array(4)), /不完整/);
  assert.throws(() => unwrapNcm(new Uint8Array(40)), /有效/);
  assert.throws(
    () => unwrapNcm(Buffer.from("CTENFDAM\0\0\xff\xff\xff\xff")),
    /不完整/,
  );
  const valid = makeNcm(Buffer.from("ID3test"));
  assert.throws(
    () => unwrapNcm(valid.subarray(0, valid.length - 5)),
    /无法识别|不完整/,
  );
});
test("PCM precision is preserved and MP3 high resolution inputs are adapted", () => {
  const settings = {
    format: "mp3",
    bitrate: "320",
    sampleRate: "source",
    channels: "source",
  };
  assert.deepEqual(
    outputArgs(settings, { sampleRate: 96000, channels: 6 }).slice(0, 4),
    ["-ar", "48000", "-ac", "2"],
  );
  assert.ok(
    outputArgs({ ...settings, format: "wav" }, { bits: 24 }).includes(
      "pcm_s24le",
    ),
  );
  assert.ok(
    outputArgs({ ...settings, format: "wav" }, { bits: 32 }).includes(
      "pcm_s32le",
    ),
  );
  assert.ok(
    !outputArgs(settings, { sampleRate: 44100, channels: 2 }).includes("-ar"),
  );
  assert.deepEqual(
    outputArgs(settings, { sampleRate: 16000, channels: 1 }).slice(0, 2),
    ["-ar", "44100"],
  );
});
test("download filenames are safe on Windows and duplicate names are unique", () => {
  assert.equal(safeName("CON.ncm", "mp3"), "_CON.mp3");
  assert.equal(safeName("歌曲/../测试.ncm", "flac"), "歌曲_.._测试.flac");
  const used = new Set();
  assert.equal(uniqueName("Tone.mp3", used), "Tone.mp3");
  assert.equal(uniqueName("tone.mp3", used), "tone (2).mp3");
});
