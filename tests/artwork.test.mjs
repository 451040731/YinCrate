import test from "node:test";
import assert from "node:assert/strict";
import { embedWavArtwork, readArtwork } from "../src/lib/artwork.js";

const image = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=", "base64");
function makeWav() {
  const wav = Buffer.alloc(44 + 32);
  wav.write("RIFF", 0);
  wav.writeUInt32LE(wav.length - 8, 4);
  wav.write("WAVEfmt ", 8);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(44100, 24);
  wav.writeUInt32LE(88200, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write("data", 36);
  wav.writeUInt32LE(32, 40);
  for (let i = 44; i < wav.length; i++) wav[i] = i;
  return wav;
}

test("WAV artwork round-trips through ID3/APIC without changing PCM or existing chunks", async () => {
  const input = makeWav();
  const original = Buffer.from(input);
  const result = await embedWavArtwork(input, new Blob([image], { type: "image/png" }));
  const bytes = Buffer.from(await result.arrayBuffer());
  assert.equal(bytes.readUInt32LE(4), bytes.length - 8);
  assert.equal(bytes.length % 2, 0);
  assert.deepEqual(bytes.subarray(8, input.length), input.subarray(8));
  assert.deepEqual(input, original);
  const cover = await readArtwork(result);
  assert.equal(cover.type, "image/png");
  assert.deepEqual(Buffer.from(await cover.arrayBuffer()), image);
});

test("absent and damaged optional artwork do not block audio", async () => {
  assert.equal(await readArtwork(new Blob([makeWav()], { type: "audio/wav" })), null);
  assert.equal(await readArtwork(new Blob(["not audio"])), null);
  await assert.rejects(embedWavArtwork(new Uint8Array(40), new Blob([image])), /封面/);
});
