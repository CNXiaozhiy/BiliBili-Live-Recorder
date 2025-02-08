# BiliBili Live Recorder System (BLR)

![Node.js Version](https://img.shields.io/badge/node-%3E%3D16.0.0-brightgreen)
![TypeScript Version](https://img.shields.io/badge/typescript-%5E4.0.0-blue)
![Package Manager](https://img.shields.io/badge/yarn-%E2%9C%93-2C8EBB)

一个基于 Node.js 的 Bilibili 直播录像系统，支持多语言界面和快速订阅功能，采用 TypeScript 开发。
[English Documentation](README_EN.md)

## 🌟 核心功能

- 自动化录制 Bilibili 直播流
- 支持通过 OneBot 协议进行通知交互
- 多语言国际化支持（i18n）
- FFmpeg 集成视频处理
- 可配置的快速订阅模板
- 实时日志记录系统

## 📦 安装与使用

### 环境要求

- Node.js v16+
- FFmpeg（需预先配置环境变量或在配置中指定路径）

## 📥 安装与运行

### 克隆仓库

```bash
# 克隆仓库
git clone https://github.com/CNXiaozhiy/BiliBili-Live-Recorder.git
```

### 使用 Yarn

```bash
# 安装依赖
yarn install

# 开发模式运行
yarn dev

# 构建并启动生产环境
yarn serve

# 仅编译项目
yarn build
```

### 使用 NPM

```bash
# 安装依赖
npm install

# 开发模式运行
npm run dev

# 构建并启动生产环境
npm run serve

# 仅编译项目
npm run build
```

## ⚙️ 配置文件指南

创建 `config.ts`（基于模板文件 `config_.ts`）：

1. **机器人配置**

   - `QBOT_WS_URL`: 填写 OneBot 兼容框架的 WebSocket 地址
   - 示例：`ws://127.0.0.1:6700`

2. **B 站身份认证**

   - `Bili_Cookie`: 通过浏览器开发者工具获取（教程见 FAQ）
   - 格式：`SESSDATA=xxxxx; bili_jct=xxxxx...`

3. **存储路径配置**

   - `RECORD_FOLDER_PATH`: 录像文件存储目录（需写权限）
   - `FFMPEG_BIN_FOLDER`: FFmpeg 二进制目录

4. **订阅模板**

```javascript
quickSubscribe: {
    rooms: {
        // 键名为QQ群号
        123456: {
            dec: '虚拟主播直播间',  // 自定义展示名称
            id: 22625027          // 真实直播间ID
        }
    }
}
```

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
│   └── config.ts    # 配置文件（需手动创建）
```

## 🌍 多语言支持

生成语言模板文件：

```bash
node generate-lng-json.js
```

1. 在 `languages` 目录创建新语言文件（如 `en_us.json`）
2. 修改配置中的 `Language` 字段切换显示语言

## 🔍 常见问题

Q: 如何获取 Bilibili Cookie？  
A: 登录后通过浏览器开发者工具 → 网络请求 → 复制 Cookie 值

Q: FFmpeg 路径配置错误？  
A: 确认路径包含 ffmpeg.exe 且斜杠方向正确（Windows 使用正斜杠需转义）

Q: 录像文件保存失败？  
A: 检查目标文件夹权限设置和磁盘空间

## 🤝 参与贡献

欢迎提交 PR 或 Issue，贡献前请先阅读：

1. 遵循现有代码风格
2. 更新对应文档
3. 添加必要的单元测试

## 📄 许可协议

MIT License © 2024 BLR System Contributors
