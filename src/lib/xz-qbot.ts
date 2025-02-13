// LLOneBot

import WebSocket from 'ws';
import { v4 } from 'uuid';
import { EventEmitter } from '../core/events';
import { alertError } from '../core/error-alarms';

type EventTypes = 'message' | 'connected'| 'connect-error' | 'connect-close';

export default class XzQBot extends EventEmitter<EventTypes> {
    websUrl: string;
    ws: WebSocket | null = null;

    connected: boolean = false;
    waitConnect: Promise<void> | null = null;

    constructor(websUrl: string) {
        super();

        this.websUrl = websUrl;
        this.connect();
    }

    action(action: string, params: any) {
        
        return new Promise((resolve, reject) => {
            // if (params.group_id === 1067126179) {resolve({});return}

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
                this.emit('message', JSON.parse(data))
            } catch (e) {
                alertError(e);
            }
        }

        this.ws.on('message', toEmit)
        
        
    }
}