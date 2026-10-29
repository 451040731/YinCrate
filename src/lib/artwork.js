import { parseBlob, parseBuffer, selectCover } from "music-metadata";

export async function readArtwork(blob) {
  try {
    const { common } = blob instanceof Uint8Array
      ? await parseBuffer(blob, undefined, { duration: false })
      : await parseBlob(blob, { duration: false });
    const picture = selectCover(common.picture);
    return picture?.data.length
      ? new Blob([picture.data], { type: picture.format })
      : null;
  } catch {
    // Optional tags must not prevent otherwise valid audio from converting.
    return null;
  }
}

export async function normalizeArtwork(blob) {
  if (!blob?.size) return null;
  let image;
  try {
    image = await createImageBitmap(blob);
    const header = new Uint8Array(await blob.slice(0, 8).arrayBuffer());
    const type = header[0] === 0xff && header[1] === 0xd8
      ? "image/jpeg"
      : header[0] === 0x89 && header[1] === 0x50 && header[2] === 0x4e && header[3] === 0x47
        ? "image/png"
        : null;
    if (type) return blob.slice(0, blob.size, type);
    const canvas = new OffscreenCanvas(image.width, image.height);
    canvas.getContext("2d").drawImage(image, 0, 0);
    return await canvas.convertToBlob({ type: "image/png" });
  } catch {
    return null;
  } finally {
    image?.close();
  }
}

// The WAV muxer accepts only audio. Store artwork in a RIFF ID3/APIC chunk,
// leaving every PCM byte and the existing RIFF chunks intact.
export async function embedWavArtwork(wav, cover) {
  const text = new TextEncoder();
  if (new TextDecoder().decode(wav.subarray(0, 4)) !== "RIFF" ||
      new TextDecoder().decode(wav.subarray(8, 12)) !== "WAVE")
    throw new Error("无法将封面写入 WAV 文件。");
  const mime = text.encode(cover.type);
  const image = new Uint8Array(await cover.arrayBuffer());
  const payload = new Uint8Array(1 + mime.length + 3 + image.length);
  payload.set(mime, 1); // Latin-1 text encoding, MIME, NUL, front cover, empty description.
  payload[mime.length + 2] = 3;
  payload.set(image, mime.length + 4);
  const frame = new Uint8Array(10);
  frame.set(text.encode("APIC"));
  new DataView(frame.buffer).setUint32(4, payload.length);
  const size = frame.length + payload.length;
  const tag = new Uint8Array([0x49, 0x44, 0x33, 3, 0, 0,
    (size >>> 21) & 127, (size >>> 14) & 127, (size >>> 7) & 127, size & 127]);
  const chunk = new Uint8Array(8);
  chunk.set(text.encode("id3 "));
  const tagSize = tag.length + size;
  new DataView(chunk.buffer).setUint32(4, tagSize, true);
  const padding = new Uint8Array(tagSize & 1);
  const alignment = new Uint8Array(wav.length & 1);
  const riffSize = wav.length + alignment.length + chunk.length + tagSize + padding.length - 8;
  if (riffSize > 0xffffffff) throw new Error("无法将封面写入 WAV 文件。");
  const header = Uint8Array.from(wav.subarray(0, 12));
  new DataView(header.buffer).setUint32(4, riffSize, true);
  return new Blob([header, wav.subarray(12), alignment, chunk, tag, frame, payload, padding], { type: "audio/wav" });
}
