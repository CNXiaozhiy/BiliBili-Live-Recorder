import fs from 'fs';
import path from 'path';
import ffmpeg from 'fluent-ffmpeg';
import moment from 'moment';
import { config } from '../lib/d';

import { getLiveRoomInfo, getLiveStreamUrl } from './bilibili-api';
import { BiliLiveRecorderOptions } from 'index';
import { EventEmitter } from '../core/events';
import { alertError } from '../core/error-alarms';
import { $t } from '../i18n';
import { startProxyServer } from './proxy';

const PORT = 3005;
const proxyServer = startProxyServer(3005);
const proxyServerUrl = `http://127.0.0.1:${PORT}`;

// ffmpeg.setFfmpegPath(path.join(__dirname, '../../ffmpeg/bin/ffmpeg'));
// ffmpeg.setFfprobePath(path.join(__dirname, '../../fffmpeg/bin/ffprobe'));
// ffmpeg.setFlvtoolPath(path.join(__dirname, '../../ffmpeg/bin/flvtool'));

ffmpeg.setFfmpegPath(path.join(config.FFMPEG_BIN_FOLDER, './ffmpeg'));
ffmpeg.setFfprobePath(path.join(config.FFMPEG_BIN_FOLDER, './ffprobe'));
ffmpeg.setFlvtoolPath(path.join(config.FFMPEG_BIN_FOLDER, './flvtool'));

type BiliRecorderEventTypes = 'error' | 'rec-start' | 'rec-progress' | 'rec-error' | 'rec-warn' | 'rec-end' | 'rec-convert-start' | 'rec-convert-end' | 'rec-convert-error';

export default class BiliLiveRecorder extends EventEmitter<BiliRecorderEventTypes> {
    roomId: number;
    saveRecordFolder: string;
    segmentFiles: string[] = [];

    recStatus: 0 | 1 | 2 = 0;
    recStartTime: null | Date = null;
    recEndTime: null | Date = null;

    recCommand: null | ffmpeg.FfmpegCommand = null;
    recConvertCommmand: null | ffmpeg.FfmpegCommand = null;
    recProgress: null | {
        frames: number;
        currentFps: number;
        currentKbps: number;
        targetSize: number;
        timemark: string;
        percent?: number | undefined;
    } = null;

    forceStop: boolean = false;

    constructor({ roomId, saveRecordFolder = '' }: BiliLiveRecorderOptions) {
        super();

        this.roomId = roomId;
        this.saveRecordFolder = saveRecordFolder;
    }

    private generateRecordFilePath(): string {
        return path.join(this.saveRecordFolder, `${this.roomId}_${moment().format('YYYY-MM-DD_HH-mm-ss')}.flv`);
    }

    public stop() {
        return {
            kill: async () => {
                if (!this.recCommand ||this.recCommand.ffmpegProc || !this.recCommand.ffmpegProc.stdin) return;
                this.recCommand.kill('SIGKILL');
                this.recCommand = null;
                this.forceStop = true;
                this.recStatus = 0;

                return this;
            },
            force: async () => {
                if (!this.recCommand || !this.recCommand.ffmpegProc || !this.recCommand.ffmpegProc.stdin) return;
                const stdin = this.recCommand.ffmpegProc.stdin;
                await stdin.write('q');
                this.recCommand = null;
                this.forceStop = true;
                this.recStatus = 0;

                return this;
            },
        }
    }

