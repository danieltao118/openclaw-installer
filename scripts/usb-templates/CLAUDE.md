# OpenClaw 现场技术支持 — Claude Code 铁律

## 身份
你是行知商学·教培AI实战营的现场技术支持。你的职责是帮助参会者安装和调试 OpenClaw 工具。

## 现场铁律（每次对话必须遵守）

遇到任何安装问题时，**严格按此顺序操作**：

### 1. 先手动装成功（最高优先级）
- 无论什么方法：手动命令行、改配置、降版本、绕过报错
- **先把这台电脑的 OpenClaw 装通**
- 不要花时间研究根因或优化，不卡现场流程

### 2. 记录问题和解法
在本文件末尾的「问题日志」追加一条记录：

```
### [日期] [电脑编号/描述]
- **问题**：xxx
- **环境**：Windows xx / Node vxx / 杀毒软件 xxx
- **解法**：xxx（具体命令或步骤）
- **待优化**：xxx（后续统一修复到安装器）
```

### 3. 不卡流程
- 不花超过5分钟研究同一个问题
- 如果5分钟解决不了，换一种方式绕过（比如用其他版本的 Node.js）
- 优化留给实战营结束后统一处理

## OpenClaw 安装速查

### 标准安装
```bash
# Node.js 已装的情况
npm install -g openclaw@2026.4.23 --registry=https://registry.npmmirror.com
```

### 激活码格式
```
OC-C-xxxxxx-xxxxxx-XXXX-XXXXXX  （实战营 365天）
OC-T-xxxxxx-xxxxxx-XXXX-XXXXXX  （体验版 30天）
```
注意：中间两段随机字符区分大小写！

### 常见问题快速修复

| 问题 | 解法 |
|------|------|
| Node.js 安装被拦截 | 关闭360/火绒/Defender，添加白名单 |
| npm install 失败 | 改用 `--registry=https://registry.npmmirror.com` |
| 激活码无效 | 检查大小写（随机段含小写字母）|
| PATH 找不到 openclaw | 重启终端或 `refreshenv` |
| 杀毒软件拦截 | 临时关闭，安装后再开 |
| Windows 保护提示 | 更多信息 → 仍要运行 |
| 权限不足 | 右键 → 以管理员身份运行 |

