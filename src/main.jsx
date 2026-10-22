import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { version as APP_VERSION } from "../package.json";
import { message, normalizeLanguage, translate } from "./lib/i18n.js";
import {
  ArrowDownToLine,
  ArrowRight,
  AudioLines,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  CircleUserRound,
  Clock3,
  CloudUpload,
  Disc3,
  FileMusic,
  FolderOpen,
  Github,
  Headphones,
  History,
  House,
  Info,
  LoaderCircle,
  LockKeyhole,
  Moon,
  Music2,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Square,
  Sun,
  Trash2,
  X,
} from "lucide-react";
import { AudioConverter } from "./lib/converter.js";
import {
  ACCEPT,
  DEFAULT_SETTINGS,
  INPUT_FORMATS,
  MAX_FILE_SIZE,
  MAX_QUEUE_SIZE,
  extension,
  prettySize,
  prettyTime,
  uniqueName,
} from "./lib/formats.js";
import {
  clearHistory,
  downloadBlob,
  getHistory,
  removeHistory,
  saveHistory,
} from "./lib/storage.js";
import "./styles.css";

const NAV = [
  { id: "convert", icon: House, title: "格式转换" },
  { id: "history", icon: History, title: "转换记录" },
  { id: "settings", icon: Settings2, title: "偏好设置" },
  { id: "help", icon: CircleHelp, title: "帮助与关于" },
];
const FORMAT_NAMES = {
  mp3: "MP3",
  flac: "FLAC",
  wav: "WAV",
  original: "原始音频",
};
const readyStatus = (status) =>
  ["waiting", "error", "cancelled"].includes(status);
