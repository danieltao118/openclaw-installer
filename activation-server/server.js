// activation-server/server.js — 激活码发放服务
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const CODES_FILE = path.join(__dirname, 'codes.json');

// 加载激活码数据
function loadCodes() {
  if (!fs.existsSync(CODES_FILE)) {
    return { codes: [], created: new Date().toISOString() };
  }
  return JSON.parse(fs.readFileSync(CODES_FILE, 'utf8'));
}

function saveCodes(data) {
  fs.writeFileSync(CODES_FILE, JSON.stringify(data, null, 2), 'utf8');
}

// MIME 类型
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
};

function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }

  // POST /claim — 领取激活码
  if (req.method === 'POST' && req.url === '/claim') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const { phone } = JSON.parse(body);
        if (!phone || !/^1\d{10}$/.test(phone)) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ ok: false, msg: '请输入正确的手机号' }));
        }

        const data = loadCodes();

        // 检查是否已领取
        const existing = data.codes.find(c => c.phone === phone);
        if (existing) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({
            ok: true,
            code: existing.code,
            msg: '您已领取过激活码',
            claimedAt: existing.claimedAt,
          }));
        }

        // 找一个未领取的码
        const available = data.codes.find(c => !c.phone);
        if (!available) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ ok: false, msg: '激活码已发放完毕' }));
        }

        // 分配
        available.phone = phone;
        available.claimedAt = new Date().toISOString();
        saveCodes(data);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, code: available.code }));
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, msg: '请求格式错误' }));
      }
    });
    return;
  }

  // GET /stats — 查看发放统计（管理员）
  if (req.method === 'GET' && req.url === '/stats') {
    const data = loadCodes();
    const total = data.codes.length;
    const claimed = data.codes.filter(c => c.phone).length;
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ total, claimed, remaining: total - claimed }));
  }

  // 静态文件
  let filePath = req.url === '/' ? '/index.html' : req.url;
  filePath = path.join(__dirname, 'public', filePath);

  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    res.writeHead(404);
    return res.end('Not Found');
  }

  const ext = path.extname(filePath);
  res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
  fs.createReadStream(filePath).pipe(res);
}

// 只监听 3000 端口（nginx 反代 80/443）
const server = http.createServer(handler);
server.listen(PORT, () => {
  const data = loadCodes();
  const total = data.codes.length;
  const claimed = data.codes.filter(c => c.phone).length;
  console.log(`\n=== OpenClaw 激活码发放服务 ===`);
  console.log(`地址: http://localhost:${PORT}`);
  console.log(`激活码: ${total} 个 (已领 ${claimed}, 剩余 ${total - claimed})`);
  console.log(`管理: http://localhost:${PORT}/stats\n`);
});
