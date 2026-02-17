export default function RedeemRulesPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-12 text-[var(--foreground)]">
      <h1 className="text-2xl font-bold mb-6">兑换码使用规则</h1>
      <p className="text-sm text-[var(--muted)] mb-8">最后更新：2026年2月17日</p>

      <section className="space-y-6 text-sm leading-relaxed">
        <div>
          <h2 className="text-lg font-semibold mb-2">一、兑换码获取方式</h2>
          <ul className="list-disc pl-5 space-y-1">
            <li>关注官方抖音账号，参与活动免费获取体验兑换码。</li>
            <li>通过抖音小黄车等第三方平台购买付费兑换码。</li>
            <li><strong>本产品内不提供任何购买或支付功能。</strong>所有付费交易均在第三方平台独立完成。</li>
          </ul>
        </div>

        <div>
          <h2 className="text-lg font-semibold mb-2">二、兑换码格式</h2>
          <p>兑换码格式为 <code className="bg-[var(--sidebar-hover)] px-1.5 py-0.5 rounded">OS-XXXX-XXXX</code>（字母和数字组合），不区分大小写。</p>
        </div>

        <div>
          <h2 className="text-lg font-semibold mb-2">三、使用规则</h2>
          <ul className="list-disc pl-5 space-y-1">
            <li><strong>一码一用</strong>：每个兑换码只能被一个用户激活一次，激活后不可转让。</li>
            <li><strong>有效期限</strong>：兑换码自生成之日起 90 天内有效，逾期作废。</li>
            <li><strong>兑换上限</strong>：每个用户最多可激活 10 个兑换码。</li>
            <li><strong>额度叠加</strong>：如已有付费套餐，新兑换码的额度将在现有额度基础上叠加。</li>
          </ul>
        </div>

        <div>
          <h2 className="text-lg font-semibold mb-2">四、套餐说明</h2>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm mt-2">
              <thead>
                <tr className="border-b border-[var(--border)]">
                  <th className="text-left py-2 pr-4">套餐</th>
                  <th className="text-left py-2 pr-4">对话次数</th>
                  <th className="text-left py-2 pr-4">生图次数</th>
                  <th className="text-left py-2">有效期</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-[var(--border)]">
                  <td className="py-2 pr-4">体验卡</td>
                  <td className="py-2 pr-4">50 次</td>
                  <td className="py-2 pr-4">10 次</td>
                  <td className="py-2">7 天</td>
                </tr>
                <tr className="border-b border-[var(--border)]">
                  <td className="py-2 pr-4">月卡</td>
                  <td className="py-2 pr-4">500 次</td>
                  <td className="py-2 pr-4">50 次</td>
                  <td className="py-2">30 天</td>
                </tr>
                <tr>
                  <td className="py-2 pr-4">季卡</td>
                  <td className="py-2 pr-4">2000 次</td>
                  <td className="py-2 pr-4">200 次</td>
                  <td className="py-2">90 天</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div>
          <h2 className="text-lg font-semibold mb-2">五、退换政策</h2>
          <ul className="list-disc pl-5 space-y-1">
            <li>兑换码一经激活，不支持退换或退款。</li>
            <li>如兑换码因系统问题无法激活，请联系客服处理。</li>
            <li>通过第三方平台购买的兑换码，退款事宜请联系对应购买平台。</li>
          </ul>
        </div>

        <div>
          <h2 className="text-lg font-semibold mb-2">六、注意事项</h2>
          <ul className="list-disc pl-5 space-y-1">
            <li>请通过正规渠道获取兑换码，非官方渠道购买的兑换码不保证有效。</li>
            <li>请勿在公开场合分享您的兑换码，以免被他人抢先使用。</li>
            <li>套餐到期后未使用的额度将失效，不做保留或退还。</li>
          </ul>
        </div>
      </section>

      <div className="mt-10 pt-6 border-t border-[var(--border)]">
        <a href="/" className="text-blue-500 hover:underline text-sm">← 返回首页</a>
      </div>
    </div>
  );
}
