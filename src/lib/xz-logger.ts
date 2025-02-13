import { colorize, colors } from "../tools";
import moment from "moment";

const levels = ['TRACE', 'DEBUG', 'INFO', 'NOTICE', 'WARN', 'ERROR', 'CRITICAL', 'ALERT', 'EMERGENCY'] as const;
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
    warn(...msgs: any[]) { this.log(msgs, 'WARN') }
    error(...msgs: any[]) { this.log(msgs, 'ERROR') }
    critical(...msgs: any[]) { this.log(msgs, 'CRITICAL') }
    alert(...msgs: any[]) { this.log(msgs, 'ALERT') }
    emergency(...msgs: any[]) { this.log(msgs, 'EMERGENCY') }

    private log(msgs: any[], level: LogLevel) {
        const levelInfo = this.logLevelInfoMap.get(level);
        if (!levelInfo) return

        if (levelInfo.weight < this.level) return;
        const logColor: colors = levelInfo.color || 'blue';
        let s = this.messageFormat(`[{data}] ${colorize(logColor, '[' + level + ']')}`);
        if (level === 'ERROR') {
            console.error(s, ...msgs);
        } else {
            console.log(s, ...msgs);
        }
    }

    private messageFormat(m: string) {
        m = m.toString().replace('{data}', moment().format('HH:mm:ss.SSS'));
        return m;
    }
}