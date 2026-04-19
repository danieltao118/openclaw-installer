#!/usr/bin/env node
// scripts/generate-codes.js — 批量生成激活码
// 用法: node scripts/generate-codes.js [--count 50] [--type C]

const activation = require('./activation');

// 解析命令行参数
const args = process.argv.slice(2);
let count = 50;
let type = 'C';

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--count' && args[i + 1]) {
    count = parseInt(args[i + 1], 10);
    i++;
  } else if (args[i] === '--type' && args[i + 1]) {
    type = args[i + 1].toUpperCase();
    i++;
  }
}

if (!activation.CODE_TYPES[type]) {
  console.error(`错误: 未知类型 "${type}"，可选: ${Object.keys(activation.CODE_TYPES).join(', ')}`);
  process.exit(1);
}

const typeName = activation.CODE_TYPES[type].name;
const days = activation.CODE_TYPES[type].days;

console.log(`\n生成 ${count} 个激活码 — 类型: ${typeName} (${days}天)`);
console.log('='.repeat(50));

const codes = [];
for (let i = 0; i < count; i++) {
  const code = activation.generateCode(type);
  codes.push(code);
  console.log(`  ${i + 1}. ${code}`);
}

// 输出 CSV
const csvPath = `activation-codes-${type}-${new Date().toISOString().slice(0, 10)}.csv`;
const fs = require('fs');
const csvContent = ['序号,激活码,类型,有效期(天)', ...codes.map((c, i) => `${i + 1},${c},${typeName},${days}`)].join('\n');
fs.writeFileSync(csvPath, '\uFEFF' + csvContent, 'utf8'); // BOM for Excel

console.log('='.repeat(50));
console.log(`\n已保存到: ${csvPath}`);
console.log(`共 ${count} 个激活码，可打印分发\n`);
