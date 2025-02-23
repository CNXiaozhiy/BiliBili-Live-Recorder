// LLOneBot

import WebSocket from 'ws';
import { v4 } from 'uuid';
import { EventEmitter } from '../core/events';
import { alertError } from '../core/error-alarms';

import throttledQueue from 'throttled-queue';

type EventTypes = 'message' | 'connected'| 'connect-error' | 'connect-close';

export default class XzQBot extends EventEmitter<EventTypes> {
    websUrl: string;
    ws: WebSocket | null = null;

    connected: boolean = false;
    waitConnect: Promise<void> | null = null;
    throttleMap: Map<string, Function> = new Map();
    silenceMap: Map<string, boolean> = new Map();
    sendFrequency: Map<string, {cInterval?: NodeJS.Timeout, time: number}> = new Map();

    isFrequencyWarn = false

    constructor(websUrl: string) {
        super();

        this.websUrl = websUrl;
        this.connect();
    }

    action(action: string, params: any) {

        const WARN_FREQUENCY = 10

        return new Promise(async (resolve, reject) => {
            // if (params.group_id === 1067126179) {resolve({});return}
            
            if (action === 'send_group_msg' || action === 'send_private_msg') {
                const id = `${params.group_id}` || `${params.user_id}`;

                if (this.silenceMap.get(id)) {resolve({}); return}

                if (!this.sendFrequency.has(id)) {
                    this.sendFrequency.set(id, {
                        time: 0,
                        cInterval: setInterval(() => {
                            this.sendFrequency.get(id)!.time = 0
                        }, 60000)
                    });
                } else {
                    this.sendFrequency.get(id)!.time++
                }

                const freq = this.sendFrequency.get(id)!

                if (freq.time === WARN_FREQUENCY) {
                    this.action(action, {
                        ...params,
                        message: `XzQBot 安全限流中心警告⚠️\n\n发送消息频率过快🟠\n\n若大量消息为冗余消息请发送 '强制限流' 命令`
                    })
                    this.isFrequencyWarn = true
                } else if (freq.time === WARN_FREQUENCY * 2) {
                    this.action(action, {
                        ...params,
                        message: `XzQBot 安全限流中心严重警告⚠️\n\n发送消息频率异常❗\n\n已强制禁言⛔`
                    })

                    this.silenceMap.set(id, true)
                    resolve({}); return;
                }

                if (this.throttleMap.has(id)) {
                    await new Promise<void>(resolve => this.throttleMap.get(id)!(resolve))
                } else {
                    this.throttleMap.set(id, throttledQueue(1, 1000));
                }
            }

            if (!this.ws || !this.connected) {
                reject('not connected')
                return
            }
            
            const echo = v4();
            this.ws.send(JSON.stringify({
                action,
                params,
                echo
            }))

            const listener = (data: any) => {
                if (data.echo !== echo) return;
                
                this.off('message', listener);
                resolve(data);
            }

            this.on('message', listener)
        })
    }

    connect() {
        this.ws = new WebSocket(this.websUrl)

        this.waitConnect = new Promise((resolve, reject) => {
            this.ws?.on('open', resolve);
        })

        this.ws.on('open', () => {
            this.connected = true;
            this.emit('connected');
        });
        
        this.ws.on('error', (err) => {
            this.connected = false;
            this.emit('connect-error', err);

            this.connect();
        });

        this.ws.on('close', (code, reason) => {
            this.connected = false
            this.emit('connect-close', { code, reason });

            this.connect();
        });

        const toEmit = (data: any) => {
            try {
                const jData = JSON.parse(data);
                const id = `${jData.group_id}` || `${jData.sender.user_id}`;
                if (jData.post_type === 'message') {
                    if (this.isFrequencyWarn) {
                        switch (jData.raw_message) {
                            case '强制限流':
                                this.throttleMap.set(id, throttledQueue(1, 60000));

                                this.action('send_group_msg', {
                                    group_id: jData.group_id,
                                    message: `XzQBot 安全限流中心\n\n限流频次已降至⛔ 1条 / 1分钟\n\n其他限流命令\n\n`
                                    + '强制限流C 频次：1条 / 半小时\n'
                                    + '强制限流B 频次：1条 / 1小时\n'
                                    + '强制限流A 强制禁言'
                                    + '\n\n使用命令解除限流\n'
                                    + '解除限流'
                                })
                                break;
                            case '强制限流C':
                                this.throttleMap.set(id, throttledQueue(1, 1800000));
                                this.action('send_group_msg', {
                                    group_id: jData.group_id,
                                    message: `XzQBot 安全限流中心\n\n限流频次已降至⛔ 1条 / 半小时\n\n其他限流命令\n\n`
                                    + '强制限流C 频次：1条 / 半小时\n'
                                    + '强制限流B 频次：1条 / 1小时\n'
                                    + '强制限流A 强制禁言'
                                    + '\n\n使用命令解除限流\n'
                                    + '解除限流'
                                })
                                break;
                            case '强制限流B':
                                this.throttleMap.set(id, throttledQueue(1, 3600000));
                                this.action('send_group_msg', {
                                    group_id: jData.group_id,
                                    message: `XzQBot 安全限流中心\n\n限流频次已降至⛔ 1条 / 1小时\n\n其他限流命令\n\n`
                                    + '强制限流C 频次：1条 / 半小时\n'
                                    + '强制限流B 频次：1条 / 1小时\n'
                                    + '强制限流A 强制禁言'
                                    + '\n\n使用命令解除限流\n'
                                    + '解除限流'
                                })
                                break;
                            case '强制限流A':
                                this.silenceMap.set(id, true);
                                this.action('send_group_msg', {
                                    group_id: jData.group_id,
                                    message: `XzQBot 安全限流中心\n\n已禁言⛔\n\n其他限流命令\n\n`
                                    + '强制限流C 频次：1条 / 半小时\n'
                                    + '强制限流B 频次：1条 / 1小时\n'
                                    + '强制限流A 强制禁言'
                                    + '\n\n使用命令解除禁言\n'
                                    + '解除限流'
                                })
                                break;
                            case '解除限流':
                                this.throttleMap.delete(id);
                                this.silenceMap.delete(id);
                                this.action('send_group_msg', {
                                    group_id: jData.group_id,
                                    message: `XzQBot 安全限流中心\n\n已解除限流（禁言）✅`
                                })
                                break;
                        }
                    }
                }
                this.emit('message', jData)
            } catch (e) {
                alertError(e);
            }
        }

        this.ws.on('message', toEmit)
        
        
    }
}