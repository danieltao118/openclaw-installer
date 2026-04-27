// particles.js — 粒子系统（浮动背景 + 爆炸效果）

(function () {
  let canvas, ctx;
  let bgParticles = [];
  let burstParticles = [];
  let animId;
  const COLORS = ['#FF6B6B', '#FF8E53', '#FF69B4', '#FFB6C1', '#7C3AED', '#3B82F6', '#A78BFA', '#FFD700'];

  function initParticles() {
    canvas = document.getElementById('particles-bg');
    if (!canvas) return;
    ctx = canvas.getContext('2d');
    resize();
    window.addEventListener('resize', resize);

    // 创建背景粒子
    const count = Math.min(40, Math.floor(window.innerWidth / 20));
    for (let i = 0; i < count; i++) {
      bgParticles.push(createBgParticle());
    }

    animate();
  }

  function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }

  function createBgParticle() {
    return {
      x: Math.random() * window.innerWidth,
      y: Math.random() * window.innerHeight,
      r: Math.random() * 3 + 1,
      dx: (Math.random() - 0.5) * 0.3,
      dy: (Math.random() - 0.5) * 0.3,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      alpha: Math.random() * 0.4 + 0.1,
      pulse: Math.random() * Math.PI * 2,
      pulseSpeed: Math.random() * 0.02 + 0.005
    };
  }

  function createBurstParticle(cx, cy) {
    const angle = Math.random() * Math.PI * 2;
    const speed = Math.random() * 6 + 2;
    return {
      x: cx,
      y: cy,
      r: Math.random() * 5 + 2,
      dx: Math.cos(angle) * speed,
      dy: Math.sin(angle) * speed,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      alpha: 1,
      decay: Math.random() * 0.02 + 0.01,
      gravity: 0.05
    };
  }

  function particlesBurst() {
    const cx = window.innerWidth / 2;
    const cy = window.innerHeight / 2;
    for (let i = 0; i < 60; i++) {
      burstParticles.push(createBurstParticle(cx, cy));
    }
  }

  function animate() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 背景粒子
    bgParticles.forEach(p => {
      p.x += p.dx;
      p.y += p.dy;
      p.pulse += p.pulseSpeed;

      // 环绕
      if (p.x < -10) p.x = canvas.width + 10;
      if (p.x > canvas.width + 10) p.x = -10;
      if (p.y < -10) p.y = canvas.height + 10;
      if (p.y > canvas.height + 10) p.y = -10;

      const a = p.alpha + Math.sin(p.pulse) * 0.15;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = p.color;
      ctx.globalAlpha = Math.max(0, a);
      ctx.fill();
    });

    // 爆炸粒子
    for (let i = burstParticles.length - 1; i >= 0; i--) {
      const p = burstParticles[i];
      p.x += p.dx;
      p.y += p.dy;
      p.dy += p.gravity;
      p.alpha -= p.decay;

      if (p.alpha <= 0) {
        burstParticles.splice(i, 1);
        continue;
      }

      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = p.color;
      ctx.globalAlpha = p.alpha;
      ctx.fill();
    }

    ctx.globalAlpha = 1;
    animId = requestAnimationFrame(animate);
  }

  window.initParticles = initParticles;
  window.particlesBurst = particlesBurst;
})();
