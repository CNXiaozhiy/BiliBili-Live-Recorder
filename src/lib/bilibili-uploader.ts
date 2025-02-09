import fs from "fs";
import path from "path";
import { BiliUploaderOptions } from "index";
import logger from "../logger";
import { $t } from "../i18n";
import { makeRequest } from "./http";

export default class BiliUploader {
    cookie: string;
    CHUNK_SIZE: number;

    constructor(cookie: string, CHUNK_SIZE = 5 * 1024 * 1024) {
        this.CHUNK_SIZE = CHUNK_SIZE;
        this.cookie = cookie
    }

    async upload(options: BiliUploaderOptions) {

        const match = this.cookie.match(/bili_jct=([^\s;]+)/);
        if (!match || !Array.isArray(match)) throw new Error('cookie中未找到bili_jct');
        const csrf = match[1];

        const video_info = options.video;
        const video_file_path = options.file_path;
        const cover_base64 = options.cover_base64;
        const video_file_name = path.basename(video_file_path);
        const video_file_size = fs.statSync(video_file_path).size;
        const totalChunks = Math.ceil(video_file_size / this.CHUNK_SIZE);
    
        // 预上传 - 注册视频存储空间

        const res_1 = await makeRequest<{ OK: number, upos_uri: string, endpoint: string, auth: string, biz_id: string }>({
            url: `https://member.bilibili.com/preupload?name=${video_file_name}&r=upos&profile=ugcupos%2Fbup&ssl=0&size=${video_file_size}&version=2.8.9`,
            headers: {
                Cookie: this.cookie
            }
        })

        if (res_1.data.OK !== 1) throw new Error('预上传失败');

        const { data: { endpoint, auth, biz_id } } = res_1;
    
        // 整理信息
        const upos_uri = res_1.data.upos_uri.replace('upos://', '');
        const upload_url = `https:${endpoint}/${upos_uri}`
        const bili_file_name = path.parse(upos_uri).name;
    
        // 获取上传ID
        const res_2 = await makeRequest<{ OK: number, bucket: string, key: string, upload_id: string }>({
            method: 'POST',
            url: upload_url + '?uploads&output=json',
            headers: {
                'X-Upos-Auth': auth,
                Cookie: this.cookie
            }
        })

        if (res_2.data.OK !== 1) throw new Error('获取上传ID失败');

        const { data: { upload_id } } = res_2;
    
        // 分片上传
        for (let i = 0; i < totalChunks; i++) {
            const start = i * this.CHUNK_SIZE;
            const end = Math.min(start + this.CHUNK_SIZE, video_file_size);
            const chunkSize = end - start;
    
            const chunk = fs.createReadStream(video_file_path, { start, end });
    
            // 构建参数
            const params = new URLSearchParams({
              partNumber: `${i + 1}`,
              uploadId: upload_id,
              chunk: `${start}`,
              chunks: `${totalChunks}`,
              size: `${chunkSize}`,
              start: `${start}`,
              end: `${end}`,
              total: `${video_file_size}`
            });

            const resp = await makeRequest({
                method: 'PUT',
                url: `${upload_url}?${params.toString()}`,
                headers: {
                    'Content-Type': 'application/octet-stream',
                    'X-Upos-Auth': auth,
                    Cookie: this.cookie
                },
                data: chunk
            })
    
            logger.info($t('TEXT_CODE_704248b8', { replace: { index: i + 1, total: totalChunks } }), resp.data);
        }
    
        // 合片
        const res_3 = await makeRequest<{ OK: number, location: string, bucket: string, key: string }>({
            method: 'POST',
            url: `${upload_url}?output=json&name=${video_file_name}&profile=ugcupos%2Fbup&uploadId=${upload_id}&biz_id=${biz_id}`,
            headers: {
                'X-Upos-Auth': auth,
                Cookie: this.cookie
            }
        })

        if (res_3.data.OK !== 1) throw new Error('合片失败');
    
        // 上传封面
        const res_4 = await makeRequest<{ code: number, message: string, ttl: number, data: { url: string } }>({
            method: 'POST',
            url: `https://member.bilibili.com/x/vu/web/cover/up`,
            headers: {
                'Content-Type': 'multipart/form-data',
                Cookie: this.cookie
            },
            data: {
                csrf,
                cover: cover_base64,
            }
        })
        
        if (res_4.data.code !== 0) throw new Error('上传封面失败');

        const { data: { url: cover_url } } = res_4.data;
    
        // 投稿视频
        const res_5 = await makeRequest<{ code: number,message: string, ttl: number, data: { aid: number, bvid: string } }>({
            method: 'POST',
            url: `https://member.bilibili.com/x/vu/web/add/v3?csrf=${csrf}`,
            headers: {
                'Content-Type': 'application/json',
                Cookie: this.cookie
            },
            data: {
                csrf,
                cover: cover_url,
                title: video_info.title,
                copyright: 1,
                tid: video_info.tid || 27,
                tag: video_info.tag || '直播录像',
                desc_format_id: 0,
                desc: video_info.description,
                recreate: -1,
                dynamic: '',
                interactive: 0,
                videos: [
                    {
                        filename: bili_file_name,
                        title: '',
                        desc: '',
                        cid: 0
                    }
                ],
                act_reserve_create: 0,
                no_disturbance: 0,
                adorder_type: 9,
                no_reprint: 1,
                subtitle: {
                    open: 0,
                    lan: ''
                },
                dolby: 0,
                lossless_music: 0,
                up_selection_reply: false,
                up_close_reply: false,
                up_close_danmu: false,
                web_os: 1,
            }
        })

        if (res_5.data.code !== 0) throw new Error('投稿失败');


        return res_5.data.data
    }
}