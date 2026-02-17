import type { Metadata, Viewport } from "next";
import "./globals.css";
import { DeviceGuard } from "@/components/device-guard";

export const metadata: Metadata = {
  title: "OpenSpeech - AI 助手",
  description: "智能 AI 助手",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "OpenSpeech",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#4285f4",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <head>
        <link rel="icon" href="/icons/icon-192.svg" type="image/svg+xml" />
        <link rel="apple-touch-icon" href="/icons/icon-192.svg" />
        {/* 阻塞脚本：在页面渲染前恢复暗色模式，消除白闪 */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var d=JSON.parse(localStorage.getItem('openspeech-chat-storage')||'{}');if(d.state&&d.state.darkMode)document.documentElement.classList.add('dark')}catch(e){}`,
          }}
        />
      </head>
      <body className="antialiased">
        <DeviceGuard />
        {children}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              if ('serviceWorker' in navigator) {
                window.addEventListener('load', () => {
                  navigator.serviceWorker.register('/sw.js').catch(() => {});
                  // 监听 SW 版本更新通知
                  navigator.serviceWorker.addEventListener('message', (e) => {
                    if (e.data?.type === 'SW_UPDATED') {
                      var b = document.createElement('div');
                      b.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:9999;background:#4285f4;color:#fff;text-align:center;padding:10px 16px;font-size:14px;display:flex;justify-content:center;align-items:center;gap:12px';
                      b.innerHTML = '<span>发现新版本，刷新后即可体验</span><button onclick="location.reload()" style="background:#fff;color:#4285f4;border:none;padding:4px 16px;border-radius:6px;cursor:pointer;font-size:13px">立即刷新</button><button onclick="this.parentElement.remove()" style="background:none;border:none;color:#fff;cursor:pointer;font-size:18px;padding:0 4px">✕</button>';
                      document.body.prepend(b);
                    }
                  });
                });
              }
              // 断网 / 恢复检测横幅
              function _showNetBanner(msg, bg) {
                var old = document.getElementById('net-banner');
                if (old) old.remove();
                var b = document.createElement('div');
                b.id = 'net-banner';
                b.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:9998;background:' + bg + ';color:#fff;text-align:center;padding:8px;font-size:13px;transition:opacity .3s';
                b.textContent = msg;
                document.body.prepend(b);
                return b;
              }
              window.addEventListener('offline', function() { _showNetBanner('网络已断开，部分功能暂时不可用', '#ef4444'); });
              window.addEventListener('online', function() {
                var b = _showNetBanner('网络已恢复', '#22c55e');
                setTimeout(function() { b.style.opacity = '0'; setTimeout(function() { b.remove(); }, 300); }, 2000);
              });
            `,
          }}
        />
      </body>
    </html>
  );
}
