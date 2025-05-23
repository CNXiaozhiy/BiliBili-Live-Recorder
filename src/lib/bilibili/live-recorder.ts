import fs from "fs";
import crypto from "crypto";
import ffmpeg from "fluent-ffmpeg";
import EventEmitter from "events";
import { getLiveRoomInfo, getLiveStreamUrl, getAvailableLiveStream } from "./api";
import {
  LiveRecoderEvents,
  Bilibili,
  LiveRecoderStat,
  FfmpegCommandProgress,
  LiveRecorderOptions,
  RecordFileMeta,
} from "@/types/bilibili";

import logger from "@/logger";
import FileNameUtils from "@/utils/file-name";
import FfpmegUtils from "@/utils/ffmpeg";
import FileTreeParse from "./file-tree-parse";
import { shutdownManager } from "@/utils/shutdown-manager";
import { generateRecordMetaFilePath } from "@/utils/meta-file";

const CHECK_FILE_EXIST_INTERVAL = 30 * 1000;
const CHECK_FILE_SIZE_INTERVAL = 60 * 1000;
const CHECK_STOP_INTERVAL = 60 * 1000;

export default class BilibiliLiveRecorder extends EventEmitter<LiveRecoderEvents> {
  public roomId;
  private saveRecordFolder;
  private recCommand: ffmpeg.FfmpegCommand | null = null;
  private segmentFiles: string[] = [];

  private recWatchDog: NodeJS.Timeout | null = null;
  private recWatchDog_lastFileSize = 0;
  private recStopTimeout: NodeJS.Timeout | null = null; // 检测软停止是否超时（ffmpeg 对q命令无响应的情况）
  private retryRecTimeout: NodeJS.Timeout | null = null;

  public recStatus = Bilibili.RecorderStatus.NOT_RECORDING;
  public recProgress: FfmpegCommandProgress | null = null;
  public stat: LiveRecoderStat = {};
  public recHash: string | null = null;

  // temp variable
  private _froceStop = false;

  get segIndex() {
    return this.segmentFiles.length;
  }

  constructor(options: LiveRecorderOptions) {
    super();
    this.roomId = typeof options.roomId === "number" ? options.roomId : parseInt(options.roomId);
    this.saveRecordFolder = options.saveRecordFolder;

    shutdownManager.registerCleanupTask(() => {
      return new Promise<void>((resolve) => {
        if (!this.recCommand) return resolve();
        this.recCommand?.removeAllListeners();
        this.recCommand?.on("error", () => resolve());
        this.recCommand?.kill("SIGTERM");
      });
    });
  }

  private _generateRecordFilePath(): string {
    return FileNameUtils.generateRecordFilePath(this.saveRecordFolder, this.roomId);
  }

  private _recoverRecorderState() {
    const metaFilePath = generateRecordMetaFilePath(this.recHash!, this.saveRecordFolder);
    if (!fs.existsSync(metaFilePath)) return;
    const metaData = FileTreeParse.verify(metaFilePath, "live-recorder") as RecordFileMeta | null;
    if (!metaData) return;

    this.stat.startTime = new Date(metaData.start_time);
    this.segmentFiles = metaData.record_files.filter((file) => fs.existsSync(file));

    logger.debug("[Live Recorder Recovery]", `恢复部分录制信息成功：`, {
      hash: this.recHash,
      roomId: this.roomId,
      recStartTime: this.stat.startTime,
      segmentFiles: this.segmentFiles,
    });
  }

  private _generateMergedFilePath(): string {
    return FileNameUtils.generateMergedFilePath(this.saveRecordFolder, this.roomId);
  }

  private _stopRec() {
    if (this.recStopTimeout) this._clearRecStopTimeout();
    if (this.recCommand) this.recCommand = null;
    this.emit("rec-stoping", this.recHash!);

    const onFinlish = (mergedFilePath: string) => {
      this.emit("rec-end", this.recHash!, mergedFilePath);
      logger.info("[Live Recorder]", `房间 ${this.roomId} 停止录制成功`);
    };
    const onError = (error: unknown) => {
      this.emit("rec-merge-error", error);
      logger.error("[Live Recorder]", `房间 ${this.roomId} 合并分片失败: ${error}`);
    };
    const onFinally = () => {
      this._changeRecStatus(Bilibili.RecorderStatus.NOT_RECORDING);
      this._cleanAfterStop();
    };

    logger.info("[Live Recorder]", `房间 ${this.roomId} 正在停止录制（合并分片）`);

    this.stat.endTime = new Date();

    this._mergeSegmentFiles().then(onFinlish).catch(onError).finally(onFinally);
  }

