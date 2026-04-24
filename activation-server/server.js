// activation-server/server.js — 激活码发放服务
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const CODES_FILE = path.join(__dirname, 'codes.json');
const FEEDBACK_FILE = path.join(__dirname, 'feedback.json');
const FEISHU_WEBHOOK = process.env.FEISHU_WEBHOOK || '';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'xzsxopenclawAI2026';

// 管理端点认证
const ADMIN_PATHS = ['/stats', '/api/codes', '/api/codes.csv', '/api/feedback'];
function checkAuth(req) {
  const cookie = (req.headers.cookie || '');
  if (cookie.split(';').some(c => c.trim() === `admin_token=${ADMIN_PASSWORD}`)) return true;
  const auth = req.headers.authorization || '';
  if (auth === `Bearer ${ADMIN_PASSWORD}`) return true;
  return false;
}
function requireAuth(req, res) {
  if (!checkAuth(req)) {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, msg: '需要管理员密码' }));
    return true;
  }
  return false;
}

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

  // POST /claim — 已停止发放
  if (req.method === 'POST' && req.url === '/claim') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ ok: false, msg: '激活码已停止发放，请联系顾问老师领取', stopped: true }));
  }

  // GET /stats — 查看发放统计（管理员）
  if (req.method === 'GET' && req.url === '/stats') {
    if (requireAuth(req, res)) return;
    const data = loadCodes();
    const total = data.codes.length;
    const claimed = data.codes.filter(c => c.phone).length;
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ total, claimed, remaining: total - claimed }));
  }

  // GET /api/codes — 已领取激活码列表（含手机号）
  if (req.method === 'GET' && req.url === '/api/codes') {
    if (requireAuth(req, res)) return;
    const data = loadCodes();
    const claimed = data.codes.filter(c => c.phone).map(c => ({
      phone: c.phone,
      code: c.code,
      claimedAt: c.claimedAt,
    }));
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify(claimed));
  }

  // GET /api/codes.csv — 导出CSV
  if (req.method === 'GET' && req.url === '/api/codes.csv') {
    if (requireAuth(req, res)) return;
    const data = loadCodes();
    const bom = Buffer.from([0xEF, 0xBB, 0xBF]);
    let csv = '手机号,激活码,领取时间\n';
    for (const c of data.codes) {
      if (c.phone) {
        csv += `${c.phone},${c.code},${c.claimedAt}\n`;
      }
    }
    res.writeHead(200, {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="activation-codes.csv"',
    });
    return res.end(Buffer.concat([bom, Buffer.from(csv, 'utf8')]));
  }

  // POST /feedback — 安装器一键反馈
  if (req.method === 'POST' && req.url === '/feedback') {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 65536) { req.destroy(); } // 64KB 限制
    });
    req.on('end', () => {
      try {
        const { error, systemInfo, logTail, contact } = JSON.parse(body);
        if (!error && !logTail) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ ok: false, msg: '反馈内容为空' }));
        }

        // 加载已有反馈
        let feedbacks = [];
        if (fs.existsSync(FEEDBACK_FILE)) {
          feedbacks = JSON.parse(fs.readFileSync(FEEDBACK_FILE, 'utf8'));
        }

        const feedback = {
          id: Date.now().toString(36) + Math.random().toString(36).substring(2, 6),
          error: error || '',
          systemInfo: systemInfo || {},
          logTail: (logTail || '').substring(0, 5000), // 最多5000字符
          contact: contact || '',
          createdAt: new Date().toISOString(),
          status: 'new', // new / viewed / resolved
        };

        feedbacks.unshift(feedback);
        // 最多保留200条
        if (feedbacks.length > 200) feedbacks = feedbacks.slice(0, 200);
        fs.writeFileSync(FEEDBACK_FILE, JSON.stringify(feedbacks, null, 2), 'utf8');

        // 飞书通知
        if (FEISHU_WEBHOOK) {
          notifyFeishu(feedback).catch(() => {});
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, id: feedback.id }));
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, msg: '请求格式错误' }));
      }
    });
    return;
  }

  // GET /admin/feedback — 反馈管理页面
  if (req.method === 'GET' && req.url === '/admin/feedback') {
    res.writeHead(302, { Location: '/admin.html' });
    return res.end();
  }

  // GET /api/feedback — 反馈数据API
  if (req.method === 'GET' && req.url === '/api/feedback') {
    if (requireAuth(req, res)) return;
    let feedbacks = [];
    if (fs.existsSync(FEEDBACK_FILE)) {
      feedbacks = JSON.parse(fs.readFileSync(FEEDBACK_FILE, 'utf8'));
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify(feedbacks));
  }

  // 静态文件（防路径遍历）
  let filePath = req.url === '/' ? '/index.html' : req.url;
  if (filePath === '/admin.html' && requireAuth(req, res)) return;
  filePath = path.join(__dirname, 'public', path.normalize(filePath));
  if (!filePath.startsWith(path.join(__dirname, 'public'))) {
    res.writeHead(403);
    return res.end('Forbidden');
  }

  if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
    const idx = path.join(filePath, 'index.html');
    if (fs.existsSync(idx)) filePath = idx;
    else { res.writeHead(404); return res.end('Not Found'); }
  }
  if (!fs.existsSync(filePath)) {
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
  console.log(`管理: http://localhost:${PORT}/stats`);
  console.log(`反馈: http://localhost:${PORT}/admin/feedback\n`);
});

// 飞书通知
async function notifyFeishu(feedback) {
  const https = require('https');
  const si = feedback.systemInfo || {};
  const text = [
    `【安装器反馈】`,
    `错误: ${feedback.error || '无'}`,
    `系统: ${si.os || '?'} | ${si.arch || '?'} | ${si.memory || '?'}`,
    `版本: ${si.installerVersion || '?'} | Node ${si.nodeVersion || '?'}`,
    `联系: ${feedback.contact || '未留'}`,
    `时间: ${feedback.createdAt}`,
  ].join('\n');

  const data = JSON.stringify({ msg_type: 'text', content: { text } });
  const url = new URL(FEISHU_WEBHOOK);
  const options = { hostname: url.hostname, path: url.pathname + url.search, method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } };

  return new Promise((resolve, reject) => {
    const req = https.request(options, res => { res.on('end', resolve); res.resume(); });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}
