export default function PrivacyPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-12 text-[var(--foreground)]">
      <h1 className="text-2xl font-bold mb-6">隐私政策</h1>
      <p className="text-sm text-[var(--muted)] mb-8">最后更新：2026年2月17日</p>

      <section className="space-y-6 text-sm leading-relaxed">
        <div>
          <h2 className="text-lg font-semibold mb-2">一、信息收集</h2>
          <p>我们收集以下信息以提供和改善服务：</p>
          <ul className="list-disc pl-5 space-y-1 mt-2">
            <li><strong>设备标识</strong>：通过浏览器特征生成的匿名设备指纹，用于用户识别和额度管理。我们不会收集您的真实身份信息。</li>
            <li><strong>IP 地址</strong>：用于安全防护和频率限制，不会与个人身份关联。</li>
            <li><strong>对话内容</strong>：您与 AI 的对话仅存储在您的浏览器本地（localStorage），不会上传到我们的服务器。对话内容会传输至 AI 模型服务提供商以生成回复。</li>
            <li><strong>客服消息</strong>：通过"联系客服"发送的消息会存储在服务器上，以便客服人员回复。</li>
          </ul>
        </div>

        <div>
          <h2 className="text-lg font-semibold mb-2">二、信息使用</h2>
          <ul className="list-disc pl-5 space-y-1">
            <li>提供、维护和改善 AI 助手服务。</li>
            <li>管理用户额度和兑换码激活。</li>
            <li>防止滥用和保障服务安全。</li>
            <li>我们<strong>不会</strong>将您的信息出售或出租给第三方。</li>
          </ul>
        </div>

        <div>
          <h2 className="text-lg font-semibold mb-2">三、数据存储与安全</h2>
          <ul className="list-disc pl-5 space-y-1">
            <li>对话历史仅存储在您的浏览器本地，清除浏览器数据即可删除。</li>
            <li>服务器端数据（设备标识、额度信息、客服消息）存储在加密的云数据库中。</li>
            <li>所有数据传输均通过 HTTPS 加密。</li>
            <li>日志中不记录对话内容、兑换码等敏感信息。</li>
          </ul>
        </div>

        <div>
          <h2 className="text-lg font-semibold mb-2">四、第三方服务</h2>
          <p>本产品使用以下第三方服务：</p>
          <ul className="list-disc pl-5 space-y-1 mt-2">
            <li><strong>AI 模型服务</strong>：您的对话内容会传输至 AI 模型提供商以生成回复，请勿在对话中输入敏感个人信息。</li>
            <li><strong>Vercel</strong>：应用托管平台，提供 HTTPS 和 CDN 服务。</li>
            <li><strong>Upstash Redis</strong>：用于存储用户额度和设备信息的云数据库。</li>
          </ul>
        </div>

        <div>
          <h2 className="text-lg font-semibold mb-2">五、支付相关</h2>
          <p><strong>本产品不收集任何支付信息。</strong>本产品内不提供任何支付功能，不处理任何支付交易。所有付费服务均通过第三方平台完成，支付信息由第三方平台独立管理，与本产品无关。</p>
        </div>

        <div>
          <h2 className="text-lg font-semibold mb-2">六、您的权利</h2>
          <ul className="list-disc pl-5 space-y-1">
            <li>您可以随时清除浏览器数据以删除本地对话历史。</li>
            <li>您可以通过"联系客服"功能请求删除服务器上的个人数据。</li>
            <li>您有权了解我们收集的关于您的信息。</li>
          </ul>
        </div>

        <div>
          <h2 className="text-lg font-semibold mb-2">七、隐私政策更新</h2>
          <p>我们可能会不时更新本隐私政策。更新后继续使用本产品视为接受更新后的隐私政策。</p>
        </div>

        <div>
          <h2 className="text-lg font-semibold mb-2">八、联系我们</h2>
          <p>如有隐私相关问题，请通过应用内的"联系客服"功能与我们联系。</p>
        </div>
      </section>

      <div className="mt-10 pt-6 border-t border-[var(--border)]">
        <a href="/" className="text-blue-500 hover:underline text-sm">← 返回首页</a>
      </div>
    </div>
  );
}
