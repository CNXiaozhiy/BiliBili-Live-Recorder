import { colorize, colors } from "../tools";
import moment from "moment";

const levels = ['TRACE', 'DEBUG', 'INFO', 'NOTICE', 'WARNING', 'ERROR', 'CRITICAL', 'ALERT', 'EMERGENCY'] as const;
const levelColors: colors[] = ['grey', 'blue', 'green', 'cyan' ,'yellow', 'red', 'magenta', 'brightRed', 'whiteRed'];
type LogLevel = typeof levels[number];

type LoggerOptions = {
    level?: LogLevel // 设置记录的最低日志级别
}

export default class XzLogger {
    private logLevelInfoMap: Map<LogLevel, {color: colors, weight: number}> = new Map ();

    private level: number; // 最低权重

    constructor(options: LoggerOptions) {
        for (let i = 0; i < levels.length; i++) {
            this.logLevelInfoMap.set(levels[i], {
                color: levelColors[i],
                weight: i
            })
        }

        this.level = levels.indexOf(options.level || 'INFO');
    }

    trace(...msgs: any[]) { this.log(msgs, 'TRACE'); }
    debug(...msgs: any[]) { this.log(msgs, 'DEBUG') }
    info(...msgs: any[]) { this.log(msgs, 'INFO'); }
    notice(...msgs: any[]) { this.log(msgs, 'NOTICE') }
    warn(...msgs: any[]) { this.log(msgs, 'WARNING') }
    error(...msgs: any[]) { this.log(msgs, 'ERROR') }
    critical(...msgs: any[]) { this.log(msgs, 'CRITICAL') }
    alert(...msgs: any[]) { this.log(msgs, 'ALERT') }
    emergency(...msgs: any[]) { this.log(msgs, 'EMERGENCY') }

    private log(msgs: any[], level: LogLevel = 'INFO') {
        const levelInfo = this.logLevelInfoMap.get(level);
        if (!levelInfo) return

        if (levelInfo.weight < this.level) return;
        const logColor: colors = levelInfo.color || 'blue';
        let m = this.messageFormat(`[{data}] ${colorize(logColor, '[' + level + ']')}`);
        if (level === 'ERROR') {
            console.error(m, ...msgs);
            return;
        }
        msgs.forEach((item) => {
            m += ' ';
    
            if (typeof item === 'number') {
                m += colorize('yellow', item.toString());
            } else if (typeof item === 'object') {
                m += colorize('green', JSON.stringify(item));
            } else if (typeof item !== 'string') {
                m += item.toString();
            } else {
                m += this.messageFormat(item)
            }
        })
        console.log(m);
    }

    private messageFormat(m: string) {
        m = m.toString().replace('{data}', moment().format('HH:mm:ss.SSS'));
        return m;
    }
}