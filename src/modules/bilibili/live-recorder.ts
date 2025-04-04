import fs from "fs";
import path from "path";
import ffmpeg from "fluent-ffmpeg";
import moment from "moment";
import { config } from "../../lib/d";

import { getLiveRoomInfo, getLiveStreamUrl } from "./api";
import { BiliLiveRecorderOptions } from "index";
import { EventEmitter } from "../../core/events";
import { alertError } from "../../core/error-alarms";
import { $t } from "../../i18n";
import { startProxyServer } from "../../lib/proxy";
import FileCleaner from "../system/live-recoder-file-cleaner";
import logger from "../../logger";
import axios from "axios";
import { checkStreamStatus } from "../../tools";

const PORT = 3005;
const proxyServer = startProxyServer(3005);
const proxyServerUrl = `http://127.0.0.1:${PORT}`;

ffmpeg.setFfmpegPath(path.join(config.FFMPEG_BIN_FOLDER, "./ffmpeg"));
ffmpeg.setFfprobePath(path.join(config.FFMPEG_BIN_FOLDER, "./ffprobe"));
ffmpeg.setFlvtoolPath(path.join(config.FFMPEG_BIN_FOLDER, "./flvtool"));

type BiliRecorderEventTypes =
  | "error"
  | "rec-start"
  | "rec-progress"
  | "rec-error"
  | "rec-warn"
  | "rec-end"
  | "rec-transcode-start"
  | "rec-transcode-skip"
  | "rec-transcode-end"
  | "rec-all-end"
  | "rec-transcode-error";

export default class BiliLiveRecorder extends EventEmitter<BiliRecorderEventTypes> {
  roomId: number;
  saveRecordFolder: string;
  transcodeMP4: boolean;
  segmentFiles: string[] = [];

  fileCleaner: FileCleaner;

  recStatus: 0 | 1 | 2 = 0;
  recStartTime: null | Date = null;
  recEndTime: null | Date = null;

  recCommand: null | ffmpeg.FfmpegCommand = null;
  recTranscodeCommmand: null | ffmpeg.FfmpegCommand = null;
  recProgress: null | {
    frames: number;
    currentFps: number;
    currentKbps: number;
    targetSize: number;
    timemark: string;
    percent?: number | undefined;
  } = null;

  forceStop: boolean = false;

  errRetryTimes: number = 0;

  MAX_ERR_RETRY_TIMES: number = 10;

  constructor({ roomId, saveRecordFolder = "", transcodeMP4 = false }: BiliLiveRecorderOptions) {
    super();

    this.roomId = roomId;
    this.saveRecordFolder = saveRecordFolder;
    this.transcodeMP4 = transcodeMP4;

    this.fileCleaner = new FileCleaner(saveRecordFolder);
  }

  private generateRecordFilePath(): string {
    return path.join(
      this.saveRecordFolder,
      `${this.roomId}_${moment().format("YYYY-MM-DD_HH-mm-ss")}.flv`
    );
  }

  public stop = {
    kill: async () => {
      if (!this.recCommand || this.recCommand.ffmpegProc || !this.recCommand.ffmpegProc.stdin)
        return;
      this.recCommand.kill("SIGKILL");
      this.recCommand = null;
      this.forceStop = true;
      this.recStatus = 0;

      return this;
    },
    force: async () => {
      if (!this.recCommand || !this.recCommand.ffmpegProc || !this.recCommand.ffmpegProc.stdin)
        return;
      const stdin = this.recCommand.ffmpegProc.stdin;
      await stdin.write("q");
      this.recCommand = null;
      this.forceStop = true;
      this.recStatus = 0;

      return this;
    },
  };

