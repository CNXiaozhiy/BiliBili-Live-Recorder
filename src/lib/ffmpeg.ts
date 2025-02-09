

export default class Ffmpeg {
    static ffmpegBinPath: string;
    static ffprobeBinPath: string;
    static flvtoolBinPath: string;

    static setFfmpegPath(ffmpegBinPath: string) {
        this.ffmpegBinPath = ffmpegBinPath;
    }
    static setFfprobePath(ffprobeBinPath: string) {
        this.ffprobeBinPath = ffprobeBinPath;
    }
    static setFlvtoolPath(flvtoolBinPath: string) {
        this.flvtoolBinPath = flvtoolBinPath;
    }

    constructor() {
    }
}