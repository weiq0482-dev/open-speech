# OpenSpeech - AI 智能助手

基于 Gemini 大模型的智能 AI 助手，提供多模态交互、工具调用、桌面应用等完整体验。

## ✨ 核心功能

### 🤖 智能对话
- **多轮对话** - 支持上下文记忆的连续对话
- **流式输出** - 实时显示 AI 回复，打字机效果
- **Markdown 渲染** - 支持代码高亮、表格、列表、LaTeX 公式
- **模型切换** - 支持多个 Gemini 模型（thinking-high / pro-image）

### 🛠️ 工具模式
- **Deep Think** - 深度思考模式，复杂问题推理
- **Deep Research** - 深度研究，多角度分析
- **图片生成** - AI 绘图（支持标准/2K/4K 分辨率）
- **局部改图** - 画笔标注 + 指令修改图片局部
- **Canvas** - 代码助手，实时预览
- **学习辅导** - 教育场景专用
- **文档分析** - 上传文档深度解析
- **头脑风暴** - 灵感源泉，创意生成

### 📁 多模态输入
- **图片上传** - 支持多张参考图，带编号标注
- **音频上传** - 支持音频文件分析
- **视频上传** - 支持视频内容理解
- **语音输入** - 实时语音转文字

### 💻 桌面应用
- **Electron 打包** - Windows Portable EXE（~105MB）
- **PWA 支持** - 可安装到桌面，离线使用
- **移动端适配** - 响应式设计 + 安全区域

### 🎨 界面体验
- **暗色模式** - 支持深色/浅色主题切换
- **对话管理** - 新建/切换/删除对话
- **停止生成** - AbortController 中断请求
- **快捷操作** - 复制/重新生成/编辑消息

## 🚀 快速开始

### 本地开发

1. **克隆项目**
```bash
git clone https://github.com/weiq0482-dev/open-speech.git
cd open-speech
```

2. **安装依赖**
```bash
npm install
```

3. **配置环境变量**

创建 `.env.local` 文件：
```env
# 4sapi 中转配置
GEMINI_API_KEY=sk-your-api-key
GEMINI_API_BASE=https://4sapi.com
```

4. **启动开发服务器**
```bash
npm run dev
```

5. **访问应用**
打开浏览器访问 http://localhost:3001

### Electron 桌面应用

1. **打包应用**
```bash
# 设置国内镜像
set ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/

# 打包 Windows Portable
npm run build:electron
```

2. **运行应用**
生成的 exe 文件位于 `dist-electron/` 目录

### 快捷启动（Windows）

双击 `start-openspeck.bat` 即可启动开发服务器

## 📦 部署指南

### Vercel 部署

1. **Fork 本项目到你的 GitHub**

2. **在 Vercel 导入项目**
   - 访问 [Vercel](https://vercel.com)
   - 点击 "Import Project"
   - 选择你的 GitHub 仓库

3. **配置环境变量**
在 Vercel 项目设置中添加：
```
GEMINI_API_KEY=sk-your-api-key
GEMINI_API_BASE=https://4sapi.com
```

4. **部署**
点击 "Deploy" 即可自动部署

### 自定义域名

在 Vercel 项目设置中添加你的域名（如 `refine-life.vip`）

## 🔧 技术栈

- **Next.js 14** - React 全栈框架，App Router
- **TypeScript** - 类型安全
- **TailwindCSS** - 原子化 CSS
- **Zustand** - 轻量级状态管理
- **React Markdown** - Markdown 渲染
- **React Syntax Highlighter** - 代码高亮
- **Lucide Icons** - 现代图标库
- **Electron** - 桌面应用打包

## 📝 API 配置说明

### 4sapi 中转服务

- **Base URL**: `https://4sapi.com`
- **文本模型**: `gemini-3-pro-preview-thinking-high`
- **图片模型**: `gemini-3-pro-image`
- **端点格式**: 
  - 非流式: `/v1beta/models/{model}:generateContent`
  - 流式: `/v1beta/models/{model}:streamGenerateContent?alt=sse`

### 请求格式

```typescript
{
  "contents": [{
    "parts": [
      { "text": "你的问题" },
      { "inline_data": { "mime_type": "image/jpeg", "data": "base64..." } }
    ]
  }]
}
```

## 🎯 使用说明

### 基础对话
1. 在输入框输入问题
2. 点击发送或按 Enter
3. AI 实时流式回复

### 工具调用
1. 点击输入框左侧的工具图标
2. 选择对应工具（Deep Think / 图片生成等）
3. 输入指令，AI 自动切换模型

### 多模态输入
1. 点击输入框左侧的附件图标
2. 上传图片/音频/视频
3. 输入问题，AI 理解多模态内容

### 图片生成
1. 选择"图片生成"工具
2. 输入描述（如"一只可爱的猫"）
3. 选择分辨率（标准/2K/4K）
4. 等待生成

### 局部改图
1. 生成图片后，点击"编辑"按钮
2. 用画笔标注要修改的区域
3. 输入修改指令（如"把这里改成蓝色"）
4. 发送，AI 局部修改

## 🔒 隐私说明

- 本项目不收集任何用户数据
- 对话记录仅存储在本地浏览器
- API 请求通过 4sapi 中转，不经过第三方服务器

## 🐛 常见问题

### 1. API 请求失败
检查 `.env.local` 中的 API Key 是否正确

### 2. 图片上传失败
确保图片大小 < 10MB，格式为 jpg/png/webp

### 3. Electron 打包失败
设置国内镜像：`set ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/`

### 4. 端口被占用
修改 `package.json` 中的端口号（默认 3001）

## 📧 联系方式

如有问题或建议，请提交 Issue
