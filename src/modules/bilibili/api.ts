import { BiliLiveRoomInfo, BiliLiveRoomPlayInfo, BiliUserInfo, BiliVideoInfo } from "index";
import logger from "../../logger";
import { $t } from "../../i18n";
import { makeRequest, makeRequestRetry } from "../../lib/http";
import { cwd, store } from "../../lib/d";
import { getCSRF } from "../../tools";
import crypto from 'crypto'
import path from 'path'

import QRCode from 'qrcode';

function parseCookies(cookieStrings: string[]): string {
    return cookieStrings
        .map(cookie => {
        // 提取 key=value 部分
        const [keyValue] = cookie.split(';');
        return keyValue.trim();
        })
        .join('; '); // 用分号连接
}

export function login(type: 'qr' | 'password' | 'phone' = 'qr') {
    return new Promise<{ cookie: string, refresh_token: string }>(async (resolve, reject) => {
        let refreshTimes = 0;
        if (type === 'qr') {
            while (true) {
                refreshTimes += 1;
                if (refreshTimes > 3) {
                    logger.error($t('TEXT_CODE_96a95f0e'))
                    process.exit(0)
                }

                const resp1 = await makeRequest<{ code: number; message: string; data: { url: string, qrcode_key: string } }>({
                    url: 'https://passport.bilibili.com/x/passport-login/web/qrcode/generate'
                })
    
                if (resp1.data.code !== 0) throw resp1.data.message;
    
    
                const qrcode_url = resp1.data.data.url;
                const qrcode_key = resp1.data.data.qrcode_key;
    
                logger.info($t('TEXT_CODE_2ae69ecf'))
                console.log(await QRCode.toString(qrcode_url, { type: 'terminal', small: true }))
                QRCode.toFile(path.join(cwd, 'qrcode.png'), qrcode_url, { type: 'png' })
                logger.info('QRCode saved to',path.join(cwd, 'qrcode.png'))
    
                
                checkLogin: while (true) {
                    const resp = await makeRequest<{ code: number; message: string; data: { url: string, refresh_token: string, timestamp:number, code: 0 | 86038 | 86090 | 86101 } }>({
                        url: `https://passport.bilibili.com/x/passport-login/web/qrcode/poll?qrcode_key=${qrcode_key}`,
                    })
    
                    if (resp.data.code !== 0) throw resp.data.message;

                    switch (resp.data.data.code) {
                        case 0:
                            const { refresh_token } = resp.data.data;
                            let newCookie = '';
                            if (resp.headers['set-cookie'] && Array.isArray(resp.headers['set-cookie'])) {
                                newCookie = parseCookies(resp.headers['set-cookie']);
                            } else {
                                throw new Error('获取 set-cookie 失败')
                            }

                            resolve({
                                cookie: newCookie,
                                refresh_token
                            })

                            logger.info($t('TEXT_CODE_60e9444d'))
                            return
                        case 86038:
                            // 二维码过期
                            logger.info($t('TEXT_CODE_1729c82c'))
                            break checkLogin
                        case 86090:
                            logger.info($t('TEXT_CODE_e46c3bc5'))
                            break
                        case 86101:
                            logger.info($t('TEXT_CODE_a65b8001'))
                            break
                    }
                    await new Promise(resolve => setTimeout(resolve, 3000));
                }
            }
        }
    })
}

// Check And RefreshCookie
export function checkARefreshCookie() {
    return new Promise<{ cookie: string, refresh_token: string } | null>(async (resolve, reject) => {
        const cookie = store.bilibili_cookie
        const csrf = getCSRF(cookie)
        const resp = await makeRequest<{code: 0 | -101, message: string, data: { refresh: boolean, timestamp: number }}>({
            url: `https://passport.bilibili.com/x/passport-login/web/cookie/info?csrf=${csrf}`,
            headers: {
                cookie
            }
        })

        if (resp.data.code === -101 || resp.data.data.refresh) {
            logger.info($t('TEXT_CODE_ec1d5090'))
            // 需要刷新
            resolve(await refreshCookie({
                timestamp: resp.data.data.timestamp
            }))
        } else {
            logger.info($t('TEXT_CODE_911774c8'))
            resolve(null)
        }
    })
}

