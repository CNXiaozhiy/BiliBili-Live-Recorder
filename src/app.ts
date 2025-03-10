/**
 * XzBLR System
 * @version 1.0.3
 */

const version = "1.0.3";

console.log('\x1B[31m' + `    ____     _     __    _     __     _                  ____                                    __              
   / __ )   (_)   / /   (_)   / /    (_) _   __  ___    / __ \\  ___   _____  ____    _____  ____/ /  ___    _____
  / __  |  / /   / /   / /   / /    / / | | / / / _ \\  / /_/ / / _ \\ / ___/ / __ \\  / ___/ / __  /  / _ \\  / ___/
 / /_/ /  / /   / /   / /   / /___ / /  | |/ / /  __/ / _, _/ /  __// /__  / /_/ / / /    / /_/ /  /  __/ / /    
/_____/  /_/   /_/   /_/   /_____//_/   |___/  \\___/ /_/ |_|  \\___/ \\___/  \\____/ /_/     \\__,_/   \\___/ /_/     
` + '\x1B[0m');
console.log('\x1B[4m' + `XzBLR Version: ${version}` + '\x1B[0m');
console.log('\x1B[4m' + `Github: https://github.com/CNXiaozhiY/bilibili-live-recorder` + '\x1B[0m' + '\n');

import { colorize, getImageBase64FromUrl, matchCommand } from './tools';
import { statusToString } from './tools/format';
import moment from "moment";
import { subscribe, config, store, chat } from './lib/d';
import { DBSubscribeTableRows, DBQuickSubscribeTableRows, DBBotAdminTableRows } from "index";
import BiliLiveAutoRecorder from "./modules/bilibili/live-auto-recorder";
import BiliUploader from "./modules/bilibili/uploader";
import BiliVideoMonitor from "./modules/bilibili/video-monitor";
import FileCleaner from "./modules/system/live-recoder-file-cleaner";
import { checkARefreshCookie, getLiveRoomInfo, getUserInfo, login } from "./modules/bilibili/api";
import XzQBot from "./lib/xz-qbot";
import { alertError, setNotifyAdapter } from "./core/error-alarms";
import logger from "./logger";
import { $t } from "./i18n";
import path from 'path';
import fs from 'fs';
import readline from 'readline/promises';
import SparkLite from './modules/ai/Spark-Lite';

const db = subscribe;

let qbot: null | XzQBot = null;
if (config.bot && config.bot.ws_url) {
    qbot = new XzQBot(config.bot.ws_url);
}

const map_waitSend = new Map();
const map_ARecorders = new Map<number, BiliLiveAutoRecorder>();

const intercept_first: string[] = [];

function initSqlite() {
    return new Promise<void>((resolve) => {
        db.serialize(() => {
            db.run(`CREATE TABLE IF NOT EXISTS settings (
                name VARCHAR NOT NULL,
                value VARCHAR NOT NULL,
                PRIMARY KEY (name)
            );`);
            db.run(`INSERT OR IGNORE INTO settings (name, value) VALUES (?, ?)`, ['bilibili_cookie', store.bilibili_cookie]);
            db.run(`INSERT OR IGNORE INTO settings (name, value) VALUES (?, ?)`, ['bilibili_refresh_token', store.bilibili_refresh_token]);
            db.run(`CREATE TABLE IF NOT EXISTS subscribe (
                room_id INTEGER NOT NULL,
                group_id INTEGER NOT NULL,
                user_id INTEGER NOT NULL,
                PRIMARY KEY (room_id, group_id, user_id)
            );`);
            db.run(`CREATE TABLE IF NOT EXISTS quick_subscribe (
                group_id INTEGER NOT NULL,
                room_id INTEGER NOT NULL,
                PRIMARY KEY (group_id)
            );`);
            db.run(`CREATE TABLE IF NOT EXISTS bot_admin (
                user_id INTEGER NOT NULL,
                permission INTEGER NOT NULL,
                PRIMARY KEY (user_id)
            );`);
            config.bot.admin.forEach(admin => {
                db.run(`INSERT OR IGNORE INTO bot_admin (user_id, permission) VALUES (?, ?)`, [admin.qid, admin.permission]);
                db.run(`UPDATE bot_admin SET permission = ? WHERE user_id = ?`, [admin.permission, admin.qid]);
            })

            resolve()
        })
    })
}

function initStoreData() {
    return new Promise<void>(async (resolve) => {
        const askQuestion = (question: string) => {
            return new Promise<string>((resolve) => {
                const rl = readline.createInterface({
                    input: process.stdin,
                    output: process.stdout,
                });
                rl.question(question).then(answer => {
                    rl.close();
                    resolve(answer);
                })
            })
        }

        function toLogin() {
            return new Promise<{ cookie: string, refresh_token: string }>(async (resolve) => {
                const { cookie, refresh_token } = await login();
                uploadSettings('bilibili_cookie', cookie);
                uploadSettings('bilibili_refresh_token', refresh_token);
                resolve({ cookie, refresh_token })
            })
        }
        
        let rows = await tools.all<[{name: string, value: string}]>('SELECT * FROM settings')

        for (const row of rows) {
            row.value = (await tools.all<[{value: string}]>('SELECT value FROM settings WHERE name = ?', [row.name]))[0].value;

            switch (row.name) {
                case 'bilibili_cookie':
                    if (!row.value) {
                        const { cookie } = await toLogin()
                        row.value = cookie

                        // const answer = await askQuestion('[BLR Question]\t请输入 BiliBili Cookie:\n')
                        // if (!answer) {
                        //     logger.error('请输入正确的 BiliBili Cookie')
                        //     process.exit(1)
                        // }
                    }

                    store.bilibili_cookie = row.value
                    break;
                case 'bilibili_refresh_token':
                    if (!row.value) {
                        const { refresh_token } = await toLogin()
                        row.value = refresh_token

                        // const answer = await askQuestion('[BLR Question]\t请输入 BiliBili Refresh Token:\n')
                        // if (!answer) {
                        //     logger.error('请输入正确的 BiliBili Refresh Token')
                        //     process.exit(1)
                        // }
                    }
                    store.bilibili_refresh_token = row.value
                    break;
                default:
                    logger.warn('未知的配置项:', row.name)
                    break;
            }
        }

        resolve()
    })

    
}

function uploadSettings (name: keyof typeof store, value: string) {
    db.run(`UPDATE settings SET value = ? WHERE name = ?`, [value, name]);
    store[name] = value
}

const checkARefreshCookieInterval = 60 * 60000;
let checkARefreshCookieTimer: NodeJS.Timer | null = null;

function initACheck() {
    return new Promise<void>(async (resolve) => {
        // 更新Cookie
        const func = async () => {
            logger.info($t('TEXT_CODE_684405ad'))

            const checkResponse = await checkARefreshCookie()

            if (checkResponse) {
                uploadSettings('bilibili_cookie', checkResponse.cookie);
                uploadSettings('bilibili_refresh_token', checkResponse.refresh_token);
            }

        }
        checkARefreshCookieTimer = setInterval(func, checkARefreshCookieInterval);
        await func()

        resolve()
    })
}

