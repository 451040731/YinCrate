# YinCrate — 开源组件与许可

本文件随扩展分发。项目使用以下第三方组件；组件版权归各自作者所有。

| 组件 | 版本 | 许可 | 上游与源码 |
| --- | --- | --- | --- |
| @ffmpeg/ffmpeg | 0.12.15 | MIT | https://github.com/ffmpegwasm/ffmpeg.wasm/tree/v12.15/packages/ffmpeg |
| @ffmpeg/core | 0.12.10 | GPL-2.0-or-later（含 FFmpeg 及外部编解码库） | https://github.com/ffmpegwasm/ffmpeg.wasm/releases/tag/v12.15 |
| @noble/ciphers | 2.4.0 | MIT | https://github.com/paulmillr/noble-ciphers |
| React / React DOM | 19.3.1 | MIT | https://github.com/facebook/react |
| Lucide React | 0.468.0 | ISC | https://github.com/lucide-icons/lucide |
| JSZip | 3.10.1 | MIT / GPL-3.0-or-later（采用 MIT） | https://github.com/Stuk/jszip |
| music-metadata | 12.3.2 | MIT | https://github.com/Borewit/music-metadata |

FFmpeg.wasm 的封装与核心具有不同许可。对应构建版本为上游 v12.15，提交 71aa99d37c02a7b4c435275ca9ef50e612f6efa1；源码与完整依赖构建配置：https://github.com/ffmpegwasm/ffmpeg.wasm/tree/v12.15 ，源码归档：https://github.com/ffmpegwasm/ffmpeg.wasm/archive/refs/tags/v12.15.tar.gz 。FFmpeg 许可说明：https://ffmpeg.org/legal.html 。GPL-2.0 文本随扩展附在 licenses/FFmpeg-GPL-2.0.txt。

本地 NCM 容器实现参考公开格式，结构校验参考 https://github.com/taurusxin/ncmdump 的实现；未复制其 C++ 源码或二进制。

本地 KGM / KWM / KGG 解析与 eKey 派生参考以下公开实现，保留对应 MIT 许可：

- Unlock Music Web（MIT，Copyright 2019–2025 MengYX）：https://git.unlock-music.dev/um/web ，历史源码镜像 https://git.dov.moe/Mirror/unlock-music 。KGM 使用公开掩码常量，KWM 使用公开文件头和掩码规则；KGG 流密码与 eKey 派生兼容 `src/decrypt/qmc_cipher.ts` / `qmc_key.ts`，其中 Map 已与上游公开测试向量核对。许可位于 `licenses/Unlock-Music-MIT.txt`。
- KGG-Decryptor（MIT，Copyright 2026）：https://github.com/Aaron-gx/KGG-Decryptor ，参考 KGG v5 文件头、客户端 eKey 匹配与本地解码流程。许可位于 `licenses/KGG-Decryptor-MIT.txt`。
- music-geshizhuanhuan（MIT，Copyright 2026 music-geshizhuanhuan contributors）：https://github.com/HRuiCcc/music-geshizhuanhuan ，其 `assets/kugou_key.xz` 仅用于开发时独立核对 KGM 掩码与固定测试结果，不随扩展分发。许可位于 `licenses/music-geshizhuanhuan-MIT.txt`。

KGM 使用小型公开常量表按位置计算掩码，扩展无需下载大型掩码文件。以上参考实现的客户端数据库读取、账号和联网取钥功能均未引入。

构建脚本会将 npm 安装包内可用的 LICENSE / COPYING 文件复制到扩展的 licenses 文件夹。重新分发时请保留本文件及各组件许可，并履行对应源码和许可义务。
