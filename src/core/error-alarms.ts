import logger from "../logger";
import XzQBot from "../lib/xz-qbot";

let qbot: XzQBot | null;

export const setNotifyAdapter = (bot: XzQBot) => {
    qbot = bot;
}

export const alertError = (e: any, console_log?: string) => {
    if (!e) e = {};
    if (!e.message) e.message = '未知错误';
    if (!e.stack) e.stack = '未知堆栈';

    qbot?.action('send_private_msg', {
        user_id: 1811302029,
        message: [
            { type: 'text', data: { text: `Live Recorder 全局异常捕获器 \n错误：${e.message}\n${console_log}\n\n${e.stack}` } }
        ]
    })

    console_log && logger.error(console_log, e);
}