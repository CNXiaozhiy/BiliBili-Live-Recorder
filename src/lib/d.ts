import sqlite3 from 'sqlite3';
import fs from 'fs';
import path from 'path';
import logger from '../logger';

interface IConfigJson {
    Bili_Cookie: string;
    RECORD_FOLDER_PATH: string;
    FFMPEG_BIN_FOLDER: string;

    Language: string;

    bot: {
        ws_url: string;
        admin:{ 
            qid: number,
            permission: number 
        }[]
    }
}

const cwd = process.cwd();

const files = {
    config: path.join(cwd,'./config.json'),
    db: {
        subscribe: path.join(cwd,'./data/subscribe.db')
    }
}

// 校验文件
if (!fs.existsSync(files.db.subscribe)) {
    fs.mkdirSync(path.dirname(files.db.subscribe), { recursive: true });
    fs.writeFileSync(files.db.subscribe, '')
};
if (!fs.existsSync(files.config)) {
    logger.info('请先配置 config.json，然后再启动程序');
    process.exit(0);
}

// 初始化
let config: IConfigJson;
let subscribe: sqlite3.Database;

try {
    config = JSON.parse(fs.readFileSync(files.config, 'utf-8'));
    if (!config.Bili_Cookie) logger.warn('Bili_Cookie 未配置，将无法使用 BiliUploader 上传视频');
    if (!config.bot || !config.bot.ws_url) logger.warn('OneBot 适配器未安装！')
    if (!config.FFMPEG_BIN_FOLDER || !config.Language || !config.RECORD_FOLDER_PATH) throw Error('参数不完整');
} catch (e) {
    logger.error('config.json 格式不正确，请查看文档后重试');
    process.exit(0);
}

try {
    subscribe = new sqlite3.Database(files.db.subscribe, function(e) {
        if (e) throw e;
    }); 
} catch (e) {
    logger.error(`加载数据库文件 ${files.db.subscribe} 出错：+ ${e}`);
    logger.notice('若无重要数据，请手动删除数据库后重试');
    process.exit(0);
}

export {
    config,
    subscribe
};