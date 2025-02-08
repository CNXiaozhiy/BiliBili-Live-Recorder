import fs from 'fs';
import path from 'path';
import ffmpeg from 'fluent-ffmpeg';
import moment from 'moment';
import config from '../config';

import { getLiveStreamUrl } from './bilibili-api';
import { BiliLiveRecorderOptions } from 'index';
import { EventEmitter } from '../core/events';
import { alertError } from '../core/error-alarms';
import { $t } from '../i18n';

// ffmpeg.setFfmpegPath(path.join(__dirname, '../../ffmpeg/bin/ffmpeg'));
// ffmpeg.setFfprobePath(path.join(__dirname, '../../fffmpeg/bin/ffprobe'));
// ffmpeg.setFlvtoolPath(path.join(__dirname, '../../ffmpeg/bin/flvtool'));

ffmpeg.setFfmpegPath(path.join(config.FFMPEG_BIN_FOLDER, './ffmpeg'));
ffmpeg.setFfprobePath(path.join(config.FFMPEG_BIN_FOLDER, './ffprobe'));
ffmpeg.setFlvtoolPath(path.join(config.FFMPEG_BIN_FOLDER, './flvtool'));

type BiliRecorderEventTypes = 'rec-start' | 'rec-progress' | 'rec-error' | 'rec-end' | 'rec-convert-start' | 'rec-convert-end' | 'rec-convert-error';

export default class BiliLiveRecorder extends EventEmitter<BiliRecorderEventTypes> {
    roomId: number;
    recordFilePath: string;

    recStatus: 0 | 1 | 2;
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

    constructor({ roomId, saveRecordFolder = '' }: BiliLiveRecorderOptions) {
        super();

        this.roomId = roomId;
        this.recordFilePath = path.join(saveRecordFolder, `${roomId}_${moment().format('YYYY-MM-DD_HH-mm-ss')}.flv`);

        this.recStatus = 0;
    }

    stop() {
        return {
            kill: async () => {
                if (!this.recCommand ||this.recCommand.ffmpegProc || !this.recCommand.ffmpegProc.stdin) return;
                this.recCommand.kill('SIGKILL');
                this.recCommand = null;
                this.recStatus = 0;

                return this;
            },
            force: async () => {
                if (!this.recCommand || !this.recCommand.ffmpegProc || !this.recCommand.ffmpegProc.stdin) return;
                const stdin = this.recCommand.ffmpegProc.stdin;
                await stdin.write('q');
                this.recCommand = null;
                this.recStatus = 0;

                return this;
            },
        }
    }

    async rec() {
        const outputFilePath = this.recordFilePath;
        
        if (fs.existsSync(outputFilePath)) {
            fs.unlinkSync(outputFilePath);
        }
        const streamUrl = await getLiveStreamUrl(this.roomId);
        
        const extname = path.extname(streamUrl); // 再次确认直播流文件格式

        this.recCommand = ffmpeg(streamUrl)
        .output(outputFilePath)
        .outputOptions('-c copy')
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
            this.recEndTime = new Date();
            this.recStatus = 0;

            this.emit('rec-end', {
                file_path: outputFilePath // flv 文件
            });

            // 转码 -> mp4
            if (extname !== '.mp4') {
                
                const mp4_file_path = outputFilePath.replace('.flv', '.mp4');
                this.recConvertCommmand = ffmpeg(outputFilePath);
                this.recConvertCommmand
                .output(mp4_file_path)
                .on('start', (commandLine) => {
                    this.emit('rec-convert-start', commandLine);
                })
                .on('end', () => {
                    this.emit('rec-convert-end', {
                        file_path: mp4_file_path,
                        output_file_path: outputFilePath
                    })
                    
                })
                .on('error', (err) => {
                    this.emit('rec-convert-error', err);
                    alertError(err, $t('TEXT_CODE_ef167dc9'));
                })

                this.recConvertCommmand.run();
            } else {
                this.emit('rec-convert-end', {
                    file_path: outputFilePath,
                    output_file_path: outputFilePath
                })
            }
            
        })
        .on('error', (err) => {
            this.emit('rec-error', err);

            alertError(err, $t('TEXT_CODE_4c7d3c19'));

            this.stop().kill();
            fs.unlink(outputFilePath, (err) => {});
            this.rec();
        });

        // 开始录制
        this.recCommand.run();

        return this;
    }
}