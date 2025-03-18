# 🎥 BiliBili Live Recorder (BLR)

[![Node.js](https://img.shields.io/badge/Node.js-18.20.6%2B-green)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7.3%2B-blue)](https://www.typescriptlang.org/)

[🔄 Switch to Chinese](README_zh.md)

## 🌟 Core Features

- Automated recording of Bilibili live streams
- Notification interaction via OneBot protocol
- Multi-language internationalization support (i18n)
- FFmpeg integrated video processing

## 🛠️ Environment

- Node.js 18.20.6+
- TypeScript 5.7.3+
- FFmpeg (Make sure the FFmpeg bin path is correctly configured in `config.json`)
- [OneBot](https://onebot.dev/) compatible QQ bot

## 📦 Package Manager

- Yarn or Npm

## 📝 Available Commands

- `dev` - Run in development mode.
- `build` - Bundle the application using webpack.
- `package` - Package the application into an executable file.

## 📂 Project Structure

```
├── data/            # Database files
├── languages/       # Multi-language resource files
├── src/
│   ├── core/        # Core classes
│   ├── i18n/        # Internationalization module
│   ├── lib/         # Core libraries
│   ├── logger/      # Log management
│   ├── tools/       # Utilities
│   ├── types/       # TypeScript type definitions
│   ├── app.ts       # Main application entry point
```

## ⚙️ Configuration File

The configuration file `config.json` is located at the root of the project (same level as `package.json`):

**Template:**

```json
{
  "RECORD_FOLDER_PATH": "/path/to/records/",
  "FFMPEG_BIN_FOLDER": "/path/to/ffmpeg/bin",
  "Language": "en_us",
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

**Explanation:**

- `RECORD_FOLDER_PATH`: Folder where video recordings will be saved.
- `FFMPEG_BIN_FOLDER`: Path to FFmpeg's `bin` directory.
- `Language`: Preferred language (e.g., `en_us` for English).
- `bot`: Configuration for a QQ bot based on the OneBot protocol.
  - `ws_url`: WebSocket address for the bot.
  - `admin`: List of administrator QQ numbers and permission levels (max 100).

## 🚀 Clone the Repository

Clone the repository with this command:

```bash
git clone https://github.com/CNXiaozhiy/BiliBili-Live-Recorder.git
```

## 💻 Install Dependencies

You can use either `npm` or `yarn` to install dependencies:

Using npm:

```bash
npm install
```

Using Yarn:

```bash
yarn install
```

## ❓ FAQ

**Q: How to get my Bilibili Cookie?**  
A: After logging in, open your browser's Developer Tools → Network → Copy the Cookie value.

**Q: FFmpeg path is incorrect?**  
A: Double-check the path and ensure it points to FFmpeg's `bin` directory.

**Q: Recording files are not saving?**  
A: Make sure the target folder has the correct permissions and enough disk space.

## 🤝 Contributing

We welcome contributions! Before submitting a PR or Issue, please make sure to:

1. Follow the existing code style 🖋️.
2. Update the relevant documentation 📚.
3. Add necessary unit tests 🧪.

## 📄 License

MIT License © 2025 BLR System Contributors
