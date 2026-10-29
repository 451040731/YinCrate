import { KGM_TABLE1, KGM_TABLE2, KGM_TABLEV2 } from "./kgm-tables.js";
import { createKugouCipher, deriveKugouKey } from "./kugou-key.js";

const decoder = new TextDecoder();
const magic = Uint8Array.from([0x7c, 0xd5, 0x32, 0xeb, 0x86, 0x02, 0x7f, 0x4b, 0xa8, 0xaf, 0xa6, 0x8e, 0x0f, 0xff, 0x99, 0x14]);
const invalid = () => new Error("音乐文件头无效、文件不完整或加密版本不受支持。");
const byteView = (input) => ArrayBuffer.isView(input)
  ? new Uint8Array(input.buffer, input.byteOffset, input.byteLength) : new Uint8Array(input);

// Detect actual containers, including AAC before the broader MPEG sync check.
export function sniffAudio(data) {
  const head = decoder.decode(data.subarray(0, 12));
  if (head.startsWith("fLaC")) return "flac";
  if (head.startsWith("OggS")) return "ogg";
  if (head.startsWith("RIFF") && head.slice(8, 12) === "WAVE") return "wav";
  if (head.slice(4, 8) === "ftyp") return "m4a";
  if (head.startsWith("MAC ")) return "ape";
  if (data[0] === 0xff && (data[1] & 0xf6) === 0xf0) return "aac";
  if (head.startsWith("ID3") || (data[0] === 0xff && (data[1] & 0xe0) === 0xe0 && (data[1] & 6) !== 0)) return "mp3";
  return null;
}

function result(audio) {
  const format = sniffAudio(audio);
  if (!format) throw new Error("提取后的音频无法识别，文件可能损坏、密钥不匹配或使用了新版加密。");
  return { audio, format, metadata: {}, cover: new Uint8Array() };
}

export function unwrapKwm(bytes) {
  bytes = byteView(bytes);
  // Some Kuwo downloads use the KWM suffix on ordinary ADTS AAC data.
  if (sniffAudio(bytes) === "aac") return result(bytes.slice());
  if (bytes.length <= 0x400) throw invalid();
  const header = decoder.decode(bytes.subarray(0, 16));
  if (header !== "yeelion-kuwo-tme" && header !== "yeelion-kuwo\0\0\0\0") throw invalid();
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const key = view.getBigUint64(0x18, true).toString();
  const predefined = "MoOtOiTvINGwd2E6n0E1i7L5t2IoOoNk";
  const mask = Uint8Array.from({ length: 32 }, (_, i) => predefined.charCodeAt(i) ^ key.charCodeAt(i % key.length));
  const audio = bytes.slice(0x400);
  for (let i = 0; i < audio.length; i++) audio[i] ^= mask[i & 31];
  return result(audio);
}

export function unwrapKugou(bytes, keys = {}) {
  bytes = byteView(bytes);
  if (bytes.length < 0x3c || !magic.every((value, i) => bytes[i] === value)) throw invalid();
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const offset = view.getUint32(0x10, true);
  const version = view.getUint32(0x14, true);
  if (offset < 0x3c || offset >= bytes.length) throw invalid();
  if (version === 5) {
    if (offset < 0x48) throw invalid();
    const length = view.getUint32(0x44, true);
    if (!length || length > 128 || 0x48 + length > offset) throw invalid();
    const hash = decoder.decode(bytes.subarray(0x48, 0x48 + length)).replace(/\0+$/, "").toLowerCase();
    if (!/^[a-f\d]{32}$/.test(hash)) throw invalid();
    const ekey = Object.hasOwn(keys, hash) ? keys[hash] : null;
    if (!ekey) throw new Error("KGG / KGM v5 需要对应歌曲的 eKey，请在偏好设置中导入酷狗密钥 JSON 后重试。");
    const key = deriveKugouKey(ekey);
    let cipher = createKugouCipher(key);
    const probe = bytes.slice(offset, Math.min(bytes.length, offset + 64));
    cipher(probe);
    if (!sniffAudio(probe) && key.length <= 300) cipher = createKugouCipher(key, false);
    const audio = bytes.slice(offset);
    cipher(audio);
    return result(audio);
  }
  if (version !== 3 || view.getUint32(0x18, true) !== 1) throw invalid();
  const key = new Uint8Array(17);
  key.set(bytes.subarray(0x1c, 0x2c));
  const audio = bytes.slice(offset);
  for (let i = 0; i < audio.length; i++) {
    let position = i >>> 4, mask = 0;
    while (position >= 17) {
      mask ^= KGM_TABLE1[position % 272];
      position >>>= 4;
      mask ^= KGM_TABLE2[position % 272];
      position >>>= 4;
    }
    mask ^= KGM_TABLEV2[i % 272] ^ key[i % 17];
    const value = audio[i] ^ mask;
    audio[i] = value ^ ((value & 15) << 4);
  }
  return result(audio);
}
