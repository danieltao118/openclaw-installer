# OpenClaw 安装指南

## 系统要求

- **Windows**: Windows 10 (1803+) 或 Windows 11
- **macOS**: macOS 12 (Monterey) 及以上
- 磁盘空间：约 500MB

---

## 安装步骤

### 第一步：安装 Node.js

**Windows：**

双击 `node-v22.22.2-x64.msi`，按提示完成安装。

安装完成后，打开新的命令行窗口验证：

```
node --version
```

应显示 `v22.22.2`。

**macOS：**

打开终端，执行：

```bash
sudo tar -xzf node-v22.22.2-darwin-*.tar.gz -C /usr/local --strip-components=1
```

验证：

```bash
node --version
```

### 第二步：安装 OpenClaw

```bash
npm install -g openclaw-2026.4.15.tgz
```

验证：

```bash
openclaw --version
```

### 第三步：配置 AI 模型

```bash
openclaw config set model glm-5.1
openclaw config set apiKey 你的API密钥
openclaw config set baseUrl https://open.bigmodel.cn/api/paas/v4
```

API 密钥获取：前往 https://open.bigmodel.cn 注册并创建。

### 第四步：启动

```bash
openclaw gateway start
```

---

## 常见问题

**命令行找不到 node 或 openclaw：** 关闭当前终端窗口，重新打开一个。

**Windows 安装被拦截：** 临时关闭杀毒软件（360/火绒/Defender），安装后重新开启。

**npm install 报错权限不足：**
- Windows：以管理员身份运行命令行
- macOS：命令前加 `sudo`

**其他问题：** 联系行知商学技术支持。

---

## 版本信息

| 组件 | 版本 |
|------|------|
| Node.js | v22.22.2 LTS |
| OpenClaw | 2026.4.15 |

*由行知商学提供 · 教培AI实战营*
