import { FFmpeg } from "@ffmpeg/ffmpeg";
import { CONTAINER_FORMATS, extension, mimeFor, outputArgs, safeName } from "./formats.js";
import { embedWavArtwork, normalizeArtwork, readArtwork } from "./artwork.js";

function decodeContainer(bytes, format, keys, signal) {
  return new Promise((resolve, reject) => {
    const worker = format === "ncm"
      ? new Worker(new URL("./ncm.worker.js", import.meta.url), { type: "module" })
      : new Worker(new URL("./music-container.worker.js", import.meta.url), { type: "module" });
    const cleanup = () => {
      worker.terminate();
      signal?.removeEventListener("abort", abort);
    };
    const abort = () => {
      cleanup();
      reject(new DOMException("已取消", "AbortError"));
    };
    worker.onmessage = ({ data }) => {
      cleanup();
      data.error ? reject(new Error(data.error)) : resolve(data.result);
    };
    worker.onerror = () => {
      cleanup();
      reject(new Error("音乐解析器启动失败，请重新加载扩展。"));
    };
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) return abort();
    worker.postMessage(format === "ncm" ? bytes : { bytes, format, keys }, [bytes.buffer]);
  });
}

export class AudioConverter {
  kugouKeys = Object.create(null);
  ffmpeg = null;
  currentProgress = null;
  logs = [];
  async load(onProgress) {
    if (this.ffmpeg?.loaded) return this.ffmpeg;
    onProgress?.(2, "正在唤醒本地音频引擎");
    const ffmpeg = new FFmpeg();
    this.ffmpeg = ffmpeg;
    ffmpeg.on("log", ({ message }) => {
      this.logs.push(message);
      if (this.logs.length > 40) this.logs.shift();
    });
    ffmpeg.on("progress", ({ progress }) =>
      this.currentProgress?.(
        Math.min(97, Math.max(15, Math.round(progress * 82 + 15))),
        "正在转换",
      ),
    );
    const base = new URL("./engine/", document.baseURI).href;
    try {
      await ffmpeg.load({
        coreURL: `${base}ffmpeg-core.js`,
        wasmURL: `${base}ffmpeg-core.wasm`,
        classWorkerURL: `${base}bridge/worker.js`,
      });
    } catch (error) {
      if (this.ffmpeg === ffmpeg) {
        ffmpeg.terminate();
        this.ffmpeg = null;
      }
      throw error;
    }
    return ffmpeg;
  }
  cancel() {
    this.ffmpeg?.terminate();
    this.ffmpeg = null;
    this.currentProgress = null;
  }
  async convert(file, settings, onProgress, signal) {
    let bytes = new Uint8Array(await file.arrayBuffer());
    let format = extension(file.name),
      metadata = {},
      cover = null,
      extracted = false;
    signal?.throwIfAborted();
    if (CONTAINER_FORMATS.includes(format)) {
      onProgress(3, "正在提取原始音频");
      const container = await decodeContainer(bytes, format, this.kugouKeys, signal);
      bytes = container.audio;
      format = container.format;
      metadata = container.metadata;
      cover = await normalizeArtwork(new Blob([container.cover]));
      extracted = true;
    }
    const embeddedCover = await normalizeArtwork(await readArtwork(extracted ? bytes : file));
    cover = embeddedCover || cover;
    signal?.throwIfAborted();
    const copy =
      settings.format === "original" ||
      (settings.preserve &&
        format === settings.format &&
        settings.sampleRate === "source" &&
        settings.channels === "source");
    const outputFormat =
      settings.format === "original" ? format : settings.format;
    // Original mode stays byte-for-byte identical. In normal output modes an
    // NCM-only cover can be attached while copying the encoded audio stream.
    const attachNcmCover = copy && extracted && cover && !embeddedCover && settings.format !== "original";
    if (copy && !attachNcmCover) {
      onProgress(100, "已保留原始音频");
      return {
        blob: new Blob([bytes], { type: mimeFor(outputFormat) }),
        cover,
        name: safeName(file.name, outputFormat),
        format: outputFormat,
        duration: metadata.duration ? metadata.duration / 1000 : null,
        method: extracted ? "原音提取 · 未重新编码" : "原音保留 · 未重新编码",
      };
    }
    const ffmpeg = await this.load(onProgress);
    signal?.throwIfAborted();
    this.currentProgress = onProgress;
    this.logs = [];
    const input = `input.${format}`,
      output = `output.${outputFormat}`,
      coverFile = cover?.type === "image/jpeg" ? "cover.jpg" : "cover.png";
    let probe;
    try {
      await ffmpeg.writeFile(input, bytes);
      // ffprobe supplies the original precision, sample rate and channel layout.
      const probeCode = await ffmpeg.ffprobe([
        "-v",
        "error",
        "-select_streams",
        "a:0",
        "-show_entries",
        "stream=codec_name,sample_rate,channels,bits_per_raw_sample,bits_per_sample:format=duration",
        "-of",
        "json",
        input,
        "-o",
        "probe.json",
      ]);
      // core 0.12.10 can return -1 after a successful ffprobe (#817 upstream).
      // Require valid JSON and a real audio stream below rather than trusting -1.
      if (probeCode !== 0 && probeCode !== -1)
        throw new Error(
          "无法解码音频。请确认文件完整，且不是 QQ 音乐等平台的加密文件。",
        );
      try {
        probe = JSON.parse(
          new TextDecoder().decode(await ffmpeg.readFile("probe.json")),
        );
      } catch {
        throw new Error(
          "无法解码音频。请确认文件完整，且不是 QQ 音乐等平台的加密文件。",
        );
      }
      const audio = probe.streams?.[0];
      if (!audio) throw new Error("文件中没有找到可转换的音轨。");
      const info = {
        sampleRate: audio.sample_rate,
        channels: audio.channels,
        bits:
          Number(audio.bits_per_raw_sample) ||
          Number(audio.bits_per_sample) ||
          (audio.codec_name?.includes("flt") ? 32 : 16),
      };
      // FLAC can represent integer PCM up to 24 bits in this bundled encoder.
      if (!attachNcmCover && settings.format === "flac" && info.bits > 24)
        throw new Error(
          "此音频超过 24 位。为避免降低精度，请选择 WAV 或原始音频输出。",
        );
      if (
        !attachNcmCover && settings.format === "wav" &&
        (/pcm_f(?:32|64)|flt|dbl/.test(audio.codec_name || "") ||
          info.bits > 32)
      )
        throw new Error(
          "浮点或超过 32 位的 PCM 请使用“原始音频”保留精度；当前 WAV 编码适用于 16 / 24 / 32 位整数 PCM。",
        );
      const args = ["-i", input];
      if (cover && outputFormat !== "wav") {
        await ffmpeg.writeFile(coverFile, new Uint8Array(await cover.arrayBuffer()));
        args.push("-i", coverFile);
      }
      args.push("-map", "0:a:0", "-map_metadata", "0");
      if (cover && outputFormat !== "wav")
        args.push("-map", "1:v:0", "-c:v", "copy", "-disposition:v:0", "attached_pic",
          "-metadata:s:v:0", "title=Album cover", "-metadata:s:v:0", "comment=Cover (front)");
      else args.push("-vn");
      if (metadata.musicName)
        args.push("-metadata", `title=${metadata.musicName}`);
      if (Array.isArray(metadata.artist))
        args.push(
          "-metadata",
          `artist=${metadata.artist.map((a) => a[0]).join(" / ")}`,
        );
      if (metadata.album) args.push("-metadata", `album=${metadata.album}`);
      args.push(...(attachNcmCover ? ["-c:a", "copy"] : outputArgs(settings, info)));
      if (attachNcmCover && outputFormat === "mp3") args.push("-id3v2_version", "3");
      args.push("-y", output);
      onProgress(15, "正在转换");
      const code = await ffmpeg.exec(args);
      signal?.throwIfAborted();
      if (code !== 0)
        throw new Error(
          "转换未完成。文件可能已损坏、被加密，或浏览器可用内存不足。",
        );
      const data = await ffmpeg.readFile(output);
      const blob = cover && outputFormat === "wav"
        ? await embedWavArtwork(data, cover)
        : new Blob([data], { type: mimeFor(outputFormat) });
      signal?.throwIfAborted();
      if (!blob.size) throw new Error("转换结果为空，请检查音源。");
      onProgress(100, "转换完成");
      return {
        blob,
        cover,
        name: safeName(file.name, outputFormat),
        format: outputFormat,
        duration: Number(probe.format?.duration) || null,
        method:
          attachNcmCover ? "原音提取 · 未重新编码" : outputFormat === "mp3"
            ? `MP3 · ${settings.bitrate} kbps`
            : `${outputFormat.toUpperCase()} · 无损编码`,
      };
    } catch (error) {
      if (signal?.aborted) throw new DOMException("已取消", "AbortError");
      if (error instanceof Error) throw error;
      throw new Error("本地音频引擎未能完成处理，请重试。");
    } finally {
      this.currentProgress = null;
      if (ffmpeg.loaded)
        await Promise.all(
          [input, output, coverFile, "probe.json"].map((path) =>
            ffmpeg.deleteFile(path).catch(() => {}),
          ),
        );
    }
  }
}
