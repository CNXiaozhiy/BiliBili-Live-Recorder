import http from 'http';
import axios from 'axios';
import { Buffer } from 'buffer';
import logger from '../logger';
import { $t } from '../i18n';

const server = http.createServer(async (req, res) => {
    // 只处理 GET 请求
    if (req.method === 'GET') {
        try {
            // 解析 URL 和查询参数
            const url = new URL(req.url!, `http://${req.headers.host}`);
            const encodedUrl = url.searchParams.get('url');

            if (!encodedUrl) {
                res.statusCode = 400;
                res.end('Missing "url" query parameter');
                return;
            }

            const decodedUrl = Buffer.from(encodedUrl, 'base64').toString('utf-8');

            const response = await axios.get(decodedUrl, {
                responseType: 'stream',
                headers: {
                    'Referer': 'https://live.bilibili.com/',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36'
                }
            });

            res.writeHead(response.status, response.headers);

            // 将响应流管道到客户端
            response.data.pipe(res);
        } catch (error) {
            console.error('Proxy error:', error);
            res.statusCode = 500;
            res.end('Internal Server Error');
        }
    } else {
        res.statusCode = 405;
        res.end('Method Not Allowed');
    }
});

export const startProxyServer = (PORT: number) => new Promise<void>((resolve) => {
    server.listen(PORT, () => {
        logger.info($t('TEXT_CODE_a001d265', { replace: { port: PORT } }));
        resolve();
    })
})