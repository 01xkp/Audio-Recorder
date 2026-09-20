# Audio Recorder

一个纯浏览器端的在线录音分割工具。录音会在当前浏览器的 FFmpeg WebAssembly Worker 中处理，不会上传到 OSS、服务器或固定本地目录。

## 功能

- 选择或拖放 WAV、MP3、M4A、Ogg、Opus、FLAC、AAC 录音
- 固定输出 Ogg/Opus，16 kHz 输入、16 kb/s、20 ms 帧，保留原始声道数
- 自定义每片时长
- 可选地设置前片尾部重叠秒数，默认 `0`
- 可选地添加下载文件名标识，默认为空
- 下载单个分片，或下载包含 `manifest.json` 的 ZIP
- 以原始录音为父项展示结果，展开后查看、下载或删除子分片
- 勾选、全选或单独删除浏览器内存中的已生成分片；不会改动原始录音或工程文件

分片是独立可播放文件。设置重叠后，第 N 片的起点为：

```text
(N - 1) * (分片时长 - 重叠时长)
```

例如设置每片 `300` 秒、重叠 `30` 秒时，第 2 片从第 270 秒开始，仍保持 300 秒长度。

## 本地运行

```bash
npm install
npm run dev
```

执行 `npm install`、`npm run dev` 或 `npm run build` 时会从已安装的 `@ffmpeg/core` 包复制 WebAssembly 核心到 `public/ffmpeg/`。这些生成文件不纳入 Git。

## 校验

```bash
npm test
npm run build
```

## 虚拟机部署

项目在 KVM 虚拟机中使用独立的 `audio-recorder.service` 和 `5175` 端口运行，不会影响现有的任务分配服务。具体步骤见 [KVM Ubuntu 部署说明](docs/deployment-kvm-ubuntu.md)。

## 许可证注意事项

`@ffmpeg/core` 的 npm 元数据为 `GPL-2.0-or-later`。在公开部署或分发前，应根据实际 FFmpeg 构建和发布方式完成许可证审查。
