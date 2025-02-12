import * as http from 'http';
import { $t } from '../i18n';
import logger from '../logger';
import * as url from 'url';

const proxyServer: http.Server = http.createServer((req, res) => {
  if (req.url) {
    const query = url.parse(req.url, true).query;
    
    const targetUrl = Buffer.from(query.url as string, 'base64').toString('utf-8');
    if (!targetUrl) {
      res.writeHead(400, { 'Content-Type': 'text/plain' });
      res.end('Error: Missing "url" query parameter');
      return;
    }

    const parsedTargetUrl = url.parse(targetUrl);
    const options: http.RequestOptions = {
      hostname: parsedTargetUrl.hostname,
      port: parsedTargetUrl.port || '80',
      path: parsedTargetUrl.path,
      method: req.method,
      headers: {
        ...req.headers,
        'Referer': 'https://live.bilibili.com/',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36'
      }
    };

    const proxyReq = http.request(options, (proxyRes) => {
      res.writeHead(proxyRes.statusCode!, proxyRes.headers);
      proxyRes.pipe(res, { end: true });
    });

    proxyReq.on('error', (e) => {
      console.error(`problem with request: ${e.message}`);
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('Error connecting to the target URL');
    });

    req.pipe(proxyReq, { end: true });
  }
});

export const startProxyServer = (PORT: number = 3005) => {
    return new Promise((resolve, reject) => {
        try {
            proxyServer.listen(PORT, () => {
                logger.info($t('TEXT_CODE_a001d265', { port: PORT }));
                resolve(proxyServer);
            })
        } catch (e) {
            reject(e);
        }
    })
};