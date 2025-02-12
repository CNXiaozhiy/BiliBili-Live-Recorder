import { BiliLiveRoomInfo, BiliLiveRoomPlayInfo, BiliUserInfo } from "index";
import logger from "../logger";
import { $t } from "../i18n";
import { makeRequest, makeRequestRetry } from "./http";

export async function getLiveStreamUrl(roomId: string | number): Promise<string> {
    return new Promise(async (resolve, reject) => {
        const roomInfo = await getLiveRoomInfo(roomId);

        if (roomInfo.live_status !== 1) {
            reject(new Error('直播间未开播'));
        }

        const playUrl = `https://api.live.bilibili.com/room/v1/Room/playUrl?cid=${roomInfo.room_id}&qn=0&platform=web`;
        makeRequestRetry<{ code: number, data: BiliLiveRoomPlayInfo, message: string }>({ url: playUrl })
        .then(resp => {
            if (resp.data.code !== 0 || !resp.data.data.durl || resp.data.data.durl.length === 0) {
                reject(new Error(resp.data.message));
            }

            resolve(resp.data.data.durl[0].url);
        })
        .catch(reject);
    })
}

export async function getLiveRoomInfo (roomId: string | number): Promise<BiliLiveRoomInfo> {
    return new Promise((resolve, reject) => {
        const roomInfoUrl = `https://api.live.bilibili.com/room/v1/Room/get_info?room_id=${roomId}`;
        makeRequestRetry<{ code: number, data: BiliLiveRoomInfo, message: string }>({ url: roomInfoUrl, timeout: 120000 })
        .then(resp => {
            if (resp.data.code !== 0) {
                throw resp.data;
            } else {
                resolve(resp.data.data);
            }
        })
        .catch(reject)
    })
}

export async function getUserInfo(mid: string | number): Promise<BiliUserInfo> {
    return new Promise((resolve, reject) => {
        // const userInfoUrl = `https://api.bilibili.com/x/space/acc/info?mid=${mid}`;
        const userInfoUrl = `https://api.bilibili.com/x/web-interface/card?mid=${mid}`;
        makeRequestRetry<{ code: number, data: BiliUserInfo, message: string }>({ url: userInfoUrl, headers: {} })
        .then(resp => {
            if (resp.data.code !== 0) {
                throw resp.data;
            } else {
                resolve(resp.data.data);
            }
        })
        .catch(reject)
    })
}