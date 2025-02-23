// import WebSocket from "ws";
// import crypto from 'crypto'
import sqlite3 from "sqlite3";
import removeMarkdown from "remove-markdown";
import { makeRequest } from "../../lib/http";

type SparkLiteMessage = {
    role: 'user' | 'assistant' | 'system'
    content: string
}

type SparkLiteChoice = {
    message: {
        role: 'user' | 'assistant' | 'system',
        content: string
    },
    index: number
}

type APIResponse = {
    code: number
    message: string
    sid: string
    choices: SparkLiteChoice[]
}

export default class SparkLite {
    // ws: WebSocket
    // public waitWsOpen: Promise<void>
    // private appid: string
    // private secret: string
    // private apikey: string
    private apiPassword: string
    private httpURL: string = 'https://spark-api-open.xf-yun.com/v1/chat/completions'
    private db: sqlite3.Database

    private SystemCotent = '你现在身份为一只猫娘，有两只毛茸茸的猫耳朵和尾巴；你的名字叫小雫，全名：猫羽雫，性格温和，外貌可爱亲人，性别女，年龄大概是16岁；并且，你喜欢使用喵~等猫娘的语气词'

    constructor(option: {apiPassword: string}, database: sqlite3.Database) {
        // this.appid = option.appid
        // this.secret = option.secret
        // this.apikey = option.apikey
        this.apiPassword = option.apiPassword
        this.db = database

        this.db.run(`CREATE TABLE IF NOT EXISTS spark_lite_chat (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            uid VARCHAR NOT NULL,
            role TEXT NOT NULL CHECK(role IN ('user', 'assistant', 'system')),
            content TEXT NOT NULL,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        )`)

        // SB 讯飞星火，我**操你全家，nm WebSocket用完就断开，我**操你ma，还tm不让重连，你父母呢

        // let url = `wss://spark-api.xf-yun.com/v1.1/chat`

        // // 鉴权
        // const getWebSocketUrl = () => {
        //     const host = 'spark-api.xf-yun.com'
        //     const date = new Date().toGMTString()
        //     const algorithm = 'hmac-sha256'
        //     const headers = 'host date request-line'
        //     const signatureOrigin = `host: ${host}\ndate: ${date}\nGET /v1.1/chat HTTP/1.1`
        //     const signatureSha = crypto.createHmac('sha256', option.secret)
        //     signatureSha.update(signatureOrigin)
        //     const signature = signatureSha.digest('base64')
        //     const authorizationOrigin = `api_key="${option.apikey}", algorithm="${algorithm}", headers="${headers}", signature="${signature}"`
        //     const authorization = Buffer.from(authorizationOrigin).toString('base64')
        //     url += `?authorization=${authorization}&date=${date}&host=${host}`
        //     return url
        // }

        // this.ws = new WebSocket(getWebSocketUrl())
        // this.waitWsOpen = new Promise(resolve => this.ws.on('open', resolve))

        // this.ws.on('open', () => {
        //     console.log('Spark-Lite 连接成功')
        // })

        // this.ws.on('error', (err) => {
        //     console.log('Spark-Lite 连接失败', err)
        // })

        // this.ws.on('close', () => {
        //     console.log('Spark-Lite 连接关闭')
        // })
    }

    private all<T = any[]>(sql: string, params?: any): Promise<T> {
        return new Promise((resolve, reject) => {
            this.db.all(sql, params, (err: Error, rows: T) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(rows);
                }
            });
        });
    }

    private getHistory(uid: string) {
        return this.all<SparkLiteMessage[]>(`SELECT * FROM spark_lite_chat WHERE uid = ? ORDER BY timestamp ASC`, [uid])
    }

    private insertHistory(uid: string, role: 'user' | 'assistant' | 'system', content: string) {
        return this.db.run(`INSERT INTO spark_lite_chat (uid, role, content) VALUES (?, ?, ?)`, [uid, role, content])
    }

    // public async sendMessage(options: { uid: string, message: string }) {
    //     return new Promise<string>(async (resolve, reject) => {
    //         await this.waitWsOpen;
            
    //         const { uid, message } = options
    //         const dbhistory = await this.getHistory(uid)
    //         const history = (dbhistory).map(item => {
    //             return {
    //                 role: item.role,
    //                 content: item.content
    //             }
    //         })
            
    //         this.ws.send(JSON.stringify({
    //             header: {
    //                 app_id: this.appid,
    //                 uid: uid
    //             },
    //             parameter: {
    //                 chat: {
    //                     domain: "lite",
    //                 }
    //             },
    //             payload: {
    //                 message: {
    //                     text: [
    //                         {
    //                             role: "system",
    //                             content: this.SystemCotent
    //                         },
    //                         ...history,
    //                         {
    //                             "role": "user",
    //                             content: message
    //                         },
    //                     ]
    //                 }
    //             }
    //         }))

    //         this.insertHistory(uid, 'user', message)

    //         let backMessage = '';
    //         const handle = (data: any) => {
    //             const json = JSON.parse(data.toString());

    //             if (json.header.code !== 0) {
    //                 this.ws.off('message', handle)
    //                 this.insertHistory(uid, 'assistant', json.header.message)
    //                 reject(json.header.message)
    //                 return
    //             }
                
    //             const status = json.header.status;
    //             const content = json.payload.choices.text[0].content;
    //             const role = json.payload.choices.text[0].role;

    //             backMessage += content;

    //             if (status === 2) {
    //                 // 完成
    //                 backMessage = removeMarkdown(backMessage)

    //                 this.insertHistory(uid, role, backMessage)
    //                 resolve(backMessage)

    //                 // this.ws.off('message', handle)
    //             }
    //         }
    //         this.ws.on('message', handle)
    //     })
    // }

    public async sendMessage(options: { uid: string, message: string }) {
        return new Promise<string>(async (resolve, reject) => {
            const { uid, message } = options
            const dbhistory = await this.getHistory(uid)
            const history = (dbhistory).map(item => {
                return {
                    role: item.role,
                    content: item.content
                }
            })

            this.insertHistory(uid, 'user', message)

            const resp = await makeRequest<APIResponse>({
                url: this.httpURL,
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${this.apiPassword}`
                },
                method: "POST",
                data: {
                    "model": "lite",
                    "user": uid,
                    "messages": [
                        {
                            "role": "system",
                            "content": this.SystemCotent
                        },
                        ...history,
                        {
                            "role": "user",
                            "content": message
                        }
                    ],
                    "stream": false
                }
            })

            if (resp.data.code === 0) {
                const m = resp.data.choices[0].message;
                m.content = removeMarkdown(m.content);
                
                this.insertHistory(uid, m.role, m.content)
                resolve(m.content)
            } else {
                reject(resp.data.message)
            }
        })
    }
}