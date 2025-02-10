# 🎥 哔哩哔哩直播录制工具 (BLR)

[![Node.js](https://img.shields.io/badge/Node.js-18.20.6%2B-green)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7.3%2B-blue)](https://www.typescriptlang.org/)

[🔄 Switch to English](README.md)

## 🌟 核心功能

- 自动化录制 Bilibili 直播流
- 支持通过 OneBot 协议进行通知交互
- 多语言国际化支持（i18n）
- FFmpeg 集成视频处理

## 🛠️ 环境要求

- Node.js 18.20.6+
- TypeScript 5.7.3+
- FFmpeg（请确保在 `config.json` 中正确配置 FFmpeg 的 bin 路径）
- 兼容 [OneBot](https://onebot.dev/) 协议的 QQ 机器人

## 📦 包管理器

- Yarn 或 Npm

## 📝 可用命令

- `dev` - 以开发模式运行。
- `build` - 使用 webpack 进行打包。
- `package` - 打包成可执行文件。

## 📂 项目结构

```
├── data/            # 数据库文件
├── languages/       # 多语言资源文件
├── src/
│   ├── core/        # 核心类
│   ├── i18n/        # 国际化模块
│   ├── lib/         # 核心库
│   ├── logger/      # 日志管理
│   ├── tools/       # 工具集
│   ├── types/       # TypeScript 类型定义
│   ├── app.ts       # 主程序入口
```

## ⚙️ 配置文件

配置文件 `config.json` 位于项目根目录（与 `package.json` 同级）：

**模板：**

```json
{
  "Bili_Cookie": "",
  "RECORD_FOLDER_PATH": "/path/to/records/",
  "FFMPEG_BIN_FOLDER": "/path/to/ffmpeg/bin",
  "Language": "zh_cn",
  "bot": {
    "ws_url": "ws://127.0.0.1:3000",
    "admin": [
      {
        "qid": 1811302029,
        "permission": 1
      }
    ]
  }
}
```

**解释：**

- `Bili_Cookie`: 哔哩哔哩的 Cookie（登录后获取）。
- `RECORD_FOLDER_PATH`: 录制视频文件保存的文件夹。
- `FFMPEG_BIN_FOLDER`: FFmpeg 的 bin 目录路径。
- `Language`: 首选语言（例如，`zh_cn` 为中文）。
- `bot`: 基于 OneBot 协议的 QQ 机器人配置。
  - `ws_url`: 机器人的 WebSocket 地址。
  - `admin`: 管理员的 QQ 号和权限等级（权限等级最大值 100）。

## 🚀 克隆仓库

使用以下命令克隆仓库：

```bash
git clone https://github.com/CNXiaozhiy/BiliBili-Live-Recorder.git
```

## 💻 安装依赖

可以使用 `npm` 或 `yarn` 安装依赖：

使用 npm:

```bash
npm install
```

使用 Yarn:

```bash
yarn install
```

## ❓ 常见问题 (FAQ)

**Q: 如何获取 Bilibili Cookie？**  
A: 登录后，打开浏览器开发者工具 → 网络 → 复制 Cookie 值。

**Q: FFmpeg 路径配置错误？**  
A: 确保路径指向 FFmpeg 的 `bin` 目录。

**Q: 录像文件保存失败？**  
A: 请检查目标文件夹的权限设置和磁盘空间是否足够。

## 🤝 参与贡献

我们欢迎您的贡献！提交 PR 或 Issue 前，请确保：

1. 遵循现有代码风格 🖋️。
2. 更新相关文档 📚。
3. 添加必要的单元测试 🧪。

## 📄 许可协议

MIT License © 2025 BLR System Contributors