export function refreshCookie(options?: { timestamp?: number, refresh_token?: string } ) {
    return new Promise<{ cookie: string, refresh_token: string }>(async (resolve, reject) => {
        if (!options) options = {};
        if (!options.refresh_token) options.refresh_token = store.bilibili_refresh_token;
        if (!options.timestamp) options.timestamp = Date.now();
        
        const { timestamp, refresh_token } = options

        const cookie = store.bilibili_cookie
        const csrf = getCSRF(cookie)
        const publicKey = await crypto.subtle.importKey(
            "jwk",
            {
                kty: "RSA",
                n: "y4HdjgJHBlbaBN04VERG4qNBIFHP6a3GozCl75AihQloSWCXC5HDNgyinEnhaQ_4-gaMud_GF50elYXLlCToR9se9Z8z433U3KjM-3Yx7ptKkmQNAMggQwAVKgq3zYAoidNEWuxpkY_mAitTSRLnsJW-NCTa0bqBFF6Wm1MxgfE",
                e: "AQAB",
            },
            { name: "RSA-OAEP", hash: "SHA-256" },
            true,
            ["encrypt"],
        )
        
        async function getCorrespondPath(timestamp: number) {
            const data = new TextEncoder().encode(`refresh_${timestamp}`);
            const encrypted = new Uint8Array(await crypto.subtle.encrypt({ name: "RSA-OAEP" }, publicKey, data))
            return encrypted.reduce((str, c) => str + c.toString(16).padStart(2, "0"), "")
        }
        
        // const ts = Date.now()
        const correspondPath = await getCorrespondPath(timestamp)

        const resp = await makeRequest<string>({
            url: `https://www.bilibili.com/correspond/1/${correspondPath}`,
            headers: {
                cookie
            }
        })

        const html = resp.data

        const regex = /<div id="1-name">(.*?)<\/div>/;
        const match = html.match(regex);

        if (!match || !match[1]) {
            throw new Error("获取 refresh_csrf 失败");
        }

        const refresh_csrf = match[1]

        const resp2 = await makeRequest<{code: 0 | -101 | -111 | 86095 , message: string, data: { status: number, message: string, refresh_token: string} }>({
            url: `https://passport.bilibili.com/x/passport-login/web/cookie/refresh?csrf=${csrf}&refresh_csrf=${refresh_csrf}&source=main_web&refresh_token=${refresh_token}`,
            method: 'POST',
            headers: {
                cookie
            }
        })

        if (resp2.data.code === 0 && resp2.data.data.refresh_token) {
            const new_refresh_token = resp2.data.data.refresh_token
            let newCookie = '';
            if (resp2.headers['set-cookie'] && Array.isArray(resp2.headers['set-cookie'])) {
                newCookie = parseCookies(resp2.headers['set-cookie']);
            }
            
            logger.info($t('TEXT_CODE_e5ba7821'))
            resolve({
                cookie: newCookie,
                refresh_token: new_refresh_token
            })
        }

        // 失效旧的 refresh_token
        await makeRequest({
            url: `https://passport.bilibili.com/x/passport-login/web/confirm/refresh?csrf=${csrf}&refresh_token=${refresh_token}`,
            headers: {
                cookie
            }
        })
    })
}

export async function getLiveStreamUrl(roomId: string | number): Promise<string> {
    return new Promise(async (resolve, reject) => {
        const roomInfo = await getLiveRoomInfo(roomId);

        if (roomInfo.live_status !== 1) {
            reject(new Error('直播间未开播'));
        }

        const playUrl = `https://api.live.bilibili.com/room/v1/Room/playUrl?cid=${roomInfo.room_id}&qn=0&platform=web`;
        makeRequestRetry<{ code: number, data: BiliLiveRoomPlayInfo, message: string }>({ 
            url: playUrl, 
            headers: {
                Referer: 'https://live.bilibili.com/',
                Cookie: store.bilibili_cookie
            } 
        })
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
        makeRequestRetry<{ code: number, data: BiliLiveRoomInfo, message: string }>({ 
            url: roomInfoUrl, 
            headers: {
                Referer: 'https://live.bilibili.com/',
                Cookie: store.bilibili_cookie
            } 
        })
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

type getVideoInfoReturnSuccess =  {code: 0 , message: string, data: BiliVideoInfo}
type getVideoInfoReturnFail =  {code: -404 | 62002 | 62004 | 62012, message: string, data: null}
type getVideoInfoReturn = getVideoInfoReturnSuccess | getVideoInfoReturnFail
export async function getVideoInfo (bvid: string): Promise<getVideoInfoReturn> {
    return new Promise((resolve, reject) => {
        const roomInfoUrl = `https://api.bilibili.com/x/web-interface/wbi/view?bvid=${bvid}`;
        makeRequestRetry<getVideoInfoReturn>({ 
            url: roomInfoUrl, 
            headers: {
                Referer: 'https://live.bilibili.com/',
                Cookie: store.bilibili_cookie
            }
        })
        .then(resp => {
            if (resp.data.code !== 0) {
                throw resp.data;
            } else {
                resolve(resp.data);
            }
        })
        .catch(reject)
    })
}

export async function getUserInfo(mid: string | number): Promise<BiliUserInfo> {
    return new Promise((resolve, reject) => {
        // const userInfoUrl = `https://api.bilibili.com/x/space/acc/info?mid=${mid}`;
        const userInfoUrl = `https://api.bilibili.com/x/web-interface/card?mid=${mid}`;
        makeRequestRetry<{ code: number, data: BiliUserInfo, message: string }>({ url: userInfoUrl })
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

