# 转音匣 YinCrate

一个在 **Microsoft Edge 浏览器内本地运行** 的音乐格式转换扩展。采用浅蓝色界面，支持拖拽上传、批量队列、实时进度、结果试听、单曲下载、ZIP 打包、转换记录与深色模式。

![转音匣 YinCrate 界面预览](docs/preview.png)
![转音匣 YinCrate 界面预览](docs/preview-1.png)
![转音匣 YinCrate 界面预览](docs/preview-2.png)

## 安装使用

> [!TIP]
> **下载说明**
>
> - **Edge 商店安装（推荐）**：[前往 Microsoft Edge 加载项商店安装转音匣](https://microsoftedge.microsoft.com/addons/detail/ohgnjlfmmbnkhnjfinclnojfljekpcko)。
> - **GitHub Releases 手动安装包**：前往 [版本下载页面](https://github.com/451040731/YinCrate/releases)，下载所需版本的 `YinCrate-v<版本号>-edge.zip`。
> - **百度网盘**：[下载安装包](https://pan.baidu.com/s/1RteKQp2G6_oKjAocCZnk0A?pwd=h7im)，提取码：`h7im`。GitHub 下载较慢时可使用此入口。
>
> Edge 用户可直接通过商店安装；选择 ZIP 安装包时，请先解压，再按下方步骤手动安装。

**商店状态：** 转音匣已在 Microsoft Edge 加载项商店正式发布。Edge 用户推荐通过商店安装，Chrome 用户可使用上述 ZIP 安装包手动安装。

**Edge 商店安装（推荐）：**

1. 使用 Edge 打开 [转音匣商店页面](https://microsoftedge.microsoft.com/addons/detail/ohgnjlfmmbnkhnjfinclnojfljekpcko)。
2. 按商店页面及浏览器提示添加扩展，无需解压安装包或开启开发人员模式。
3. 在扩展菜单中打开“转音匣”，可将其固定到工具栏。

**Edge 手动安装：**

1. 如使用 ZIP，请先解压到固定目录。
2. 在 Edge 地址栏输入 `edge://extensions`。
3. 打开左侧的“开发人员模式”。
4. 点击“加载解压缩的扩展”，选择 **包含 manifest.json 的 dist 文件夹**，或 ZIP 解压后的目录。
5. 在扩展菜单中点击“转音匣”，即可在独立标签页中打开工作台。可将扩展固定到工具栏。

**Chrome 手动安装：**

1. 从 GitHub Releases 或百度网盘下载 ZIP 安装包，解压到固定目录。
2. 打开浏览器菜单 → **扩展程序** → **管理扩展程序**，或在地址栏输入 `chrome://extensions`。
3. 开启右上角的 **开发者模式**。
4. 将解压后、包含 `manifest.json` 的文件夹拖入扩展程序管理页面；也可以点击 **加载已解压的扩展程序**，选择该文件夹。
5. 安装完成后，在扩展程序菜单中打开“转音匣”，可将其固定到工具栏。

手动加载方式也可参考 [Chrome 官方说明](https://developer.chrome.com/docs/extensions/get-started/tutorial/hello-world#load-unpacked)。

## 开发构建

开发构建 `npm run build` 只生成 `dist/` 文件夹；正式打包 `npm run release` 另外生成 `release/YinCrate-v<版本号>-edge.zip`。源码仓库不包含 `dist/` 和依赖；如需从源码安装，请先执行开发章节中的 `npm ci` 和 `npm run build`。

将音乐文件拖入窗口，选择输出格式，点击“开始转换”。完成后可试听、逐个下载或打包下载。扩展内下载默认位于浏览器下载目录的 `YinCrate/` 文件夹；最终位置仍由浏览器下载设置决定。转换时请保持工作台标签页打开。

v1.0.1 支持中文和英文界面。顶部深色模式按钮前可切换语言，默认中文；语言选择会保存在当前浏览器中，刷新或重新打开后继续沿用。

## 支持范围与音质

| 项目 | 行为 |
| --- | --- |
| 输入 | 常见 NCM、酷狗 KGG / KGM、酷我 KWM、OGG（Vorbis / Opus）、FLAC、WAV、MP3、M4A、AAC、AIFF、OPUS、WMA；实际以文件内音轨及引擎可解码范围为准 |
| MP3 输出 | 默认 LAME 320 kbps，也可选择 256 / 192 / 128 kbps |
| FLAC 输出 | 无损整数音频编码，当前引擎最多 24 位；大于 24 位会报错并提示其他输出方式 |
| WAV 输出 | 根据源精度选择 16 / 24 / 32 位整数 PCM；浮点源需用原始音频模式保留精度 |
| 原始音频 | 普通音频直接保留字节；NCM、KGG、KGM、KWM 提取内部音频，不重新编码 |
| 酷狗 / 酷我 | 常见 KGM v3、KWM 可直接本地解析；KGG / KGM v5 需要导入对应歌曲的客户端 eKey |
| 同格式保留 | 默认开启：当输出与实际音源格式一致，且采样率与声道均跟随源时，保留原始音频字节 |
| QQ 音乐 OGG | 支持普通 OGG；QMC、MGG、MFLAC 等加密音源暂不支持，改扩展名不能解密 |
| 单文件 / 队列 | 200 MB / 512 MB；在浏览器内逐首处理，以控制内存使用 |

**MP3 是有损格式，不存在“无损转 MP3”。** 320 kbps 可尽量保留听感，无法数学上无损。提高码率不能恢复原本丢失的信息。有无损需求时选择 FLAC / WAV，并保持源采样率和声道；修改这些参数会改变音频数据。有损音源转成 FLAC / WAV 也不会提高源音质。MP3 最高支持 48 kHz 与双声道，超过时会自动适配。

NCM 读取常见容器结构。新版加密、损坏文件可能不受支持。可读取的封面会显示在转换结果、历史记录和试听播放器中，转换为 MP3 / FLAC 时嵌入输出文件，WAV 使用 ID3 封面标签（外部播放器能否显示取决于其支持）。NCM 容器内的封面也会保留。重新编码会复制引擎支持的文字标签，并补充 NCM 标题、歌手、专辑；歌词和全部特殊标签不保证保留。原始音频模式保持提取出来的音频文件本身不变，不向其中补写 NCM 容器标签或封面，但工作台仍可显示单独读取的封面。

酷狗 `.kgm` 支持常见 v3 容器，酷我 `.kwm` 支持两种常见文件头及使用该后缀的普通 AAC 文件。`.kgg` 和 v5 `.kgm` 的歌曲密钥不在音频文件中，需要先从自己的酷狗客户端密钥库取得对应歌曲的 eKey，再到“偏好设置 → 酷狗音乐密钥”导入 JSON。对象的键为文件头中的 32 位歌曲哈希（audio_hash），值为客户端导出的 Base64 eKey，例如：

```json
{ "0123456789abcdef0123456789abcdef": "此处替换为该歌曲的真实 eKey" }
```

导入后可重试失败任务。支持 v1 / v2 eKey，密钥 JSON 上限为 4 MB、10000 条；重新导入替换当前密钥，可手动清除。密钥仅保存在当前页面内存中，不写入设置或历史记录，刷新或关闭页面即清除。扩展不自动读取或解密 `KGMusicV3.db`，也不在线获取密钥；只有 KGG 文件而没有对应密钥时无法转换。未知加密版本、缺失或不匹配的密钥、损坏文件会明确报错。

## 本地数据与权限

- 引擎、脚本、图标全部打包在扩展内；不使用 CDN、分析统计或远程转换接口。
- 音频仅由用户主动选择或拖入，不读取网页、账号、浏览记录或文件目录。
- 唯一请求的扩展权限是 `downloads`，用于保存转换结果。没有网页主机权限或内容脚本。
- 偏好设置保存在 localStorage，完成的结果（含音频 Blob）保存在 IndexedDB。
- 转换记录会占用本地浏览器存储；可在“转换记录”中删除或清空。存储不足时保留当前队列结果并提示下载。
- 关闭页面会中断当前任务；已保存记录在重新打开后可下载。卸载扩展、浏览器清理及系统存储回收可能删除本地数据，请及时备份。

## 开发

需要 Node.js 22.12+（建议 Node.js 24 LTS）。

```powershell
npm ci
node scripts/prepare.mjs
npm run dev
```

开发预览：`http://127.0.0.1:5173`。普通网页预览没有扩展的下载 API，会使用标准浏览器下载方式。实际扩展请加载构建后的 `dist/`。

```powershell
npm run build
npm test
npm run test:ui
npm run test:e2e
npm run release
```

`npm run build` 仅构建最新 `dist/`，用于开发和加载扩展，不生成 ZIP。浏览器测试前先构建，`test:ui` 无需 release ZIP。

`npm run release` 会重新构建最新代码，再在 `release/` 目录生成 `YinCrate-v<版本号>-edge.zip`。版本号读取自 `package.json`，同一版本再次打包会覆盖同名 ZIP。版本号仍需手动同步修改 `package.json`、`package-lock.json` 和 `public/manifest.json`，命令不会自动升级版本或创建 Git 标签。

`build` 会复制本地 WebAssembly 音频引擎、生成 PNG 图标并构建页面；`release` 在构建后额外生成 ZIP。完整引擎约 32 MB，启动时从扩展本地加载。无需本机安装 FFmpeg；自动测试生成对照样本时需要命令行 `ffmpeg` 与 `ffprobe`。

Windows 上端到端测试默认使用已安装的 Edge，在独立临时扩展环境中运行真实 WASM 引擎。其他系统需先执行 `npx playwright install chromium`。测试使用自行生成的音频及合成 NCM、KGM、KWM、KGG 容器，检查格式输出、原始字节保留、无损 PCM 比对、密钥导入与刷新清除、记录持久化、取消重试、错误文件及下载。没有拿到用户真实下载的加密音乐样本，因此不能替代对特定平台版本文件的兼容性验证。

源码入口：`src/main.jsx`；音频引擎：`src/lib/converter.js`；NCM 解析：`src/lib/ncm.js`；扩展清单：`public/manifest.json`。开源组件及对应源码见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。已上架 [Microsoft Edge 加载项商店](https://microsoftedge.microsoft.com/addons/detail/ohgnjlfmmbnkhnjfinclnojfljekpcko)，同时提供 ZIP 安装包供手动加载。

## 修改说明与发布

每次项目新增、修改或删除文件后，统一更新根目录的 [changelog.md](changelog.md)，按版本维护“修改说明”和“更新内容”。同一版本的后续更新追加到已有章节，保留历史版本记录，不再新建独立说明文件，也不自动增加应用版本号。

提交标题使用 `v<版本号>：<当前版本的修改说明>`，正文依据该版本“更新内容”编写。提交前审阅差异、同步远端、完成必要验证并检查暂存区，提交后推送并确认远端提交号；具体流程见 [AGENTS.md](AGENTS.md)。

`release/` 目录仅用于保存本地安装包，整个目录由 Git 忽略，不提交到源码仓库。运行 `npm run release` 后，由维护者手动将 ZIP 上传至 [GitHub Releases](https://github.com/451040731/YinCrate/releases)，并填写对应的版本更新说明。源码提交、安装包生成与 Release 发布分别进行。

## 微信打赏

如果转音匣对你有帮助，欢迎微信扫码打赏，支持项目持续维护与更新。

<img src="docs/wx.jpg" alt="微信打赏二维码" width="280" />
