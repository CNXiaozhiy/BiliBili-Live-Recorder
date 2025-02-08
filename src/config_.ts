export default {
    QBOT_WS_URL: '', // onebot 协议的ws地址
    Bili_Cookie: '', // bilibili cookie 用于上传视频，获取教程请看 README
    RECORD_FOLDER_PATH: 'D:/BLR/records/', // 直播录像保存文件夹
    FFMPEG_BIN_FOLDER: 'D:/BLR/ffmpeg/bin/', // ffmpeg bin 路径，注意是 bin 路径！

    Language: 'zh_cn', // 语言

    // 快捷订阅 将 1, 2 改为快捷订阅的QQ群号
    quickSubscribe: {
        rooms: {
            1: {    
                dec: 'xxx', // 房间展示标题（随你）
                id: 100000  // 直播间ID
            },
            2 : {
                dec: 'xxx', // 房间展示标题（随你）
                id: 100000  // 直播间ID
            }
        }
    }
}

// 将此文件名改为 config.ts -> oK