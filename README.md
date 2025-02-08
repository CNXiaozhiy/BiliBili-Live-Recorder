# BiliBili Live Recorder System (BLR)

![Node.js Version](https://img.shields.io/badge/node-%3E%3D16.0.0-brightgreen)
![TypeScript Version](https://img.shields.io/badge/typescript-%5E4.0.0-blue)
![Package Manager](https://img.shields.io/badge/yarn-%E2%9C%93-2C8EBB)

A Node.js-based Bilibili live streaming recording system, supporting multi-language interfaces and quick subscription features, developed with TypeScript.
[中文文档](README_zh.md)

## 🌟 Core Features

- Automated recording of Bilibili live streams
- Notification interaction via OneBot protocol
- Multi-language internationalization support (i18n)
- FFmpeg integrated video processing
- Configurable quick subscription templates
- Real-time logging system

## 📦 Installation and Usage

### Environment Requirements

- Node.js v16+
- FFmpeg (needs to be pre-configured in environment variables or specified in the configuration)

## 📥 Installation and Running

### Clone Repository

```bash
# Clone repository
git clone https://github.com/CNXiaozhiy/BiliBili-Live-Recorder.git
```

### Using Yarn

```bash
# Install dependencies
yarn install

# Run in development mode
yarn dev

# Build and start production environment
yarn serve

# Compile project only
yarn build
```

### Using NPM

```bash
# Install dependencies
npm install

# Run in development mode
npm run dev

# Build and start production environment
npm run serve

# Compile project only
npm run build
```

## ⚙️ Configuration File Guide

Create `config.ts` (based on template file `config_.ts`):

1. **Bot Configuration**

   - `QBOT_WS_URL`: Fill in the WebSocket address of the OneBot compatible framework
   - Example: `ws://127.0.0.1:6700`

2. **Bilibili Authentication**

   - `Bili_Cookie`: Obtain via browser developer tools (see FAQ for tutorial)
   - Format: `SESSDATA=xxxxx; bili_jct=xxxxx...`

3. **Storage Path Configuration**

   - `RECORD_FOLDER_PATH`: Recording file storage directory (requires write permissions)
   - `FFMPEG_BIN_FOLDER`: FFmpeg binary directory

4. **Subscription Template**

```javascript
quickSubscribe: {
    rooms: {
        // Key is QQ group number
        123456: {
            dec: 'Virtual Streamer Live Room',  // Custom display name
            id: 22625027          // Actual live room ID
        }
    }
}
```

## 📂 Project Structure

```
├── data/            # Database files
├── languages/       # Multi-language resource files
├── src/
│   ├── core/        # Core classes
│   ├── i18n/        # Internationalization module
│   ├── lib/         # Core libraries
│   ├── logger/      # Log management
│   ├── tools/       # Toolset
│   ├── types/       # TypeScript type definitions
│   ├── app.ts       # Main program entry
│   └── config.ts    # Configuration file (needs to be manually created)
```

## 🌍 Multi-language Support

Generate language template file:

```bash
node generate-lng-json.js
```

1. Create a new language file in the `languages` directory (e.g., `en_us.json`)
2. Modify the `Language` field in the configuration to switch the display language

## 🔍 Frequently Asked Questions

Q: How to get Bilibili Cookie?  
A: After logging in, use browser developer tools → Network requests → Copy Cookie value

Q: FFmpeg path configuration error?  
A: Ensure the path contains ffmpeg.exe and the slash direction is correct (Windows needs to escape forward slashes)

Q: Recording file save failed?  
A: Check target folder permissions and disk space

## 🤝 Contributing

Welcome to submit PRs or Issues, please read before contributing:

1. Follow existing code style
2. Update corresponding documentation
3. Add necessary unit tests

## 📄 License

MIT License © 2024 BLR System Contributors
