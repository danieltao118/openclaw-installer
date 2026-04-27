// remove-bg.js — 去掉虾宝图片的白色背景
// 使用方法: node scripts/remove-bg.js

const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

const ASSETS = path.join(__dirname, '..', 'public', 'baby', 'assets');

const files = ['male.png', 'female.png'];

async function removeBg(inputPath, outputPath) {
  console.log('Processing:', inputPath);

  const { data, info } = await sharp(inputPath)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const channels = info.channels;
  if (channels !== 4) {
    throw new Error('Expected 4 channels (RGBA), got ' + channels);
  }

  let removed = 0;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    // 白色及接近白色的像素 → 透明
    if (r > 240 && g > 240 && b > 240) {
      data[i + 3] = 0;
      removed++;
    }
  }

  console.log('  Removed', removed, 'pixels of', Math.floor(data.length / 4), 'total');

  // 先写到临时文件，成功后再覆盖原文件
  const tmpPath = outputPath + '.tmp.png';
  await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } })
    .png()
    .toFile(tmpPath);

  fs.renameSync(tmpPath, outputPath);
  console.log('  Saved:', outputPath);
}

async function main() {
  for (const file of files) {
    const filePath = path.join(ASSETS, file);
    if (!fs.existsSync(filePath)) {
      console.error('Not found:', filePath);
      continue;
    }
    await removeBg(filePath, filePath);
  }
  console.log('Done!');
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