  public async rec() {
    // 辅助函数
    const delNullSegmentFiles = (file?: string) => {
      if (!file) {
        this.segmentFiles.forEach(delNullSegmentFiles, this);
      } else {
        if (!fs.existsSync(file)) {
          this.segmentFiles.includes(file) &&
            this.segmentFiles.splice(this.segmentFiles.indexOf(file), 1);
        } else if (fs.statSync(file).size === 0) {
          try {
            fs.unlinkSync(file);
            this.segmentFiles.includes(file) &&
              this.segmentFiles.splice(this.segmentFiles.indexOf(file), 1);
          } catch (e) {
            this.emit("rec-error", e);
          }
        }
      }
    };
    const recEndFunc = async () => {
      this.recEndTime = new Date();
      this.recStatus = 0;

      delNullSegmentFiles();

      const mergedFilePath = await this.mergeSegmentFiles();

      this.segmentFiles = [];
      this.emit("rec-end", { file_path: mergedFilePath });

      const extname = path.extname(mergedFilePath);

      // 转码 -> mp4
      if (extname !== ".mp4" && this.transcodeMP4) {
        const mp4_file_path = mergedFilePath.replace(".flv", ".mp4");
        this.recTranscodeCommmand = ffmpeg(mergedFilePath)
          .output(mp4_file_path)
          .on("start", (commandLine) => {
            this.emit("rec-transcode-start", commandLine);
          })
          .on("end", () => {
            this.emit("rec-transcode-end", {
              file_path: mp4_file_path,
            });
            this.emit("rec-all-end", {
              file_path: mp4_file_path,
            });
          })
          .on("error", (err) => {
            this.emit("rec-transcode-error", err);
            alertError(err, $t("TEXT_CODE_ef167dc9"));
          });

        this.recTranscodeCommmand.run();
      } else {
        this.emit("rec-transcode-skip");
        this.emit("rec-all-end", {
          file_path: mergedFilePath,
        });
      }
    };

    // 直播间是否开播
    if ((await getLiveRoomInfo(this.roomId)).live_status !== 1) {
      if (this.recStatus !== 0) {
        recEndFunc();
      }
      return;
    }

    // 获取直播流地址
    let streamUrl;
    try {
      streamUrl = await getLiveStreamUrl(this.roomId);
    } catch (e) {
      setTimeout(() => this.rec(), 5000);
      return;
    }

    // 等待代理直播流启动
    await proxyServer;

    const proxyStreamUrl = `${proxyServerUrl}/?url=${Buffer.from(streamUrl).toString("base64")}`;

    // 测试直播流是否可用 获取返回状态码
    const statusCode = await checkStreamStatus(proxyStreamUrl);
    if (statusCode !== 200) {
      // 直播流不可用
      logger.warn(`[Live Recorder]\t${this.roomId} 直播流不可用，状态码:${statusCode}`);
      setTimeout(() => this.rec(), 3000);
      return;
    }

    // 生成直播录制文件名
    const outputFilePath = this.generateRecordFilePath();
    this.segmentFiles.push(outputFilePath);

    // 开始直播录制
    this.recCommand = ffmpeg(proxyStreamUrl)
      .output(outputFilePath)
      .outputOptions("-c copy")
      .addOption("-timeout", "5000000") // 5秒超时
      .addOption("-reconnect", "1") // 启用自动重连
      .addOption("-reconnect_at_eof", "1")
      .addOption("-reconnect_streamed", "1")
      .addOption("-reconnect_delay_max", "5")
      .on("start", (commandLine) => {
        if (this.segmentFiles.length === 1) this.recStartTime = new Date();
        this.recStatus = 1;
        this.emit("rec-start", commandLine);
      })
      .on("progress", (progress) => {
        this.recProgress = progress;
        this.emit("rec-progress", progress);
      })
      .on("end", async () => {
        try {
          const resp = await getLiveRoomInfo(this.roomId);
          if (resp.live_status === 1 && !this.forceStop) {
            this.emit("rec-warn", $t("TEXT_CODE_1b8c5033", { replace: { id: this.roomId } }));
            // 继续录制
            this.rec();
          } else {
            if (this.forceStop) this.forceStop = false;
            recEndFunc();
          }
        } catch (e) {
          console.error(e);
          this.emit("rec-error", e);
        }
      })
      .on("error", (err) => {
        if (err.message.includes("ffmpeg was killed with signal")) return;

        this.errRetryTimes++;
        if (this.errRetryTimes >= this.MAX_ERR_RETRY_TIMES) {
          this.emit("rec-error", new Error("已到达最大重试次数，已结束录制。"));
          this.errRetryTimes = 0;
          recEndFunc();
          return;
        }

        if (err.message.includes("Conversion failed")) {
          this.emit(
            "rec-error",
            new Error(
              "硬盘空间不足，已结束录制并启动文件清理任务。文件清理完成后自动重新开始录制。"
            )
          );

          this.fileCleaner
            .clean(this.segmentFiles.map((file) => path.basename(file)))
            .then(() => this.rec());
          return;
        }

        const getTranslatedErrorMessage = (message: string): string => {
          const translatedErrorMessages = {
            "Error opening input files: Server returned 5XX Server Error reply":
              "哔哩哔哩返回服务器错误",
          };

          for (const key in translatedErrorMessages) {
            if (message.includes(key)) {
              return translatedErrorMessages[key as keyof typeof translatedErrorMessages];
            }
          }

          return "未知错误";
        };

        this.emit("rec-error", new Error(getTranslatedErrorMessage(err.message)));

        setTimeout(() => this.rec(), 3000);
      });

    // 开始录制
    this.recCommand.run();

    return this;
  }

  private async mergeSegmentFiles(): Promise<string> {
    const mergedFilePath = path.join(
      this.saveRecordFolder,
      `${this.roomId}_merged_${moment().format("YYYY-MM-DD_HH-mm-ss")}.flv`
    );
    const inputListFilePath = path.join(
      this.saveRecordFolder,
      `input_list_${this.roomId}_${Date.now()}.txt`
    );

    // 生成输入文件列表
    const inputListContent = this.segmentFiles.map((file) => `file '${file}'`).join("\n");
    fs.writeFileSync(inputListFilePath, inputListContent);

    // 使用 concat 协议合并文件
    await new Promise<void>((resolve, reject) => {
      ffmpeg()
        .input(inputListFilePath)
        .inputOptions("-safe 0")
        .inputFormat("concat")
        .outputOptions("-c copy")
        .output(mergedFilePath)
        .on("end", () => {
          fs.unlinkSync(inputListFilePath); // 删除临时文件

          this.segmentFiles.forEach(fs.unlinkSync);
          resolve();
        })
        .on("error", (err) => {
          fs.unlinkSync(inputListFilePath); // 删除临时文件
          reject(err);
        })
        .run();
    });

    return mergedFilePath;
  }

  public destroy() {
    if (this.recCommand) this.recCommand.kill("SIGKILL");
    if (this.recTranscodeCommmand) this.recTranscodeCommmand.kill("SIGKILL");

    this.off("all");
  }
}