  private _cleanAfterStop() {
    this.segmentFiles = [];
    this.recCommand = null;
    this.recProgress = null;
  }

  private _deleteRecordFile(file: string) {
    if (process.env.DEBUG_NO_DELETE_RECORD_FILE) return;
    if (fs.existsSync(file)) fs.unlinkSync(file);
  }

  private _mergeSegmentFiles() {
    this.cleanNullSegmentFiles();
    if (this.segmentFiles.length === 1) {
      const mergedFilePath = this._generateMergedFilePath();
      fs.renameSync(this.segmentFiles[0], mergedFilePath);
      return Promise.resolve(mergedFilePath);
    }

    return FfpmegUtils.concat({
      inputFileList: this.segmentFiles,
      outputPath: this._generateMergedFilePath(),
    });
  }

  private async _firstRec() {
    const liveRoomInfo = await getLiveRoomInfo(this.roomId);

    this.stat.startTime = new Date();
    this.stat.endTime = undefined;
    this.recProgress = null;

    const _liveStartTime = new Date(liveRoomInfo.live_time).getTime();
    this.recHash = crypto
      .createHash("md5")
      .update(`${this.roomId}_${_liveStartTime}`)
      .digest("hex");

    const metaFilePath = generateRecordMetaFilePath(this.recHash, this.saveRecordFolder);

    if (fs.existsSync(metaFilePath)) {
      logger.info(
        "[Live Recorder Recovery]",
        `房间 ${this.roomId} 已经有录制信息，可能出现了意外情况，正在恢复`
      );
      this._recoverRecorderState();
    }
  }

  private cleanNullSegmentFiles() {
    for (let i = 0; i < this.segmentFiles.length; i++) {
      const file = this.segmentFiles[i];
      if (!fs.existsSync(file)) {
        this.segmentFiles.splice(i, 1);
        i--;
      } else if (fs.statSync(file).size === 0) {
        fs.unlinkSync(file);
        this.segmentFiles.splice(i, 1);
        i--;
      }
    }
  }

  private _changeRecStatus(newStatus: Bilibili.RecorderStatus) {
    this.recStatus = newStatus;
    if (this.recWatchDog) this._clearRecWatchDog();
  }

  private _clearRecWatchDog() {
    if (this.recWatchDog) {
      clearTimeout(this.recWatchDog);
      this.recWatchDog = null;
      this.recWatchDog_lastFileSize = 0;
    }
  }

  private _clearRetryRecTimeout() {
    if (this.retryRecTimeout) {
      clearTimeout(this.retryRecTimeout);
      this.retryRecTimeout = null;
    }
  }

  private _clearRecStopTimeout() {
    if (this.recStopTimeout) {
      clearTimeout(this.recStopTimeout);
      this.recStopTimeout = null;
    }
  }

  private retryRec(timeout = 5000) {
    this.retryRecTimeout = setTimeout(() => this.rec(), timeout);
    this._clearRecWatchDog();
  }

  public stop() {
    this._froceStop = true;
    this._stop();
  }

  private _stop() {
    if (!this.recCommand || this.recStatus === Bilibili.RecorderStatus.STOPPING) return;
    if (this.retryRecTimeout) this._clearRetryRecTimeout();
    if (this.recWatchDog) this._clearRecWatchDog();
    this._changeRecStatus(Bilibili.RecorderStatus.STOPPING);

    logger.debug("[Live Recorder]", `房间 ${this.roomId} _stop()`);

    this.recStopTimeout = setTimeout(() => {
      this.recCommand?.removeAllListeners();
      this.recCommand?.on("error", () => {});
      this.recCommand?.kill("SIGKILL");

      logger.warn("[Live Recorder]", `房间 ${this.roomId} 正在强制停止录制`);
      this._froceStop = false;
      this._stopRec();
    }, CHECK_STOP_INTERVAL);

    logger.debug("[Live Recorder]", `stdin <- 'q' 已弃用`);
    // const stdin: NodeJS.WritableStream = (this.recCommand as any).ffmpegProc?.stdin;
    // if (stdin) stdin.write('q');
    this.recCommand?.removeAllListeners();
    this.recCommand?.on("error", () => {});
    this.recCommand?.kill("SIGTERM");
    this._froceStop = false;
    this._stopRec();
  }

