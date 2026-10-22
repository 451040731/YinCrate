import test from "node:test";
import assert from "node:assert/strict";
import { message, normalizeLanguage, translate } from "../src/lib/i18n.js";

test("Chinese is the default, including existing and invalid language preferences", () => {
  for (const value of [undefined, null, "", "zh", "fr", "en-US", false]) {
    assert.equal(normalizeLanguage(value), "zh");
  }
  assert.equal(normalizeLanguage("en"), "en");
});

test("stored notifications can change language without rewriting user filenames", () => {
  const problem = message("{name}：{reason}", {
    name: "我的音乐 {count}.egg",
    reason: message("EGG 不是受支持的音频，请使用 OGG 原文件"),
  });
  assert.equal(translate("zh", problem), "我的音乐 {count}.egg：EGG 不是受支持的音频，请使用 OGG 原文件");
  assert.equal(translate("en", problem), "我的音乐 {count}.egg: EGG is not supported audio. Please use the original OGG file");
  assert.equal(
    translate("en", [problem, message("另有 {count} 个文件未添加", { count: 3 })]),
    "我的音乐 {count}.egg: EGG is not supported audio. Please use the original OGG file; 3 more file(s) were not added",
  );
});

test("old saved result descriptions and worker errors follow the current language", () => {
  for (const source of [
    "原音提取 · 未重新编码",
    "原音保留 · 未重新编码",
    "FLAC · 无损编码",
    "WAV · 无损编码",
    "NCM 文件不完整，或文件结构不受支持。",
  ]) {
    assert.doesNotMatch(translate("en", source), /[\u3400-\u9fff]/);
    assert.equal(translate("zh", source), source);
  }
  assert.equal(translate("en", "MP3 · 320 kbps"), "MP3 · 320 kbps");
});
