import { BiliLiveAutoRecorderOptions } from "index";
import BiliLiveMonitor from "./bilibili-live-monitor";
import BiliLiveRecorder from "./bilibili-live-recorder";
import { alertError } from "../core/error-alarms";
import { $t } from "../i18n";

export default class BiliLiveAutoRecorder {
    public monitor: BiliLiveMonitor;
    public recorder: BiliLiveRecorder;

    public autoRecord = false;
    
    constructor(options: BiliLiveAutoRecorderOptions) {
        this.monitor = new BiliLiveMonitor({ roomId: options.roomId });
        
        this.autoRecord = options.autoRecord;
        this.recorder = new BiliLiveRecorder({ roomId: options.roomId, saveRecordFolder: options.saveRecordFolder });

        this.monitor.startMonitor();
        this.installAutoRecordEventListener();
    }

    private installAutoRecordEventListener() {
        this.monitor.on('live-start', () => {
            try {
                if (this.autoRecord) this.recorder.rec();
            } catch (error) {
                alertError(error, $t('TEXT_CODE_2c6b0d0e'));
            }
        });
    }

    public removeAllEventListeners() {
        this.monitor.off('all');
        this.recorder.off('all');

        this.installAutoRecordEventListener();
    }
}