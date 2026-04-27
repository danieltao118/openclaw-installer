// baby-certificate.js — Canvas 渲染科技风出生证明并导出 PNG
// 精确匹配 baby.css 中 .certificate 的设计

(function () {
  var W = 1080;
  var H = 1920;

  // 用 fetch + blob 加载图片，避免跨域污染 Canvas
  function loadImageAsBlob(src) {
    return fetch(src)
      .then(function (r) { return r.blob(); })
      .then(function (blob) { return createImageBitmap(blob); })
      .catch(function () {
        return new Promise(function (resolve, reject) {
          var img = new Image();
          img.onload = function () { resolve(img); };
          img.onerror = reject;
          img.src = src;
        });
      });
  }

  function exportCertificate(state) {
    var btn = document.getElementById('btn-save');
    if (btn) { btn.textContent = '生成中...'; btn.disabled = true; }

    var avatarSrc = state.gender === 'male' ? 'assets/male.png' : 'assets/female.png';

    loadImageAsBlob(avatarSrc)
      .then(function (avatarImg) {
        var canvas = document.getElementById('export-canvas');
        if (!canvas) { throw new Error('Canvas not found'); }
        var ctx = canvas.getContext('2d');
        renderCertificate(ctx, state, avatarImg);
      })
      .catch(function (err) {
        console.error('exportCertificate error:', err);
        try {
          var canvas = document.getElementById('export-canvas');
          var ctx = canvas.getContext('2d');
          renderCertificate(ctx, state, null);
        } catch (e2) {
          alert('保存失败: ' + e2.message);
        }
      })
      .finally(function () {
        if (btn) { btn.textContent = '保存图片'; btn.disabled = false; }
      });
  }

  // 绘制发光球（匹配 CSS .glow）
  function drawGlowOrb(ctx, x, y, radius, color) {
    var grad = ctx.createRadialGradient(x, y, 0, x, y, radius);
    grad.addColorStop(0, color);
    grad.addColorStop(1, 'transparent');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  function renderCertificate(ctx, state, avatarImg) {
    ctx.clearRect(0, 0, W, H);

    // === 背景: 匹配 CSS --bg: #0A0A1A + 发光球 ===
    ctx.fillStyle = '#0A0A1A';
    ctx.fillRect(0, 0, W, H);

    // 发光球效果（匹配 CSS .glow-1/2/3 的颜色和位置）
    drawGlowOrb(ctx, W * 0.88, H * 0.05, 350, 'rgba(255, 105, 180, 0.12)');
    drawGlowOrb(ctx, W * 0.1, H * 0.92, 320, 'rgba(124, 58, 237, 0.1)');
    drawGlowOrb(ctx, W * 0.5, H * 0.38, 220, 'rgba(255, 107, 107, 0.08)');

    // === 主卡片 ===
    // 匹配 CSS:
    //   background: linear-gradient(145deg, #0d1b2a, #1b2838, #0d1b2a)
    //   border: 1.5px solid rgba(59, 130, 246, 0.4)
    //   box-shadow: 0 0 30px rgba(59, 130, 246, 0.15)
    //   border-radius: 16px
    var cardX = 60, cardY = 80, cardW = W - 120, cardR = 36;

    // 卡片外阴影发光
    ctx.save();
    ctx.shadowColor = 'rgba(59, 130, 246, 0.18)';
    ctx.shadowBlur = 70;
    roundRect(ctx, cardX, cardY, cardW, 1400, cardR);
    ctx.fillStyle = '#0d1b2a';
    ctx.fill();
    ctx.restore();

    // 卡片渐变背景
    var cardGrad = ctx.createLinearGradient(cardX, cardY, cardX + cardW * 0.4, cardY + 1400);
    cardGrad.addColorStop(0, '#0d1b2a');
    cardGrad.addColorStop(0.5, '#1b2838');
    cardGrad.addColorStop(1, '#0d1b2a');
    roundRect(ctx, cardX, cardY, cardW, 1400, cardR);
    ctx.fillStyle = cardGrad;
    ctx.fill();

    // 发光边框
    roundRect(ctx, cardX, cardY, cardW, 1400, cardR);
    ctx.strokeStyle = 'rgba(59, 130, 246, 0.4)';
    ctx.lineWidth = 3;
    ctx.stroke();

    // 顶部内高光（匹配 inset 0 1px 0 rgba(255,255,255,0.06)）
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(cardX + cardR, cardY + 1.5);
    ctx.lineTo(cardX + cardW - cardR, cardY + 1.5);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();

    // 内容区域边距（匹配 certificate padding: 24px 18px → 缩放约 2.5x）
    var padL = 48, padR = 48;
    var contentX = cardX + padL;
    var contentW = cardW - padL - padR;
    var y = cardY + 70;

    // === 顶部品牌 ===
    // 匹配 .cert-brand: 0.7rem, rgba(160,180,220,0.5)
    ctx.font = '28px "PingFang SC", "Microsoft YaHei", sans-serif';
    ctx.fillStyle = 'rgba(160, 180, 220, 0.5)';
    ctx.textAlign = 'center';
    ctx.fillText('教培AI实战营 · OpenClaw', W / 2, y);
    y += 55;

    // === 标题（渐变色） ===
    // 匹配 .cert-title: 1.4rem, bold 800, linear-gradient(135deg, #00d4ff, #7C3AED, #FF6B6B)
    var titleGrad = ctx.createLinearGradient(W / 2 - 280, 0, W / 2 + 280, 0);
    titleGrad.addColorStop(0, '#00d4ff');
    titleGrad.addColorStop(0.5, '#7C3AED');
    titleGrad.addColorStop(1, '#FF6B6B');
    ctx.font = 'bold 60px "PingFang SC", "Microsoft YaHei", sans-serif';
    ctx.fillStyle = titleGrad;
    ctx.fillText('虾宝出生证明', W / 2, y);
    y += 32;

    // 匹配 .cert-subtitle: 0.55rem, rgba(160,180,220,0.5)
    ctx.font = '20px sans-serif';
    ctx.fillStyle = 'rgba(160, 180, 220, 0.5)';
    ctx.fillText('SHRIMP BABY BIRTH CERTIFICATE', W / 2, y);
    y += 50;

    // === 主内容区：左图右信息 ===
    // 匹配 .cert-main: flex, gap 16px, padding 14px, background rgba(255,255,255,0.03)
    var mainPad = 30;
    var mainX = contentX;
    var mainW = contentW;
    var mainH = 460;
    roundRect(ctx, mainX, y, mainW, mainH, 24);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.03)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // --- 左侧头像 ---
    // 匹配 .cert-avatar-ring: 100px circle, border 2px rgba(59,130,246,0.5), shadow 20px
    var avatarR = 110;
    var avatarCX = mainX + mainPad + avatarR + 10;
    var avatarCY = y + mainH / 2 - 15;

    // 头像发光环
    ctx.save();
    ctx.shadowColor = 'rgba(59, 130, 246, 0.25)';
    ctx.shadowBlur = 45;
    ctx.beginPath();
    ctx.arc(avatarCX, avatarCY, avatarR + 4, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(59, 130, 246, 0.5)';
    ctx.lineWidth = 4;
    ctx.stroke();
    ctx.restore();

    // 头像背景
    ctx.beginPath();
    ctx.arc(avatarCX, avatarCY, avatarR, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.fill();

    // 绘制头像图片
    if (avatarImg) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(avatarCX, avatarCY, avatarR - 4, 0, Math.PI * 2);
      ctx.clip();
      var imgS = (avatarR - 4) * 2;
      ctx.drawImage(avatarImg, avatarCX - imgS / 2, avatarCY - imgS / 2, imgS, imgS);
      ctx.restore();
    }

    // 头像下方名字（匹配 .cert-avatar-name: 0.85rem, bold 700, #00d4ff）
    ctx.font = 'bold 30px "PingFang SC", "Microsoft YaHei", sans-serif';
    ctx.fillStyle = '#00d4ff';
    ctx.textAlign = 'center';
    ctx.fillText(state.name, avatarCX, avatarCY + avatarR + 40);

    // --- 右侧信息 ---
    // 匹配 .cert-right: flex column, gap 10px
    var rightX = avatarCX + avatarR + 45;
    var infoItems = [
      ['持证虾宝', state.name],
      ['性别', state.gender === 'male' ? '虾宝弟' : '虾宝妹'],
      ['出生时间', state.date],
      ['出生地点', '教培AI实战营'],
      ['专属编号', state.id]
    ];

    // 匹配 .ci-label: 0.65rem, rgba(160,180,220,0.6)
    // 匹配 .ci-value: 0.9rem, bold 700, #e0e8f0
    var ry = y + 45;
    for (var i = 0; i < infoItems.length; i++) {
      var label = infoItems[i][0];
      var value = infoItems[i][1];

      // 标签
      ctx.font = '22px "PingFang SC", "Microsoft YaHei", sans-serif';
      ctx.fillStyle = 'rgba(160, 180, 220, 0.6)';
      ctx.textAlign = 'left';
      ctx.fillText(label, rightX, ry);
      ry += 28;

      // 值
      if (label === '专属编号') {
        // 匹配 .ci-id: 0.7rem, #7C3AED, monospace
        ctx.font = 'bold 26px "JetBrains Mono", "Consolas", monospace';
        ctx.fillStyle = '#7C3AED';
      } else if (label === '出生时间') {
        // 匹配 .ci-sm: 0.75rem
        ctx.font = 'bold 28px "PingFang SC", "Microsoft YaHei", sans-serif';
        ctx.fillStyle = '#e0e8f0';
      } else {
        ctx.font = 'bold 32px "PingFang SC", "Microsoft YaHei", sans-serif';
        ctx.fillStyle = '#e0e8f0';
      }
      ctx.fillText(value, rightX, ry);
      ry += 44;
    }

    y += mainH + 40;

    // === 属性芯片 ===
    // 匹配 .cert-chips: grid 2x2, gap 10px
    var attrs = [
      { tag: '技能', value: state.skill, c1: '#00d4ff', c2: '#0ea5e9' },
      { tag: '性格', value: state.personality, c1: '#a78bfa', c2: '#7c3aed' },
      { tag: '爱好', value: state.hobby, c1: '#f472b6', c2: '#ec4899' },
      { tag: '梦想', value: state.dream, c1: '#fbbf24', c2: '#f59e0b' }
    ];

    var chipGap = 22;
    var chipW = (contentW - chipGap) / 2;
    var chipH = 88;
    var chipR = 20;

    for (i = 0; i < attrs.length; i++) {
      var col = i % 2;
      var row = Math.floor(i / 2);
      var cx = contentX + col * (chipW + chipGap);
      var cy = y + row * (chipH + chipGap);

      // 匹配 .cert-chip: padding 10px 12px, background rgba(255,255,255,0.03), border-radius 10px
      roundRect(ctx, cx, cy, chipW, chipH, chipR);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.03)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // 渐变标签（匹配 .chip-tag: 0.6rem, bold 700, white, gradient bg）
      var tagW = 76, tagH = 34;
      var tagX = cx + 16;
      var tagY = cy + (chipH - tagH) / 2;
      var tagGrad = ctx.createLinearGradient(tagX, tagY, tagX + tagW, tagY + tagH);
      tagGrad.addColorStop(0, attrs[i].c1);
      tagGrad.addColorStop(1, attrs[i].c2);
      roundRect(ctx, tagX, tagY, tagW, tagH, 8);
      ctx.fillStyle = tagGrad;
      ctx.fill();

      ctx.font = 'bold 20px "PingFang SC", "Microsoft YaHei", sans-serif';
      ctx.fillStyle = 'white';
      ctx.textAlign = 'center';
      ctx.fillText(attrs[i].tag, tagX + tagW / 2, tagY + 23);

      // 属性值（匹配 .chip-val: 0.8rem, bold 600, #c0c8e0）
      ctx.font = 'bold 26px "PingFang SC", "Microsoft YaHei", sans-serif';
      ctx.fillStyle = '#c0c8e0';
      ctx.textAlign = 'left';
      ctx.fillText(attrs[i].value, tagX + tagW + 14, cy + chipH / 2 + 9);
    }

    y += 2 * (chipH + chipGap) + 45;

    // === 底部语 ===
    // 匹配 .cert-motto: 0.75rem, rgba(160,180,220,0.5), italic
    ctx.font = 'italic 28px "PingFang SC", "Microsoft YaHei", sans-serif';
    ctx.fillStyle = 'rgba(160, 180, 220, 0.5)';
    ctx.textAlign = 'center';
    ctx.fillText('每一只虾宝，都是独一无二的 AI 伙伴', W / 2, y);
    y += 70;

    // === 印章 ===
    // 匹配 .stamp-circle: 64px circle → 缩放 ~160px, border 2px #c0392b, rotate -15deg, opacity 0.6
    ctx.save();
    ctx.translate(cardX + cardW - 130, y);
    ctx.rotate(-15 * Math.PI / 180);
    ctx.globalAlpha = 0.6;

    ctx.beginPath();
    ctx.arc(0, 0, 70, 0, Math.PI * 2);
    ctx.strokeStyle = '#c0392b';
    ctx.lineWidth = 4;
    ctx.stroke();

    ctx.font = 'bold 20px "PingFang SC", "Microsoft YaHei", sans-serif';
    ctx.fillStyle = '#c0392b';
    ctx.textAlign = 'center';
    ctx.fillText('教培AI实战营', 0, -5);
    ctx.font = '16px "PingFang SC", "Microsoft YaHei", sans-serif';
    ctx.fillText('认证领养', 0, 18);
    ctx.restore();

    // === 下载 ===
    var canvas = document.getElementById('export-canvas');
    var dataURL;
    try {
      dataURL = canvas.toDataURL('image/png');
    } catch (e) {
      console.error('toDataURL failed:', e);
      alert('图片生成失败（可能浏览器安全限制），请截图保存');
      return;
    }

    var link = document.createElement('a');
    link.download = '虾宝出生证明-' + state.name + '.png';
    link.href = dataURL;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    setTimeout(function () {
      document.body.removeChild(link);
    }, 200);
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  window.exportCertificate = exportCertificate;
})();
