export const INPUT_FORMATS = [
  "ncm",
  "ogg",
  "flac",
  "wav",
  "mp3",
  "m4a",
  "aac",
  "aiff",
  "aif",
  "opus",
  "wma",
];
export const ACCEPT = INPUT_FORMATS.map((x) => `.${x}`).join(",");
export const MAX_FILE_SIZE = 200 * 1024 * 1024;
export const MAX_QUEUE_SIZE = 512 * 1024 * 1024;
export const DEFAULT_SETTINGS = {
  format: "mp3",
  bitrate: "320",
  sampleRate: "source",
  channels: "source",
  preserve: true,
  autoDownload: false,
  theme: "light",
};
export function extension(name) {
  return name.split(".").pop()?.toLowerCase() || "";
}
export function prettySize(bytes = 0) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
export function prettyTime(seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) return "—";
  return `${Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0")}:${Math.floor(seconds % 60)
    .toString()
    .padStart(2, "0")}`;
}
export function safeName(name, ext) {
  let stem =
    name
      .replace(/\.[^.]+$/, "")
      .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_")
      .replace(/[. ]+$/g, "")
      .slice(0, 150) || "audio";
  if (/^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)/i.test(stem))
    stem = `_${stem}`;
  return `${stem}.${ext}`;
}
export function uniqueName(name, used) {
  let result = name,
    i = 2;
  const dot = name.lastIndexOf(".");
  while (used.has(result.toLowerCase()))
    result = `${name.slice(0, dot)} (${i++})${name.slice(dot)}`;
  used.add(result.toLowerCase());
  return result;
}
export function mimeFor(format) {
  return (
    {
      mp3: "audio/mpeg",
      flac: "audio/flac",
      wav: "audio/wav",
      ogg: "audio/ogg",
      m4a: "audio/mp4",
      opus: "audio/ogg",
    }[format] || "application/octet-stream"
  );
}

export function outputArgs(settings, info = {}) {
  const args = [];
  if (settings.sampleRate !== "source") args.push("-ar", settings.sampleRate);
  // MP3 supports up to 48 kHz; resample only when the source requires it.
  else if (settings.format === "mp3" && Number(info.sampleRate) > 48000)
    args.push("-ar", "48000");
  else if (
    settings.format === "mp3" &&
    Number(info.sampleRate) < 32000 &&
    Number(settings.bitrate) > 160
  )
    args.push("-ar", "44100");
  if (settings.channels !== "source") args.push("-ac", settings.channels);
  else if (settings.format === "mp3" && Number(info.channels) > 2)
    args.push("-ac", "2");
  if (settings.format === "mp3")
    args.push(
      "-c:a",
      "libmp3lame",
      "-b:a",
      `${settings.bitrate}k`,
      "-id3v2_version",
      "3",
    );
  if (settings.format === "flac")
    args.push("-c:a", "flac", "-compression_level", "5");
  if (settings.format === "wav") {
    const bits = Number(info.bits) || 16;
    args.push(
      "-c:a",
      bits > 24 ? "pcm_s32le" : bits > 16 ? "pcm_s24le" : "pcm_s16le",
    );
  }
  return args;
}