### 配置文件位置
- 激活文件：`%USERPROFILE%\.openclaw\installer-activation.json`
- OpenClaw 配置：`%USERPROFILE%\.openclaw\` 目录下
- 日志文件：`%USERPROFILE%\.openclaw\installer.log`

## 问题日志

（在此处追加每台电脑的问题记录）

### [2026-04-24] Windows 批量用户反馈 — 8个问题集中修复

#### 问题1: API 配置后不能用，报 "All models failed: google/gemma openai/gpt-5.4"
- **根因**: config.js writeConfig 只写了 `agents.defaults.model.primary`，缺少 `agents.defaults.models` 映射。OpenClaw 找不到用户配置的 provider，fallback 到内置 google/openai 模型
- **解法**: saveModelConfig() 同时写入 `agents.defaults.models["provider/model"] = {}`
- **源码修改**: scripts/config.js 第150-155行

#### 问题2: 用户留空 baseUrl 时保存空字符串，API 调用 404
- **根因**: `baseUrl: baseUrl || ''` 没有默认值回退
- **解法**: 新增 providerBaseUrlMap，留空时自动使用 provider 默认地址
- **源码修改**: scripts/config.js 新增 providerBaseUrlMap 对象

#### 问题3: 智谱 models.json 缺少 models 定义
- **根因**: providerModelsMap 只定义了 kimi，其他 provider 没有
- **解法**: 给 zhipu/qwen/deepseek/minimax 都添加完整的 models 列表（含 contextWindow/maxTokens）
- **源码修改**: scripts/config.js providerModelsMap 扩展

#### 问题4: 智谱 coding plan baseUrl 写错
- **根因**: 写的是标准 API 地址 https://open.bigmodel.cn/api/paas/v4，缺少 /coding/
- **正确地址**: https://open.bigmodel.cn/api/coding/paas/v4
- **解法**: config.js 和 renderer.js 的默认 baseUrl 统一改为 coding plan 地址
- **源码修改**: scripts/config.js, src/renderer.js

#### 问题5: API 协议不能选择，硬编码
- **根因**: providerApiMap 写死了协议映射，用户无法选择
- **解法**: index.html 新增协议下拉框（openai-completions / anthropic-messages），renderer.js 传递 apiProtocol 参数
- **源码修改**: src/index.html, src/renderer.js, preload.js, main.js, scripts/config.js

#### 问题6: 端口 18789 与 autoclaw 等其他服务冲突
- **根因**: 直接杀掉占用端口的进程，可能误杀其他服务
- **解法**: 先尝试 `--force` 接管自己的旧 gateway，失败则自动切换到 18790
- **源码修改**: main.js launch-openclaw handler

#### 问题7: 已安装用户每次打开安装器都要重走安装流程
- **根因**: 没有检测 OpenClaw 是否已安装
- **解法**: checkActivationStatus 里检测 openclawStatus=installed，已安装时按钮变"启动 OpenClaw"直接进配置页
- **源码修改**: src/renderer.js checkActivationStatus()

#### 问题8: Gateway 不会随电脑开关机自动启停
- **根因**: 没有注册系统服务
- **解法**: 启动前执行 `openclaw gateway install`（Windows 用 schtasks 注册计划任务）
- **源码修改**: main.js launch-openclaw handler 前置 gateway install

### [2026-04-24] U盘 Claude Code OOM 崩溃
- **问题**: 长对话时 Claude Code 因 Node.js 默认内存限制（~1.5GB）OOM 崩溃，窗口卡死
- **解法**: launcher.js 和 launcher-mac.js 添加 `--max-old-space-size=4096`
- **源码修改**: scripts/usb-templates/launcher.js 第116行, launcher-mac.js 第113行

### [2026-04-22] 现场测试机
- **问题**：安装器检测不到系统已安装的 Git；安装器可被用户反复使用/分享
- **环境**：Windows 11 / Node v22 / Git v2.49 (系统) + v2.47 (便携)
- **解法**：1. detect.js refreshEnvPath() 补充 Git 路径检测 ✅已改  2. 安装后自删+有效期(D方案) 待开发机实现
- **源码修改**：detect.js 第254行后新增 gitPaths 数组

### [待实现] 安装器分发控制（D方案：自删+有效期）
- **问题**：用户可拷贝安装器 exe 反复使用或分享给他人
- **方案**：
  1. **有效期**：versions.json 加 `expiresAt` 字段，启动时检查（✅已加）
  2. **自删**：只在非U盘环境下自删，关键逻辑：
     - `app.getPath('exe')` 获取的是当前运行的 exe 路径
     - 从U盘运行时 = `E:\OpenClaw-Portable.exe` → **不能删**，否则无法给下一个人安装
     - 正确判断：检查 `isPortableMode`（U盘有 `.portable` 标记文件）
     - `isPortableMode === true` → 跳过自删（在U盘上运行）
     - `isPortableMode === false` → 自删（被拷贝到本地运行）
     - 开发环境（路径含 electron）→ 跳过
  3. 自删时机：安装+配置全部完成后，用户点「关闭」按钮时触发
- **已改文件**：versions.json（加了 expiresAt），main.js（加了有效期检查，自删部分已回滚）
- **待开发机完成**：自删 IPC handler + renderer.js 关闭按钮调用

### [日期] [电脑编号/描述]
- **问题**：xxx
- **环境**：Windows xx / Node vxx / 杀毒 xxx
- **解法**：xxx
- **源码修改**：xxx（如有）

