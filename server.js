const http = require('http');
const fs = require('fs');
const path = require('path');
const https = require('https');

const DEEPSEEK_API_KEY = "sk-a1b831e5a45c4e9b8c908066835fe047";

const server = http.createServer((req, res) => {
    // --- DeepSeek Proxy Endpoint ---
    if (req.url === '/api/deepseek' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => { body += chunk.toString(); });
        req.on('end', () => {
            try {
                const options = {
                    hostname: 'api.deepseek.com',
                    path: '/chat/completions',
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${DEEPSEEK_API_KEY}`
                    }
                };

                const proxyReq = https.request(options, (proxyRes) => {
                    res.writeHead(proxyRes.statusCode, { 'Content-Type': 'application/json' });
                    proxyRes.pipe(res);
                });

                proxyReq.on('error', (e) => {
                    console.error('Proxy Error:', e);
                    res.writeHead(500);
                    res.end(JSON.stringify({ error: 'DeepSeek Proxy Failed' }));
                });

                proxyReq.write(body);
                proxyReq.end();
            } catch (err) {
                res.writeHead(400);
                res.end(JSON.stringify({ error: 'Invalid Request' }));
            }
        });
        return;
    }

    let filePath = '.' + req.url;
    if (filePath === './') {
        filePath = './index.html';
    }

    const extname = String(path.extname(filePath)).toLowerCase();
    const mimeTypes = {
        '.html': 'text/html',
        '.js': 'text/javascript',
        '.css': 'text/css',
        '.json': 'application/json',
        '.png': 'image/png',
        '.jpg': 'image/jpg',
        '.gif': 'image/gif',
        '.svg': 'image/svg+xml',
        '.wav': 'audio/wav',
        '.mp4': 'video/mp4',
        '.woff': 'application/font-woff',
        '.ttf': 'application/font-ttf',
        '.eot': 'application/vnd.ms-fontobject',
        '.otf': 'application/font-otf',
        '.wasm': 'application/wasm'
    };

    const contentType = mimeTypes[extname] || 'application/octet-stream';

    fs.readFile(filePath, (error, content) => {
        if (error) {
            if (error.code === 'ENOENT') {
                res.writeHead(404, { 'Content-Type': 'text/html' });
                res.end('<h1>404 Not Found</h1>', 'utf-8');
            } else {
                res.writeHead(500);
                res.end('Sorry, check with the site admin for error: ' + error.code + ' ..\n');
            }
        } else {
            res.writeHead(200, { 'Content-Type': contentType });
            res.end(content, 'utf-8');
        }
    });
});

const PORT = process.env.PORT || 8000;
server.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}/`);
});
