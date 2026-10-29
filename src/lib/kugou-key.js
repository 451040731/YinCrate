// KGG v5 key derivation and stream ciphers, compatible with Unlock Music.
// Reference: Aaron-gx/KGG-Decryptor (MIT); see THIRD_PARTY_NOTICES.md.
const decoder = new TextDecoder();
const encoder = new TextEncoder();
const invalidKey = () => new Error("酷狗 eKey 无效或不匹配，请重新导入对应歌曲的密钥。");

function base64(value) {
  if (!value || value.length > 32768 || !/^[A-Za-z0-9+/]+={0,2}$/.test(value))
    throw invalidKey();
  return Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
}

function teaBlock(input, key) {
  const view = new DataView(input.buffer, input.byteOffset, 8);
  let a = view.getUint32(0), b = view.getUint32(4);
  let sum = Math.imul(0x9e3779b9, 16) >>> 0;
  for (let i = 0; i < 16; i++) {
    b = (b - (((a << 4) + key[2]) ^ (a + sum) ^ ((a >>> 5) + key[3]))) >>> 0;
    a = (a - (((b << 4) + key[0]) ^ (b + sum) ^ ((b >>> 5) + key[1]))) >>> 0;
    sum = (sum - 0x9e3779b9) >>> 0;
  }
  const result = new Uint8Array(8);
  const out = new DataView(result.buffer);
  out.setUint32(0, a);
  out.setUint32(4, b);
  return result;
}

function teaDecrypt(input, keyBytes) {
  if (input.length < 16 || input.length % 8) throw invalidKey();
  const view = new DataView(keyBytes.buffer, keyBytes.byteOffset, 16);
  const key = Array.from({ length: 4 }, (_, i) => view.getUint32(i * 4));
  const output = new Uint8Array(input.length);
  let previousCipher = new Uint8Array(8), previousPlain = new Uint8Array(8);
  for (let offset = 0; offset < input.length; offset += 8) {
    const cipher = input.subarray(offset, offset + 8);
    const block = teaBlock(cipher.map((v, i) => v ^ previousPlain[i]), key);
    output.set(block.map((v, i) => v ^ previousCipher[i]), offset);
    previousPlain = block;
    previousCipher = cipher;
  }
  const start = 1 + (output[0] & 7) + 2;
  const end = output.length - 7;
  if (start >= end || output.subarray(end).some((v) => v !== 0)) throw invalidKey();
  return output.slice(start, end);
}

export function deriveKugouKey(ekey) {
  try {
    let raw = base64(ekey);
    if (decoder.decode(raw.subarray(0, 18)) === "QQMusic EncV2,Key:") {
      raw = teaDecrypt(raw.subarray(18), encoder.encode("386ZJY!@#*$%^&)("));
      raw = teaDecrypt(raw, encoder.encode("**#!(#$%&^a1cZ,T"));
      raw = base64(decoder.decode(raw));
    }
    if (raw.length < 24) throw invalidKey();
    const key = new Uint8Array(16);
    for (let i = 0; i < 8; i++) {
      key[i * 2] = Math.floor(Math.abs(Math.tan(106 + i * 0.1)) * 100) & 255;
      key[i * 2 + 1] = raw[i];
    }
    const tail = teaDecrypt(raw.subarray(8), key);
    const result = new Uint8Array(8 + tail.length);
    result.set(raw.subarray(0, 8));
    result.set(tail, 8);
    return result;
  } catch {
    throw invalidKey();
  }
}

export function createKugouCipher(key, legacyMap = true) {
  const size = key.length;
  if (!size) throw invalidKey();
  if (size <= 300) {
    return (bytes, offset = 0) => {
      for (let i = 0; i < bytes.length; i++) {
        const at = offset + i;
        const position = at > 0x7fff ? at % 0x7fff : at;
        const index = (position * position + 71214) % size;
        const shift = (index + 4) % 8;
        const value = key[index];
        bytes[i] ^= ((value << shift) | (value >>> (legacyMap ? shift : 8 - shift))) & 255;
      }
    };
  }
  const initial = Uint8Array.from({ length: size }, (_, i) => i & 255);
  let j = 0, hash = 1;
  for (let i = 0; i < size; i++) {
    j = (j + initial[i] + key[i]) % size;
    [initial[i], initial[j]] = [initial[j], initial[i]];
  }
  for (const value of key) {
    if (!value) continue;
    const next = Math.imul(hash, value) >>> 0;
    if (next <= hash) break;
    hash = next;
  }
  const skip = (id) => key[id % size]
    ? Math.floor(hash / ((id + 1) * key[id % size]) * 100) % size : 0;
  return (bytes, offset = 0) => {
    let index = 0;
    while (index < bytes.length && offset + index < 128) {
      bytes[index] ^= key[skip(offset + index)];
      index++;
    }
    while (index < bytes.length) {
      const at = offset + index;
      const count = Math.min(bytes.length - index, 5120 - at % 5120);
      const box = initial.slice();
      const discard = at % 5120 + skip(Math.floor(at / 5120));
      let a = 0, b = 0;
      for (let i = -discard; i < count; i++) {
        a = (a + 1) % size;
        b = (b + box[a]) % size;
        [box[a], box[b]] = [box[b], box[a]];
        if (i >= 0) bytes[index + i] ^= box[(box[a] + box[b]) % size];
      }
      index += count;
    }
  };
}

// Explicit JSON import keeps keys out of persistent settings and audio history.
export function parseKugouKeys(text) {
  let data;
  try { data = JSON.parse(text.replace(/^\uFEFF/, "")); } catch { throw new Error("密钥文件不是有效的 JSON。"); }
  if (!data || typeof data !== "object" || Array.isArray(data))
    throw new Error("密钥 JSON 应为歌曲哈希到 eKey 的对象。");
  const entries = Object.entries(data);
  if (!entries.length || entries.length > 10000)
    throw new Error("密钥文件为空或超过 10000 条上限。");
  const keys = Object.create(null);
  for (const [hash, value] of entries) {
    if (!/^[a-f\d]{32}$/i.test(hash) || typeof value !== "string")
      throw new Error("密钥 JSON 应为歌曲哈希到 eKey 的对象。");
    deriveKugouKey(value.trim());
    keys[hash.toLowerCase()] = value.trim();
  }
  return keys;
}