  public async rec() {
    if (this.retryRecTimeout) this._clearRetryRecTimeout();
    if (this.recWatchDog) this._clearRecWatchDog();

    // 判断是否强制停止录制
    if (this.recStatus === Bilibili.RecorderStatus.RECORDING && this._froceStop) {
      logger.debug("[Live Recorder]", `房间 ${this.roomId} 正在停止录制`);
      this._froceStop = false;
      this._changeRecStatus(Bilibili.RecorderStatus.STOPPING);
      this._stopRec();
      return;
    }

    // 判断直播间是否开播
    if ((await getLiveRoomInfo(this.roomId)).live_status !== Bilibili.LiveRoomStatus.LIVE) {
      logger.debug(
        "[Live Recorder]",
        `Retry Rec Check Result: 房间 ${this.roomId} 直播间未开播，结束录制`
      );
      if (this.recStatus === Bilibili.RecorderStatus.RECORDING) this._stopRec();
      return;
    }
    // 获取直播流
    let liveStreamUrl;
    // 判断直播流是否可用
    try {
      const liveStreamUrls = await getLiveStreamUrl(this.roomId);
      liveStreamUrl = await getAvailableLiveStream(liveStreamUrls);
      if (!liveStreamUrl) throw new Error("无可用的直播流");
    } catch (error) {
      logger.warn("[Live Recorder]", `获取直播流失败: ${error}`);
      this.retryRec();
      return;
    }

    const outputFilePath = this._generateRecordFilePath();

    this.recCommand = FfpmegUtils.rec(liveStreamUrl, outputFilePath);

    this.recCommand
      .once("start", async () => {
        if (this.segmentFiles.length === 0) await this._firstRec();
        this.segmentFiles.push(outputFilePath);

        this._changeRecStatus(Bilibili.RecorderStatus.RECORDING);
        this.emit("rec-start", this.recHash!);

        this.emit("segment-change", this.recHash!, this.segmentFiles);

        logger.info("[Live Recorder]", `房间 ${this.roomId} 开始录制`);

        setTimeout(() => {
          if (!fs.existsSync(outputFilePath)) {
            // this.recCommand?.emit("error", new Error("录制文件长时间未生成"));
            logger.warn("[Live Recorder]", `房间 ${this.roomId} 录制文件长时间未生成`);
            this.recCommand?.kill("SIGTERM");
            this.retryRec();
          }
        }, CHECK_FILE_EXIST_INTERVAL);

        this.recWatchDog = setInterval(() => {
          const fileSize = fs.statSync(outputFilePath).size;

          if (this.recWatchDog_lastFileSize === fileSize) {
            // this.recCommand?.emit("error", new Error("录制文件长时间无变化"));
            logger.warn("[Live Recorder]", `房间 ${this.roomId} 录制文件长时间无变化`);
            this.recCommand?.kill("SIGTERM");
            this.retryRec();
          }
        }, CHECK_FILE_SIZE_INTERVAL);
      })
      .once("error", (err) => {
        logger.error("[Live Recorder]", `房间 ${this.roomId} 录制失败: ${err}`);
        this.emit("rec-error", err);
        this.retryRec();
      })
      .once("end", () => this.retryRec());

    this.recCommand.on("progress", (progress) => {
      this.recProgress = progress;
      this.emit("rec-progress", progress);
    });

    this.recCommand.run();
  }

  public destroy(cleanFile: boolean = true) {
    this.removeAllListeners();
    this.recCommand?.removeAllListeners();
    this.recCommand?.on("error", () => {
      if (cleanFile) {
        this.segmentFiles.forEach(this._deleteRecordFile);
      }
      this.recCommand?.removeAllListeners();
    });
    this.recCommand?.kill("SIGTERM");
    this._cleanAfterStop();
  }
}
