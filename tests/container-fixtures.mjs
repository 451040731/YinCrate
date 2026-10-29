import { KGM_TABLE1, KGM_TABLE2, KGM_TABLEV2 } from "../src/lib/kgm-tables.js";

const magic = Buffer.from("7cd532eb86027f4ba8afa68e0fff9914", "hex");
export const fixtureHash = "0123456789abcdef0123456789abcdef";

export function makeKwm(audio, key = 18446744073709551615n, modern = true) {
  const header = Buffer.alloc(1024);
  header.write(modern ? "yeelion-kuwo-tme" : "yeelion-kuwo");
  header.writeBigUInt64LE(key, 0x18);
  const digits = key.toString().repeat(32).slice(0, 32);
  const seed = Buffer.from("MoOtOiTvINGwd2E6n0E1i7L5t2IoOoNk");
  return Buffer.concat([header, Buffer.from(audio).map((v, i) => v ^ seed[i % 32] ^ digits.charCodeAt(i % 32))]);
}

export function makeKgm(audio) {
  const header = Buffer.alloc(1024);
  magic.copy(header);
  header.writeUInt32LE(header.length, 0x10);
  header.writeUInt32LE(3, 0x14);
  header.writeUInt32LE(1, 0x18);
  const key = Buffer.from(Array.from({ length: 17 }, (_, i) => i < 16 ? (i * 13 + 23) & 255 : 0));
  key.copy(header, 0x1c, 0, 16);
  const encrypted = Buffer.from(audio).map((byte, index) => {
    let mask = KGM_TABLEV2[index % 272];
    for (let at = Math.floor(index / 16); at >= 17;) {
      mask ^= KGM_TABLE1[at % 272];
      at = Math.floor(at / 16);
      mask ^= KGM_TABLE2[at % 272];
      at = Math.floor(at / 16);
    }
    const low = byte & 15;
    return (((byte >>> 4) ^ low) << 4 | low) ^ mask ^ key[index % 17];
  });
  return Buffer.concat([header, encrypted]);
}

// Fixture TEA encryption is the inverse of the decoder, with independent
// big-endian word handling and fixed deterministic padding (never user keys).
function encryptTea(input, keyBytes) {
  const pad = (8 - (input.length + 10) % 8) % 8;
  const plain = Buffer.concat([Buffer.from([pad]), Buffer.alloc(pad + 2, 0x5a), input, Buffer.alloc(7)]);
  const key = Array.from({ length: 4 }, (_, i) => keyBytes.readUInt32BE(i * 4));
  const output = Buffer.alloc(plain.length);
  let previousCipher = Buffer.alloc(8), previousMix = Buffer.alloc(8);
  for (let at = 0; at < plain.length; at += 8) {
    const mixed = plain.subarray(at, at + 8).map((value, i) => value ^ previousCipher[i]);
    let left = mixed.readUInt32BE(0), right = mixed.readUInt32BE(4), sum = 0;
    for (let round = 0; round < 16; round++) {
      sum = (sum + 0x9e3779b9) >>> 0;
      left = (left + (((right << 4) + key[0]) ^ (right + sum) ^ ((right >>> 5) + key[1]))) >>> 0;
      right = (right + (((left << 4) + key[2]) ^ (left + sum) ^ ((left >>> 5) + key[3]))) >>> 0;
    }
    const cipher = Buffer.alloc(8);
    cipher.writeUInt32BE(left, 0);
    cipher.writeUInt32BE(right, 4);
    for (let i = 0; i < 8; i++) cipher[i] ^= previousMix[i];
    cipher.copy(output, at);
    previousCipher = cipher;
    previousMix = mixed;
  }
  return output;
}

export function makeEkey(key, v2 = false) {
  const salt = [105, 86, 70, 56, 43, 32, 21, 11];
  const teaKey = Buffer.from(salt.flatMap((value, i) => [value, key[i]]));
  let raw = Buffer.concat([key.subarray(0, 8), encryptTea(key.subarray(8), teaKey)]);
  if (v2) {
    raw = encryptTea(Buffer.from(raw.toString("base64")), Buffer.from("**#!(#$%&^a1cZ,T"));
    raw = Buffer.concat([Buffer.from("QQMusic EncV2,Key:"), encryptTea(raw, Buffer.from("386ZJY!@#*$%^&)("))]);
  }
  return raw.toString("base64");
}

export const mapKey = Buffer.from(Array.from({ length: 256 }, (_, i) => (i * 37 + 9) & 255));
export const rc4Key = Buffer.from(Array.from({ length: 512 }, (_, i) => (i * 59 + 17) & 255));

export function referenceCipher(audio, key, normalRotate = false) {
  const data = Buffer.from(audio), n = key.length;
  if (n <= 300) {
    for (let offset = 0; offset < data.length; offset++) {
      const p = offset > 32767 ? offset % 32767 : offset;
      const j = (p * p + 71214) % n, s = (j + 4) % 8;
      data[offset] ^= ((key[j] << s) | (key[j] >> (normalRotate ? 8 - s : s))) & 255;
    }
    return data;
  }
  const box = Array.from({ length: n }, (_, i) => i % 256);
  for (let i = 0, j = 0; i < n; i++) {
    j = (j + box[i] + key[i]) % n;
    [box[i], box[j]] = [box[j], box[i]];
  }
  let hash = 1n;
  for (const value of key) {
    if (!value) continue;
    const next = hash * BigInt(value) & 0xffffffffn;
    if (next <= hash) break;
    hash = next;
  }
  const skip = (id) => key[id % n] ? Math.floor(Number(hash) / ((id + 1) * key[id % n]) * 100) % n : 0;
  // Build the full RC4 stream once; every segment restarts from this state.
  const stream = [];
  for (let i = 0, a = 0, b = 0; i < 5120 + n; i++) {
    a = (a + 1) % n;
    b = (b + box[a]) % n;
    [box[a], box[b]] = [box[b], box[a]];
    stream.push(box[(box[a] + box[b]) % n]);
  }
  for (let i = 0; i < data.length; i++) {
    data[i] ^= i < 128 ? key[skip(i)] : stream[i % 5120 + skip(Math.floor(i / 5120))];
  }
  return data;
}

export function makeKgg(audio, key = mapKey, options = {}) {
  const header = Buffer.alloc(1024);
  magic.copy(header);
  header.writeUInt32LE(header.length, 0x10);
  header.writeUInt32LE(5, 0x14);
  header.writeUInt32LE(32, 0x44);
  header.write(fixtureHash, 0x48);
  return Buffer.concat([header, referenceCipher(audio, key, options.normalRotate)]);
}