    public async rec() {
        const outputFilePath = this.generateRecordFilePath();
        this.segmentFiles.push(outputFilePath);
        
        if (fs.existsSync(outputFilePath)) {
            try {
                fs.unlinkSync(outputFilePath);
            } catch (e) {
                this.emit('rec-error', e);
                return;
            }
        }

        const delNullSegmentFiles = (file?: string) => {
            if (!file) {
                this.segmentFiles.forEach(delNullSegmentFiles, this);
            } else {
                if (!fs.existsSync(file)) {
                    this.segmentFiles.includes(file) && this.segmentFiles.splice(this.segmentFiles.indexOf(file), 1);
                } else if (fs.statSync(file).size === 0) {
                    try {
                        fs.unlinkSync(file);
                        this.segmentFiles.includes(file) && this.segmentFiles.splice(this.segmentFiles.indexOf(file), 1);
                    } catch (e) {
                        this.emit('rec-error', e);
                    }
                }
            }
        }

        const streamUrl = await getLiveStreamUrl(this.roomId);
        const proxyStreamUrl = streamUrl.startsWith('https://d1') ? streamUrl : `${proxyServerUrl}/?url=${Buffer.from(streamUrl).toString('base64')}`;
        
        const extname = path.extname(streamUrl); // 再次确认直播流文件格式

        await proxyServer;
        this.recCommand = ffmpeg(proxyStreamUrl)
        .output(outputFilePath)
        .outputOptions('-c copy')
        .addOption('-timeout', '5000000') // 5秒超时
        .addOption('-reconnect', '1') // 启用自动重连
        .addOption('-reconnect_at_eof', '1')
        .addOption('-reconnect_streamed', '1')
        .addOption('-reconnect_delay_max', '5')

        .on('start', (commandLine) => {
            this.recStartTime = new Date();
            this.emit('rec-start', commandLine);
            this.recStatus = 1;
        })
        .on('progress', (progress) => {
            this.recProgress = progress;
            this.emit('rec-progress', progress);
        })
        .on('end', async () => {
            try {
                const resp = await getLiveRoomInfo(this.roomId);
                if (resp.live_status === 1 && !this.forceStop) {
                    delNullSegmentFiles(outputFilePath);
                    this.emit('rec-warn', $t('TEXT_CODE_1b8c5033', { replace: { id: this.roomId } }));
                    this.rec();
                } else {
                    if (this.forceStop) this.forceStop = false;
                    this.recEndTime = new Date();
                    this.recStatus = 0;

                    delNullSegmentFiles();

                    const mergedFilePath = await this.mergeSegmentFiles();
                    this.segmentFiles = [];
                    this.emit('rec-end', { file_path: mergedFilePath });

                    // 转码 -> mp4
                    if (extname !== '.mp4') {
                        const mp4_file_path = mergedFilePath.replace('.flv', '.mp4');
                        this.recConvertCommmand = ffmpeg(mergedFilePath)
                        .output(mp4_file_path)
                        .on('start', (commandLine) => {
                            this.emit('rec-convert-start', commandLine);
                        })
                        .on('end', () => {
                            this.emit('rec-convert-end', {
                                file_path: mp4_file_path
                            })
                        })
                        .on('error', (err) => {
                            this.emit('rec-convert-error', err);
                            alertError(err, $t('TEXT_CODE_ef167dc9'));
                        })

                        this.recConvertCommmand.run();
                    }
                }
            } catch (e) {
                console.error(e)
                this.emit('rec-error', e);
            }
        })
        .on('error', (err) => {
            if (err.message.includes('ffmpeg was killed with signal')) return;
            this.emit('rec-error', err);

            alertError(err, $t('TEXT_CODE_4c7d3c19'));

            delNullSegmentFiles(outputFilePath);
            
            this.rec();
        })
        .on('stderr', (stderrLine) => {
        })

        // 开始录制
        this.recCommand.run();

        return this;
    }

    private async mergeSegmentFiles(): Promise<string> {
        const mergedFilePath = path.join(this.saveRecordFolder, `${this.roomId}_merged_${moment().format('YYYY-MM-DD_HH-mm-ss')}.flv`);
        const inputListFilePath = path.join(this.saveRecordFolder, `input_list_${this.roomId}_${Date.now()}.txt`);

        // 生成输入文件列表
        const inputListContent = this.segmentFiles.map((file) => `file '${file}'`).join('\n');
        fs.writeFileSync(inputListFilePath, inputListContent);

        // 使用 concat 协议合并文件
        await new Promise<void>((resolve, reject) => {
            ffmpeg()
                .input(inputListFilePath)
                .inputOptions('-safe 0')
                .inputFormat('concat')
                .outputOptions('-c copy')
                .output(mergedFilePath)
                .on('end', () => {
                    fs.unlinkSync(inputListFilePath); // 删除临时文件

                    try {
                        this.segmentFiles.forEach(fs.unlinkSync);
                    } catch (e) {
                        reject(e);
                        return;
                    }
                    resolve();
                })
                .on('error', (err) => {
                    fs.unlinkSync(inputListFilePath); // 删除临时文件
                    reject(err);
                })
                .run();
        });

        return mergedFilePath;
    }

    public destroy() {
        if (this.recCommand) this.recCommand.kill('SIGKILL');
        if (this.recConvertCommmand) this.recConvertCommmand.kill('SIGKILL');

        this.off('all')
    }
}