const dateLabel = (time, language) =>
  new Intl.DateTimeFormat(language === "en" ? "en-US" : "zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(time);
function readSettings() {
  try {
    const value = {
      ...DEFAULT_SETTINGS,
      ...JSON.parse(localStorage.getItem("yincrate-settings") || "{}"),
    };
    if (!Object.hasOwn(FORMAT_NAMES, value.format)) value.format = "mp3";
    if (!["320", "256", "192", "128"].includes(value.bitrate))
      value.bitrate = "320";
    if (!["source", "44100", "48000"].includes(value.sampleRate))
      value.sampleRate = "source";
    if (!["source", "1", "2"].includes(value.channels))
      value.channels = "source";
    value.language = normalizeLanguage(value.language);
    return value;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function Logo({ small = false }) {
  return (
    <span className={`logo-mark ${small ? "small" : ""}`} aria-hidden="true">
      <AudioLines strokeWidth={2.7} />
    </span>
  );
}
function Select({
  label,
  value,
  onChange,
  children,
  disabled,
  className = "",
}) {
  return (
    <label className={`select-field ${className}`}>
      <span>{label}</span>
      <span className="select-wrap">
        <select
          aria-label={label}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
        >
          {children}
        </select>
        <ChevronDown size={16} />
      </span>
    </label>
  );
}
function Toggle({ checked, onChange, label, detail, disabled }) {
  return (
    <label className={`toggle-row ${disabled ? "disabled" : ""}`}>
      <span>
        <strong>{label}</strong>
        <small>{detail}</small>
      </span>
      <input
        type="checkbox"
        role="switch"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        disabled={disabled}
      />
      <span className="switch" aria-hidden="true" />
    </label>
  );
}
function QualityControls({ settings, change, disabled, t }) {
  return (
    <>
      <div className="settings-grid">
        <Select
          label={t("MP3 比特率")}
          value={settings.bitrate}
          onChange={(bitrate) => change({ bitrate })}
          disabled={disabled || settings.format !== "mp3"}
        >
          <option value="320">{t("320 kbps · 高音质")}</option>
          <option value="256">{t("256 kbps · 精选音质")}</option>
          <option value="192">{t("192 kbps · 均衡")}</option>
          <option value="128">{t("128 kbps · 小体积")}</option>
        </Select>
        <Select
          label={t("采样率")}
          value={settings.sampleRate}
          onChange={(sampleRate) => change({ sampleRate })}
          disabled={disabled || settings.format === "original"}
        >
          <option value="source">{t("跟随源文件")}</option>
          <option value="44100">44,100 Hz</option>
          <option value="48000">48,000 Hz</option>
        </Select>
        <Select
          label={t("声道")}
          value={settings.channels}
          onChange={(channels) => change({ channels })}
          disabled={disabled || settings.format === "original"}
        >
          <option value="source">{t("跟随源文件")}</option>
          <option value="2">{t("立体声")}</option>
          <option value="1">{t("单声道")}</option>
        </Select>
      </div>
      <Toggle
        checked={settings.preserve}
        onChange={(preserve) => change({ preserve })}
        label={t("同格式时保留原音")}
        detail={t("格式相同且无需调整参数时，直接保留音频，避免重复编码。")}
        disabled={disabled}
      />
      <div className="quality-note">
        <Info size={17} />
        <p>{t("MP3 是有损格式，320 kbps 可尽量保留听感。需要无损请选 FLAC / WAV，并跟随源采样率与声道；调整这些参数会改变音频数据，转为无损格式不会提升原音质。原始音频模式可直接提取 NCM 内的 MP3 / FLAC。")}</p>
      </div>
    </>
  );
}

function App() {
  const [view, setView] = useState("convert");
  const [settings, setSettings] = useState(readSettings);
  const settingsRef = useRef(settings);
  const t = (key, values) => translate(settingsRef.current.language, key, values);
  const [items, setItems] = useState([]);
  const itemsRef = useRef([]);
  const [history, setHistory] = useState([]);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [dragging, setDragging] = useState(false);
  const dragDepth = useRef(0);
  const [advanced, setAdvanced] = useState(false);
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);
  const [zipBusy, setZipBusy] = useState(false);
  const [playing, setPlaying] = useState(null);
  const audioRef = useRef(null);
  const playingUrl = useRef(null);
  const fileInput = useRef(null);
  const engine = useRef(new AudioConverter());
  const controller = useRef(null);
  const [confirm, setConfirm] = useState(null);

  function notify(key, type = "info", values) {
    clearTimeout(toastTimer.current);
    setToast({ message: typeof key === "string" ? message(key, values) : key, type });
    toastTimer.current = setTimeout(() => setToast(null), 6500);
  }
  function updateItems(fn) {
    const next = fn(itemsRef.current);
    itemsRef.current = next;
    setItems(next);
  }
  function patchItem(id, patch) {
    updateItems((all) =>
      all.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    );
  }
  function changeSettings(patch) {
    if (
      busyRef.current &&
      Object.keys(patch).some((k) => !["theme", "autoDownload", "language"].includes(k))
    )
      return;
    setSettings((previous) => {
      const next = { ...previous, ...patch };
      settingsRef.current = next;
      return next;
    });
  }
  useEffect(() => {
    document.documentElement.dataset.theme = settings.theme;
    document.documentElement.lang = settings.language === "en" ? "en" : "zh-CN";
    document.title = t("转音匣 YinCrate · 让音乐自由流动");
    document.querySelector('meta[name="description"]').content = t(
      "转音匣 YinCrate，在本地转换 NCM、OGG、FLAC、WAV 等音乐格式。",
    );
    try {
      localStorage.setItem("yincrate-settings", JSON.stringify(settings));
    } catch {
      /* Session still works when persistence is blocked. */
    }
  }, [settings]);
  useEffect(() => {
    getHistory()
      .then(setHistory)
      .catch(() =>
        notify("本地存储不可用，转换仍可使用；请及时下载结果。", "error"),
      );
    const preventClose = (e) => {
      if (busyRef.current) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", preventClose);
    return () => {
      window.removeEventListener("beforeunload", preventClose);
      engine.current.cancel();
      clearTimeout(toastTimer.current);
      if (playingUrl.current) URL.revokeObjectURL(playingUrl.current);
    };
  }, []);
  useEffect(() => {
    if (!advanced && !confirm) return;
    const onKey = (e) => {
      if (e.key === "Escape") {
        setAdvanced(false);
        setConfirm(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [advanced, confirm]);

  async function addFiles(files) {
    const accepted = [],
      problems = [];
    let totalSize = itemsRef.current.reduce(
      (sum, item) => sum + item.file.size,
      0,
    );
    for (const file of Array.from(files)) {
      const ext = extension(file.name);
      if (!INPUT_FORMATS.includes(ext)) {
        problems.push(
          message("{name}：{reason}", {
            name: file.name,
            reason: message(ext === "egg" ? "EGG 不是受支持的音频，请使用 OGG 原文件" : "暂不支持此格式"),
          }),
        );
        continue;
      }
      if (!file.size) {
        problems.push(message("{name}：文件为空", { name: file.name }));
        continue;
      }
      if (file.size > MAX_FILE_SIZE) {
        problems.push(message("{name}：超过单个 200 MB 上限", { name: file.name }));
        continue;
      }
      if (totalSize + file.size > MAX_QUEUE_SIZE) {
        problems.push("队列已达 512 MB，请先转换并清理部分文件");
        continue;
      }
      if (
        itemsRef.current.some(
          (x) =>
            x.file.name === file.name &&
            x.file.size === file.size &&
            x.file.lastModified === file.lastModified,
        )
      ) {
        problems.push(message("{name}：已在列表中", { name: file.name }));
        continue;
      }
      if (
        accepted.some(
          (x) =>
            x.file.name === file.name &&
            x.file.size === file.size &&
            x.file.lastModified === file.lastModified,
        )
      )
        continue;
      accepted.push({
        id: crypto.randomUUID(),
        file,
        ext,
        status: "waiting",
        progress: 0,
        duration: null,
      });
      totalSize += file.size;
    }
    updateItems((all) => [...all, ...accepted]);
    if (accepted.length) {
      setView("convert");
      if (!problems.length)
        notify("已添加 {count} 首音乐，准备好就开始吧。", "info", { count: accepted.length });
    }
    if (problems.length)
      notify(
        [
          ...problems.slice(0, 2),
          ...(problems.length > 2
            ? [message("另有 {count} 个文件未添加", { count: problems.length - 2 })]
            : []),
        ],
        "error",
      );
    // Metadata is optional; decoding here would hold an entire second PCM copy in memory.
    for (const item of accepted.filter((x) => x.ext !== "ncm")) {
      const url = URL.createObjectURL(item.file);
      const audio = new Audio();
      audio.preload = "metadata";
      const cleanup = () => {
        audio.removeAttribute("src");
        audio.load();
        URL.revokeObjectURL(url);
      };
      const timeout = setTimeout(cleanup, 8000);
      audio.onloadedmetadata = () => {
        patchItem(item.id, {
          duration: Number.isFinite(audio.duration) ? audio.duration : null,
        });
        clearTimeout(timeout);
        cleanup();
      };
      audio.onerror = () => {
        clearTimeout(timeout);
        cleanup();
      };
      audio.src = url;
    }
  }

  async function run(ids) {
    if (busyRef.current) return;
    const batch = itemsRef.current.filter(
      (item) => readyStatus(item.status) && (!ids || ids.includes(item.id)),
    );
    if (!batch.length) return;
    busyRef.current = true;
    setBusy(true);
    const abort = new AbortController();
    controller.current = abort;
    const config = { ...settingsRef.current };
    let completed = 0,
      failed = 0;
    try {
      for (const item of batch) {
        if (abort.signal.aborted) break;
        if (!itemsRef.current.some((x) => x.id === item.id)) continue;
        patchItem(item.id, {
          status: "converting",
          progress: 0,
          message: "正在准备",
          error: null,
        });
        try {
          const result = await engine.current.convert(
            item.file,
            config,
            (progress, message) => patchItem(item.id, { progress, message }),
            abort.signal,
          );
          abort.signal.throwIfAborted();
          patchItem(item.id, {
            status: "done",
            progress: 100,
            result,
            duration: result.duration || item.duration,
          });
          completed++;
          const record = {
            id: item.id,
            sourceName: item.file.name,
            sourceFormat: item.ext,
            sourceSize: item.file.size,
            name: result.name,
            format: result.format,
            size: result.blob.size,
            duration: result.duration || item.duration,
            blob: result.blob,
            method: result.method,
            createdAt: Date.now(),
          };
          try {
            await saveHistory(record);
            setHistory(await getHistory());
          } catch {
            notify(
              "转换成功，但历史记录未能保存（本地存储空间可能不足）。请下载当前结果。",
              "error",
            );
          }
          if (config.autoDownload)
            try {
              await downloadBlob(result.blob, result.name);
            } catch {
              notify("自动下载未开始，请点击文件右侧的下载按钮。", "error");
            }
        } catch (error) {
          if (abort.signal.aborted || error?.name === "AbortError") {
            patchItem(item.id, {
              status: "cancelled",
              progress: 0,
              message: "已取消，可重新开始",
            });
            break;
          }
          failed++;
          patchItem(item.id, {
            status: "error",
            progress: 0,
            error: error?.message || "转换失败，请重试。",
          });
        }
      }
    } finally {
      busyRef.current = false;
      setBusy(false);
      controller.current = null;
      if (abort.signal.aborted) notify("已停止转换，已完成的结果仍可下载。");
      else if (failed)
        notify(
          "{completed} 首完成，{failed} 首未完成。可查看文件下方的原因并重试。",
          "error",
          { completed, failed },
        );
      else if (completed)
        notify("{count} 首音乐转换完成，去听听吧。", "success", { count: completed });
    }
  }
  function stop() {
    controller.current?.abort();
    engine.current.cancel();
  }
  function removeItem(item) {
    if (item.status === "converting") return;
    if (playing === item.id) stopPlaying();
    updateItems((all) => all.filter((x) => x.id !== item.id));
  }
  function stopPlaying() {
    audioRef.current?.pause();
    if (playingUrl.current) {
      URL.revokeObjectURL(playingUrl.current);
      playingUrl.current = null;
    }
    audioRef.current = null;
    setPlaying(null);
  }
  function preview(id, blob) {
    if (playing === id) return stopPlaying();
    stopPlaying();
    const url = URL.createObjectURL(blob);
    playingUrl.current = url;
    const audio = new Audio(url);
    audioRef.current = audio;
    audio.onended = stopPlaying;
    audio.onerror = () => {
      stopPlaying();
      notify("浏览器无法试听此格式，下载后可用本地播放器播放。", "error");
    };
    audio
      .play()
      .then(() => setPlaying(id))
      .catch(() => {
        stopPlaying();
        notify("试听未能开始，可下载后播放。", "error");
      });
  }
  async function download(result) {
    try {
      await downloadBlob(result.blob, result.name);
      notify("下载已开始。", "success");
    } catch (error) {
      notify("下载未开始：{reason}", "error", {
        reason: message(error.message || "请检查浏览器下载设置"),
      });
    }
  }
  async function downloadZip(records) {
    if (zipBusy || !records.length) return;
    setZipBusy(true);
    try {
      const { default: JSZip } = await import("jszip");
      const zip = new JSZip(),
        names = new Set();
      for (const result of records)
        zip.file(
          uniqueName(result.name, names),
          await result.blob.arrayBuffer(),
        );
      const blob = await zip.generateAsync({
        type: "blob",
        compression: "STORE",
      });
      await downloadBlob(
        blob,
        `YinCrate-${new Date().toISOString().slice(0, 10)}.zip`,
      );
      notify("已打包 {count} 首音乐，下载已开始。", "success", { count: records.length });
    } catch {
      notify("打包未完成，可能是可用内存不足。请逐个下载。", "error");
    } finally {
      setZipBusy(false);
    }
  }
  function addDemos() {
    const files = [261.63, 329.63, 392].map((freq, index) => {
      const rate = 44100,
        frames = rate * (3 + index),
        buffer = new ArrayBuffer(44 + frames * 2),
        data = new DataView(buffer);
      const text = (offset, value) =>
        [...value].forEach((c, i) =>
          data.setUint8(offset + i, c.charCodeAt(0)),
        );
      text(0, "RIFF");
      data.setUint32(4, buffer.byteLength - 8, true);
      text(8, "WAVE");
      text(12, "fmt ");
      data.setUint32(16, 16, true);
      data.setUint16(20, 1, true);
      data.setUint16(22, 1, true);
      data.setUint32(24, rate, true);
      data.setUint32(28, rate * 2, true);
      data.setUint16(32, 2, true);
      data.setUint16(34, 16, true);
      text(36, "data");
      data.setUint32(40, frames * 2, true);
      for (let i = 0; i < frames; i++) {
        const t = i / rate,
          env =
            Math.min(t / 0.04, 1) * Math.min((frames - i) / (rate * 0.4), 1);
        data.setInt16(
          44 + i * 2,
          (Math.sin(2 * Math.PI * freq * t) +
            0.2 * Math.sin(4 * Math.PI * freq * t)) *
            5500 *
            env,
          true,
        );
      }
      return new File(
        [buffer],
        t(["晴日序曲 · 示例.wav", "蓝色回声 · 示例.wav", "晚风来信 · 示例.wav"][index]),
        { type: "audio/wav", lastModified: 1 },
      );
    });
    addFiles(files);
  }
  function onDrag(event) {
    event.preventDefault();
    if (!Array.from(event.dataTransfer.types).includes("Files")) return;
    dragDepth.current++;
    setDragging(true);
  }
  function onLeave(event) {
    event.preventDefault();
    dragDepth.current--;
    if (dragDepth.current <= 0) {
      dragDepth.current = 0;
      setDragging(false);
    }
  }
  function onDrop(event) {
    event.preventDefault();
    dragDepth.current = 0;
    setDragging(false);
    addFiles(event.dataTransfer.files);
  }

  const pending = items.filter((x) => readyStatus(x.status)).length;
  const done = items.filter((x) => x.status === "done");
  const totalSize = items.reduce((sum, item) => sum + item.file.size, 0);
  const historySize = history.reduce((sum, record) => sum + record.size, 0);
  const formatName = t(FORMAT_NAMES[settings.format]);

  return (
    <div
      className="app-scene"
      onDragEnter={onDrag}
      onDragLeave={onLeave}
      onDragOver={(e) => {
        e.preventDefault();
        if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
      }}
      onDrop={onDrop}
    >
      <div className="ambient ambient-one" />
      <div className="ambient ambient-two" />
      <div className="app-shell">
        <aside className="sidebar">
          <button
            className="brand"
            onClick={() => setView("convert")}
            aria-label={t("转音匣首页")}
          >
            <Logo />
            <span className="brand-type">
              <strong>{t("转音匣")}<span className="brand-dot">.</span>
              </strong>
              <span>YINCRATE</span>
            </span>
          </button>
          <div className="workspace-label">{t("你的音乐工作台")}</div>
          <nav aria-label={t("主导航")}>
            {NAV.map(({ id, icon: Icon, title }, i) => (
              <React.Fragment key={id}>
                {i === 2 && <div className="nav-divider" />}
                <button
                  className={`nav-item ${view === id ? "active" : ""}`}
                  onClick={() => setView(id)}
                  aria-label={t(title)}
                  title={t(title)}
                  aria-current={view === id ? "page" : undefined}
                >
                  <Icon size={20} strokeWidth={1.8} />
                  <span>{t(title)}</span>
                  {id === "history" && history.length > 0 && (
                    <span className="nav-count">{history.length}</span>
                  )}
                  {view === id && <span className="nav-active-dot" />}
                </button>
              </React.Fragment>
            ))}
          </nav>
          <div className="sidebar-bottom">
            <div className="privacy-card">
              <span className="privacy-icon">
                <ShieldCheck size={22} />
              </span>
              <strong>{t("只在本地，安心转换")}</strong>
              <p>{t("你的音乐始终留在你的设备上。")}</p>
              <span className="privacy-status">
                <i />{t("无需联网 · 无需上传")}</span>
            </div>
            <div className="sidebar-foot">
              <span>YinCrate</span>
              <span>v{APP_VERSION}</span>
            </div>
          </div>
        </aside>

        <main className="main">
          <header className="topbar">
            <div className="breadcrumb">
              <span>{t("工作台")}</span>
              <ChevronRight size={13} />
              <strong>{t(NAV.find((x) => x.id === view).title)}</strong>
            </div>
            <div className="topbar-actions">
              <span className="local-badge">
                <i />{t("本地运行")}</span>
              <span className="topbar-divider" />
              <label className="language-switch">
                <span className="visually-hidden">{t("界面语言")}</span>
                <select
                  aria-label={t("界面语言")}
                  value={settings.language}
                  onChange={(event) => changeSettings({ language: event.target.value })}
                >
                  <option value="zh" lang="zh-CN">中文</option>
                  <option value="en" lang="en">English</option>
                </select>
                <ChevronDown size={12} aria-hidden="true" />
              </label>
              <button
                className="icon-button"
                onClick={() =>
                  changeSettings({
                    theme: settings.theme === "dark" ? "light" : "dark",
                  })
                }
                title={
                  t(settings.theme === "dark" ? "切换浅色模式" : "切换深色模式")
                }
                aria-label={
                  t(settings.theme === "dark" ? "切换浅色模式" : "切换深色模式")
                }
              >
                {settings.theme === "dark" ? (
                  <Sun size={19} />
                ) : (
                  <Moon size={19} />
                )}
              </button>
              <button
                className="icon-button"
                onClick={() => setView("help")}
                aria-label={t("使用帮助")}
                title={t("使用帮助")}
              >
                <CircleHelp size={19} />
              </button>
              <a
                className="icon-button"
                href="https://github.com/451040731/YinCrate"
                target="_blank"
                rel="noopener noreferrer"
                aria-label={t("GitHub 项目仓库")}
                title="GitHub · YinCrate"
              >
                <Github size={19} />
              </a>
            </div>
          </header>

          <div className="page-content" key={view}>
            {view === "convert" && (
              <>
                <section className="page-heading">
                  <div>
                    <span className="eyebrow">
                      <span /> EVERY NOTE, A NEW POSSIBILITY
                    </span>
                    <h1>{t("好音乐，")}<span>{t("换个格式听。")}</span>
                    </h1>
                    <p>{t("把格式交给转音匣，把好听的留给自己。")}</p>
                  </div>
                  <div className="heading-art" aria-hidden="true">
                    <div className="record">
                      <span>
                        <Music2 size={20} />
                      </span>
                    </div>
                    <span className="floating-note">
                      <Music2 size={16} />
                    </span>
                    <i className="art-star">✦</i>
                  </div>
                </section>

                <section
                  className={`dropzone ${dragging ? "dragging" : ""}`}
                  aria-label={t("音乐文件上传区域")}
                >
                  <div className="dropzone-corner top-left" />
                  <div className="dropzone-corner bottom-right" />
                  <div className="upload-symbol">
                    <CloudUpload size={34} strokeWidth={1.7} />
                    <span>
                      <Plus size={12} strokeWidth={3} />
                    </span>
                  </div>
                  <h2>
                    {t(dragging
                      ? "松开鼠标，让音乐进来"
                      : "拖入音乐，开启格式自由")}
                  </h2>
                  <p>{t("将音频文件拖到这里，或")}{" "}
                    <button
                      className="text-button"
                      onClick={() => fileInput.current.click()}
                    >{t("点击选择文件")}<ArrowRight size={13} />
                    </button>
                  </p>
                  <div className="format-chips">
                    {["NCM", "OGG", "FLAC", "WAV", "MP3"].map((format) => (
                      <span
                        className={`format-chip ${format.toLowerCase()}`}
                        key={format}
                      >
                        {format}
                      </span>
                    ))}
                    <span
                      className="more-formats"
                      title={t("也支持 M4A、AAC、AIFF、OPUS、WMA")}
                    >{t("+ 更多")}</span>
                  </div>
                  <span className="dropzone-caption">{t("支持批量添加")}<span>·</span>{t("单个文件最大 200 MB")}</span>
                </section>

                <section
                  className="queue-section"
                  aria-labelledby="queue-title"
                >
                  <div className="section-bar">
                    <div className="section-title">
                      <h2 id="queue-title">{t("转换列表")}</h2>
                      <span className="count-badge">
                        {items.length.toString().padStart(2, "0")}
                      </span>
                      {items.length > 0 && (
                        <span className="queue-size">{t("共 {size}", { size: prettySize(totalSize) })}
                        </span>
                      )}
                    </div>
                    <div className="section-actions">
                      <button
                        className="subtle-button add-button"
                        onClick={() => fileInput.current.click()}
                      >
                        <Plus size={15} />{t("添加文件")}</button>
                      <span className="action-divider" />
                      <button
                        className="subtle-button"
                        disabled={!items.length || busy}
                        onClick={() => {
                          stopPlaying();
                          updateItems(() => []);
                        }}
                      >
                        <Trash2 size={14} />{t("清空列表")}</button>
                    </div>
                  </div>
                  {items.length === 0 ? (
                    <div className="empty-queue">
                      <div className="empty-icon">
                        <ListMusicIcon />
                      </div>
                      <div>
                        <strong>{t("你的下一首好音乐，就从这里开始")}</strong>
                        <p>{t("添加音频文件，或")}<button className="text-button" onClick={addDemos}>{t("用示例音频试一试")}<ArrowRight size={12} />
                          </button>
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="file-list" aria-live="polite">
                      {items.map((item) => (
                        <article
                          className={`file-row ${item.status}`}
                          key={item.id}
                        >
                          <div
                            className={`file-art ${item.ext}`}
                            aria-hidden="true"
                          >
                            {item.ext === "ncm" ? (
                              <Music2 size={25} />
                            ) : item.ext === "ogg" ? (
                              <Disc3 size={25} />
                            ) : (
                              <AudioLines size={25} />
                            )}
                            <span>{item.ext.toUpperCase()}</span>
                          </div>
                          <div className="file-info">
                            <h3 title={item.file.name}>{item.file.name}</h3>
                            <div className="file-meta">
                              <span>{prettySize(item.file.size)}</span>
                              <i />
                              <span>{prettyTime(item.duration)}</span>
                              {item.status === "done" && (
                                <>
                                  <i />
                                  <span>
                                    {prettySize(item.result.blob.size)}
                                  </span>
                                </>
                              )}
                            </div>
                            {item.error && (
                              <p className="file-error">{t(item.error)}</p>
                            )}
                          </div>
                          <span className={`conversion-badge ${item.ext}`}>
                            {item.ext.toUpperCase()}
                            <ArrowRight size={11} />
                            {item.result
                              ? item.result.format.toUpperCase()
                              : settings.format === "original"
                                ? t("原音")
                                : formatName}
                          </span>
                          <div className="file-status">
                            {item.status === "converting" ? (
                              <>
                                <span className="converting-label">
                                  <LoaderCircle className="spin" size={13} />
                                  {t(item.message)}
                                  <span>{item.progress}%</span>
                                </span>
                                <div
                                  className="progress-track"
                                  role="progressbar"
                                  aria-label={t("{name}转换进度", { name: item.file.name })}
                                  aria-valuenow={item.progress}
                                  aria-valuemin={0}
                                  aria-valuemax={100}
                                >
                                  <span
                                    style={{ width: `${item.progress}%` }}
                                  />
                                </div>
                              </>
                            ) : item.status === "done" ? (
                              <>
                                <span className="status-done">
                                  <Check size={14} />{t("转换完成")}</span>
                                <small title={t(item.result.method)}>
                                  {t(item.result.method)}
                                </small>
                              </>
                            ) : item.status === "error" ? (
                              <span className="status-error">
                                <Info size={14} />{t("转换失败")}</span>
                            ) : item.status === "cancelled" ? (
                              <span className="status-wait">
                                <Square size={12} />{t("已取消")}</span>
                            ) : (
                              <span className="status-wait">
                                <Clock3 size={14} />{t("等待转换")}</span>
                            )}
                          </div>
                          <div className="file-actions">
                            {item.status === "done" ? (
                              <>
                                <button
                                  className={`icon-button row-play ${playing === item.id ? "is-playing" : ""}`}
                                  onClick={() =>
                                    preview(item.id, item.result.blob)
                                  }
                                  aria-label={t(playing === item.id ? "停止试听 {name}" : "试听 {name}", { name: item.file.name })}
                                  title={t("试听")}
                                >
                                  {playing === item.id ? (
                                    <Pause size={15} fill="currentColor" />
                                  ) : (
                                    <Play size={15} fill="currentColor" />
                                  )}
                                </button>
                                <button
                                  className="icon-button download-button"
                                  onClick={() => download(item.result)}
                                  title={t("下载音乐")}
                                  aria-label={t("下载 {name}", { name: item.result.name })}
                                >
                                  <ArrowDownToLine size={18} />
                                </button>
                              </>
                            ) : item.status === "converting" ? (
                              <span className="row-spinner">
                                <LoaderCircle className="spin" size={20} />
                              </span>
                            ) : (
                              <button
                                className="icon-button row-play"
                                onClick={() => run([item.id])}
                                disabled={busy}
                                aria-label={t("转换 {name}", { name: item.file.name })}
                                title={
                                  t(item.status === "error"
                                    ? "重新转换"
                                    : "转换此文件")
                                }
                              >
                                {item.status === "error" ||
                                item.status === "cancelled" ? (
                                  <RotateCcw size={16} />
                                ) : (
                                  <Play size={15} fill="currentColor" />
                                )}
                              </button>
                            )}
                            <button
                              className="icon-button remove-button"
                              onClick={() => removeItem(item)}
                              disabled={item.status === "converting"}
                              aria-label={t("移除 {name}", { name: item.file.name })}
                              title={t("移除文件")}
                            >
                              <X size={17} />
                            </button>
                          </div>
                        </article>
                      ))}
                    </div>
                  )}
                  {done.length > 0 && (
                    <div className="completed-summary">
                      <span>
                        <CheckCheck size={15} />{t("已完成 {completed} / {total} 首音乐", { completed: done.length, total: items.length })}</span>
                      <button
                        className="text-button"
                        disabled={zipBusy}
                        onClick={() => downloadZip(done.map((x) => x.result))}
                      >
                        {zipBusy ? (
                          <LoaderCircle className="spin" size={14} />
                        ) : (
                          <ArrowDownToLine size={14} />
                        )}{t("打包下载全部")}</button>
                    </div>
                  )}
                </section>

                <section className="conversion-panel">
                  <div className="output-options">
                    <Select
                      label={t("输出格式")}
                      value={settings.format}
                      onChange={(format) => changeSettings({ format })}
                      disabled={busy}
                    >
                      <option value="mp3">MP3</option>
                      <option value="flac">{t("FLAC · 无损")}</option>
                      <option value="wav">{t("WAV · 无损")}</option>
                      <option value="original">{t("原始音频")}</option>
                    </Select>
                    <button
                      className="advanced-button"
                      onClick={() => setAdvanced(true)}
                    >
                      <SlidersHorizontal size={17} />
                      <span>{t("高级设置")}</span>
                    </button>
                  </div>
                  <div className="start-area">
                    <span className="quality-summary">
                      {settings.format === "mp3"
                        ? t("{bitrate} kbps · 高音质", { bitrate: settings.bitrate })
                        : settings.format === "original"
                          ? t("保留音频原始编码")
                          : t("跟随源音质")}
                      <ChevronDown size={12} />
                    </span>
                    {busy ? (
                      <button
                        className="primary-button stop-button"
                        onClick={stop}
                      >
                        <Square size={17} fill="currentColor" />{t("停止转换")}</button>
                    ) : (
                      <button
                        className="primary-button"
                        onClick={() => run()}
                        disabled={pending === 0}
                      >
                        <AudioLines size={20} />{t("开始转换")}{pending > 0 && (
                          <span className="button-count">{pending}</span>
                        )}
                        <ArrowRight size={17} />
                      </button>
                    )}
                  </div>
                </section>
                <div className="quality-footnote">
                  <ShieldCheck size={13} />
                  <span>
                    {t(settings.format === "mp3"
                      ? "高音质 MP3 输出。需要无损？试试 FLAC / WAV。"
                      : settings.format === "original"
                        ? "直接保留原始音频字节，NCM 将提取为内部的 MP3 / FLAC。"
                        : "无损编码保留可表示的音频精度；采样率与声道默认跟随源文件。")}
                  </span>
                </div>
              </>
            )}

            {view === "history" && (
              <>
                <section className="page-heading simple-heading">
                  <div>
                    <span className="eyebrow">
                      <span /> YOUR MUSIC, REIMAGINED
                    </span>
                    <h1>{t("每一次转换，")}<span>{t("都有迹可循。")}</span>
                    </h1>
                    <p>{t("结果保存在当前浏览器，可随时回来试听、下载。")}</p>
                  </div>
                  <History
                    className="page-watermark"
                    size={58}
                    strokeWidth={1.2}
                  />
                </section>
                <div className="history-overview">
                  <div>
                    <span>{t("累计转换")}</span>
                    <strong>
                      {history.length}
                      <small>{t("首音乐")}</small>
                    </strong>
                  </div>
                  <div>
                    <span>{t("本地结果占用")}</span>
                    <strong>{prettySize(historySize)}</strong>
                  </div>
                  <span className="history-local">
                    <LockKeyhole size={15} />{t("仅保存在这台设备")}</span>
                </div>
                <div className="section-bar">
                  <div className="section-title">
                    <h2>{t("全部记录")}</h2>
                    <span className="count-badge">
                      {history.length.toString().padStart(2, "0")}
                    </span>
                  </div>
                  <div className="section-actions">
                    <button
                      className="subtle-button"
                      disabled={!history.length || zipBusy}
                      onClick={() => downloadZip(history)}
                    >
                      <ArrowDownToLine size={15} />
                      {t(zipBusy ? "正在打包" : "打包下载")}
                    </button>
                    <button
                      className="subtle-button"
                      disabled={!history.length || busy}
                      onClick={() =>
                        setConfirm({
                          title: "清空转换记录？",
                          body: "将删除本地保存的转换结果，并释放浏览器存储空间。已经下载的文件会保留。",
                          action: async () => {
                            await clearHistory();
                            setHistory([]);
                            stopPlaying();
                            notify("转换记录已清空。");
                          },
                        })
                      }
                    >
                      <Trash2 size={14} />{t("清空记录")}</button>
                  </div>
                </div>
                {history.length === 0 ? (
                  <div className="large-empty">
                    <span>
                      <History size={35} strokeWidth={1.4} />
                    </span>
                    <h2>{t("还没有转换记录")}</h2>
                    <p>{t("每一首转换完成的音乐，都会在这里等你。")}</p>
                    <button
                      className="secondary-button"
                      onClick={() => setView("convert")}
                    >{t("去转换第一首")}<ArrowRight size={15} />
                    </button>
                  </div>
                ) : (
                  <div className="history-list">
                    {history.map((record) => (
                      <article className="history-row" key={record.id}>
                        <div className={`file-art ${record.sourceFormat}`}>
                          <FileMusic size={23} />
                          <span>{record.format.toUpperCase()}</span>
                        </div>
                        <div className="file-info">
                          <h3 title={record.name}>{record.name}</h3>
                          <div className="file-meta">
                            <span>{prettySize(record.size)}</span>
                            <i />
                            <span>{prettyTime(record.duration)}</span>
                            <i />
                            <span>{dateLabel(record.createdAt, settings.language)}</span>
                          </div>
                          <small
                            className="history-source"
                            title={record.sourceName}
                          >{t("来自 {name}", { name: record.sourceName })}
                          </small>
                        </div>
                        <span className="history-method">{t(record.method)}</span>
                        <div className="file-actions">
                          <button
                            className="icon-button row-play"
                            onClick={() => preview(record.id, record.blob)}
                            aria-label={t(playing === record.id ? "停止试听 {name}" : "试听 {name}", { name: record.name })}
                          >
                            {playing === record.id ? (
                              <Pause size={15} />
                            ) : (
                              <Play size={15} fill="currentColor" />
                            )}
                          </button>
                          <button
                            className="icon-button download-button"
                            onClick={() => download(record)}
                            aria-label={t("下载 {name}", { name: record.name })}
                          >
                            <ArrowDownToLine size={19} />
                          </button>
                          <button
                            className="icon-button remove-button"
                            onClick={async () => {
                              try {
                                await removeHistory(record.id);
                                setHistory((previous) =>
                                  previous.filter((x) => x.id !== record.id),
                                );
                                if (playing === record.id) stopPlaying();
                              } catch {
                                notify("记录删除失败，请重试。", "error");
                              }
                            }}
                            aria-label={t("删除记录 {name}", { name: record.name })}
                          >
                            <X size={17} />
                          </button>
                        </div>
                      </article>
                    ))}
                  </div>
                )}
                <p className="history-hint">
                  <Info size={14} />{t("记录包含转换后的音频文件；清理浏览器数据或卸载扩展可能使其丢失，请及时下载收藏。")}</p>
              </>
            )}

            {view === "settings" && (
              <>
                <section className="page-heading simple-heading">
                  <div>
                    <span className="eyebrow">
                      <span /> MAKE IT YOURS
                    </span>
                    <h1>{t("好听，")}<span>{t("也要合你心意。")}</span>
                    </h1>
                    <p>{t("设置自动保存，下次打开还是你喜欢的样子。")}</p>
                  </div>
                  <SlidersHorizontal
                    className="page-watermark"
                    size={58}
                    strokeWidth={1.2}
                  />
                </section>
                {busy && (
                  <div className="inline-notice">
                    <LoaderCircle size={16} className="spin" />{t("转换进行中，音频参数将在结束后可修改。")}</div>
                )}
                <section className="settings-card">
                  <div className="card-heading">
                    <span>
                      <AudioLines size={19} />
                    </span>
                    <div>
                      <h2>{t("音频输出")}</h2>
                      <p>{t("为你的音乐选择合适的格式与品质。")}</p>
                    </div>
                  </div>
                  <div className="default-format">
                    <Select
                      label={t("默认输出格式")}
                      value={settings.format}
                      onChange={(format) => changeSettings({ format })}
                      disabled={busy}
                    >
                      <option value="mp3">{t("MP3 · 广泛兼容")}</option>
                      <option value="flac">{t("FLAC · 无损压缩")}</option>
                      <option value="wav">{t("WAV · 无损 PCM")}</option>
                      <option value="original">{t("原始音频 · 直接保留")}</option>
                    </Select>
                  </div>
                  <QualityControls
                    t={t}
                    settings={settings}
                    change={changeSettings}
                    disabled={busy}
                  />
                </section>
                <section className="settings-card">
                  <div className="card-heading">
                    <span>
                      <FolderOpen size={19} />
                    </span>
                    <div>
                      <h2>{t("下载与外观")}</h2>
                      <p>{t("让每次使用都更顺手。")}</p>
                    </div>
                  </div>
                  <Toggle
                    label={t("转换完成后自动下载")}
                    detail={t("文件将保存到浏览器下载目录下的 YinCrate 文件夹。")}
                    checked={settings.autoDownload}
                    onChange={(autoDownload) =>
                      changeSettings({ autoDownload })
                    }
                  />
                  <Toggle
                    label={t("深色外观")}
                    detail={t("给深夜听歌的你，一个柔和的工作台。")}
                    checked={settings.theme === "dark"}
                    onChange={(checked) =>
                      changeSettings({ theme: checked ? "dark" : "light" })
                    }
                  />
                </section>
              </>
            )}

            {view === "help" && (
              <>
                <section className="page-heading simple-heading">
                  <div>
                    <span className="eyebrow">
                      <span /> A LITTLE HELP, A LOT OF MUSIC
                    </span>
                    <h1>{t("关于音乐，")}<span>{t("关于转音匣。")}</span>
                    </h1>
                    <p>{t("一些你可能想了解的事。")}</p>
                  </div>
                  <Headphones
                    className="page-watermark"
                    size={58}
                    strokeWidth={1.2}
                  />
                </section>
                <section className="about-card">
                  <Logo />
                  <div>
                    <h2>{t("转音匣")}{settings.language === "zh" && <span>YinCrate</span>}
                      <small>v{APP_VERSION}</small>
                    </h2>
                    <p>{t("一个小小的匣子，装下音乐的更多可能。")}</p>
                  </div>
                  <span className="about-local">
                    <ShieldCheck size={17} />{t("本地处理")}</span>
                </section>
                <div className="quick-guide">
                  <h2>{t("三步，听见新可能")}</h2>
                  <div className="guide-steps">
                    {[
                      {
                        icon: Plus,
                        title: "添加音乐",
                        text: "拖拽文件，或点击选择。",
                      },
                      {
                        icon: SlidersHorizontal,
                        title: "选择格式",
                        text: "MP3 便携，FLAC / WAV 无损。",
                      },
                      {
                        icon: ArrowDownToLine,
                        title: "转换并下载",
                        text: "转换完成，试听或打包带走。",
                      },
                    ].map(({ icon: Icon, title, text }, i) => (
                      <div key={title}>
                        <span className="step-number">0{i + 1}</span>
                        <Icon size={20} />
                        <strong>{t(title)}</strong>
                        <p>{t(text)}</p>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="faq-list">
                  {[
                    [
                      "真的可以无损转成 MP3 吗？",
                      "MP3 本身是有损编码，任何工具都无法把无损音源“无损压缩成 MP3”。转音匣默认使用 320 kbps 尽量保留听感。若要求无损，请选择 FLAC / WAV 并跟随源参数，或选择“原始音频”。原本有损的音源转为 FLAC 也不会提升音质。",
                    ],
                    [
                      "NCM 是怎样转换的？",
                      "先在本地提取 NCM 容器中的 MP3 或 FLAC 音频。“原始音频”模式会直接保留内部音频字节。输出格式与内部格式相同，并开启“同格式时保留原音”时，也不重新编码。其他情况使用本地引擎转换。支持常见 NCM 文件，新版加密或损坏文件可能无法读取。",
                    ],
                    [
                      "支持 QQ 音乐的 OGG 吗？",
                      "支持普通的 Ogg/Vorbis 和 Ogg/Opus 音频。QQ 音乐下载的 QMC、MFLAC、MGG 等加密格式暂不支持；将加密文件改名为 .ogg 并不能转换。请使用你有权处理的普通音频文件。",
                    ],
                    [
                      "我的音乐会被上传吗？",
                      "不会。转换引擎随扩展一起安装，所有转换都在当前设备的浏览器中进行。扩展无需读取网页、账号或浏览记录，也不使用远程转换服务。转换记录及音频结果仅保存在本地浏览器。",
                    ],
                    [
                      "转换时可以关闭页面吗？",
                      "请保持转换标签页打开。切换到其他标签页不会主动终止转换，但关闭页面、退出浏览器或让系统休眠会中断正在处理的文件。已完成并保存到转换记录的结果可在下次打开时下载。",
                    ],
                    [
                      "为什么大文件转换较慢？",
                      "本地转换会占用 CPU 和内存，实际速度取决于设备与音乐长度。队列逐首处理，单个文件上限 200 MB，队列上限 512 MB。浏览器内存不足时，可以减少文件数量，转换后及时下载并清理。",
                    ],
                    [
                      "封面、标签和高解析音频会保留吗？",
                      "原始音频模式保留音频文件字节。重新编码时保留引擎支持的文字标签，并读取 NCM 的歌曲、歌手与专辑信息；不保证保留封面、歌词及所有特殊标签。MP3 最高支持 48 kHz 和双声道，超出的参数会自动适配。超过 24 位的 FLAC 输出会提示改用 WAV 或原始音频，以避免静默降低精度。",
                    ],
                  ].map(([q, a]) => (
                    <details key={q}>
                      <summary>
                        {t(q)}
                        <Plus size={16} />
                      </summary>
                      <p>{t(a)}</p>
                    </details>
                  ))}
                </div>
                <div className="about-footer">
                  <span>Made for the love of music.</span>
                  <span>{t("由 FFmpeg.wasm 驱动")}<span>·</span>{" "}
                    <a
                      href="THIRD_PARTY_NOTICES.md"
                      target="_blank"
                      rel="noreferrer"
                    >{t("开源组件与许可")}<ArrowRight size={11} />
                    </a>
                  </span>
                </div>
              </>
            )}
          </div>
          <footer className="main-footer">
            <span className="footer-tagline">
              <AudioLines size={14} aria-hidden="true" />{t("让音乐，自由流动。")}</span>
            <span className="footer-product">
              YINCRATE <i />{t("音乐格式转换工具")}</span>
            <p className="footer-author">
              <CircleUserRound size={14} strokeWidth={1.8} aria-hidden="true" />
              <span>{t("作者：猴子称大王（451040731）")}</span>
            </p>
          </footer>
        </main>
      </div>
      <div className="scene-caption">
        <span>YOUR MUSIC. YOUR FORMAT.</span>
        <span>{t("每一段旋律，都值得好好保留。")}</span>
      </div>
      <input
        ref={fileInput}
        type="file"
        accept={ACCEPT}
        multiple
        className="visually-hidden"
        aria-label={t("选择音频文件")}
        onChange={(e) => {
          addFiles(e.target.files);
          e.target.value = "";
        }}
      />
      {dragging && (
        <div className="drag-overlay" aria-hidden="true">
          <CloudUpload size={55} strokeWidth={1.5} />
          <strong>{t("把音乐放进转音匣")}</strong>
          <span>{t("松开即可添加到转换列表")}</span>
        </div>
      )}
      {toast && (
        <div className={`toast ${toast.type}`} role="status">
          {toast.type === "success" ? (
            <Check size={18} />
          ) : toast.type === "error" ? (
            <Info size={18} />
          ) : (
            <Music2 size={18} />
          )}
          <span>{t(toast.message)}</span>
          <button
            className="icon-button"
            aria-label={t("关闭提示")}
            onClick={() => setToast(null)}
          >
            <X size={15} />
          </button>
        </div>
      )}
      {advanced && (
        <Dialog
          t={t}
          title={t("为好音质，多一点讲究")}
          subtitle={t("音频参数")}
          onClose={() => setAdvanced(false)}
        >
          <QualityControls
            t={t}
            settings={settings}
            change={changeSettings}
            disabled={busy}
          />
          <button
            className="primary-button modal-done"
            onClick={() => setAdvanced(false)}
          >
            <Check size={17} />{t("完成设置")}</button>
        </Dialog>
      )}
      {confirm && (
        <Dialog
          t={t}
          title={t(confirm.title)}
          subtitle={t("本地数据")}
          onClose={() => setConfirm(null)}
        >
          <p className="confirm-body">{t(confirm.body)}</p>
          <div className="confirm-actions">
            <button
              className="secondary-button"
              onClick={() => setConfirm(null)}
            >{t("保留记录")}</button>
            <button
              className="danger-button"
              onClick={async () => {
                try {
                  await confirm.action();
                  setConfirm(null);
                } catch {
                  notify("操作未完成，请重试。", "error");
                }
              }}
            >{t("确认清空")}</button>
          </div>
        </Dialog>
      )}
    </div>
  );
}

function ListMusicIcon() {
  return (
    <>
      <span />
      <AudioLines size={21} />
      <span />
    </>
  );
}
function Dialog({ title, subtitle, onClose, children, t }) {
  const dialog = useRef(null),
    previousFocus = useRef(null);
  useEffect(() => {
    previousFocus.current = document.activeElement;
    dialog.current?.focus();
    return () => previousFocus.current?.focus();
  }, []);
  function trap(event) {
    if (event.key !== "Tab") return;
    const nodes = dialog.current.querySelectorAll(
      'button:not(:disabled), select:not(:disabled), input:not(:disabled), a[href], [tabindex="0"]',
    );
    if (!nodes.length) return;
    const first = nodes[0],
      last = nodes[nodes.length - 1];
    if (
      event.shiftKey &&
      (document.activeElement === first ||
        document.activeElement === dialog.current)
    ) {
      event.preventDefault();
      last.focus();
    } else if (
      !event.shiftKey &&
      (document.activeElement === last ||
        document.activeElement === dialog.current)
    ) {
      event.preventDefault();
      first.focus();
    }
  }
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <section
        ref={dialog}
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        onKeyDown={trap}
      >
        <button
          className="icon-button modal-close"
          onClick={onClose}
          aria-label={t("关闭对话框")}
        >
          <X size={20} />
        </button>
        <span className="eyebrow">{subtitle}</span>
        <h2>{title}</h2>
        {children}
      </section>
    </div>
  );
}

createRoot(document.getElementById("root")).render(<App />);
