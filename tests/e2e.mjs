import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createFixtures, pcmHash, probe } from "./fixtures.mjs";

const root = process.cwd();
const out = path.join(root, "test-results");
await mkdir(out, { recursive: true });
const fixtureDir = await createFixtures(path.join(out, "fixtures"));
const extension = path.join(root, "dist");
const context = await chromium.launchPersistentContext(
  path.join(out, `profile-${Date.now()}`),
  {
    headless: true,
    channel:
      process.env.YINCRATE_BROWSER ||
      (process.platform === "win32" ? "msedge" : "chromium"),
    viewport: { width: 1440, height: 1000 },
    args: [
      `--disable-extensions-except=${extension}`,
      `--load-extension=${extension}`,
    ],
    acceptDownloads: true,
    downloadsPath: path.join(out, "downloads"),
  },
);
const failures = [],
  checks = [],
  requests = [];
let page;
const check = (name, fn) =>
  Promise.resolve()
    .then(fn)
    .then(() => {
      checks.push(name);
      console.log(`PASS ${name}`);
    });
try {
  const background =
    context.serviceWorkers()[0] ||
    (await context.waitForEvent("serviceworker", { timeout: 20000 }));
  const id = new URL(background.url()).host;
  page = await context.newPage();
  await page.emulateMedia({ reducedMotion: "reduce" });
  page.on("pageerror", (error) => failures.push(error.message));
  page.on("console", (message) => {
    if (["error", "warning"].includes(message.type()))
      console.error("BROWSER", message.text());
  });
  context.on("request", (request) => {
    if (/^https?:/.test(request.url())) requests.push(request.url());
  });
  await page.goto(`chrome-extension://${id}/index.html`);
  await page.getByRole("heading", { name: "好音乐，换个格式听。" }).waitFor();
  await page.screenshot({
    path: path.join(out, "01-empty.png"),
    fullPage: true,
  });
  // Packaged JS/WASM must work with internet access disabled.
  await context.setOffline(true);

  async function add(names) {
    await page
      .getByLabel("选择音频文件")
      .setInputFiles(names.map((name) => path.join(fixtureDir, name)));
  }
  async function clearQueue() {
    await page.getByRole("button", { name: "清空列表", exact: true }).click();
  }
  async function run(count) {
    await page.getByRole("button", { name: /开始转换/ }).click();
    await page.waitForFunction(
      (n) =>
        document.querySelectorAll(".file-row.done, .file-row.error").length ===
        n,
      count,
      { timeout: 120000 },
    );
    assert.deepEqual(await page.locator(".file-error").allTextContents(), []);
    await page.getByRole("button", { name: /开始转换/ }).waitFor();
  }
  async function records() {
    return page.evaluate(async () => {
      const db = await new Promise((resolve, reject) => {
        const r = indexedDB.open("yincrate", 1);
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => reject(r.error);
      });
      const rows = await new Promise((resolve, reject) => {
        const r = db.transaction("history").objectStore("history").getAll();
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => reject(r.error);
      });
      db.close();
      return Promise.all(
        rows.map(async (row) => ({
          ...row,
          blob: undefined,
          base64: await new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result.split(",")[1]);
            reader.readAsDataURL(row.blob);
          }),
        })),
      );
    });
  }
  async function lastOutput(sourceName) {
    const rows = await records();
    const result = rows
      .filter((x) => x.sourceName === sourceName)
      .sort((a, b) => b.createdAt - a.createdAt)[0];
    assert.ok(result, `history contains ${sourceName}`);
    const file = path.join(out, `result-${result.id}.${result.format}`);
    await writeFile(file, Buffer.from(result.base64, "base64"));
    return { ...result, file };
  }
  async function setFormat(format) {
    await page.getByLabel("输出格式", { exact: true }).selectOption(format);
  }
  async function completedDownload(suffix) {
    const deadline = Date.now() + 30000;
    let rows = [];
    while (Date.now() < deadline) {
      rows = await page.evaluate(async () =>
        chrome.downloads.search({ limit: 10, orderBy: ["-startTime"] }),
      );
      const result = rows.find(
        (row) => row.filename.endsWith(suffix) && row.state === "complete",
      );
      if (result) return result;
      if (rows.some((row) => row.state === "interrupted"))
        throw new Error(JSON.stringify(rows));
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error(`Download did not finish: ${JSON.stringify(rows)}`);
  }

  await check(
    "real MP3 conversion: WAV / FLAC / OGG / NCM / M4A, offline",
    async () => {
      await add([
        "tone.wav",
        "tone.flac",
        "tone.ogg",
        "from-mp3.ncm",
        "from-flac.ncm",
        "tone.m4a",
        "precision32.wav",
      ]);
      await page.screenshot({
        path: path.join(out, "02-queued.png"),
        fullPage: true,
      });
      await run(7);
      for (const name of [
        "tone.wav",
        "tone.flac",
        "tone.ogg",
        "from-flac.ncm",
        "tone.m4a",
      ]) {
        const result = await lastOutput(name),
          info = probe(result.file);
        assert.equal(info.streams[0].codec_name, "mp3");
        assert.ok(Math.abs(Number(info.format.duration) - 2.2) < 0.2);
        assert.ok(Number(info.streams[0].bit_rate) >= 319000);
      }
      const originalMp3 = await readFile(path.join(fixtureDir, "tone.mp3"));
      const highRateOutput = await lastOutput("precision32.wav");
      assert.equal(probe(highRateOutput.file).streams[0].sample_rate, "48000");
      assert.deepEqual(
        await readFile((await lastOutput("from-mp3.ncm")).file),
        originalMp3,
      );
      await page.screenshot({
        path: path.join(out, "03-completed.png"),
        fullPage: true,
      });
    },
  );

  await check("24-bit WAV → FLAC retains exact decoded PCM", async () => {
    await clearQueue();
    await setFormat("flac");
    await add(["precision24.wav"]);
    await run(1);
    const result = await lastOutput("precision24.wav");
    assert.equal(probe(result.file).streams[0].bits_per_raw_sample, "24");
    assert.equal(
      pcmHash(result.file),
      pcmHash(path.join(fixtureDir, "precision24.wav")),
    );
  });

  await check("24-bit FLAC → WAV retains exact decoded PCM", async () => {
    await clearQueue();
    await setFormat("wav");
    await add(["tone.flac"]);
    await run(1);
    const result = await lastOutput("tone.flac");
    assert.equal(probe(result.file).streams[0].codec_name, "pcm_s24le");
    assert.equal(
      pcmHash(result.file),
      pcmHash(path.join(fixtureDir, "tone.flac")),
    );
  });

  await check("NCM original FLAC extraction retains exact bytes", async () => {
    await clearQueue();
    await setFormat("original");
    await add(["from-flac.ncm"]);
    await run(1);
    assert.deepEqual(
      await readFile((await lastOutput("from-flac.ncm")).file),
      await readFile(path.join(fixtureDir, "tone.flac")),
    );
  });

  await check(
    "invalid and encrypted files display actionable errors",
    async () => {
      await clearQueue();
      await setFormat("mp3");
      await add(["broken.ncm", "encrypted.ogg"]);
      await page.getByRole("button", { name: /开始转换/ }).click();
      await page.waitForFunction(
        () => document.querySelectorAll(".file-row.error").length === 2,
        { timeout: 30000 },
      );
      assert.equal(await page.locator(".file-error").count(), 2);
      assert.match(
        await page
          .locator(".file-error")
          .allTextContents()
          .then((x) => x.join(" ")),
        /不完整|解码|加密/,
      );
    },
  );

  await check("32-bit WAV → FLAC refuses silent precision loss", async () => {
    await clearQueue();
    await setFormat("flac");
    await add(["precision32.wav"]);
    await page.getByRole("button", { name: /开始转换/ }).click();
    await page.locator(".file-row.error").waitFor({ timeout: 30000 });
    assert.match(await page.locator(".file-error").innerText(), /超过 24 位/);
  });

  await check(
    "floating-point PCM is not silently quantized to integer WAV",
    async () => {
      await clearQueue();
      await setFormat("wav");
      await page.getByRole("button", { name: "高级设置", exact: true }).click();
      await page.getByRole("switch", { name: /同格式时保留原音/ }).uncheck();
      await page.keyboard.press("Escape");
      await add(["float32.wav"]);
      await page.getByRole("button", { name: /开始转换/ }).click();
      await page.locator(".file-row.error").waitFor();
      assert.match(await page.locator(".file-error").innerText(), /浮点/);
      await page.getByRole("button", { name: "高级设置", exact: true }).click();
      await page.getByRole("switch", { name: /同格式时保留原音/ }).check();
      await page.keyboard.press("Escape");
    },
  );

  await check("history persists after page reload", async () => {
    const before = await records();
    await page.reload();
    await page.getByRole("button", { name: /转换记录/ }).click();
    await page.waitForFunction(
      (n) => document.querySelectorAll(".history-row").length === n,
      before.length,
    );
    assert.equal(await page.locator(".history-row").count(), before.length);
    await page.screenshot({
      path: path.join(out, "04-history.png"),
      fullPage: true,
    });
  });

  await check("dark theme, dialog keyboard escape, mobile layout", async () => {
    await page.getByRole("button", { name: "切换深色模式" }).click();
    await page.getByRole("button", { name: "格式转换", exact: true }).click();
    await page.getByRole("button", { name: "高级设置", exact: true }).click();
    await page.getByRole("dialog").waitFor();
    await page.keyboard.press("Escape");
    assert.equal(await page.getByRole("dialog").count(), 0);
    await page.screenshot({
      path: path.join(out, "05-dark.png"),
      fullPage: true,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    );
    await page.screenshot({
      path: path.join(out, "06-mobile.png"),
      fullPage: true,
    });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.getByRole("button", { name: "切换浅色模式" }).click();
  });

  await check("cancel and restart reinitializes the local engine", async () => {
    await setFormat("mp3");
    await add(["long.wav"]);
    await page.getByRole("button", { name: /开始转换/ }).click();
    await page.getByRole("button", { name: "停止转换" }).click();
    await page.locator(".file-row.cancelled").waitFor();
    await run(1);
    assert.ok(
      Number(probe((await lastOutput("long.wav")).file).format.duration) > 59,
    );
    await clearQueue();
  });

  await check(
    "real demo audio, drag and drop, preview and download control",
    async () => {
      await setFormat("mp3");
      await page.getByRole("button", { name: /用示例音频试一试/ }).click();
      assert.equal(await page.locator(".file-row").count(), 3);
      await page.screenshot({
        path: path.join(out, "YinCrate-preview.png"),
        fullPage: true,
      });
      await run(3);
      await page.getByRole("button", { name: "关闭提示" }).click();
      await page.screenshot({
        path: path.join(out, "YinCrate-preview.png"),
        fullPage: true,
      });
      const firstPlay = page.getByRole("button", { name: /试听 晴日/ });
      await firstPlay.click();
      await page.getByRole("button", { name: /停止试听 晴日/ }).waitFor();
      await page.getByRole("button", { name: /停止试听 晴日/ }).click();
      const session = await context.newCDPSession(page);
      await session.send("Browser.setDownloadBehavior", {
        behavior: "allow",
        downloadPath: path.join(out, "downloads"),
        eventsEnabled: true,
      });
      await page.getByRole("button", { name: /下载 晴日/ }).click();
      const download = await completedDownload(".mp3");
      assert.equal(download.state, "complete");
      assert.equal(probe(download.filename).streams[0].codec_name, "mp3");
      await page.getByRole("button", { name: "打包下载全部" }).click();
      const zipDownload = await completedDownload(".zip");
      const { default: JSZip } = await import("jszip");
      const zip = await JSZip.loadAsync(await readFile(zipDownload.filename));
      assert.equal(Object.keys(zip.files).length, 3);
      await clearQueue();
      await page.evaluate(() => {
        const dt = new DataTransfer();
        dt.items.add(
          new File(["not audio"], "drop-test.ogg", { type: "audio/ogg" }),
        );
        const scene = document.querySelector(".app-scene");
        scene.dispatchEvent(
          new DragEvent("drop", {
            bubbles: true,
            cancelable: true,
            dataTransfer: dt,
          }),
        );
      });
      await page.getByRole("heading", { name: "drop-test.ogg" }).waitFor();
    },
  );
  assert.deepEqual(failures, [], "No uncaught page errors");
  assert.deepEqual(requests, [], "No network requests");
  console.log(
    `\n${checks.length} end-to-end checks passed. No network requests or uncaught page errors.`,
  );
  await writeFile(
    path.join(out, "report.json"),
    JSON.stringify(
      {
        passed: checks,
        pageErrors: failures,
        networkRequests: requests,
        testedAt: new Date().toISOString(),
        browserVersion: context.browser()?.version(),
        browserChannel:
          process.env.YINCRATE_BROWSER ||
          (process.platform === "win32" ? "msedge" : "chromium"),
      },
      null,
      2,
    ),
  );
} catch (error) {
  if (page) {
    await page
      .screenshot({ path: path.join(out, "failure.png"), fullPage: true })
      .catch(() => {});
    console.error(
      await page
        .locator("body")
        .innerText()
        .catch(() => ""),
    );
  }
  throw error;
} finally {
  await context.close();
}
