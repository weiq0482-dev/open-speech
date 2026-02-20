# Open-speech 项目状态总结

## 项目概述
AI 知识库系统，支持多来源资料管理、AI 分析、Studio 内容生成、播客制作等功能。

## 最新提交状态
**提交 ID**: `1f7e365`  
**时间**: 2026-02-20  
**分支**: `feature/notebook`

## 核心功能完成情况

### ✅ 已完成
1. **知识库基础功能**
   - 笔记本创建、编辑、删除
   - 来源管理（文件、URL、视频、文字）
   - AI 对话分析
   - 讨论组功能

2. **视频字幕提取与音频转录**
   - YouTube：字幕提取（音频转录因防盗链已禁用）
   - B站：字幕提取 + 音频转录（DASH纯音频 + DashScope OSS）
   - 其他平台：通用网页抓取

3. **Studio 内容生成**
   - 学习指南、常见问题、大纲摘要等6种类型
   - 支持千问/Gemini双模型
   - 修复了模型名称错误问题

4. **播客功能**
   - 朗读模式/对话模式
   - 分模式独立存储（切换不覆盖）
   - TTS 优化（语速0.9，系统中文声音）

5. **UI 优化**
   - 来源标注小斜体显示
   - 清空AI分析/讨论组按钮
   - 左右栏抽屉折叠
   - 响应式设计

### 🔧 技术栈
- **前端**: Next.js 14, React, TypeScript, TailwindCSS
- **后端**: Next.js API Routes
- **数据库**: Upstash Redis
- **AI**: 阿里云 DashScope, Google Gemini
- **音频**: Web Speech API, Edge TTS

### 📁 关键文件结构
```
src/
├── app/
│   ├── api/notebook/[id]/          # 知识库API
│   │   ├── chat/                   # AI对话
│   │   ├── studio/                 # Studio生成
│   │   ├── podcast/                 # 播客
│   │   └── sources/                 # 来源管理
│   └── notebook/[id]/page.tsx      # 主页面
├── components/notebook/             # 知识库组件
├── lib/
│   ├── audio-transcribe.ts         # 音频转录核心
│   └── notebook-utils.ts            # 工具函数
└── store/notebook-store.ts          # 状态管理
```

## 当前问题与注意事项

### ⚠️ 已知问题
1. **Tailwind CSS 警告**: `@tailwind` 规则无法识别（功能正常，IDE问题）
2. **B站长视频转录**: 1小时视频需要60-90秒（正常，需要下载30MB音频）

### 🔑 环境变量配置
确保以下环境变量已配置：
- `KV_REST_API_URL`: Upstash Redis URL
- `KV_REST_API_TOKEN`: Upstash Redis Token
- `AI_API_BASE`: AI API Base URL
- `AI_API_KEY`: AI API Key

### 📊 性能参考
- **短视频转录（5-10分钟）**: 10-20秒
- **长视频转录（1小时）**: 60-90秒
- **Studio生成**: 10-30秒（取决于内容长度）
- **播客生成**: 15-45秒

## 开发环境运行
```bash
npm run dev
# 访问 http://localhost:3000
```

## 部署环境
- **前端**: Vercel（推荐）
- **Redis**: Upstash
- **AI服务**: 阿里云 DashScope / Google Gemini

## 下一步计划
1. 修复 Tailwind CSS IDE 警告
2. 优化长视频转录速度
3. 添加更多播客声音选择
4. 实现批量来源导入
5. 添加知识库模板功能

## 重要技术决策
1. **音频转录方案**: 使用 DashScope 文件上传凭证API绕过防盗链
2. **播客存储**: 按模式分开存储，避免互相覆盖
3. **UI框架**: 使用抽屉式折叠优化屏幕利用
4. **模型选择**: 支持千问/Gemini双模型，自动适配

---
*更新时间: 2026-02-20*
