import { BiliLiveMonitorOptions, BiliLiveRoomInfo, IBiliLiveMonitor } from "index";

import { EventEmitter } from "../core/events";
import { getLiveRoomInfo } from "./bilibili-api";

type BiliLiveMonitorEvents = 'data' | 'status-change' | 'live-start' | 'live-end' | 'live-slideshow' | 'error';

export default class BiliLiveMonitor extends EventEmitter<BiliLiveMonitorEvents> implements IBiliLiveMonitor  {
    roomId: number;
    pollInterval: null | NodeJS.Timeout = null;
    oldLiveStatus: null | number = null;
    roomInfoBefore: BiliLiveRoomInfo | null = null;
    roomInfo: BiliLiveRoomInfo | null = null;

    constructor(options: BiliLiveMonitorOptions) {
        super();

        this.roomId = options.roomId;
    }

    startMonitor() {
        const poll = () => {
            getLiveRoomInfo(this.roomId).then((roomInfo) => {
                if (roomInfo.live_status === 1 ) this.roomInfoBefore = roomInfo;
                this.roomInfo = roomInfo;
                this.emit('data', roomInfo);

                if (this.oldLiveStatus !== roomInfo.live_status) {
                    this.emit('status-change', roomInfo);

                    switch (roomInfo.live_status) {
                        case 0:
                            this.emit('live-end', roomInfo);
                            break;
                        case 1:
                            this.emit('live-start', roomInfo);
                            break;
                        case 2:
                            this.emit('live-end', roomInfo);
                            this.emit('live-slideshow', roomInfo);
                            break;
                        default:
                            break;
                    }

                }
                
                this.oldLiveStatus = roomInfo.live_status;
            }).catch((error) => this.emit('error', error));
        }

        this.pollInterval = setInterval(poll, 10 * 1000);
        poll();

        return this;
    }

    stopMonitor() {
        if (this.pollInterval) {
            clearInterval(this.pollInterval);
        }

        return this;
    }
}