export default function TermsPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-12 text-[var(--foreground)]">
      <h1 className="text-2xl font-bold mb-6">用户服务协议</h1>
      <p className="text-sm text-[var(--muted)] mb-8">最后更新：2026年2月17日</p>

      <section className="space-y-6 text-sm leading-relaxed">
        <div>
          <h2 className="text-lg font-semibold mb-2">一、服务说明</h2>
          <p>OpenSpeech（以下简称"本产品"）是一款基于人工智能技术的智能助手工具，提供对话、图片生成、深度研究等 AI 辅助功能。本产品通过网页和桌面客户端提供服务。</p>
        </div>

        <div>
          <h2 className="text-lg font-semibold mb-2">二、账户与设备</h2>
          <p>本产品通过设备指纹自动为您创建账户，无需手动注册。每个设备对应唯一的用户标识，用于额度管理和服务提供。请妥善保管您的设备信息，因设备更换导致的账户变更，相关额度不予转移。</p>
        </div>

        <div>
          <h2 className="text-lg font-semibold mb-2">三、免费额度与付费服务</h2>
          <ul className="list-disc pl-5 space-y-1">
            <li>免费用户享有每日有限的使用次数和一定天数的试用期。</li>
            <li>您可通过兑换码激活更多额度，兑换码通过产品推广渠道获取。</li>
            <li><strong>本产品不提供任何应用内支付功能。</strong>所有付费交易均在第三方平台（如抖音小黄车等）完成，本产品仅提供兑换码激活服务。</li>
            <li>兑换码一经激活不可退换，请确认后再使用。</li>
          </ul>
        </div>

        <div>
          <h2 className="text-lg font-semibold mb-2">四、使用规范</h2>
          <ul className="list-disc pl-5 space-y-1">
            <li>不得利用本产品生成违反法律法规的内容。</li>
            <li>不得通过技术手段绕过额度限制或滥用服务。</li>
            <li>不得将本产品用于商业用途（除非获得授权）。</li>
            <li>违反以上规范的用户，我们有权暂停或终止其服务。</li>
          </ul>
        </div>

        <div>
          <h2 className="text-lg font-semibold mb-2">五、免责声明</h2>
          <ul className="list-disc pl-5 space-y-1">
            <li>AI 生成的内容仅供参考，不构成专业建议。</li>
            <li>本产品不保证 AI 输出的准确性、完整性或适用性。</li>
            <li>因 AI 生成内容引起的任何后果，本产品不承担责任。</li>
            <li>因不可抗力（如网络故障、服务器维护）导致的服务中断，本产品不承担责任。</li>
          </ul>
        </div>

        <div>
          <h2 className="text-lg font-semibold mb-2">六、知识产权</h2>
          <p>本产品的设计、代码和品牌标识受知识产权法保护。用户使用 AI 生成的内容，其知识产权归属遵循相关法律法规的规定。</p>
        </div>

        <div>
          <h2 className="text-lg font-semibold mb-2">七、协议修改</h2>
          <p>我们有权随时修改本协议。修改后继续使用本产品视为接受修改后的协议。</p>
        </div>
      </section>

      <div className="mt-10 pt-6 border-t border-[var(--border)]">
        <a href="/" className="text-blue-500 hover:underline text-sm">← 返回首页</a>
      </div>
    </div>
  );
}
