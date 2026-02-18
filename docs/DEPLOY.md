# 部署指南

## Vercel 部署（推荐）

### 1. 准备工作

确保你已经：
- 注册 [Vercel](https://vercel.com) 账号
- 将项目推送到 GitHub
- 获取 4sapi API Key

### 2. 导入项目

1. 登录 Vercel
2. 点击 "Add New..." → "Project"
3. 选择你的 GitHub 仓库 `open-speech`
4. 点击 "Import"

### 3. 配置环境变量

在项目设置中添加以下环境变量：

| 变量名 | 值 | 说明 |
|--------|-----|------|
| `GEMINI_API_KEY` | `sk-your-api-key` | 4sapi API Key（必填） |
| `GEMINI_API_BASE` | `https://4sapi.com` | 4sapi Base URL（必填） |
| `KV_REST_API_URL` | `https://your-redis.upstash.io` | Upstash Redis URL（可选） |
| `KV_REST_API_TOKEN` | `your-redis-token` | Upstash Redis Token（可选） |
| `ADMIN_KEY` | `your-admin-key` | 管理后台密钥（可选） |
| `RESEND_API_KEY` | `re_your_key` | Resend 邮件服务（可选） |
| `RESEND_FROM_EMAIL` | `OpenSpeech <onboarding@resend.dev>` | 发件人地址（可选） |
| `JWT_SECRET` | `your-random-secret` | JWT 密钥（可选） |

**最小配置**（只需这两个即可运行）：
```
GEMINI_API_KEY=sk-your-api-key
GEMINI_API_BASE=https://4sapi.com
```

### 4. 部署

1. 点击 "Deploy"
2. 等待构建完成（约 2-3 分钟）
3. 访问 Vercel 提供的域名

### 5. 自定义域名（可选）

1. 在 Vercel 项目设置中点击 "Domains"
2. 添加你的域名（如 `refine-life.vip`）
3. 按照提示配置 DNS 记录
4. 等待 DNS 生效（通常 5-10 分钟）

## 其他部署方式

### Docker 部署

```bash
# 构建镜像
docker build -t openspeech .

# 运行容器
docker run -d \
  -p 3001:3001 \
  -e GEMINI_API_KEY=sk-your-api-key \
  -e GEMINI_API_BASE=https://4sapi.com \
  openspeech
```

### 传统服务器部署

```bash
# 1. 克隆项目
git clone https://github.com/weiq0482-dev/open-speech.git
cd open-speech

# 2. 安装依赖
npm install

# 3. 配置环境变量
cp .env.example .env.local
# 编辑 .env.local 填入你的配置

# 4. 构建项目
npm run build

# 5. 启动服务
npm start
```

### 使用 PM2 守护进程

```bash
# 安装 PM2
npm install -g pm2

# 启动应用
pm2 start npm --name "openspeech" -- start

# 设置开机自启
pm2 startup
pm2 save
```

## 环境变量说明

### 必填变量

- **GEMINI_API_KEY**: 4sapi API Key，用于调用 Gemini 模型
- **GEMINI_API_BASE**: 4sapi Base URL，默认 `https://4sapi.com`

### 可选变量

- **KV_REST_API_URL**: Upstash Redis URL，用于存储对话记录（不配置则使用本地存储）
- **KV_REST_API_TOKEN**: Upstash Redis Token
- **ADMIN_KEY**: 管理后台访问密钥
- **RESEND_API_KEY**: Resend 邮件服务 API Key，用于邮箱登录
- **RESEND_FROM_EMAIL**: 发件人邮箱地址
- **JWT_SECRET**: JWT 密钥，用于签发登录 Token

## 常见问题

### 1. 部署后 API 请求失败

检查环境变量是否正确配置：
- 在 Vercel 项目设置中查看环境变量
- 确保 `GEMINI_API_KEY` 和 `GEMINI_API_BASE` 已设置
- 重新部署项目使环境变量生效

### 2. 构建失败

可能原因：
- Node.js 版本不兼容（需要 18.x 或更高）
- 依赖安装失败（检查 `package.json`）
- 环境变量缺失

解决方法：
```bash
# 本地测试构建
npm run build

# 清除缓存重新构建
rm -rf .next node_modules
npm install
npm run build
```

### 3. 自定义域名无法访问

检查 DNS 配置：
- A 记录指向 Vercel IP
- CNAME 记录指向 `cname.vercel-dns.com`
- 等待 DNS 生效（5-10 分钟）

### 4. 图片上传失败

可能原因：
- 图片过大（限制 10MB）
- 格式不支持（仅支持 jpg/png/webp）
- Vercel 函数超时（默认 10 秒）

解决方法：
- 压缩图片后上传
- 在 `vercel.json` 中增加超时时间

## 性能优化

### 1. 启用 CDN

Vercel 自动启用全球 CDN，无需额外配置

### 2. 图片优化

使用 Next.js Image 组件自动优化图片：
```tsx
import Image from 'next/image'

<Image src="/logo.png" width={200} height={200} alt="Logo" />
```

### 3. 代码分割

Next.js 自动进行代码分割，按需加载组件

### 4. 缓存策略

在 `next.config.mjs` 中配置缓存：
```js
export default {
  headers: async () => [
    {
      source: '/api/:path*',
      headers: [
        { key: 'Cache-Control', value: 'no-store' }
      ]
    }
  ]
}
```

## 监控和日志

### Vercel 日志

1. 在 Vercel 项目页面点击 "Logs"
2. 查看实时日志和错误信息
3. 使用过滤器筛选特定类型的日志

### 性能监控

1. 在 Vercel 项目页面点击 "Analytics"
2. 查看访问量、响应时间等指标
3. 分析用户行为和性能瓶颈

## 安全建议

1. **不要在代码中硬编码 API Key**
   - 使用环境变量管理敏感信息
   - 不要将 `.env.local` 提交到 Git

2. **启用 HTTPS**
   - Vercel 自动提供免费 SSL 证书
   - 强制使用 HTTPS 访问

3. **限制 API 访问**
   - 在 4sapi 后台设置 IP 白名单
   - 限制请求频率，防止滥用

4. **定期更新依赖**
   ```bash
   npm audit
   npm update
   ```

## 回滚部署

如果新版本有问题，可以快速回滚：

1. 在 Vercel 项目页面点击 "Deployments"
2. 找到之前的稳定版本
3. 点击 "..." → "Promote to Production"

## 联系支持

如有部署问题，请：
1. 查看 [Vercel 文档](https://vercel.com/docs)
2. 提交 GitHub Issue
3. 联系项目维护者
