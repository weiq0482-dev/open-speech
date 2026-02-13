# OpenSpeck - AI 助手

基于 Gemini 大模型的智能 AI 助手，复刻 Google Gemini 网页版体验。

## 功能

- **多轮对话** - 支持上下文记忆的连续对话
- **流式输出** - 实时显示 AI 回复
- **Markdown 渲染** - 支持代码高亮、表格、列表等
- **模型切换** - 支持多个 Gemini 模型
- **工具模式** - Deep Research / 图片生成 / Canvas / 学习辅导
- **文件上传** - 支持图片和文档上传
- **对话管理** - 新建 / 切换 / 删除对话
- **暗色模式** - 支持深色 / 浅色主题
- **语音输入** - 语音转文字输入

## 快速开始

1. 安装依赖：
```bash
npm install
```

2. 配置环境变量：
编辑 `.env.local` 文件，填入你的 API Key 和中转地址：
```
GEMINI_API_KEY=你的API密钥
GEMINI_API_BASE=https://你的中转地址
```

3. 启动开发服务器：
```bash
npm run dev
```

4. 打开浏览器访问 http://localhost:3000

## 技术栈

- **Next.js 14** - React 全栈框架
- **TailwindCSS** - 样式
- **Zustand** - 状态管理
- **React Markdown** - Markdown 渲染
- **Lucide Icons** - 图标库
