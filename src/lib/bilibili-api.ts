import { BiliLiveRoomInfo, BiliLiveRoomPlayInfo, BiliUserInfo } from "index";
import request from 'request';
import logger from "../logger";
import { $t } from "../i18n";
import { makeRequest, makeRequestRetry } from "./http";

const quality_description = {
    1: '原画',
    2: '蓝光',
    3: '超清'
}

const map_quality_description = new Map(Object.entries(quality_description));

async function getLiveStreamUrl(roomId: string | number): Promise<string> {

    const roomInfo = await getLiveRoomInfo(roomId);

    if (roomInfo.live_status !== 1) {
        throw new Error('直播间未开播');
    }

    let streamUrl = null;

    const playUrl = `https://api.live.bilibili.com/room/v1/Room/playUrl?cid=${roomInfo.room_id}&qn=0&platform=web`;

    async function testStreamUrl(streamUrl: string) {
        const testRequest = request({
            method: 'GET',
            url: streamUrl,
            headers: {
                'Accept': '*/*',
                'User-Agent': 'Mozilla/5.0 BiliDroid/5.37.0 (bbcallen@gmail.com)'
            }
        })

        let statusCode = 0;
        await new Promise<void>((resolve, reject) => {
            testRequest.on('response', (response: any) => {
                statusCode = response.statusCode;
                resolve();
            })
            testRequest.on('error', reject)
        })

        testRequest.abort();
        return statusCode;
    }

    for (let i = 1; i <= 10; i++) {
        // 获取直播流地址
        const playUrlResponse = await makeRequestRetry<{ code: number, data: BiliLiveRoomPlayInfo, message: string }>({ url: playUrl });

        if (playUrlResponse.data.code !== 0) {
            throw new Error(playUrlResponse.data.message);
        }

        streamUrl = playUrlResponse.data.data.durl[0].url;
        
        const statusCode = await testStreamUrl(streamUrl);
        
        if (statusCode === 200) {
            logger.info($t('TEXT_CODE_f65433c5', { replace: { times: i } }));
            break;
        } else {
            streamUrl = null;
        }
    }

    if (!streamUrl) {
        const playUrlResponse = await makeRequestRetry<{ code: number, data: BiliLiveRoomPlayInfo, message: string }>({ url: playUrl });

        for (let item of playUrlResponse.data.data.durl) {
            if (await testStreamUrl(item.url) === 200) {
                logger.info($t('TEXT_CODE_cf9d449d', { replace: { quality: map_quality_description.get(item.order.toString()) || '未知' } }));
                streamUrl = item.url;
                break;
            }
        }

        logger.error(playUrlResponse.data);
        if (!streamUrl) throw new Error('获取可用直播流地址失败');
    }

    logger.info($t('TEXT_CODE_4f013ca3'));
    return streamUrl;
}

async function getLiveRoomInfo (roomId: string | number): Promise<BiliLiveRoomInfo> {
    const roomInfoUrl = `https://api.live.bilibili.com/room/v1/Room/get_info?room_id=${roomId}`;
    const roomInfoResponse = await makeRequestRetry<{ code: number, data: BiliLiveRoomInfo, message: string }>({ url: roomInfoUrl, timeout: 120000 });
    if (roomInfoResponse.data.code !== 0) {
        throw roomInfoResponse.data;
    } else {
        return roomInfoResponse.data.data;
    }
}

async function getUserInfo(mid: string | number): Promise<BiliUserInfo> {
    // const userInfoUrl = `https://api.bilibili.com/x/space/acc/info?mid=${mid}`;
    const userInfoUrl = `https://api.bilibili.com/x/web-interface/card?mid=${mid}`;
    const userInfoResponse = await makeRequestRetry<{ code: number, data: BiliUserInfo, message: string }>({ url: userInfoUrl, headers: {} });
    if (userInfoResponse.data.code !== 0) {
        throw userInfoResponse.data;
    } else {
        return userInfoResponse.data.data;
    }
}

export { getLiveStreamUrl, getLiveRoomInfo, getUserInfo };