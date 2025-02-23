import { BiliVideoMonitorOptions, IBiliMonitor } from "index";

import { EventEmitter } from "../../core/events";
import { getVideoInfo } from "./api";
import logger from "../../logger";

type BiliVideoMonitorEvents = 'video-opening' | 'video-closing' | 'other-status';
/**
    0：成功
    -400：请求错误
    -403：权限不足
    -404：无视频
    62002：稿件不可见
    62004：稿件审核中
    62012：仅UP主自己可见
 */

export default class BiliVideoMonitor extends EventEmitter<BiliVideoMonitorEvents> implements IBiliMonitor  {
    bvid: string;
    oldStatus: number | null = null;
    pollInterval: null | NodeJS.Timeout = null;

    constructor(options: BiliVideoMonitorOptions) {
        super();

        this.bvid = options.bvid;
    }

    startMonitor() {
        const poll = () => {
            const uploadStats = (videoInfo: any) => {
                if (this.oldStatus !== videoInfo.code) {
                    if (videoInfo.code === 0) {
                        this.emit('video-opening', videoInfo);
                    } else {
                        this.emit('video-closing', videoInfo);
                    }
                    this.oldStatus = videoInfo.code;
                }
            }

            getVideoInfo(this.bvid)
            .then(uploadStats)
            .catch(uploadStats)
        }

        this.pollInterval = setInterval(poll, 60 * 1000);
        poll();

        return this;
    }

    stopMonitor() {
        if (this.pollInterval) {
            clearInterval(this.pollInterval);
        }

        return this;
    }

    destroy() {
        this.stopMonitor();
        this.off('all');
    }
}