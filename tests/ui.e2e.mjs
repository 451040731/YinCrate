import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const out = path.join(root, "test-results", "i18n");
await mkdir(out, { recursive: true });
const { version } = JSON.parse(await readFile("package.json", "utf8"));
const extension = path.join(root, "dist");
const context = await chromium.launchPersistentContext(path.join(out, `profile-${Date.now()}`), {
  channel: process.env.YINCRATE_BROWSER || (process.platform === "win32" ? "msedge" : "chromium"),
  headless: true,
  viewport: { width: 1440, height: 1000 },
  args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
});
const errors = [], requests = [], checks = [];
let page;
const check = async (name, fn) => {
  await fn();
  checks.push(name);
  console.log(`PASS ${name}`);
};
const nav = (name) => page.getByRole("navigation").getByRole("button", { name, exact: true });
const language = () => page.locator(".language-switch select");
const noChinese = async () => {
  const text = await page.locator("body").innerText();
  const author = await page.locator(".footer-author span").innerText();
  assert.match(author, /^Author: /);
  // Preserve the author's chosen name and each language's native menu label.
  assert.doesNotMatch(text.replace(author, "").replaceAll("中文", ""), /[\u3400-\u9fff]/);
};
try {
  const worker = context.serviceWorkers()[0] || await context.waitForEvent("serviceworker");
  const id = new URL(worker.url()).host;
  page = await context.newPage();
  page.on("pageerror", (error) => errors.push(error.message));
  context.on("request", (request) => {
    if (/^https?:/.test(request.url())) requests.push(request.url());
  });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(`chrome-extension://${id}/index.html`);
  await context.setOffline(true);

  await check("Chinese default, language control before theme, consistent version", async () => {
    await page.getByRole("heading", { name: "好音乐，换个格式听。" }).waitFor();
    assert.equal(await language().inputValue(), "zh");
    assert.equal(await page.locator("html").getAttribute("lang"), "zh-CN");
    assert.equal(await page.evaluate(() => chrome.runtime.getManifest().version), version);
    assert.equal(await page.locator(".sidebar-foot").innerText().then(text => text.includes(`v${version}`)), true);
    assert.ok(await page.evaluate(() => document.querySelector(".language-switch").compareDocumentPosition(document.querySelector(".topbar button")) & Node.DOCUMENT_POSITION_FOLLOWING));
  });

  await check("English selection survives reload and preserves other settings", async () => {
    await page.getByRole("button", { name: "切换深色模式" }).click();
    await page.getByLabel("输出格式", { exact: true }).selectOption("flac");
    await language().selectOption("en");
    await page.getByRole("heading", { name: "Good music, in your format." }).waitFor();
    await page.reload();
    await page.getByRole("heading", { name: "Good music, in your format." }).waitFor();
    assert.equal(await language().inputValue(), "en");
    assert.equal(await page.locator("html").getAttribute("lang"), "en");
    assert.equal(await page.locator("html").getAttribute("data-theme"), "dark");
    assert.equal(await page.getByLabel("Output format", { exact: true }).inputValue(), "flac");
    assert.equal(await page.title(), "YinCrate · Let your music flow");
    for (const name of ["History", "Preferences", "Help & about", "Convert"]) {
      await nav(name).click();
      await noChinese();
    }
  });

  await check("English validation, NCM worker errors and live notification translation", async () => {
    await page.getByLabel("Choose audio files").setInputFiles({ name: "invalid.egg", mimeType: "application/octet-stream", buffer: Buffer.from("invalid") });
    await page.getByRole("status").filter({ hasText: "EGG is not supported" }).waitFor();
    await language().selectOption("zh");
    await page.getByRole("status").filter({ hasText: "EGG 不是受支持的音频" }).waitFor();
    await language().selectOption("en");
    await page.getByLabel("Choose audio files").setInputFiles({ name: "broken.ncm", mimeType: "application/octet-stream", buffer: Buffer.from("broken") });
    await page.getByRole("button", { name: /Start conversion/ }).click();
    await page.locator(".file-row.error").waitFor();
    assert.match(await page.locator(".file-error").innerText(), /NCM file is incomplete/);
    await noChinese();
    await page.getByRole("button", { name: "Clear queue", exact: true }).click();
  });

  await check("language can change during real offline conversion; history stays bilingual", async () => {
    await page.getByLabel("Output format", { exact: true }).selectOption("mp3");
    await page.getByRole("button", { name: "try demo audio" }).click();
    await page.getByRole("button", { name: /Start conversion/ }).click();
    await page.getByRole("button", { name: "Stop conversion" }).waitFor();
    await language().selectOption("zh");
    assert.equal(await language().inputValue(), "zh");
    await page.waitForFunction(() => document.querySelectorAll(".file-row.done, .file-row.error").length === 3, null, { timeout: 120000 });
    assert.equal(await page.locator(".file-row.done").count(), 3);
    assert.equal(await page.locator(".file-error").count(), 0);
    await language().selectOption("en");
    await noChinese();
    await page.reload();
    await nav("History").click();
    assert.equal(await page.locator(".history-row").count(), 3);
    await page.getByRole("button", { name: "Clear history", exact: true }).click();
    await page.getByRole("dialog", { name: "Clear conversion history?" }).waitFor();
    await noChinese();
    await page.getByRole("button", { name: "Keep results" }).click();
    assert.equal(await page.locator(".history-row").count(), 3);
  });

  await check("Chinese and English layouts, both themes, mobile through desktop", async () => {
    let layouts = 0;
    for (const locale of ["en", "zh"]) {
      await language().selectOption(locale);
      const views = locale === "en" ? ["Convert", "History", "Preferences", "Help & about"] : ["格式转换", "转换记录", "偏好设置", "帮助与关于"];
      for (const theme of ["light", "dark"]) {
        if (await page.locator("html").getAttribute("data-theme") !== theme) await page.locator(".topbar button").first().click();
        for (const width of [360, 390, 760, 768, 1024, 1440]) {
          await page.setViewportSize({ width, height: 1000 });
          for (const name of views) {
            await nav(name).click();
            if (name === views[3]) await page.locator(".faq-list summary").first().click();
            if (locale === "en") await noChinese();
            assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `${locale} ${theme} ${width} ${name}`);
            if (locale === "en" && theme === "light" && [390, 1440].includes(width)) await page.screenshot({ path: path.join(out, `en-${width}-${views.indexOf(name)}.png`), fullPage: true });
            layouts++;
          }
          await nav(views[0]).click();
          await page.getByRole("button", { name: locale === "en" ? "Advanced settings" : "高级设置" }).click();
          if (locale === "en") await noChinese();
          const dialog = await page.getByRole("dialog").boundingBox();
          assert.ok(dialog.x >= 0 && dialog.x + dialog.width <= width + 1);
          await page.keyboard.press("Escape");
          layouts++;
        }
      }
    }
    assert.equal(layouts, 120);
    await page.reload();
    assert.equal(await language().inputValue(), "zh");
  });

  await check("existing settings without a language migrate to Chinese", async () => {
    await page.evaluate(() => localStorage.setItem("yincrate-settings", JSON.stringify({ format: "wav", bitrate: "192", sampleRate: "48000", channels: "2", preserve: false, autoDownload: false, theme: "dark" })));
    await page.reload();
    await page.getByRole("heading", { name: "好音乐，换个格式听。" }).waitFor();
    assert.equal(await language().inputValue(), "zh");
    assert.equal(await page.getByLabel("输出格式", { exact: true }).inputValue(), "wav");
    assert.equal(await page.locator("html").getAttribute("data-theme"), "dark");
  });

  assert.deepEqual(errors, []);
  assert.deepEqual(requests, []);
  await writeFile(path.join(out, "report.json"), JSON.stringify({ passed: checks, pageErrors: errors, networkRequests: requests }, null, 2));
  console.log(`${checks.length} bilingual UI checks passed, including 120 layouts and real offline conversion.`);
} catch (error) {
  if (page) await page.screenshot({ path: path.join(out, "failure.png"), fullPage: true }).catch(() => {});
  throw error;
} finally {
  await context.close();
}
