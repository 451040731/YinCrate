import { ecb } from "@noble/ciphers/aes.js";

const decoder = new TextDecoder();
const encoder = new TextEncoder();
const CORE_KEY = encoder.encode("hzHRAmso5kInbaxW");
const META_KEY = Uint8Array.from([
  0x23, 0x31, 0x34, 0x6c, 0x6a, 0x6b, 0x5f, 0x21, 0x5c, 0x5d, 0x26, 0x30, 0x55,
  0x3c, 0x27, 0x28,
]);

export function sniffFormat(data) {
  const magic = decoder.decode(data.subarray(0, 4));
  if (magic === "fLaC") return "flac";
  if (magic === "OggS") return "ogg";
  if (magic === "RIFF") return "wav";
  if (
    magic.slice(0, 3) === "ID3" ||
    (data[0] === 0xff && (data[1] & 0xe0) === 0xe0)
  )
    return "mp3";
  return null;
}

// NCM is a container: unwrapping it does not re-encode the embedded audio.
// Bounds are checked before every read so corrupt lengths cannot allocate memory.
export function unwrapNcm(input) {
  const bytes = ArrayBuffer.isView(input)
    ? new Uint8Array(input.buffer, input.byteOffset, input.byteLength)
    : new Uint8Array(input);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 0;
  const take = (length) => {
    if (
      !Number.isSafeInteger(length) ||
      length < 0 ||
      offset + length > bytes.length
    )
      throw new Error("NCM 文件不完整，或文件结构不受支持。");
    const value = bytes.subarray(offset, offset + length);
    offset += length;
    return value;
  };
  const uint32 = () => {
    const at = offset;
    take(4);
    return view.getUint32(at, true);
  };
  if (decoder.decode(take(8)) !== "CTENFDAM")
    throw new Error("这不是有效的 NCM 文件，请确认原始文件格式。");
  take(2);
  const keyData = take(uint32()).map((x) => x ^ 0x64);
  if (!keyData.length || keyData.length > 4096 || keyData.length % 16)
    throw new Error("NCM 密钥数据无效。");
  let rawKey;
  try {
    rawKey = ecb(CORE_KEY).decrypt(keyData);
  } catch {
    throw new Error("无法读取此 NCM 文件的密钥。");
  }
  if (decoder.decode(rawKey.subarray(0, 17)) !== "neteasecloudmusic")
    throw new Error("不支持的 NCM 密钥版本。");
  const key = rawKey.subarray(17);
  if (!key.length) throw new Error("NCM 音频密钥为空。");
  const box = Uint8Array.from({ length: 256 }, (_, i) => i);
  let last = 0;
  for (let i = 0; i < 256; i++) {
    const c = (box[i] + last + key[i % key.length]) & 255;
    [box[i], box[c]] = [box[c], box[i]];
    last = c;
  }
  const metaData = take(uint32());
  let metadata = {};
  if (metaData.length) {
    try {
      const encoded = decoder.decode(metaData.map((x) => x ^ 0x63)).slice(22);
      const encrypted = Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0));
      const text = decoder.decode(ecb(META_KEY).decrypt(encrypted));
      metadata = JSON.parse(text.slice(text.indexOf(":") + 1));
    } catch {
      /* Audio can still be recovered when optional tags are damaged. */
    }
  }
  take(5); // CRC32 + image version
  const coverSpace = uint32();
  const coverSize = uint32();
  if (coverSize > coverSpace) throw new Error("NCM 封面数据损坏。");
  const cover = take(coverSpace).slice(0, coverSize);
  const audio = take(bytes.length - offset).slice();
  const stream = new Uint8Array(256);
  for (let i = 0; i < 256; i++) {
    const j = (i + 1) & 255;
    stream[i] = box[(box[j] + box[(box[j] + j) & 255]) & 255];
  }
  for (let i = 0; i < audio.length; i++) audio[i] ^= stream[i & 255];
  const format = sniffFormat(audio);
  if (!format || !["mp3", "flac"].includes(format))
    throw new Error("NCM 内部音频无法识别，可能是文件损坏或新版本加密。");
  return { audio, format, metadata, cover };
}