const tools = {
    async all<T = DBSubscribeTableRows>(sql: string, params?: any): Promise<T> {
        return new Promise((resolve, reject) => {
            db.all(sql, params, (err: Error, rows: T) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(rows);
                }
            });
        });
    },
    async isAdmin(user_id: number): Promise<{isAdmin: boolean, permission: number}> {
        return new Promise((resolve, reject) => {
            this.all<DBBotAdminTableRows>('SELECT * FROM bot_admin WHERE user_id = ?', [user_id]).then(rows => {
                if (rows.length > 0) {
                    const permission = rows[0].permission
                    resolve({isAdmin: permission > 0, permission});
                } else {
                    resolve({isAdmin: false, permission: 0});
                }
            })
        });
    },
    async getQSRoomIDByGID(group_id: number): Promise<number> {
        return new Promise((resolve, reject) => {
            tools.all<DBQuickSubscribeTableRows>('SELECT * FROM quick_subscribe WHERE group_id = ?', [group_id.toString()]).then(
                rows => {
                    if (rows.length > 0) {
                        resolve(rows[0].room_id);
                    } else {
                        resolve(0);
                    }
                }
            ).catch(reject)
        })
    }
}

const app = async () => {

    const uploader = new BiliUploader(store.bilibili_cookie, 10 * 1024 * 1024);
    // const sparkAI  = new SparkLite({
    //     appid: '86b65cc2',
    //     secret: 'ZThiMjkxMGI4NmU3ZDkzMzNlYmYxM2I0',
    //     apikey: 'c573660d3030671f2aac4e8ecf2b7811'
    // }, chat)
    const sparkAI  = new SparkLite({
        apiPassword: 'PTWLgcLZGQOZIUXNcQXr:yIeFCboCZSIhrrnMGaPl'
    }, chat)

    if (qbot) {
        await qbot.waitConnect
        setNotifyAdapter(qbot)
    }

    logger.info($t('TEXT_CODE_7fb741ca'))

    // 机器人事件处理
    qbot?.on('message',  (data) => {
        if (data.post_type === 'message') {
            const qid = data.sender.user_id
            const message_id = data.message_id

            // AI
            if (data.message[0].type === 'at' && data.message[0].data.qq === data.self_id.toString()) {
                // 收到AT消息

                const allTextMessage = data.message
                .filter((item: { type: string; }) => item.type === 'text')
                .map((item: { data: { text: string; }; }) => item.data.text)
                .join('')

                sparkAI.sendMessage({ uid: qid.toString(), message: allTextMessage })
                .then(resp => {
                    if (data.message_type === 'group') {
                        qbot?.action('send_group_msg', { 
                            group_id: data.group_id, 
                            message: [
                                { type: 'reply', data: { id: data.message_id.toString() } },
                                { type: 'text', data: { text: resp } }
                            ]
                        })
                    } else if (data.message_type === 'private') {
                        qbot?.action('send_private_msg', { 
                            user_id: qid, 
                            message: [
                                { type: 'reply', data: { id: data.message_id.toString() } },
                                { type: 'text', data: { text: resp } }
                            ]
                        })
                    }

                })
            }
            if (data.message_type === 'group') {
                const gid = data.group_id
                

                function subscribe(room_id: number, group_id: number, user_id: number) {

                    tools.all('SELECT * FROM subscribe WHERE room_id = ? AND group_id = ? AND user_id = ?', [room_id, group_id, user_id]).then(rows => {
                        if (rows.length > 0) {
                            qbot?.action('send_group_msg', { 
                                group_id, 
                                message: [
                                    { type: 'reply', data: { id: message_id.toString() } },
                                    { type: 'text', data: { text: $t('TEXT_CODE_082b59bb') } }
                                ]
                            })
                            
                        } else {
                            db.run('INSERT INTO subscribe (room_id, group_id, user_id) VALUES (?, ?, ?)', [room_id, group_id, user_id]);

                            qbot?.action('send_group_msg', { 
                                group_id, 
                                message: [
                                    { type: 'reply', data: { id: message_id.toString() } },
                                    { type: 'text', data: { text: $t('TEXT_CODE_5611157e') } }
                                ]
                            })

                            refreshARecorders()
                        }
                    })

                }

                function unsubscribe(room_id: number, group_id: number, user_id: number) {

                    tools.all('SELECT * FROM subscribe WHERE room_id = ? AND group_id = ? AND user_id = ?', [room_id, group_id, user_id]).then(rows => {

                        if (rows.length > 0) {
                            db.run('DELETE FROM subscribe WHERE room_id = ? AND group_id = ? AND user_id = ?', [room_id, group_id, user_id]);

                            qbot?.action('send_group_msg', { 
                                group_id, 
                                message: [
                                    { type: 'reply', data: { id: message_id.toString() } },
                                    { type: 'text', data: { text: $t('TEXT_CODE_4766188f') } }
                                ]
                            })

                            refreshARecorders()
                        } else {
                            qbot?.action('send_group_msg', { group_id, 
                                message: [
                                    { type: 'reply', data: { id: message_id.toString() } },
                                    { type: 'text', data: { text: $t('TEXT_CODE_a541cd40') } }
                                ]
                            })
                        }

                    })
                }

                if (data.message[0].type === 'text') {
                    const command = data.message[0].data.text;

                    // 二级命令处理区
                    const level2Event = map_waitSend.get(`${gid}_${qid}`)
                    if (level2Event) {
                        if (command === 'q') {
                            qbot?.action('send_group_msg', { group_id: gid, 
                                message: [{ type: 'text', data: { text: $t('TEXT_CODE_3e57098e') } }]
                            })
    
                            map_waitSend.delete(`${gid}_${qid}`)
                            return
                        }
                        else if (level2Event === 'unsubscribe') {
                            
                            try {
                                if (data.message[0].data.text === '0') {
                                    db.run('DELETE FROM subscribe WHERE group_id = ? AND user_id = ?', [gid, qid]);
                                    qbot?.action('send_group_msg', {
                                        group_id: gid,
                                        message: [
                                            { type: 'reply', data: { id: message_id.toString() } },
                                            { type: 'text', data: { text: $t('TEXT_CODE_3f5d8200') } }
                                        ]
                                    })
        
                                    map_waitSend.delete(`${gid}_${qid}`)
                                    refreshARecorders()
                                    return
                                }

                                tools.all('SELECT * FROM subscribe WHERE group_id = ? AND user_id = ?', [gid, qid]).then((rows) => {
                                    const num = parseInt(data.message[0].data.text);
    
                                    if (num <= 0 || !rows[num - 1]) {
                                        throw new Error($t('TEXT_CODE_7f34883a'))
                                    }

                                    if (rows.length > 0) {
                                        const room_id = rows[num - 1].room_id;
                                        unsubscribe(room_id, gid, qid)
                                        map_waitSend.delete(`${gid}_${qid}`)
                                    }
                                })

                            } catch (error: any) {
                                error.message !== $t('TEXT_CODE_7f34883a') && alertError(error, $t('TEXT_CODE_0aef44bd'));
    
                                qbot?.action('send_group_msg', { 
                                    group_id: gid, 
                                    message: [
                                        { type: 'text', data: { text: $t('TEXT_CODE_8bbbb4a0') } }
                                    ]
                                })
                            }
    
                            return
                        }
                        else if (level2Event === 'subscribe') {
    
                            try {
                                // 快捷订阅
                                if (data.message[0].data.text === $t('TEXT_CODE_command.yes')) {
                                    tools.getQSRoomIDByGID(gid).then((room_id) => {
                                        if (room_id !== 0) {
                                            subscribe(room_id, gid, qid)
                                            map_waitSend.delete(`${gid}_${qid}`)
                                        } else {
                                            qbot?.action('send_group_msg', { 
                                                group_id: gid, 
                                                message: [
                                                    { type: 'text', data: { text: $t('TEXT_CODE_61a034b7') } }
                                                ]
                                            })
                                        }
                                    })
                                    return
                                }
    
                                const room_id = parseInt(data.message[0].data.text);
    
                                if (room_id <= 0) {
                                    throw new Error($t('TEXT_CODE_78e760ba'))
                                }
                                getLiveRoomInfo(room_id).then(roomInfo => {
                                    if (!roomInfo.uid) throw new Error($t('TEXT_CODE_78e760ba'))
    
                                    subscribe(room_id, gid, qid)
                                    map_waitSend.delete(`${gid}_${qid}`)
                                });
                                
    
                            } catch (error: any) {
                                error.message !== $t('TEXT_CODE_78e760ba') && alertError(error, $t('TEXT_CODE_da1deb89'))
    
                                qbot?.action('send_group_msg', { 
                                    group_id: gid, 
                                    message: [
                                        { type: 'text', data: { text: $t('TEXT_CODE_cf398d8b', { replace: { err: error.message } } ) } }
                                    ]
                                })
                            }
                            
                            return
                        }
                        else if (level2Event === 'stop-force-record') {

                            tools.all('SELECT * FROM subscribe WHERE group_id = ? AND user_id = ?', [gid, qid]).then((rows) => {
                                try {
                                    if (rows.length <= 0) {
                                        qbot?.action('send_group_msg', {
                                            group_id: gid,
                                            message: [
                                                { type: 'reply', data: { id: message_id.toString() } },
                                                { type: 'text', data: { text: $t('TEXT_CODE_b8fe8f2d') } }
                                            ]
                                        })
                                        
                                        map_waitSend.delete(`${gid}_${qid}`)
                                        return
                                    }
                                    if (data.message[0].data.text === '0') {
                                        rows.forEach(async row => {
                                            const aRecorder = map_ARecorders.get(row.room_id)
                                            if (!aRecorder) return
                                            if (aRecorder.recorder.recStatus === 1) {
                                                await aRecorder.recorder.stop().force();
                                            }
                                        })

                                        qbot?.action('send_group_msg', {
                                            group_id: gid,
                                            message: [
                                                { type: 'reply', data: { id: message_id.toString() } },
                                                { type: 'text', data: { text: $t('TEXT_CODE_2cf400c4') } }
                                            ]
                                        })

                                        map_waitSend.delete(`${gid}_${qid}`)
                                        return
                                    }

                                    const num = parseInt(data.message[0].data.text);

                                    if (num <= 0 || !rows[num - 1]) {
                                        throw new Error($t('TEXT_CODE_7f34883a'))
                                    }

                                    const room_id = rows[num - 1].room_id;
                                        
                                    const aRecorder = map_ARecorders.get(room_id);
                                    if (!aRecorder) return
                                    
                                    if (aRecorder.recorder.recStatus !== 1) {
                                        qbot?.action('send_group_msg', {
                                            group_id: gid,
                                            message: [
                                                { type: 'reply', data: { id: message_id.toString() } },
                                                { type: 'text', data: { text: $t('TEXT_CODE_50cad086') } }
                                            ]
                                        })
                                    } else {
                                        aRecorder.recorder.stop().force().then(() => {
                                            qbot?.action('send_group_msg', {
                                                group_id: gid,
                                                message: [
                                                    { type: 'reply', data: { id: message_id.toString() } },
                                                    { type: 'text', data: { text: $t('TEXT_CODE_2ebe69e5') } }
                                                ]
                                            })
        
                                            map_waitSend.delete(`${gid}_${qid}`)
                                        })
                                    }
                                } catch (error: any) {
                                    error.message !== $t('TEXT_CODE_7f34883a') && alertError(error, $t('TEXT_CODE_3291c3b3'));
        
                                    qbot?.action('send_group_msg', { 
                                        group_id: gid, 
                                        message: [
                                            { type: 'text', data: { text: $t('TEXT_CODE_7f34883a') } }
                                        ]
                                    })
                                }
                            })

                            return
                        }
                        else if (level2Event === 'start-record') {
                            
                            tools.all('SELECT * FROM subscribe WHERE group_id = ? AND user_id = ?', [gid, qid]).then((rows) => {
                                try {
                                    if (rows.length <= 0) {
                                        qbot?.action('send_group_msg', {
                                            group_id: gid,
                                            message: [
                                                { type: 'reply', data: { id: message_id.toString() } },
                                                { type: 'text', data: { text: $t('TEXT_CODE_b8fe8f2d') } }
                                            ]
                                        })
    
                                        map_waitSend.delete(`${gid}_${qid}`)
                                        return
                                    }
                                    if (data.message[0].data.text === '0') {
                                        rows.forEach(row => {
    
                                            const aRecorder = map_ARecorders.get(row.room_id)
                                            if (!aRecorder) return
                                            aRecorder.recorder.rec();
                                        })
    
                                        qbot?.action('send_group_msg', {
                                            group_id: gid,
                                            message: [
                                                { type: 'reply', data: { id: message_id.toString() } },
                                                { type: 'text', data: { text: $t('TEXT_CODE_8c845915') } }
                                            ]
                                        })
    
                                        map_waitSend.delete(`${gid}_${qid}`)
    
                                        return
                                    }
    
                                    const num = parseInt(data.message[0].data.text);
    
                                    if (num <= 0 || !rows[num - 1]) {
                                        throw new Error($t('TEXT_CODE_7f34883a'))
                                    }
    
                                    const room_id = rows[num - 1].room_id;
                                        
                                    const aRecorder = map_ARecorders.get(room_id)
                                    if (!aRecorder) return
    
                                    if (aRecorder.recorder.recStatus === 1) {
                                        qbot?.action('send_group_msg', {
                                            group_id: gid,
                                            message: [
                                                { type: 'reply', data: { id: message_id.toString() } },
                                                { type: 'text', data: { text: $t('TEXT_CODE_9ffe87c5') } }
                                            ]
                                        })
                                    } else {
    
                                        aRecorder.recorder.rec()
                                        qbot?.action('send_group_msg', {
                                            group_id: gid,
                                            message: [
                                                { type: 'reply', data: { id: message_id.toString() } },
                                                { type: 'text', data: { text: $t('TEXT_CODE_ba46b880') } }
                                            ]
                                        })
                                    }
                                    
    
                                    map_waitSend.delete(`${gid}_${qid}`)

                                } catch (error: any) {
                                    error.message !== $t('TEXT_CODE_7f34883a') && alertError(error, $t('TEXT_CODE_9307956f'));
        
                                    qbot?.action('send_group_msg', { 
                                        group_id: gid, 
                                        message: [
                                            { type: 'text', data: { text: $t('TEXT_CODE_7f34883a') } }
                                        ]
                                    })
                                }
                            })
                            return
                        }
                        else {
                            map_waitSend.delete(`${gid}_${qid}`)
                        }

                        return;
                    }

                    matchCommand (command, [$t('TEXT_CODE_command.help')], () => {
                        qbot?.action('send_group_msg', {
                            group_id: gid,
                            message: [
                                { type: 'reply', data: { id: message_id.toString() } },
                                { type: 'text', data: { text: $t('TEXT_CODE_c59b7cb2') } }
                            ]
                        })
                        return
                    })
                    matchCommand (command, [$t('TEXT_CODE_command.get_progress')], (result) => {
                        if ('id' in result) {
                            let listStr = '';
                            const list = uploader.getTask(parseInt(result.id))?.list;
                            list?.forEach(task => listStr += task + '\n');
                            qbot?.action('send_group_msg', {
                                group_id: gid,
                                message: [
                                    { type: 'reply', data: { id: message_id.toString() } },
                                    { type: 'text', data: { text: list ? listStr : $t('TEXT_CODE_c4ac6d3f') } }
                                ]
                            })
                        }
                    })
                    matchCommand (command, [$t('TEXT_CODE_command.reupload')], async (result) => {
                        if (!(await tools.isAdmin(qid)).isAdmin) {
                            qbot?.action('send_group_msg', {
                                group_id: gid,
                                message: [
                                    { type: 'reply', data: { id: message_id.toString() } },
                                    { type: 'text', data: { text: $t('TEXT_CODE_84eda865') } }
                                ]
                            })
                            return
                        }

                        if ('id' in result) {
                            const task = uploader.getTask(parseInt(result.id));
                            if (!task) {
                                qbot?.action('send_group_msg', {
                                    group_id: gid,
                                    message: [
                                        { type: 'reply', data: { id: message_id.toString() } },
                                        { type: 'text', data: { text: $t('TEXT_CODE_c4ac6d3f') } }
                                    ]
                                })
                                return
                            }
                            qbot?.action('send_group_msg', {
                                group_id: gid,
                                message: [
                                    { type: 'reply', data: { id: message_id.toString() } },
                                    { type: 'text', data: { text: $t('TEXT_CODE_48bc5b59') } }
                                ]
                            })
                            task.upload()
                            .then(resp => {
                                const message = [{ type: 'text', data: { text: $t('TEXT_CODE_75fe8a3e', { replace: {
                                    bvid: resp.bvid
                                }}) } }]
                                qbot?.action('send_group_msg', qbot?.action('send_group_msg', { 
                                    group_id: gid, 
                                    message
                                }))
                            })
                            .catch(e => {
                                qbot?.action('send_group_msg', {
                                    group_id: gid,
                                    message: [
                                        { type: 'reply', data: { id: message_id.toString() } },
                                        { type: 'text', data: { text: `Error -> ${e}` } }
                                    ]
                                })
                            })
                        }
                    })
                    matchCommand (command, [$t('TEXT_CODE_command.recover')], async (result) => {
                        if (!(await tools.isAdmin(qid)).isAdmin) {
                            qbot?.action('send_group_msg', {
                                group_id: gid,
                                message: [
                                    { type: 'reply', data: { id: message_id.toString() } },
                                    { type: 'text', data: { text: $t('TEXT_CODE_84eda865') } }
                                ]
                            })
                            return
                        }

                        if ('file' in result) {
                            const recover_file = path.join(config.RECORD_FOLDER_PATH, result.file);
                            if (!fs.existsSync(recover_file)) { 
                                qbot?.action('send_group_msg', {
                                    group_id: gid,
                                    message: [
                                        { type: 'reply', data: { id: message_id.toString() } },
                                        { type: 'text', data: { text: $t('TEXT_CODE_5b3036d4') } }
                                    ]
                                })
                                return
                            }
                            
                            qbot?.action('send_group_msg', {
                                group_id: gid,
                                message: [
                                    { type: 'reply', data: { id: message_id.toString() } },
                                    { type: 'text', data: { text: $t('TEXT_CODE_6d7f5abd') } }
                                ]
                            })

                            let json;
                            try {
                                json = JSON.parse(fs.readFileSync(recover_file, 'utf-8'));
                            } catch (e) {
                                qbot?.action('send_group_msg', {
                                    group_id: gid,
                                    message: [
                                        { type: 'reply', data: { id: message_id.toString() } },
                                        { type: 'text', data: { text: $t('TEXT_CODE_705c4b45') } }
                                    ]
                                })
                                return
                            }

                            uploader.createTask(json.uploader.params).then(task => {
                                qbot?.action('send_group_msg', {
                                    group_id: gid,
                                    message: [
                                        { type: 'reply', data: { id: message_id.toString() } },
                                        { type: 'text', data: { text: $t('TEXT_CODE_8e44f1b0', { replace: { id: task.id } } ) } }
                                    ]
                                })

                                task.upload()
                                .then(resp => {
                                    const message = [{ type: 'text', data: { text: $t('TEXT_CODE_75fe8a3e', { replace: {
                                        bvid: resp.bvid
                                    }}) } }]
                                    qbot?.action('send_group_msg', { 
                                        group_id: gid, 
                                        message
                                    })
                                })
                                .catch(e => {
                                    qbot?.action('send_group_msg', {
                                        group_id: gid,
                                        message: [
                                            { type: 'reply', data: { id: message_id.toString() } },
                                            { type: 'text', data: { text: `Error -> ${e}` } }
                                        ]
                                    })
                                })
                            })
                                
                        }
                    })
                    matchCommand (command, [$t('TEXT_CODE_command.get_recover_list')], () => {
                        const fc = new FileCleaner(config.RECORD_FOLDER_PATH);
                        fc.scan().then(result => {
                            let str = '';
                            if (result.unrecoveredFiles.length > 0) {
                                str = result.unrecoveredFiles.map(item => {
                                    return `${item}`
                                }).join('\n');

                                str += '\n\n'
                            }
                            
                            str += '未恢复文件数量: ' + result.unrecoveredFiles.length

                            qbot?.action('send_group_msg', {
                                group_id: gid,
                                message: [{ type: 'text', data: { text: str } }]
                            })
                        })
                    })
                    matchCommand (command, [$t('TEXT_CODE_command.clean_files')], async () => {
                        if (!(await tools.isAdmin(qid)).isAdmin) {
                            qbot?.action('send_group_msg', {
                                group_id: gid,
                                message: [
                                    { type: 'reply', data: { id: message_id.toString() } },
                                    { type: 'text', data: { text: $t('TEXT_CODE_84eda865') } }
                                ]
                            })
                            return
                        }

                        const fc = new FileCleaner(config.RECORD_FOLDER_PATH);
                        fc.clean().then(result => {
                            
                            qbot?.action('send_group_msg', {
                                group_id: gid,
                                message: [{ type: 'text', data: { text: 
                                    `文件清理完成✅\n\n`
                                    + '统计信息 已清理\n'
                                    + '损坏文件: ' + result.statisticalInformation.damagedFiles + '\n'
                                    + '异常遗留文件: ' + result.statisticalInformation.exceptionallyLeftFiles + '\n'
                                    + '总清理文件数: ' + (result.statisticalInformation.damagedFiles + result.statisticalInformation.exceptionallyLeftFiles)
                                    + '\n\n'
                                    + '未恢复的文件数量: ' + result.statisticalInformation.unrecoveredFiles
                                    + '\n\nTips: 部分为正在录制的文件，无法被清理奥😁'
                                } }]
                            })
                        })
                    })
                    matchCommand (command, [$t('TEXT_CODE_command.add_quick_subscribe')], (result) => {
                        if ('id' in result) {
                            tools.isAdmin(qid).then( async res => {
                                if (res.isAdmin) {
                                    const room_id = parseInt(result.id);
                                    const room_info = await getLiveRoomInfo(room_id)
                                    const user_info = await getUserInfo(room_info.uid);
                                    tools.all('SELECT * FROM quick_subscribe WHERE group_id = ?', [gid]).then(rows => {
                                        if (rows.length <= 0) {
                                            db.run('INSERT INTO quick_subscribe (group_id, room_id) VALUES (?, ?)', [gid, room_id]);
                                        } else {
                                            db.run('UPDATE quick_subscribe SET room_id = ? WHERE group_id = ?', [room_id, gid]);
                                        }
                                    })
                                    qbot?.action('send_group_msg', {
                                        group_id: gid,
                                        message: [
                                            { type: 'reply', data: { id: message_id.toString() } },
                                            { type: 'image', data: {
                                                url: user_info.card.face
                                            }},
                                            { type: 'text', data: { text:
                                                'UP主信息 👀预览\n\n'
                                                + `💫 昵称：${user_info.card.name}\n`
                                                + `🌟 粉丝数：${user_info.card.fans}\n`
                                                + `🖋️ 个性签名：\n${user_info.card.sign}\n`
                                                + `🔗 用户链接：https://space.bilibili.com/${user_info.card.mid}\n`
                                                + `🔗 直播间链接：https://live.bilibili.com/${room_id}\n\n`
                                                + '已成功为本群开通快速订阅 🎉🎉🎉'
                                            }}
                                        ]
                                    })
                                } else {
                                    qbot?.action('send_group_msg', {
                                        group_id: gid,
                                        message: [
                                            { type: 'reply', data: { id: message_id.toString() } },
                                            { type: 'text', data: { text: $t('TEXT_CODE_84eda865') } }
                                        ]
                                    })
                                    return
                                }
                            })
                        }
                    })
                    matchCommand (command, [$t('TEXT_CODE_command.add_admin'), $t('TEXT_CODE_command.add_admin_2')], (result) => {
                        if ('id' in result) {
                            const user_id = parseInt(result.id);
                            tools.isAdmin(qid).then(res => {
                                if (res.isAdmin && res.permission >= 10) {
                                    tools.all('SELECT * FROM bot_admin WHERE user_id = ?', [user_id]).then(rows => {
                                        if (rows.length <= 0) {
                                            const permission = 'permission' in result ? parseInt(result.permission) : 1;
                                            if (permission >= res.permission) {
                                                qbot?.action('send_group_msg', {
                                                    group_id: gid,
                                                    message: [
                                                        { type: 'reply', data: { id: message_id.toString() } },
                                                        { type: 'text', data: { text: $t('TEXT_CODE_d22f6d6a') } }
                                                    ]
                                                });
                                                return;
                                            }
                                            db.run('INSERT INTO bot_admin (user_id, permission) VALUES (?, ?)', [user_id, permission]);

                                            qbot?.action('send_group_msg', {
                                                group_id: gid,
                                                message: [
                                                    { type: 'reply', data: { id: message_id.toString() } },
                                                    { type: 'text', data: { text: $t('TEXT_CODE_0552154f') } }
                                                ]
                                            });
                                        } else {
                                            qbot?.action('send_group_msg', {
                                                group_id: gid,
                                                message: [
                                                    { type: 'reply', data: { id: message_id.toString() } },
                                                    { type: 'text', data: { text: $t('TEXT_CODE_846114b8') } }  
                                                ]
                                            })
                                            return
                                        }
                                    })
                                } else {
                                    qbot?.action('send_group_msg', {
                                        group_id: gid,
                                        message: [
                                            { type: 'reply', data: { id: message_id.toString() } },
                                            { type: 'text', data: { text: res.isAdmin ? $t('TEXT_CODE_e01af5e0') : $t('TEXT_CODE_84eda865') } }
                                        ]
                                    })
                                    return
                                }
                            })
                        }
                    })
                    matchCommand (command, [$t('TEXT_CODE_command.remove_admin')], (result) => {
                        if ('id' in result) {
                            const user_id = parseInt(result.id);
                            tools.isAdmin(qid).then(async res => {
                                if (res.isAdmin && res.permission >= 10) {
                                    const user_admin = await tools.isAdmin(user_id);
                                    if (!user_admin.isAdmin || user_admin.permission >= res.permission) {
                                        qbot?.action('send_group_msg', {
                                            group_id: gid,
                                            message: [
                                                { type: 'reply', data: { id: message_id.toString() } },
                                                { type: 'text', data: { text: user_admin.permission >= res.permission ? $t('TEXT_CODE_d22f6d6a') : $t('TEXT_CODE_662f897e') } }
                                            ]
                                        });
                                        return
                                    }
                                    tools.all('SELECT * FROM bot_admin WHERE user_id = ?', [user_id]).then(rows => {
                                        if (rows.length > 0) {
                                            db.run('DELETE FROM bot_admin WHERE user_id = ?', [user_id]);
                                            qbot?.action('send_group_msg', {
                                                group_id: gid,
                                                message: [
                                                    { type: 'reply', data: { id: message_id.toString() } },
                                                    { type: 'text', data: { text: $t('TEXT_CODE_c4c7946e') } }
                                                ]
                                            });
                                        } else {
                                            qbot?.action('send_group_msg', {
                                                group_id: gid,
                                                message: [
                                                    { type: 'reply', data: { id: message_id.toString() } },
                                                    { type: 'text', data: { text: $t('TEXT_CODE_662f897e') } }
                                                ]
                                            });
                                        }
                                    })
                                }
                            })
                        }
                    })
                    matchCommand (command, [$t('TEXT_CODE_command.about')], () => {
                        qbot?.action('send_group_msg', {
                            group_id: gid,
                            message: [
                                { type: 'reply', data: { id: message_id.toString() } },
                                { type: 'text', data: { text: $t('TEXT_CODE_5ed094b8', { replace: {
                                    version
                                }}) } }
                            ]
                        })
                        return
                    })
                    matchCommand (command, [$t('TEXT_CODE_command.subscribe')], () => {
                        tools.getQSRoomIDByGID(gid).then(async room_id => {
                            if (room_id) {
                                const room_info = await getLiveRoomInfo(room_id);
                                const up_info = await getUserInfo(room_info.uid);
                                const text = room_id ? $t('TEXT_CODE_09460d60', { replace: { name: up_info.card.name || '未知', id: room_id} }) : $t('TEXT_CODE_61a034b7');
                                qbot?.action('send_group_msg', { group_id: gid, 
                                    message: [
                                        { type: 'text', data: { text } }
                                    ]
                                })
                            }

                            map_waitSend.set(`${gid}_${qid}`, 'subscribe')
                            return
                        })
                    })
                    matchCommand (command, [$t('TEXT_CODE_command.unsubscribe')], () => {
        
                        tools.all('SELECT * FROM subscribe WHERE group_id = ? AND user_id = ?', [gid, qid]).then((rows) => {
                            if (rows.length > 0) {
                                map_waitSend.set(`${gid}_${qid}`, 'unsubscribe')
    
                                const rooms = rows.map(row => row.room_id)
                                let i = 0;
                                const message = [
                                    { type: 'reply', data: { id: message_id.toString() } },
                                    { type: 'text', data: { text: $t('TEXT_CODE_77f48086') + '\n\n' } },
                                    { type: 'text', data: { text: '0. ' + $t('TEXT_CODE_a517f96b') + '\n' } }
                                ]
                                message.push(...rooms.map(room_id => {
                                    i++;
                                    return {
                                        type: 'text',
                                        data: {
                                            text: `${i}. ${room_id}\n`
                                        }
                                    }
                                }))
    
                                message.push({ type: 'text', data: { text: 'q. ' + $t('TEXT_CODE_8ed4f929') } })
    
                                qbot?.action('send_group_msg', { group_id: gid, message })
                            } else {
                                qbot?.action('send_group_msg', { 
                                    group_id: gid, 
                                    message: [
                                        { type: 'reply', data: { id: message_id.toString() } },
                                        { type: 'text', data: { text: $t('TEXT_CODE_a541cd40') } }
                                    ]
                                })
    
                            }
                        })
                        
                        return
                    })
                    matchCommand (command, [$t('TEXT_CODE_command.live_room')], () => {
                        tools.all('SELECT * FROM subscribe WHERE group_id = ? AND user_id = ?', [gid, qid]).then(async (rows) => {
                            if (rows.length > 0) {
                                const message: any = [
                                    { type: 'reply', data: { id: message_id.toString() } },
                                    { type: 'text', data: { text: `${$t('TEXT_CODE_64555daa')}\n\n` } }
                                ]
    
                                for (let i = 0; i < rows.length; i++) {
                                    const room_id = rows[i].room_id
                                    const room_info = await getLiveRoomInfo(room_id)
    
                                    const aRecoder = map_ARecorders.get(room_id)
                                    if (!aRecoder) continue
    
                                    const recorder = aRecoder.recorder;
    
                                    message.push(...[{ type: 'image', data: { url: room_info.user_cover }
                                        },{
                                            type: 'text',
                                            data: {
                                                text: $t('TEXT_CODE_1bccf05b', { replace: {
                                                    title: room_info.title,
                                                    liveStatus: statusToString('liveStatus', room_info.live_status),
                                                    recStatus: statusToString('recStatus', recorder.recStatus),
                                                    description: room_info.description || '无',
                                                    online: room_info.online,
                                                    liveTime: room_info.live_time,
                                                    id: room_info.room_id,
                                                    url: `https://live.bilibili.com/${room_info.room_id}`
                                                } }) + '\n\n'
                                            }
                                        }
                                    ])
                                }
    
                                qbot?.action('send_group_msg', { group_id: gid, message })
                            } else {
                                qbot?.action('send_group_msg', { 
                                    group_id: gid, 
                                    message: [
                                        { type: 'reply', data: { id: message_id.toString() } },
                                        { type: 'text', data: { text: $t('TEXT_CODE_a541cd40') } }
                                    ]
                                })
                            }
                        })
                        return
                    })
                    matchCommand (command, [$t('TEXT_CODE_command.rec_status')], () => {
                        tools.all('SELECT * FROM subscribe WHERE group_id = ? AND user_id = ?', [gid, qid]).then((rows) => {
                            if (rows.length > 0) {
                                // 获取recorder
                               
                                const message = [
                                    { type: 'reply', data: { id: message_id.toString() } },
                                    { type: 'text', data: { text: $t('TEXT_CODE_ca6361c4') + '\n\n' } }
                                ]
    
                                for (let i = 0; i < rows.length; i++) {
                                    const aRecorder = map_ARecorders.get(rows[i].room_id)
                                    if (!aRecorder) continue
    
                                    const recorder = aRecorder.recorder
    
                                    if (recorder.recStatus !== 1) {
                                        message.push({ type: 'text',
                                            data: {
                                                text: $t('TEXT_CODE_670a5281',{ replace: { 
                                                    id: rows[i].room_id, 
                                                    recStatus: statusToString('recStatus', recorder.recStatus)
                                                } }) + '\n\n'
                                            }
                                        })
                                        continue
                                    } else {
                                        message.push({ type: 'text',
                                            data: {
                                                text: $t('TEXT_CODE_16fc8c6f',{ replace: { 
                                                    id: rows[i].room_id,
                                                    index: recorder.segmentFiles.length,
                                                    recStatus: statusToString('recStatus', recorder.recStatus),
                                                    timemark: recorder.recProgress?.timemark || '未知',
                                                    fps: recorder.recProgress?.currentFps || '未知'
                                                } }) + '\n\n'
                                            }
                                        })
                                    }
                                }
    
                                message.push({ type: 'text', data: { text: `XzQBot` } })
                                qbot?.action('send_group_msg', { group_id: gid, message })
                                
                            } else {
                                qbot?.action('send_group_msg', { 
                                    group_id: gid, 
                                    message: [
                                        { type: 'reply', data: { id: message_id.toString() } },
                                        { type: 'text', data: { text: $t('TEXT_CODE_a541cd40') } }
                                    ]
                                })
                            }
                        })
                    })
                    matchCommand (command, [$t('TEXT_CODE_command.rec_start')], async () => {
                        if (!(await tools.isAdmin(qid)).isAdmin) {
                            qbot?.action('send_group_msg', {
                                group_id: gid,
                                message: [
                                    { type: 'reply', data: { id: message_id.toString() } },
                                    { type: 'text', data: { text: $t('TEXT_CODE_84eda865') } }
                                ]
                            })
                            return
                        }
                        
                        tools.all('SELECT * FROM subscribe WHERE group_id = ? AND user_id = ?', [gid, qid]).then((rows) => {
                            if (rows.length > 0) {
                                map_waitSend.set(`${gid}_${qid}`, 'start-record')
    
                                const rooms = rows.map(row => row.room_id)
                                let i = 0;
                                const message = [
                                    { type: 'reply', data: { id: message_id.toString() } },
                                    { type: 'text', data: { text: $t('TEXT_CODE_9ad02e0d') + '\n\n' } },
                                    { type: 'text', data: { text: '0. ' + $t('TEXT_CODE_58516b67') + '\n' } }
                                ]
                                message.push(...rooms.map(room_id => {
                                    i++;
                                    return {
                                        type: 'text',
                                        data: {
                                            text: `${i}. ${room_id}\n`
                                        }
                                    }
                                }))
    
                                message.push({ type: 'text', data: { text: 'q. ' + $t('TEXT_CODE_8ed4f929') } })
    
                                qbot?.action('send_group_msg', { group_id: gid, message })
                            } else {
                                qbot?.action('send_group_msg', { 
                                    group_id: gid, 
                                    message: [
                                        { type: 'reply', data: { id: message_id.toString() } },
                                        { type: 'text', data: { text: $t('TEXT_CODE_a541cd40') } }
                                    ]
                                })
    
                            }
                        })
                        
                        return
                    })
                    matchCommand (command, [$t('TEXT_CODE_command.rec_stop_1'), $t('TEXT_CODE_command.rec_stop_2')], async () => {
                        if (!(await tools.isAdmin(qid)).isAdmin) {
                            qbot?.action('send_group_msg', {
                                group_id: gid,
                                message: [
                                    { type: 'reply', data: { id: message_id.toString() } },
                                    { type: 'text', data: { text: $t('TEXT_CODE_84eda865') } }
                                ]
                            })
                            return
                        }

                        tools.all('SELECT * FROM subscribe WHERE group_id = ? AND user_id = ?', [gid, qid]).then((rows) => {
                            if (rows.length > 0) {
                                map_waitSend.set(`${gid}_${qid}`, 'stop-force-record')
    
                                const rooms = rows.map(row => row.room_id)
                                let i = 0;
                                const message = [
                                    { type: 'reply', data: { id: message_id.toString() } },
                                    { type: 'text', data: { text: $t('TEXT_CODE_3007f844') + '\n\n' } },
                                    { type: 'text', data: { text: '0. ' + $t('TEXT_CODE_6b875d46') + '\n' } }
                                ]
                                message.push(...rooms.map(room_id => {
                                    i++;
                                    return {
                                        type: 'text',
                                        data: {
                                            text: `${i}. ${room_id}\n`
                                        }
                                    }
                                }))
    
                                message.push({ type: 'text', data: { text: 'q. ' + $t('TEXT_CODE_8ed4f929') } })
    
                                qbot?.action('send_group_msg', { group_id: gid, message })
                            } else {
                                qbot?.action('send_group_msg', { 
                                    group_id: gid, 
                                    message: [
                                        { type: 'reply', data: { id: message_id.toString() } },
                                        { type: 'text', data: { text: $t('TEXT_CODE_a541cd40') } }
                                    ]
                                })
    
                            }
                        })
                        
                        return
                    })
                    matchCommand (command, ['debug.exit'], () => {
                        return
                        process.exit(0)
                    })
                }
            }
        }
    })

    // 刷新 BLR AutoRecorder
    function refreshARecorders() {
        tools.all('SELECT * FROM subscribe').then((rows) => {

            if (rows.length === 0 && !qbot) {
                logger.warn($t('TEXT_CODE_3199beaa'));
            }

            const map_room = new Map();

            // 释放无订阅的房间
            map_ARecorders.forEach((aRecorder: BiliLiveAutoRecorder, room_id: number) => {
                if (!rows.find(row => row.room_id === room_id)) {
                    logger.info($t('TEXT_CODE_19d6f339', { replace: { code: colorize('yellow', room_id.toString()) } }));
                    aRecorder.destroy();
                    map_ARecorders.delete(room_id);
                }
            })

            rows.forEach(row => {
                !Array.isArray(map_room.get(row.room_id)) && map_room.set(row.room_id, []);
                map_room.get(row.room_id).push({
                    group_id: row.group_id,
                    user_id: row.user_id
                });
            })
    
            // 为所有房间安装
            map_room.forEach((room_subs: {group_id: number, user_id: number}[], room_id: number) => {
                let aRecorder = map_ARecorders.get(room_id);
                if (aRecorder) {
                    // aRecorder.monitor.off('all') // 清空事件
                    // aRecorder.recorder.off('all') // 清空事件

                    // 至于为什么不使用上面的方法, 因为会导致自动录制的事件监听器也被清空
                    aRecorder.removeAllEventListeners();
                } else {
                    logger.info($t('TEXT_CODE_0fe45b42', { replace: { code: colorize('yellow', room_id.toString()) } }));
                    aRecorder = new BiliLiveAutoRecorder({
                        roomId: room_id,
                        autoRecord: true, // 自动录制
                        saveRecordFolder: config.RECORD_FOLDER_PATH
                    });
                }

                aRecorder.monitor.on('status-change', (info) => {
                    logger.info($t('TEXT_CODE_5b289dd8', { replace: { roomId: colorize('blue', room_id.toString()), status: statusToString('liveStatus', info.live_status) } }));
                })
    
                const map_groupSend = new Map();

                room_subs.forEach(user => {
                    !Array.isArray(map_groupSend.get(user.group_id)) && map_groupSend.set(user.group_id, []);
                    map_groupSend.get(user.group_id).push(user.user_id);
                })

                aRecorder.recorder.on('rec-start', (room_info) => {
                    logger.info($t('TEXT_CODE_d3da5e2d'), room_id);
                })

                aRecorder.recorder.on('rec-error', (err) => {
                    map_groupSend.forEach(async (user_ids, group_id) => {

                        const message = [{ type: 'text', data: { text: $t('TEXT_CODE_3ec89037', {replace: 
                            { 
                                id: room_id,
                                err: err.message || `${err}`,
                                retry: aRecorder.recorder.errRetryTimes,
                                maxRetry: aRecorder.recorder.MAX_ERR_RETRY_TIMES
                            } 
                        }) } }]

                        qbot?.action('send_group_msg', { group_id, message })
                    })
                })

                aRecorder.recorder.on('rec-warn', (err) => {
                    logger.warn(err);
                })

                aRecorder.recorder.on('rec-end', (file) => {
                    map_groupSend.forEach(async (user_ids, group_id) => {

                        const message = [{ type: 'text', data: { text: $t('TEXT_CODE_fcd1f98f', {replace: { id: room_id, status: statusToString('transcodeMP4Status', aRecorder.recorder.transcodeMP4 ? 1 : 0) } }) } }]
                        qbot?.action('send_group_msg', { group_id, message })
                    })
                })

                aRecorder.recorder.on('rec-transcode-start', () => {
                    logger.info($t('TEXT_CODE_11aaea4d'), room_id);
                })

                aRecorder.recorder.on('rec-transcode-end', (files) => {
                    logger.info($t('TEXT_CODE_52c48763'), room_id, files);
                    map_groupSend.forEach(async (user_ids, group_id) => {

                        const message = [{ type: 'text', data: { text: $t('TEXT_CODE_9753a930', {replace: { id: room_id } }) } }]
                        qbot?.action('send_group_msg', { group_id, message })
                    })
                })

                // aRecorder.recorder.on('rec-transcode-skip', () => {})

                aRecorder.recorder.on('rec-all-end', async (file) => {

                    const room_info = aRecorder.monitor.roomInfoBefore; // 下播前的直播间信息
                    
                    if (!room_info) throw new Error('下播前的直播间信息不存在');
                    if (!aRecorder.recorder.recStartTime) throw new Error('直播录制开始时间不存在');
                    if (!aRecorder.recorder.recEndTime) throw new Error('直播录制结束时间不存在');

                    const cover_base64 = await getImageBase64FromUrl(room_info.user_cover);

                    const format_time_start = moment(aRecorder.recorder.recStartTime).format('yyyy-MM-DD HH:mm:ss');
                    const format_time_end = moment(aRecorder.recorder.recEndTime).format('yyyy-MM-DD HH:mm:ss');

                    const user_info = await getUserInfo(room_info.uid);

                    const params = {
                        file_path: file.file_path,
                        cover_base64,
                        video: {
                            title: $t('TEXT_CODE_cf485316', { replace: {
                                name: user_info.card.name,
                                title: room_info.title,
                                startTime: room_info.live_time || format_time_start,
                                endTime: format_time_end
                            }}) ,
                            description: $t('TEXT_CODE_560f94fc', { replace: {
                                id: room_info.room_id,
                                description: room_info.description || '无',
                                title: room_info.title,
                                liveTime: room_info.live_time,
                                startTime: format_time_start,
                                endTime: format_time_end
                            }}),
                        }
                    }

                    const recover_folder = path.join(config.RECORD_FOLDER_PATH, 'recovery');
                    try {
                        fs.mkdirSync(recover_folder, { recursive: true });
                    } catch (error) {
                        logger.error(error);
                    }

                    uploader.createTask(params).then(({ id, upload }) => {
                        map_groupSend.forEach(async (user_ids, group_id) => {

                            const message = [{ type: 'text', data: { text: $t('TEXT_CODE_7ff48a7e', {replace: { id: room_id, taskID: id } }) } }]
                            qbot?.action('send_group_msg', { group_id, message })
                        })

                        upload()
                        .then((res) => {
                            
                            map_groupSend.forEach(async (user_ids, group_id) => {

                                const message = [{ type: 'text', data: { text: $t('TEXT_CODE_75fe8a3e', { replace: {
                                    id: room_id,
                                    bvid: res.bvid
                                }}) } }]
                                qbot?.action('send_group_msg', { group_id, message })
                            })

                            // 启动监听器
                            const videoMonitor = new BiliVideoMonitor({
                                bvid: res.bvid,
                            })

                            videoMonitor.startMonitor();
                            logger.info($t('TEXT_CODE_e3ca6ddb', { replace: { id: res.bvid } }));

                            videoMonitor.on('video-opening', () => {

                                videoMonitor.destroy()
                                logger.info($t('TEXT_CODE_59b2752a', { replace: { id: res.bvid } }))
                                
                                map_groupSend.forEach(async (user_ids, group_id) => {
                                    const message = [{ type: 'text', data: { text: $t('TEXT_CODE_0737a8b5', { replace: {
                                        id: res.bvid,
                                        bvid: res.bvid
                                    }}) } }]
                                    qbot?.action('send_group_msg', { group_id, message })
                                })

                                // 清理文件
                                fs.unlink(file.file_path, (err) => {
                                    let message;
                                    
                                    if (err) {
                                        logger.warn('清理文件时发送错误', err)
                                        message = [{ type: 'text', data: { text: $t('TEXT_CODE_b3e258d3', { replace: {
                                            err: err.message || err
                                        }}) } }]
                                    } else {
                                        message = [{ type: 'text', data: { text: $t('TEXT_CODE_b3e258d3') } }]
                                    }

                                    map_groupSend.forEach(async (user_ids, group_id) => {
                                        message
                                        qbot?.action('send_group_msg', { group_id, message })
                                    })
                                })
                            })

                            map_groupSend.forEach(async (user_ids, group_id) => {
                                const message = [{ type: 'text', data: { text: $t('TEXT_CODE_634b96fd', { replace: {
                                    id: res.bvid,
                                    bvid: res.bvid
                                }}) } }]
                                qbot?.action('send_group_msg', { group_id, message })
                            })

                            logger.info($t('TEXT_CODE_aed04805'), room_id, res);
                        })
                        .catch((err) => {
                            
                            const recover_file = `${path.basename(file.file_path)}_recovery.json`;
                            fs.writeFileSync(path.join(recover_folder, recover_file), JSON.stringify({
                                type: 'uploader-err-recovery',
                                time: Date.now(),
                                time_: moment().format('YYYY-MM-DD HH:mm:ss'),
                                error: `${err}`,
                                room_id,
                                uploader: {
                                    params
                                },
                                manual_recovery: {
                                    ...params.video
                                }
                            }, null, 2));

                            alertError(err, $t('TEXT_CODE_4bf8d0a0'))

                            map_groupSend.forEach(async (user_ids, group_id) => {
                                const message = [{ type: 'text', data: { text: $t('TEXT_CODE_35bd8fb2', { replace: { 
                                    id: room_id,
                                    file: recover_file 
                                } }) } }]
                                qbot?.action('send_group_msg', { group_id, message })    
                            })
                        })
                    })

                })

                // 群发
                map_groupSend.forEach(async (user_ids: number[], group_id) => {

                    aRecorder.monitor.on('live-start', async (room_info) => {

                        const message: any = [
                            { type: 'image', data: { url: room_info.user_cover } },
                            { type: 'text', data: { text: $t('TEXT_CODE_3aa85bfe', {replace: {
                                title: room_info.title,
                                description: room_info.description || '无',
                                online: room_info.online,
                                liveTime: room_info.live_time,
                                id: room_info.room_id,
                                url: `https://live.bilibili.com/${room_info.room_id}`
                            }}) + '\n\n' } }
                        ]

                        message.push(...user_ids.map(user_id => {
                            return { type: 'at', data: { qq: user_id.toString() } }
                        }))
                        
                        if (!intercept_first.includes(`${room_id}_${group_id}`)) {
                            intercept_first.push(`${room_id}_${group_id}`)
                            return
                        }

                        qbot?.action('send_group_msg', { group_id, message })
                    })

                    aRecorder.monitor.on('live-end', async (room_info) => {

                        const message: any = [
                            { type: 'image', data: { url: room_info.user_cover } },
                            { type: 'text', data: { text: $t('TEXT_CODE_0344d6ee', {
                                title: room_info.title,
                                id: room_info.room_id
                            }) } }
                        ]

                        if (!intercept_first.includes(`${room_id}_${group_id}`)) {
                            intercept_first.push(`${room_id}_${group_id}`)
                            return
                        }

                        qbot?.action('send_group_msg', { group_id, message })
                    })
                    
                })
    
                map_ARecorders.set(room_id, aRecorder);
            })
        })
    }

    refreshARecorders()
}

// Run App
(async () => {
    try {
        logger.info($t('TEXT_CODE_70bb782b'));

        logger.info($t('TEXT_CODE_03cba728'));
        await initSqlite();
        await initStoreData();
        await initACheck();

        await app();
        logger.info($t('TEXT_CODE_60c96648'));
        logger.info($t('TEXT_CODE_1580a4fb'));

    } catch (error) {
        alertError(error, $t('TEXT_CODE_973c5191'));
    }
})()