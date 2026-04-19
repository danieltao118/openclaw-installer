// scripts/activation.js — 离线激活码系统 v2（高安全等级）
// 双层 HMAC-SHA512 + Base62 + 机器绑定

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const os = require('os');

// ========== 密钥配置 ==========
const SECRET_KEY = 'XZSX-OpenClaw-2026-Activation-$$-v2-Secret!!';
const SALT = 'OCLAW-SALT-2026-Q2';

// Base62 字符集（大小写+数字，62种）
const BASE62 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

// 激活码类型
const CODE_TYPES = {
  C: { name: '实战营', days: 365 },
  T: { name: '体验', days: 30 },
};

// 激活状态文件
const ACTIVATION_FILE = path.join(os.homedir(), '.openclaw', 'installer-activation.json');

// ========== 工具函数 ==========

// Base62 编码：从 Buffer 提取指定位数的字符
function base62Encode(buffer, length) {
  let result = '';
  for (let i = 0; i < length; i++) {
    result += BASE62[buffer[i % buffer.length] % 62];
  }
  return result;
}

// 从 HMAC digest 提取 hex 校验段
function hexChecksum(hmacBuffer, startByte, length) {
  let hex = '';
  for (let i = startByte; i < startByte + length && i < hmacBuffer.length; i++) {
    hex += hmacBuffer[i].toString(16).padStart(2, '0');
  }
  return hex.toUpperCase();
}

// 第一层校验：HMAC-SHA512(TYPE + RAND1 + RAND2)
function computeCheck1(type, rand1, rand2) {
  const payload = type + rand1 + rand2;
  const hmac = crypto.createHmac('sha512', SECRET_KEY + SALT).update(payload).digest();
  return hexChecksum(hmac, 0, 2); // 4 hex chars
}

// 第二层校验：HMAC-SHA512(RAND1 + RAND2 + CHECK1, KEY + TYPE)
function computeCheck2(type, rand1, rand2, check1) {
  const payload = rand1 + rand2 + check1;
  const hmac = crypto.createHmac('sha512', SECRET_KEY + SALT + type).update(payload).digest();
  return hexChecksum(hmac, 4, 3); // 6 hex chars
}

// ========== 生成激活码 ==========
// 格式: OC-TYPE-RAND1-RAND2-CHECK1-CHECK2
// 示例: OC-C-7nHr3K-B2m9F4-A3E8-B7D2C1
function generateCode(type) {
  if (!CODE_TYPES[type]) throw new Error(`未知类型: ${type}`);

  // 两段随机，各 6 位 Base62
  const rand1 = base62Encode(crypto.randomBytes(8), 6);
  const rand2 = base62Encode(crypto.randomBytes(8), 6);

  // 双层校验
  const check1 = computeCheck1(type, rand1, rand2);
  const check2 = computeCheck2(type, rand1, rand2, check1);

  return `OC-${type}-${rand1}-${rand2}-${check1}-${check2}`;
}

// ========== 验证激活码 ==========
function validateCode(code) {
  if (!code) return { valid: false, reason: '请输入激活码' };

  const trimmed = code.trim();

  // 格式检查: OC-C-xxxxxx-xxxxxx-XXXX-XXXXXX
  // RAND 段允许大小写字母+数字，CHECK 段为大写 hex
  const match = trimmed.match(/^OC-([CT])-([A-Za-z0-9]{6})-([A-Za-z0-9]{6})-([A-F0-9]{4})-([A-F0-9]{6})$/i);
  if (!match) {
    return { valid: false, reason: '激活码格式不正确' };
  }

  const [, type, rand1, rand2, providedCheck1, providedCheck2] = match;
  const upperCheck1 = providedCheck1.toUpperCase();
  const upperCheck2 = providedCheck2.toUpperCase();

  // 双层校验验证
  const expectedCheck1 = computeCheck1(type, rand1, rand2);
  if (upperCheck1 !== expectedCheck1) {
    return { valid: false, reason: '激活码无效' };
  }

  const expectedCheck2 = computeCheck2(type, rand1, rand2, upperCheck1);
  if (upperCheck2 !== expectedCheck2) {
    return { valid: false, reason: '激活码无效' };
  }

  return {
    valid: true,
    type,
    typeName: CODE_TYPES[type].name,
    days: CODE_TYPES[type].days,
  };
}

// ========== 激活（保存到本地） ==========
function activate(code) {
  const validation = validateCode(code);
  if (!validation.valid) return validation;

  const { machineIdSync } = require('node-machine-id');
  const machineId = machineIdSync();

  const activationData = {
    code: code.trim(),
    activatedAt: new Date().toISOString(),
    type: validation.type,
    typeName: validation.typeName,
    days: validation.days,
    machineId,
    // 二次验证签名（防止篡改激活文件）
    signature: crypto.createHmac('sha256', SECRET_KEY + machineId)
      .update(code.trim() + validation.type + machineId)
      .digest('hex').substring(0, 16),
  };

  const dir = path.dirname(ACTIVATION_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  fs.writeFileSync(ACTIVATION_FILE, JSON.stringify(activationData, null, 2), 'utf8');

  return { success: true, ...activationData };
}

// ========== 检查是否已激活 ==========
function isActivated() {
  try {
    if (!fs.existsSync(ACTIVATION_FILE)) return { activated: false };

    const data = JSON.parse(fs.readFileSync(ACTIVATION_FILE, 'utf8'));

    // 1. 验证激活码仍然有效
    const validation = validateCode(data.code);
    if (!validation.valid) {
      return { activated: false, reason: '激活信息无效' };
    }

    // 2. 验证机器 ID
    const { machineIdSync } = require('node-machine-id');
    const currentMachineId = machineIdSync();
    if (data.machineId && data.machineId !== currentMachineId) {
      return { activated: false, reason: '机器不匹配，请重新激活' };
    }

    // 3. 验证签名（防篡改）
    if (data.signature) {
      const expectedSig = crypto.createHmac('sha256', SECRET_KEY + currentMachineId)
        .update(data.code + data.type + currentMachineId)
        .digest('hex').substring(0, 16);
      if (data.signature !== expectedSig) {
        return { activated: false, reason: '激活信息被篡改' };
      }
    }

    // 4. 检查过期
    const activatedAt = new Date(data.activatedAt);
    const expiresAt = new Date(activatedAt.getTime() + data.days * 24 * 60 * 60 * 1000);
    if (new Date() > expiresAt) {
      return { activated: false, reason: `激活已于 ${expiresAt.toLocaleDateString('zh-CN')} 过期` };
    }

    const daysLeft = Math.ceil((expiresAt - new Date()) / (24 * 60 * 60 * 1000));

    return {
      activated: true,
      code: data.code,
      type: data.type,
      typeName: data.typeName || CODE_TYPES[data.type]?.name,
      activatedAt: data.activatedAt,
      expiresAt: expiresAt.toISOString(),
      daysLeft,
    };
  } catch (err) {
    return { activated: false, reason: err.message };
  }
}

module.exports = {
  generateCode,
  validateCode,
  activate,
  isActivated,
  CODE_TYPES,
  ACTIVATION_FILE,
  // 暴露内部函数供浏览器端生成器同步使用
  _computeCheck1: computeCheck1,
  _computeCheck2: computeCheck2,
  _base62Encode: base62Encode,
  _SECRET_KEY: SECRET_KEY,
  _SALT: SALT,
};
