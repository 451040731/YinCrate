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

FFmpeg.wasm 的封装与核心具有不同许可。对应构建版本为上游 v12.15，提交 71aa99d37c02a7b4c435275ca9ef50e612f6efa1；源码与完整依赖构建配置：https://github.com/ffmpegwasm/ffmpeg.wasm/tree/v12.15 ，源码归档：https://github.com/ffmpegwasm/ffmpeg.wasm/archive/refs/tags/v12.15.tar.gz 。FFmpeg 许可说明：https://ffmpeg.org/legal.html 。GPL-2.0 文本随扩展附在 licenses/FFmpeg-GPL-2.0.txt。

本地 NCM 容器实现参考公开格式，结构校验参考 https://github.com/taurusxin/ncmdump 的实现；未复制其 C++ 源码或二进制。

构建脚本会将 npm 安装包内可用的 LICENSE / COPYING 文件复制到扩展的 licenses 文件夹。重新分发时请保留本文件及各组件许可，并履行对应源码和许可义务。
