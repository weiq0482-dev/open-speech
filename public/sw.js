const CACHE_VERSION = 3;
const CACHE_NAME = `openspeech-v${CACHE_VERSION}`;
const PRECACHE_URLS = ["/", "/offline"];

// 离线回退页面 HTML
const OFFLINE_HTML = `<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>OpenSpeech - 离线</title>
<style>*{margin:0;box-sizing:border-box}body{font-family:-apple-system,BlinkMacSystemFont,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;background:#f0f4f9;color:#1a1a2e;text-align:center;padding:2rem}
.c{max-width:400px}.icon{font-size:4rem;margin-bottom:1rem}h1{font-size:1.5rem;margin-bottom:.5rem}p{color:#94a3b8;margin-bottom:1.5rem;line-height:1.6}
button{background:#4285f4;color:#fff;border:none;padding:.75rem 2rem;border-radius:12px;font-size:1rem;cursor:pointer}button:active{opacity:.8}</style>
</head><body><div class="c"><div class="icon">📡</div><h1>网络已断开</h1><p>请检查网络连接后重试。<br>已缓存的页面仍可浏览。</p><button onclick="location.reload()">重新连接</button></div></body></html>`;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => {
      // 通知所有客户端有新版本可用
      self.clients.matchAll().then((clients) => {
        clients.forEach((client) => client.postMessage({ type: "SW_UPDATED", version: CACHE_VERSION }));
      });
    })
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // API 请求和敏感接口不缓存
  if (url.pathname.startsWith("/api/")) return;

  // 离线回退页面
  if (url.pathname === "/offline") {
    event.respondWith(new Response(OFFLINE_HTML, { headers: { "Content-Type": "text/html; charset=utf-8" } }));
    return;
  }

  // 网络优先，失败时回退缓存，都没有则显示离线页
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() =>
        caches.match(event.request).then((cached) => {
          if (cached) return cached;
          // 导航请求回退到离线页
          if (event.request.mode === "navigate") {
            return new Response(OFFLINE_HTML, { headers: { "Content-Type": "text/html; charset=utf-8" } });
          }
          return new Response("offline", { status: 503 });
        })
      )
  );
});
