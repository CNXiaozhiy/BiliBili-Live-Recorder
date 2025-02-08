// index.d.ts

declare module 'fluent-ffmpeg' {
    interface FfmpegCommand {
        ffmpegProc: any;
    }
}

type BiliLiveAutoRecorderOptions =  BiliLiveMonitorOptions & BiliLiveRecorderOptions & { autoRecord: boolean };

export interface BiliLiveRecorderOptions {
    roomId: number;
    saveRecordFolder: string;
}

export interface BiliLiveMonitorOptions {
    roomId: number;
}

export interface BiliUploaderOptions {
    file_path: string;
    cover_base64: string;

    video: {
        title: string;
        description: string;
        tid?: number;
        tag?: string;
    }
}

export interface IBiliLiveMonitor {
    startMonitor(roomId: number): void;
    stopMonitor(): void;
}

export interface BiliLiveRoomInfo {
    uid: number;
    room_id: number;
    short_id: number;
    attention: number;
    online: number;
    is_portrait: boolean;
    description: string;
    live_status: 0 | 1 | 2;
    area_id: number;
    parent_area_id: number;
    parent_area_name: string;
    old_area_id: number;
    background: string;
    title: string;
    user_cover: string;
    keyframe: string;
    is_strict_room: boolean;
    live_time: string;
    tags: string;
    is_anchor: number;
    room_silent_type: string;
    room_silent_level: number;
    room_silent_second: number;
    area_name: string;
    pendants: string;
    area_pendants: string;
    hot_words: string[];
    hot_words_status: number;
    verify: string;
    new_pendants: any;
    up_session: string;
    pk_status: number;
    pk_id: number;
    battle_id: number;
    allow_change_area_time: number;
    allow_upload_cover_time: number;
    studio_info: {
        status: number;
        master_list: any[];
    };
}

export interface BiliLiveRoomPlayInfo {
    current_quality: number;
    accept_quality: string[];
    current_qn: number;
    quality_description: {
        qn: number;
        desc: string;
    }[];
    durl: {
        url: string;
        length: number;
        order: number;
        stream_type: number;
        p2p_type: number;
    }[];
}

// SQLite

export interface DBSubscribeTableRow {
    room_id: number;
    group_id: number;
    user_id: number;
}

export type DBSubscribeTableRows = DBSubscribeTableRow[];