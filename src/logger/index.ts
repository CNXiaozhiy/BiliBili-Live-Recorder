import XzLogger from "../lib/xz-logger";
const logger = new XzLogger({
    level: 'TRACE' // 设置记录的最低日志级别
});

export default logger

/**
    import pino, { P } from "pino";
    import pretty from "pino-pretty";
    const logger = pino({
        level: "debug", // 设置记录的最低日志级别
        serializers: {
        req: pino.stdSerializers.req, // 标准请求序列化器
        res: pino.stdSerializers.res, // 标准响应序列化器
        }
    }, pretty({
        colorize: true,
        levelFirst: false,
        messageFormat: "{msg}",
    }));
*/
