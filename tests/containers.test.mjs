import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { unwrapKugou, unwrapKwm, sniffAudio } from "../src/lib/music-containers.js";
import { createKugouCipher, deriveKugouKey, parseKugouKeys } from "../src/lib/kugou-key.js";
import { ACCEPT, INPUT_FORMATS } from "../src/lib/formats.js";
import { fixtureHash, makeEkey, makeKgg, makeKgm, makeKwm, mapKey, rc4Key, referenceCipher } from "./container-fixtures.mjs";

const audio = Buffer.from(Array.from({ length: 131111 }, (_, i) => (i * 19 + 17) & 255));
audio.write("fLaC");

test("KGM v3 extraction restores every byte across key, table and position boundaries", () => {
  const wrapped = makeKgm(audio);
  // Known answer computed independently with Unlock Music's kgm.mask and
  // its 272-byte mend table (not the encoder or generated tables above).
  assert.equal(createHash("sha256").update(wrapped.subarray(1024)).digest("hex"),
    "2e6abee94a9b79940eb5ff40482deb602b3df89688f200c4fe56c3c78144e3f2");
  const result = unwrapKugou(wrapped);
  assert.equal(result.format, "flac");
  assert.deepEqual(Buffer.from(result.audio), audio);
  // A nonzero byteOffset must not shift header reads into the backing buffer.
  const padded = Buffer.concat([Buffer.alloc(13), wrapped, Buffer.alloc(9)]);
  assert.deepEqual(Buffer.from(unwrapKugou(padded.subarray(13, -9)).audio), audio);
});

test("KWM supports both headers, full unsigned 64-bit seeds and zero seeds", () => {
  for (const modern of [true, false]) for (const key of [0n, 18446744073709551615n, 9007199254740993n]) {
    const result = unwrapKwm(makeKwm(audio, key, modern));
    assert.equal(result.format, "flac");
    assert.deepEqual(Buffer.from(result.audio), audio);
  }
  const aac = Uint8Array.from([0xff, 0xf1, 0x50, 0x80, 1, 2, 3]);
  assert.equal(unwrapKwm(aac).format, "aac");
  assert.deepEqual(unwrapKwm(aac).audio, aac);
});

test("KGG eKey v1/v2 derivation validates TEA padding and restores map/RC4 keys", () => {
  for (const key of [mapKey, rc4Key]) for (const v2 of [false, true]) {
    assert.deepEqual(Buffer.from(deriveKugouKey(makeEkey(key, v2))), key);
  }
  for (const value of ["", "invalid", "!not-base64!", "AAAA", "A".repeat(64)])
    assert.throws(() => deriveKugouKey(value), /eKey/);
});

test("KGG v5 restores map variants and RC4 segments with a matching imported key", () => {
  for (const key of [mapKey, rc4Key]) for (const normalRotate of [true, false]) {
    const result = unwrapKugou(makeKgg(audio, key, { normalRotate }), { [fixtureHash]: makeEkey(key) });
    assert.equal(result.format, "flac");
    assert.deepEqual(Buffer.from(result.audio), audio);
  }
});

test("KGG RC4 supports chunk offsets around the 128-byte prefix and 5120-byte segments", () => {
  // Independently computed with Unlock Music's QmcRC4Cipher, revision 1a12ebf17c4c680e.
  const stream = new Uint8Array(audio.length);
  createKugouCipher(rc4Key)(stream);
  assert.equal(createHash("sha256").update(stream).digest("hex"),
    "91d6608f26e16d02b810585d058b17ddc917dba89126090d4488acbbd0b4e8c4");
  const encrypted = referenceCipher(audio, rc4Key);
  const cipher = createKugouCipher(rc4Key);
  for (const offset of [0, 1, 127, 128, 129, 5119, 5120, 5121, 32767, 65536]) {
    const slice = encrypted.subarray(offset, offset + 7011);
    const decoded = Uint8Array.from(slice);
    cipher(decoded, offset);
    assert.deepEqual(Buffer.from(decoded), audio.subarray(offset, offset + 7011));
  }
});

test("KGG map cipher matches the published Unlock Music known-answer vector", () => {
  // unlock-music src/decrypt/qmc_cipher.test.ts, revision 1a12ebf17c4c680e.
  const key = Uint8Array.from({ length: 256 }, (_, i) => i);
  const bytes = new Uint8Array(16);
  createKugouCipher(key)(bytes);
  assert.deepEqual(Array.from(bytes), [0xbb, 0x7d, 0x80, 0xbe, 0xff, 0x38, 0x81, 0xfb,
    0xbb, 0xff, 0x82, 0x3c, 0xff, 0xba, 0x83, 0x79]);
});

test("missing/mismatched keys, bad headers and impossible lengths fail before original output", () => {
  const kgg = makeKgg(audio);
  assert.throws(() => unwrapKugou(kgg), /偏好设置/);
  assert.throws(() => unwrapKugou(kgg, { [fixtureHash]: makeEkey(Buffer.alloc(256, 1)) }), /无法识别/);
  const longHash = Buffer.from(kgg);
  longHash.writeUInt32LE(0xffffffff, 0x44);
  assert.throws(() => unwrapKugou(longHash), /文件头/);
  for (const at of [0, 0x3b, 0x44, 1024]) {
    assert.throws(() => unwrapKugou(kgg.subarray(0, at)), /文件头/);
  }
  for (const offset of [0, 59, kgg.length, 0xffffffff]) {
    const bad = Buffer.from(kgg);
    bad.writeUInt32LE(offset, 0x10);
    assert.throws(() => unwrapKugou(bad), /文件头/);
  }
  const kgm = makeKgm(audio);
  kgm.writeUInt32LE(9, 0x14);
  assert.throws(() => unwrapKugou(kgm), /文件头/);
  kgm.writeUInt32LE(3, 0x14);
  kgm.writeUInt32LE(99, 0x18);
  assert.throws(() => unwrapKugou(kgm), /文件头/);
  assert.throws(() => unwrapKwm(new Uint8Array(40)), /文件头/);
  const brokenKwm = makeKwm(audio);
  brokenKwm[0] ^= 1;
  assert.throws(() => unwrapKwm(brokenKwm), /文件头/);
});

test("key JSON import validates shape and values and normalizes track hashes", () => {
  const ekey = makeEkey(mapKey);
  const keys = parseKugouKeys(`\uFEFF${JSON.stringify({ [fixtureHash.toUpperCase()]: ekey })}`);
  assert.equal(keys[fixtureHash], ekey);
  assert.equal(Object.getPrototypeOf(keys), null);
  for (const value of ["bad", "null", "[]", "{}", '{"__proto__":"x"}', JSON.stringify({ [fixtureHash]: "broken" })])
    assert.throws(() => parseKugouKeys(value));
});

test("format selection accepts KGG/KGM/KWM and audio sniffing distinguishes AAC from MP3", () => {
  for (const extension of ["kgg", "kgm", "kwm"]) {
    assert.ok(INPUT_FORMATS.includes(extension));
    assert.ok(ACCEPT.split(",").includes(`.${extension}`));
  }
  assert.equal(sniffAudio(Uint8Array.from([0xff, 0xf1])), "aac");
  assert.equal(sniffAudio(Uint8Array.from([0xff, 0xfb])), "mp3");
  assert.equal(sniffAudio(Buffer.from("RIFFbad file")), null);
});
