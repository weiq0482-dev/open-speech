# Open-speech 开发指南

## 快速开始

### 1. 环境准备
```bash
# 克隆项目
git clone <repository-url>
cd Open-speech

# 安装依赖
npm install

# 配置环境变量
cp .env.example .env
# 编辑 .env 文件，填入必要配置
```

### 2. 环境变量配置
```env
# Redis (Upstash)
KV_REST_API_URL=https://xxx.upstash.io
KV_REST_API_TOKEN=xxx

# AI 服务
AI_API_BASE=https://4sapi.com  # 或其他 Gemini API
AI_API_KEY=xxx

# 可选：千问 API（如果使用阿里云）
# 在系统设置中配置 qwenApiKey
```

### 3. 启动开发服务器
```bash
npm run dev
# 访问 http://localhost:3000
```

## 核心功能开发

### 知识库系统架构
```
用户 → 笔记本 → 来源 → AI分析/Studio/播客
```

### 关键组件说明

#### 1. 音频转录 (`src/lib/audio-transcribe.ts`)
- **核心功能**: 处理有防盗链的音频（如B站）
- **流程**: 下载音频 → 上传DashScope OSS → 转录
- **关键函数**: `transcribeAudioUrl()`, `uploadAudioToDashScope()`

#### 2. 知识库页面 (`src/app/notebook/[id]/page.tsx`)
- **布局**: 三栏式（来源-对话-Studio）
- **新功能**: 左右栏抽屉折叠
- **状态管理**: `leftOpen`, `rightOpen`

#### 3. Studio 生成 (`src/app/api/notebook/[id]/studio/route.ts`)
- **支持类型**: 6种（学习指南、FAQ等）
- **模型**: 自动适配千问/Gemini
- **注意**: 模型名称使用 `qwen-plus`（不是 `qwen3.5-plus`）

#### 4. 播客系统 (`src/app/api/notebook/[id]/podcast/route.ts`)
- **模式**: 朗读模式/对话模式
- **存储**: 按模式分开存储（避免覆盖）
- **TTS**: Web Speech API + 系统中文声音

### 开发注意事项

#### 1. TypeScript 类型安全
- 使用 `useNotebookStore` 时确保类型正确
- 新增功能时更新接口定义

#### 2. 错误处理
- API 调用使用 try-catch
- 用户友好的错误提示
- 额度不足时的特殊处理

#### 3. 性能优化
- 大文件使用流式处理
- Redis 批量操作
- 组件懒加载

## 常见问题解决

### Q: Studio 生成失败（400错误）
**原因**: 模型名称错误或来源内容为空
**解决**: 
- 检查 `qwen-plus` 模型名
- 确认来源已启用且有内容

### Q: B站音频转录慢
**原因**: 长视频需要下载完整音频
**解决**: 
- 短视频（<10分钟）正常速度
- 长视频需要60-90秒，属正常现象

### Q: 播客切换模式后脚本消失
**原因**: 之前只存储一份，会互相覆盖
**解决**: 已修复，按模式分开存储

### Q: Tailwind CSS 警告
**原因**: IDE 配置问题
**解决**: 功能正常，可忽略警告

## 调试技巧

### 1. 查看日志
```bash
# 开发服务器日志在终端
# 生产环境查看 Vercel 日志
```

### 2. Redis 调试
```bash
# 使用 Upstash Redis Console
# 或使用 Redis CLI 连接
```

### 3. API 测试
```bash
# 测试音频转录
curl -X POST http://localhost:3000/api/notebook/[id]/studio \
  -H "Content-Type: application/json" \
  -d '{"userId":"u_xxx","type":"guide"}'
```

## 部署指南

### Vercel 部署
```bash
# 安装 Vercel CLI
npm i -g vercel

# 部署
vercel --prod
```

### 环境变量设置
在 Vercel Dashboard 中设置环境变量：
- `KV_REST_API_URL`
- `KV_REST_API_TOKEN`
- `AI_API_BASE`
- `AI_API_KEY`

## 代码规范

### 1. 文件命名
- 组件: `PascalCase.tsx`
- 工具: `camelCase.ts`
- 页面: `kebab-case.tsx`

### 2. 提交规范
```bash
feat: 新功能
fix: 修复bug
docs: 文档更新
style: 代码格式
refactor: 重构
```

### 3. 注释规范
- 复杂逻辑添加中文注释
- API 接口说明参数和返回值
- 组件 props 说明用途

## 扩展开发

### 添加新的 Studio 类型
1. 在 `STUDIO_TYPES` 中添加定义
2. 更新前端显示逻辑
3. 测试生成效果

### 添加新的来源类型
1. 更新 `NotebookSource` 接口
2. 在 `notebook-sources.tsx` 添加处理逻辑
3. 更新图标和样式

### 优化音频转录
1. 支持更多平台
2. 优化下载速度
3. 添加音频格式转换

---
*更新时间: 2026-02-20*
