// baby.js — 虾宝出生证明主逻辑

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

// ========== 随机属性池 ==========
const ATTRS = {
  skills: ['AI绘画', '智能对话', '文案创作', '数据分析', '视频剪辑', '语音合成', '知识问答', '代码生成', '翻译达人', '思维导图'],
  personalities: ['活泼好动', '温柔体贴', '古灵精怪', '沉着冷静', '好奇心强', '乐于助人', '调皮可爱', '善解人意'],
  hobbies: ['游泳', '学习新技能', '和人类聊天', '探索互联网', '整理数据', '听音乐', '画画', '读电子书'],
  dreams: ['成为AI大师', '帮助10万学员', '环游数字世界', '成为超级助手', '学会所有语言', '创造美好作品']
};

function randomPick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function generateId() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let id = '';
  for (let i = 0; i < 6; i++) id += chars[Math.floor(Math.random() * chars.length)];
  return `XB-2026-${id}`;
}

// ========== 状态 ==========
let state = {
  name: '',
  gender: '',
  id: '',
  date: '',
  skill: '',
  personality: '',
  hobby: '',
  dream: ''
};

// ========== 步骤切换 ==========
function showStep(name) {
  $$('.step').forEach(el => el.classList.remove('active'));
  const target = $(`#step-${name}`);
  target.classList.add('active');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ========== Step 1: 打字机效果 ==========
function typewriter(text, el, speed = 60) {
  return new Promise(resolve => {
    let i = 0;
    el.textContent = '';
    const timer = setInterval(() => {
      if (i < text.length) {
        el.textContent += text[i];
        i++;
      } else {
        clearInterval(timer);
        resolve();
      }
    }, speed);
  });
}

// ========== Step 2: 表单逻辑 ==========
function validateName() {
  const name = $('#baby-name').value.trim();
  const hint = $('#name-hint');
  const btn = $('#btn-hatch');

  if (name.length === 0) {
    hint.textContent = '请输入虾宝的名称';
    hint.className = 'form-hint';
    btn.disabled = true;
    return false;
  }
  if (name.length < 2) {
    hint.textContent = '名称至少需要2个字哦';
    hint.className = 'form-hint error';
    btn.disabled = true;
    return false;
  }
  hint.textContent = `${name}，好名字！`;
  hint.className = 'form-hint valid';
  state.name = name;
  updateHatchBtn();
  return true;
}

function updateHatchBtn() {
  const btn = $('#btn-hatch');
  btn.disabled = !state.name || !state.gender;
}

// ========== Step 3: 孵化动画 ==========
function playHatching() {
  return new Promise(resolve => {
    const egg = $('#egg-container');
    const cracks = $('#egg-cracks');
    const text = $('#hatching-text');

    const messages = ['正在注入灵魂...', 'AI正在赋能...', '即将诞生...'];
    let msgIdx = 0;

    // 摇晃阶段
    text.textContent = messages[0];
    setTimeout(() => {
      text.textContent = messages[1];
      // 加大摇晃
      egg.classList.remove('egg-container');
      void egg.offsetWidth;
      egg.className = 'egg-container cracking';
    }, 1200);

    // 裂纹阶段
    setTimeout(() => {
      text.textContent = messages[2];
      cracks.setAttribute('opacity', '1');
      // 播放粒子爆炸
      if (window.particlesBurst) window.particlesBurst();
    }, 2400);

    // 破壳阶段
    setTimeout(() => {
      egg.className = 'egg-container hatching';
    }, 3200);

    // 完成
    setTimeout(() => {
      resolve();
    }, 3800);
  });
}

// ========== Step 4: 填充证明 ==========
function fillCertificate() {
  const now = new Date();
  const dateStr = `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日 ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

  state.id = generateId();
  state.date = dateStr;
  state.skill = randomPick(ATTRS.skills);
  state.personality = randomPick(ATTRS.personalities);
  state.hobby = randomPick(ATTRS.hobbies);
  state.dream = randomPick(ATTRS.dreams);

  // 切换证明上的虾宝形象
  const avatarImg = $('#cert-avatar-img');
  avatarImg.src = state.gender === 'male' ? 'assets/male.png' : 'assets/female.png';
  avatarImg.alt = state.gender === 'male' ? '虾宝弟' : '虾宝妹';

  // 填充信息
  $('#cert-name-display').textContent = state.name;
  $('#cert-name').textContent = state.name;
  $('#cert-gender').textContent = state.gender === 'male' ? '虾宝弟' : '虾宝妹';
  $('#cert-id').textContent = state.id;
  $('#cert-date').textContent = state.date;
  $('#attr-skill').textContent = state.skill;
  $('#attr-personality').textContent = state.personality;
  $('#attr-hobby').textContent = state.hobby;
  $('#attr-dream').textContent = state.dream;
}

// ========== 重置 ==========
function resetAll() {
  state = { name: '', gender: '', id: '', date: '', skill: '', personality: '', hobby: '', dream: '' };
  $('#baby-name').value = '';
  $('#name-hint').textContent = '请输入虾宝的名称';
  $('#name-hint').className = 'form-hint';
  $$('.gender-card').forEach(c => {
    c.className = 'gender-card';
  });
  $('#btn-hatch').disabled = true;
  // 重置蛋
  const egg = $('#egg-container');
  egg.className = 'egg-container';
  $('#egg-cracks').setAttribute('opacity', '0');
  // 重置头像滤镜
  $('#cert-avatar').style.filter = '';
  showStep('intro');
}

// ========== 事件绑定 ==========
document.addEventListener('DOMContentLoaded', async () => {
  // 启动粒子背景
  if (window.initParticles) window.initParticles();

  // 打字机效果
  await new Promise(r => setTimeout(r, 500));
  await typewriter('欢迎来到虾宝孵化中心！', $('#typewriter-text'), 80);
  await new Promise(r => setTimeout(r, 300));
  await typewriter('在这里，每只 AI 虾宝都是独一无二的。给你的虾宝取个名字，领取专属出生证明吧！', $('#typewriter-text'), 60);

  // 按钮：开始领养
  $('#btn-start').addEventListener('click', () => {
    showStep('form');
  });

  // 表单：名称输入
  $('#baby-name').addEventListener('input', validateName);

  // 表单：性别选择
  $$('.gender-card').forEach(card => {
    card.addEventListener('click', () => {
      const gender = card.dataset.gender;
      state.gender = gender;
      // 移除另一个选中
      $$('.gender-card').forEach(c => {
        c.className = 'gender-card';
      });
      card.classList.add(`selected-${gender}`);
      // 弹跳动画
      card.classList.add('bounce');
      setTimeout(() => card.classList.remove('bounce'), 400);
      updateHatchBtn();
    });
  });

  // 按钮：孵化
  $('#btn-hatch').addEventListener('click', async () => {
    if (!state.name || !state.gender) return;
    showStep('hatching');
    await playHatching();
    fillCertificate();
    showStep('certificate');
  });

  // 按钮：保存图片
  $('#btn-save').addEventListener('click', () => {
    if (window.exportCertificate) {
      window.exportCertificate(state);
    }
  });

});
