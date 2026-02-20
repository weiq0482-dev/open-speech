"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { MessageSquare, Users, Gift, Settings, Activity, Trash2, LogOut, Shield, UserPlus } from "lucide-react";

// ========== 类型定义 ==========
interface Message {
  id: string;
  from: "user" | "admin";
  content: string;
  timestamp: string;
  read?: boolean;
}

interface Thread {
  userId: string;
  messages: Message[];
  lastActivity: string;
  unread?: number;
}

interface UserInfo {
  userId: string;
  email?: string;
  plan: string;
  chatRemaining: number;
  imageRemaining: number;
  dailyFreeUsed: number;
  dailyFreeDate: string;
  freeTrialStarted: string;
  redeemCode: string | null;
  locked: string | null;
  createdAt?: string;
  lastLogin?: string;
}

interface Coupon {
  code: string;
  plan: string;
  planLabel: string;
  createdAt: string;
  expiresAt: string | null;
  createdBy: string | null;
  usedBy: string | null;
  usedAt: string | null;
}

interface AdminSession {
  username: string;
  role: "super" | "normal";
  permissions: string[];
  adminKey: string; // 用于 API 鉴权
}

type TabKey = "messages" | "users" | "coupons" | "settings" | "trash" | "admins" | "monitor";

// ========== 工具函数 ==========
function adminFetch(url: string, session: AdminSession, options?: RequestInit) {
  return fetch(url, {
    ...options,
    headers: {
      "x-admin-key": session.adminKey,
      "x-admin-role": session.role,
      "x-admin-user": session.username,
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });
}

function shortId(id: string) {
  return id.length > 12 ? id.slice(0, 8) + "..." : id;
}

function expiryCountdown(expiresAt: string | null): { text: string; color: string } {
  if (!expiresAt) return { text: "-", color: "text-gray-400" };
  const now = Date.now();
  const exp = new Date(expiresAt).getTime();
  const diff = exp - now;
  if (diff <= 0) return { text: "已过期", color: "text-red-500" };
  const days = Math.floor(diff / 86400000);
  const hours = Math.floor((diff % 86400000) / 3600000);
  if (days > 0) return { text: `${days}天${hours}小时`, color: days <= 7 ? "text-amber-600" : "text-green-600" };
  const mins = Math.floor((diff % 3600000) / 60000);
  return { text: `${hours}小时${mins}分`, color: "text-red-500" };
}

function planBadge(plan: string, planList?: PlanOption[]) {
  const colorMap: Record<string, string> = {
    blue: "bg-blue-100 text-blue-700",
    amber: "bg-amber-100 text-amber-700",
    purple: "bg-purple-100 text-purple-700",
    green: "bg-green-100 text-green-700",
    red: "bg-red-100 text-red-700",
    pink: "bg-pink-100 text-pink-700",
    indigo: "bg-indigo-100 text-indigo-700",
    teal: "bg-teal-100 text-teal-700",
  };
  if (plan === "free") {
    return <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-gray-100 text-gray-600">免费</span>;
  }
  const found = planList?.find(p => p.id === plan);
  const bgClass = found?.color ? (colorMap[found.color] || "bg-gray-100 text-gray-600") : "bg-gray-100 text-gray-600";
  const label = found?.label?.replace(/\（.*?\）|\(.*?\)/g, "") || plan;
  return (
    <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${bgClass}`}>
      {label}
    </span>
  );
}

// ========== 主组件 ==========
export default function AdminPage() {
  const [session, setSession] = useState<AdminSession | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>("messages");
  const [loginMode, setLoginMode] = useState<"key" | "password">("key");
  const [keyInput, setKeyInput] = useState("");
  const [usernameInput, setUsernameInput] = useState("");
  const [passwordInput, setPasswordInput] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);

  // 恢复会话
  useEffect(() => {
    const saved = localStorage.getItem("openspeech-admin-session");
    if (saved) {
      try {
        const s = JSON.parse(saved) as AdminSession;
        // 验证密钥仍然有效
        fetch("/api/admin/users", { headers: { "x-admin-key": s.adminKey } })
          .then((r) => { if (r.ok) setSession(s); else localStorage.removeItem("openspeech-admin-session"); })
          .catch(() => setSession(s)); // 离线时仍允许
      } catch { localStorage.removeItem("openspeech-admin-session"); }
    }
  }, []);

  const handleLogin = async () => {
    setLoginLoading(true);
    setLoginError("");
    try {
      let body: Record<string, string>;
      if (loginMode === "key") {
        if (!keyInput.trim()) { setLoginLoading(false); return; }
        body = { key: keyInput.trim() };
      } else {
        if (!usernameInput.trim() || !passwordInput) { setLoginLoading(false); return; }
        body = { username: usernameInput.trim(), password: passwordInput };
      }
      const resp = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await resp.json();
      if (resp.ok && data.success) {
        const adminKey = loginMode === "key" ? keyInput.trim() : keyInput.trim() || process.env.NEXT_PUBLIC_ADMIN_KEY || "";
        const s: AdminSession = {
          username: data.admin.username,
          role: data.admin.role,
          permissions: data.admin.permissions,
          adminKey: loginMode === "key" ? keyInput.trim() : keyInput.trim(),
        };
        // 普通管理员需要超级管理员密钥才能调用 API
        // 改用 header 传递用户名+密码，后端统一验证
        if (loginMode === "password") {
          s.adminKey = `user:${usernameInput.trim()}:${passwordInput}`;
        }
        localStorage.setItem("openspeech-admin-session", JSON.stringify(s));
        setSession(s);
      } else {
        setLoginError(data.error || "登录失败");
      }
    } catch {
      setLoginError("网络连接失败");
    }
    setLoginLoading(false);
  };

  const handleLogout = () => {
    localStorage.removeItem("openspeech-admin-session");
    setSession(null);
    setKeyInput("");
    setUsernameInput("");
    setPasswordInput("");
  };

  if (!session) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="bg-white rounded-2xl shadow-xl p-8 max-w-sm w-full">
          <h1 className="text-xl font-bold mb-2 text-center">OpenSpeech</h1>
          <p className="text-xs text-gray-400 text-center mb-4">管理后台</p>

          {/* 登录模式切换 */}
          <div className="flex rounded-lg border border-gray-200 mb-4 overflow-hidden">
            <button
              onClick={() => setLoginMode("key")}
              className={`flex-1 py-2 text-xs font-medium transition-colors ${loginMode === "key" ? "bg-blue-500 text-white" : "bg-white text-gray-500"}`}
            >
              超级管理员
            </button>
            <button
              onClick={() => setLoginMode("password")}
              className={`flex-1 py-2 text-xs font-medium transition-colors ${loginMode === "password" ? "bg-blue-500 text-white" : "bg-white text-gray-500"}`}
            >
              管理员登录
            </button>
          </div>

          {loginMode === "key" ? (
            <input
              type="password"
              value={keyInput}
              onChange={(e) => setKeyInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleLogin()}
              placeholder="输入超级管理密钥"
              className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-gray-50 text-sm outline-none focus:border-blue-500 mb-4"
            />
          ) : (
            <div className="space-y-3 mb-4">
              <input
                value={usernameInput}
                onChange={(e) => setUsernameInput(e.target.value)}
                placeholder="用户名"
                className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-gray-50 text-sm outline-none focus:border-blue-500"
              />
              <input
                type="password"
                value={passwordInput}
                onChange={(e) => setPasswordInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleLogin()}
                placeholder="密码"
                className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-gray-50 text-sm outline-none focus:border-blue-500"
              />
            </div>
          )}

          {loginError && <p className="text-xs text-red-500 mb-3 text-center">{loginError}</p>}
          <button
            onClick={handleLogin}
            disabled={loginLoading}
            className="w-full px-4 py-3 rounded-xl bg-blue-500 text-white text-sm font-medium hover:bg-blue-600 transition-colors disabled:bg-gray-300"
          >
            {loginLoading ? "验证中..." : "登录"}
          </button>
        </div>
      </div>
    );
  }

  const allTabs: { key: TabKey; label: string; perm: string; icon: React.ReactNode }[] = [
    { key: "messages", label: "客服消息", perm: "messages", icon: <MessageSquare size={16} /> },
    { key: "users", label: "用户管理", perm: "users", icon: <Users size={16} /> },
    { key: "coupons", label: "兑换码", perm: "coupons", icon: <Gift size={16} /> },
    { key: "settings", label: "系统设置", perm: "settings", icon: <Settings size={16} /> },
    { key: "trash", label: "回收站", perm: "trash", icon: <Trash2 size={16} /> },
    { key: "admins", label: "管理员", perm: "admins", icon: <Shield size={16} /> },
    { key: "monitor", label: "访问监控", perm: "monitor", icon: <Activity size={16} /> },
  ];
  const tabs = allTabs.filter((t) => session.permissions.includes(t.perm));

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-blue-500 px-6 py-2 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <h1 className="text-lg font-bold text-white">OpenSpeech 管理后台</h1>
          <nav className="flex gap-1">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                  activeTab === tab.key
                    ? "bg-white text-blue-600"
                    : "text-white/90 hover:bg-blue-400"
                }`}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-white/80">
            {session.username} ({session.role === "super" ? "超级管理员" : "管理员"})
          </span>
          <button onClick={handleLogout} className="flex items-center gap-1 text-xs text-white/80 hover:text-white transition-colors">
            <LogOut size={14} />
            退出
          </button>
        </div>
      </header>

      <div className="p-6">
        {activeTab === "messages" && <MessagesTab session={session} />}
        {activeTab === "users" && <UsersTab session={session} />}
        {activeTab === "coupons" && <CouponsTab session={session} />}
        {activeTab === "settings" && <SettingsTab session={session} />}
        {activeTab === "trash" && <TrashTab session={session} />}
        {activeTab === "admins" && <AdminsTab session={session} />}
        {activeTab === "monitor" && <MonitorTab session={session} />}
      </div>
    </div>
  );
}

// ========== 客服消息 Tab ==========
function MessagesTab({ session }: { session: AdminSession }) {
  const [threads, setThreads] = useState<Thread[]>([]);
  const [activeUserId, setActiveUserId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const fetchThreads = useCallback(async () => {
    try {
      const resp = await adminFetch("/api/admin/threads", session);
      if (resp.ok) {
        const data = await resp.json();
        setThreads(data.threads || []);
      }
    } catch { /* ignore */ }
  }, [session]);

  useEffect(() => {
    fetchThreads();
    const timer = setInterval(fetchThreads, 5000);
    return () => clearInterval(timer);
  }, [fetchThreads]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [activeUserId, threads]);

  const handleReply = async () => {
    if (!replyText.trim() || !activeUserId || sending) return;
    setSending(true);
    try {
      const resp = await adminFetch("/api/admin/reply", session, {
        method: "POST",
        body: JSON.stringify({ userId: activeUserId, message: replyText.trim() }),
      });
      if (resp.ok) { setReplyText(""); fetchThreads(); }
    } catch { /* ignore */ }
    setSending(false);
  };

  const activeThread = threads.find((t) => t.userId === activeUserId);

  return (
    <div className="flex bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden" style={{ height: "calc(100vh - 140px)" }}>
      {/* 左侧列表 */}
      <div className="w-72 border-r border-gray-200 flex flex-col">
        <div className="p-3 border-b border-gray-100 text-xs text-gray-500">
          {threads.length} 个会话
        </div>
        <div className="flex-1 overflow-y-auto">
          {threads.map((thread) => {
            const lastMsg = thread.messages[thread.messages.length - 1];
            return (
              <button
                key={thread.userId}
                onClick={() => setActiveUserId(thread.userId)}
                className={`w-full text-left px-4 py-3 border-b border-gray-50 hover:bg-gray-50 transition-colors ${
                  activeUserId === thread.userId ? "bg-blue-50" : ""
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium">{shortId(thread.userId)}</span>
                  {(thread.unread || 0) > 0 && (
                    <span className="bg-red-500 text-white text-[10px] rounded-full px-1.5 py-0.5 min-w-[18px] text-center">
                      {thread.unread}
                    </span>
                  )}
                </div>
                <p className="text-xs text-gray-500 truncate">{lastMsg?.content || "暂无消息"}</p>
              </button>
            );
          })}
        </div>
      </div>

      {/* 右侧聊天 */}
      <div className="flex-1 flex flex-col">
        {activeThread ? (
          <>
            <div className="px-6 py-3 border-b border-gray-200 text-sm font-semibold">
              用户 {shortId(activeUserId || "")}
              <span className="text-xs text-gray-400 ml-2 font-normal">
                {activeThread.messages.length} 条消息
              </span>
            </div>
            <div className="flex-1 overflow-y-auto p-6 space-y-3">
              {activeThread.messages.map((msg) => (
                <div key={msg.id} className={`flex ${msg.from === "admin" ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-md px-4 py-2.5 rounded-2xl text-sm ${
                    msg.from === "admin" ? "bg-blue-500 text-white" : "bg-gray-100 text-gray-900"
                  }`}>
                    <p className="whitespace-pre-wrap">{msg.content}</p>
                    <p className={`text-[10px] mt-1 ${msg.from === "admin" ? "text-blue-100" : "text-gray-400"}`}>
                      {new Date(msg.timestamp).toLocaleString("zh-CN")}
                    </p>
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>
            <div className="p-4 border-t border-gray-200">
              <div className="flex gap-2">
                <input
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleReply()}
                  placeholder="输入回复..."
                  className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 text-sm outline-none focus:border-blue-500"
                />
                <button
                  onClick={handleReply}
                  disabled={!replyText.trim() || sending}
                  className={`px-6 py-2.5 rounded-xl text-sm text-white ${
                    replyText.trim() && !sending ? "bg-blue-500 hover:bg-blue-600" : "bg-gray-300"
                  }`}
                >
                  发送
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
            选择一个会话开始回复
          </div>
        )}
      </div>
    </div>
  );
}

// ========== 用户管理 Tab ==========
function UsersTab({ session }: { session: AdminSession }) {
  const [users, setUsers] = useState<UserInfo[]>([]);
  const [suspicious, setSuspicious] = useState<UserInfo[]>([]);
  const [userPlans, setUserPlans] = useState<PlanOption[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<"all" | "free" | "paid" | "locked" | "suspicious">("all");
  const [lockReason, setLockReason] = useState("");
  const [actionUserId, setActionUserId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const fetchUsers = useCallback(async () => {
    try {
      const resp = await adminFetch("/api/admin/users", session);
      if (resp.ok) {
        const data = await resp.json();
        setUsers(data.users || []);
        setSuspicious(data.suspicious || []);
        setTotal(data.total || 0);
        setError("");
      } else {
        setError(`加载失败 (${resp.status})`);
      }
    } catch (e) { setError(`网络错误: ${e}`); }
    setLoading(false);
  }, [session]);

  useEffect(() => {
    fetchUsers();
    adminFetch("/api/admin/plans", session).then(r => r.json()).then(d => { if (d.plans) setUserPlans(d.plans); }).catch(() => {});
  }, [fetchUsers, session]);

  const handleLock = async (userId: string) => {
    await adminFetch("/api/admin/users/lock", session, {
      method: "POST",
      body: JSON.stringify({ userId, reason: lockReason || "管理员手动锁定" }),
    });
    setActionUserId(null);
    setLockReason("");
    fetchUsers();
  };

  const handleUnlock = async (userId: string) => {
    await adminFetch("/api/admin/users/unlock", session, {
      method: "POST",
      body: JSON.stringify({ userId }),
    });
    fetchUsers();
  };

  const filteredUsers = users.filter((u) => {
    // 搜索过滤
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchSearch = u.userId.toLowerCase().includes(q) || (u.email?.toLowerCase().includes(q));
      if (!matchSearch) return false;
    }
    // 状态过滤
    if (filter === "free") return u.plan === "free";
    if (filter === "paid") return u.plan !== "free";
    if (filter === "locked") return !!u.locked;
    if (filter === "suspicious") return suspicious.some((s) => s.userId === u.userId);
    return true;
  });

  if (loading) return <div className="text-center text-gray-400 py-20">加载中...</div>;
  if (error) return <div className="text-center text-red-500 py-20">{error}<br/><button onClick={fetchUsers} className="mt-2 text-blue-500 underline text-sm">重试</button></div>;

  return (
    <div className="space-y-4">
      {/* 统计卡片 */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-white rounded-xl p-4 border border-gray-200">
          <p className="text-2xl font-bold text-gray-900">{total}</p>
          <p className="text-xs text-gray-500 mt-1">总用户数</p>
        </div>
        <div className="bg-white rounded-xl p-4 border border-gray-200">
          <p className="text-2xl font-bold text-blue-600">{users.filter((u) => u.plan !== "free").length}</p>
          <p className="text-xs text-gray-500 mt-1">付费用户</p>
        </div>
        <div className="bg-white rounded-xl p-4 border border-gray-200">
          <p className="text-2xl font-bold text-amber-600">{suspicious.length}</p>
          <p className="text-xs text-gray-500 mt-1">可疑用户</p>
        </div>
        <div className="bg-white rounded-xl p-4 border border-gray-200">
          <p className="text-2xl font-bold text-red-600">{users.filter((u) => u.locked).length}</p>
          <p className="text-xs text-gray-500 mt-1">已锁定</p>
        </div>
      </div>

      {/* 搜索框和刷新按钮 */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-xs">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="按用户ID/邮箱/手机号..."
            className="w-full pl-9 pr-3 py-2 rounded-lg border border-gray-200 text-sm outline-none focus:border-blue-500"
          />
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>
        <button onClick={fetchUsers} className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm bg-white border border-gray-200 hover:bg-gray-50">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          刷新
        </button>
      </div>

      {/* 用户列表 */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 text-blue-600 text-xs">
              <th className="text-left px-4 py-3 font-medium">用户</th>
              <th className="text-left px-4 py-3 font-medium">套餐</th>
              <th className="text-left px-4 py-3 font-medium">套餐额度</th>
              <th className="text-left px-4 py-3 font-medium">今日用量</th>
              <th className="text-left px-4 py-3 font-medium">注册时间</th>
              <th className="text-left px-4 py-3 font-medium">状态</th>
              <th className="text-left px-4 py-3 font-medium">操作</th>
            </tr>
          </thead>
          <tbody>
            {filteredUsers.map((user) => (
              <tr key={user.userId} className="border-t border-gray-100 hover:bg-gray-50">
                <td className="px-4 py-3">
                  <div className="flex flex-col gap-0.5">
                    <span className="font-medium text-sm">{shortId(user.userId)}</span>
                    {user.email && (
                      <span className="text-[11px] text-gray-400">{user.email}</span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3">{planBadge(user.plan, userPlans)}</td>
                <td className="px-4 py-3 text-xs text-amber-600 font-medium">
                  {user.plan === "free" ? "-" : user.chatRemaining}
                </td>
                <td className="px-4 py-3 text-xs">
                  <span className={user.dailyFreeUsed >= 4 ? "text-red-500 font-semibold" : "text-gray-600"}>
                    {user.dailyFreeUsed}
                  </span>
                </td>
                <td className="px-4 py-3 text-xs text-gray-500">
                  {user.createdAt ? new Date(user.createdAt).toLocaleDateString("zh-CN") :
                   user.freeTrialStarted ? new Date(user.freeTrialStarted).toLocaleDateString("zh-CN") : "-"}
                </td>
                <td className="px-4 py-3">
                  {user.locked ? (
                    <span className="text-[11px] bg-red-100 text-red-600 px-2 py-0.5 rounded font-medium">
                      已锁
                    </span>
                  ) : (
                    <span className="text-[11px] bg-green-100 text-green-600 px-2 py-0.5 rounded font-medium">
                      正常
                    </span>
                  )}
                </td>
                <td className="px-4 py-3">
                  {user.locked ? (
                    <button onClick={() => handleUnlock(user.userId)} className="text-xs text-blue-500 hover:underline flex items-center gap-1">
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z" /></svg>
                      解锁
                    </button>
                  ) : (
                    <button onClick={() => setActionUserId(user.userId)} className="text-xs text-red-500 hover:underline flex items-center gap-1">
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
                      锁定
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filteredUsers.length === 0 && (
          <p className="text-center text-gray-400 text-sm py-8">暂无数据</p>
        )}
      </div>
    </div>
  );
}

// ========== 兑换码 Tab ==========
interface PlanOption { id: string; label: string; chatQuota: number; imageQuota: number; durationDays: number; dailyLimit: number; rank: number; color?: string }

function CouponsTab({ session }: { session: AdminSession }) {
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [plans, setPlans] = useState<PlanOption[]>([]);
  const [plan, setPlan] = useState("");
  const [count, setCount] = useState(5);
  const [generating, setGenerating] = useState(false);
  const [newCodes, setNewCodes] = useState<string[]>([]);

  const fetchCoupons = useCallback(async () => {
    try {
      const resp = await adminFetch("/api/admin/coupons", session);
      if (resp.ok) {
        const data = await resp.json();
        setCoupons(data.coupons || []);
      }
    } catch { /* ignore */ }
  }, [session]);

  const fetchPlans = useCallback(async () => {
    try {
      const resp = await adminFetch("/api/admin/plans", session);
      if (resp.ok) {
        const data = await resp.json();
        const pl = data.plans || [];
        setPlans(pl);
        if (pl.length > 0 && !plan) setPlan(pl[0].id);
      }
    } catch { /* ignore */ }
  }, [session, plan]);

  useEffect(() => { fetchCoupons(); fetchPlans(); }, [fetchCoupons, fetchPlans]);

  const [genError, setGenError] = useState("");

  const handleGenerate = async () => {
    setGenerating(true);
    setGenError("");
    try {
      const resp = await adminFetch("/api/admin/coupons/generate", session, {
        method: "POST",
        body: JSON.stringify({ plan, count, createdBy: session.username }),
      });
      if (resp.ok) {
        const data = await resp.json();
        setNewCodes((prev) => [...data.codes, ...prev]);
        fetchCoupons();
      } else {
        setGenError(`生成失败 (${resp.status})`);
      }
    } catch (e) { setGenError(`网络错误: ${e}`); }
    setGenerating(false);
  };

  const copyAll = () => {
    navigator.clipboard.writeText(newCodes.join("\n"));
  };

  return (
    <div className="space-y-4">
      {/* 生成兑换码 */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <h3 className="text-sm font-semibold mb-3">生成兑换码</h3>
        <div className="flex items-center gap-3">
          <select
            value={plan}
            onChange={(e) => setPlan(e.target.value)}
            className="px-3 py-2 rounded-lg border border-gray-200 text-sm"
          >
            {plans.map((p) => (
              <option key={p.id} value={p.id}>{p.label}</option>
            ))}
          </select>
          <input
            type="number"
            value={count}
            onChange={(e) => setCount(Math.min(50, Math.max(1, Number(e.target.value))))}
            min={1}
            max={50}
            className="w-20 px-3 py-2 rounded-lg border border-gray-200 text-sm"
          />
          <span className="text-xs text-gray-500">张</span>
          <button
            onClick={handleGenerate}
            disabled={generating}
            className="px-4 py-2 rounded-lg bg-blue-500 text-white text-sm hover:bg-blue-600 disabled:bg-gray-300"
          >
            {generating ? "生成中..." : "生成"}
          </button>
        </div>
        {genError && <p className="text-xs text-red-500 mt-2">{genError}</p>}

        {newCodes.length > 0 && (
          <div className="mt-3 p-3 bg-green-50 rounded-lg">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-green-700 font-medium">新生成的兑换码</span>
              <button onClick={copyAll} className="text-xs text-blue-500 hover:underline">复制全部</button>
            </div>
            <div className="space-y-1">
              {newCodes.map((code) => (
                <div key={code} className="flex items-center gap-2">
                  <span className="font-mono text-sm font-bold">{code}</span>
                  <button onClick={() => navigator.clipboard.writeText(code)} className="text-[10px] text-gray-400 hover:text-blue-500">
                    复制
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 统计 + 导出 */}
      <div className="flex items-center justify-between mb-2">
        <div />
        <button
          onClick={() => {
            const lines = ["\u5151\u6362\u7801,\u5957\u9910,\u72b6\u6001,\u6709\u6548\u671f,\u521b\u5efa\u8005,\u4f7f\u7528\u8005,\u4f7f\u7528\u65f6\u95f4,\u521b\u5efa\u65f6\u95f4"];
            coupons.forEach((c) => {
              const status = c.usedBy ? "\u5df2\u4f7f\u7528" : (c.expiresAt && new Date(c.expiresAt) < new Date() ? "\u5df2\u8fc7\u671f" : "\u53ef\u7528");
              lines.push([c.code, c.planLabel, status, c.expiresAt || "", c.createdBy || "", c.usedBy || "", c.usedAt || "", c.createdAt].join(","));
            });
            const blob = new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
            const a = document.createElement("a");
            a.href = URL.createObjectURL(blob);
            a.download = `coupons_${new Date().toISOString().slice(0,10)}.csv`;
            a.click();
          }}
          className="px-3 py-1.5 rounded-lg text-xs bg-white border border-gray-200 hover:bg-gray-50"
        >
          导出 CSV
        </button>
      </div>
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-xl p-4 border border-gray-200">
          <p className="text-2xl font-bold">{coupons.length}</p>
          <p className="text-xs text-gray-500 mt-1">总兑换码</p>
        </div>
        <div className="bg-white rounded-xl p-4 border border-gray-200">
          <p className="text-2xl font-bold text-green-600">{coupons.filter((c) => !c.usedBy).length}</p>
          <p className="text-xs text-gray-500 mt-1">未使用</p>
        </div>
        <div className="bg-white rounded-xl p-4 border border-gray-200">
          <p className="text-2xl font-bold text-red-600">{coupons.filter((c) => c.usedBy).length}</p>
          <p className="text-xs text-gray-500 mt-1">已使用</p>
        </div>
      </div>

      {/* 兑换码列表 */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 text-gray-500 text-xs">
              <th className="text-left px-4 py-3 font-medium">兑换码</th>
              <th className="text-left px-4 py-3 font-medium">套餐</th>
              <th className="text-left px-4 py-3 font-medium">状态</th>
              <th className="text-left px-4 py-3 font-medium">有效期剩余</th>
              <th className="text-left px-4 py-3 font-medium">创建者</th>
              <th className="text-left px-4 py-3 font-medium">使用者</th>
              <th className="text-left px-4 py-3 font-medium">使用时间</th>
              <th className="text-left px-4 py-3 font-medium">创建时间</th>
            </tr>
          </thead>
          <tbody>
            {coupons.slice(0, 200).map((c) => {
              const expiry = c.usedBy ? { text: "-", color: "text-gray-400" } : expiryCountdown(c.expiresAt);
              return (
                <tr key={c.code} className="border-t border-gray-100 hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-bold">{c.code}</span>
                      <button
                        onClick={() => navigator.clipboard.writeText(c.code)}
                        className="text-[10px] text-gray-400 hover:text-blue-500"
                      >
                        复制
                      </button>
                    </div>
                  </td>
                  <td className="px-4 py-3">{planBadge(c.plan, plans)}</td>
                  <td className="px-4 py-3">
                    {c.usedBy ? (
                      <span className="text-[10px] bg-red-100 text-red-700 px-2 py-0.5 rounded">已使用</span>
                    ) : expiry.text === "已过期" ? (
                      <span className="text-[10px] bg-gray-100 text-gray-500 px-2 py-0.5 rounded">已过期</span>
                    ) : (
                      <span className="text-[10px] bg-green-100 text-green-700 px-2 py-0.5 rounded">可用</span>
                    )}
                  </td>
                  <td className={`px-4 py-3 text-xs font-medium ${expiry.color}`}>
                    {expiry.text}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500">{c.createdBy || "-"}</td>
                  <td className="px-4 py-3 text-xs text-gray-500">{c.usedBy ? shortId(c.usedBy) : "-"}</td>
                  <td className="px-4 py-3 text-xs text-gray-500">
                    {c.usedAt ? new Date(c.usedAt).toLocaleString("zh-CN") : "-"}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500">{new Date(c.createdAt).toLocaleDateString("zh-CN")}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {coupons.length === 0 && (
          <p className="text-center text-gray-400 text-sm py-8">暂无兑换码</p>
        )}
      </div>
    </div>
  );
}

// ========== 系统设置 Tab ==========
function SettingsTab({ session }: { session: AdminSession }) {
  const [freeTrialDays, setFreeTrialDays] = useState(30);
  const [freeDailyLimit, setFreeDailyLimit] = useState(5);
  const [modelProvider, setModelProvider] = useState<"gemini" | "qwen">("qwen");
  const [qwenApiKey, setQwenApiKey] = useState("");
  const [geminiApiKey, setGeminiApiKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // 卡种管理
  const [plans, setPlans] = useState<PlanOption[]>([]);
  const [plansSaving, setPlansSaving] = useState(false);
  const [plansSaved, setPlansSaved] = useState(false);
  const [showAddPlan, setShowAddPlan] = useState(false);
  const [newPlan, setNewPlan] = useState<PlanOption>({ id: "", label: "", chatQuota: 100, imageQuota: 20, durationDays: 30, dailyLimit: 20, rank: 1, color: "blue" });

  const COLORS = ["blue", "amber", "purple", "green", "red", "pink", "indigo", "teal"];

  useEffect(() => {
    adminFetch("/api/admin/settings", session).then((r) => r.json()).then((d) => {
      if (d.settings) {
        setFreeTrialDays(d.settings.freeTrialDays || 30);
        setFreeDailyLimit(d.settings.freeDailyLimit || 5);
        setModelProvider(d.settings.modelProvider || "qwen");
        setQwenApiKey(d.settings.qwenApiKey || "");
        setGeminiApiKey(d.settings.geminiApiKey || "");
      }
    }).catch(() => {});
    adminFetch("/api/admin/plans", session).then((r) => r.json()).then((d) => {
      if (d.plans) setPlans(d.plans);
    }).catch(() => {});
  }, [session]);

  const handleSaveSettings = async () => {
    setSaving(true);
    try {
      await adminFetch("/api/admin/settings", session, {
        method: "POST",
        body: JSON.stringify({ freeTrialDays, freeDailyLimit, modelProvider, qwenApiKey, geminiApiKey }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch { /* ignore */ }
    setSaving(false);
  };

  const handleSavePlans = async () => {
    setPlansSaving(true);
    try {
      const resp = await adminFetch("/api/admin/plans", session, {
        method: "POST",
        body: JSON.stringify({ plans }),
      });
      if (resp.ok) {
        setPlansSaved(true);
        setTimeout(() => setPlansSaved(false), 2000);
      }
    } catch { /* ignore */ }
    setPlansSaving(false);
  };

  const updatePlan = (idx: number, field: string, value: string | number) => {
    setPlans(prev => prev.map((p, i) => i === idx ? { ...p, [field]: value } : p));
  };

  const removePlan = (idx: number) => {
    if (plans.length <= 1) return;
    setPlans(prev => prev.filter((_, i) => i !== idx));
  };

  const addPlan = () => {
    if (!newPlan.id || !newPlan.label) return;
    if (plans.some(p => p.id === newPlan.id)) return;
    setPlans(prev => [...prev, { ...newPlan }]);
    setNewPlan({ id: "", label: "", chatQuota: 100, imageQuota: 20, durationDays: 30, dailyLimit: 20, rank: plans.length + 1, color: "blue" });
    setShowAddPlan(false);
  };

  return (
    <div className="max-w-3xl space-y-4">
      {/* 卡种管理 */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold">卡种管理</h3>
            <p className="text-xs text-gray-400 mt-0.5">自定义套餐类型，每种卡独立配置额度和每日使用上限</p>
          </div>
          <button
            onClick={() => setShowAddPlan(!showAddPlan)}
            className="px-3 py-1.5 rounded-lg text-xs bg-blue-500 text-white hover:bg-blue-600"
          >
            + 新建卡种
          </button>
        </div>

        {/* 新建卡种表单 */}
        {showAddPlan && (
          <div className="bg-blue-50 rounded-xl p-4 space-y-3 border border-blue-200">
            <h4 className="text-xs font-semibold text-blue-700">新建卡种</h4>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] text-gray-500 mb-0.5 block">卡种ID（英文）</label>
                <input value={newPlan.id} onChange={(e) => setNewPlan(p => ({ ...p, id: e.target.value.replace(/[^a-z0-9_-]/g, "") }))}
                  placeholder="例如: yearly" className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm outline-none" />
              </div>
              <div>
                <label className="text-[10px] text-gray-500 mb-0.5 block">显示名称</label>
                <input value={newPlan.label} onChange={(e) => setNewPlan(p => ({ ...p, label: e.target.value }))}
                  placeholder="例如: 年卡（365天）" className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm outline-none" />
              </div>
              <div>
                <label className="text-[10px] text-gray-500 mb-0.5 block">对话次数</label>
                <input type="number" value={newPlan.chatQuota} onChange={(e) => setNewPlan(p => ({ ...p, chatQuota: Number(e.target.value) }))}
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm outline-none" />
              </div>
              <div>
                <label className="text-[10px] text-gray-500 mb-0.5 block">生图次数</label>
                <input type="number" value={newPlan.imageQuota} onChange={(e) => setNewPlan(p => ({ ...p, imageQuota: Number(e.target.value) }))}
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm outline-none" />
              </div>
              <div>
                <label className="text-[10px] text-gray-500 mb-0.5 block">有效天数</label>
                <input type="number" value={newPlan.durationDays} onChange={(e) => setNewPlan(p => ({ ...p, durationDays: Number(e.target.value) }))}
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm outline-none" />
              </div>
              <div>
                <label className="text-[10px] text-gray-500 mb-0.5 block">每日上限（次/天）</label>
                <input type="number" value={newPlan.dailyLimit} onChange={(e) => setNewPlan(p => ({ ...p, dailyLimit: Number(e.target.value) }))}
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm outline-none" />
              </div>
              <div>
                <label className="text-[10px] text-gray-500 mb-0.5 block">优先级（数字越大越高）</label>
                <input type="number" value={newPlan.rank} onChange={(e) => setNewPlan(p => ({ ...p, rank: Number(e.target.value) }))}
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm outline-none" />
              </div>
              <div>
                <label className="text-[10px] text-gray-500 mb-0.5 block">徽章颜色</label>
                <select value={newPlan.color} onChange={(e) => setNewPlan(p => ({ ...p, color: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm outline-none">
                  {COLORS.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={addPlan} disabled={!newPlan.id || !newPlan.label}
                className="px-4 py-2 rounded-lg bg-blue-500 text-white text-xs hover:bg-blue-600 disabled:bg-gray-300">
                添加
              </button>
              <button onClick={() => setShowAddPlan(false)} className="px-4 py-2 rounded-lg border border-gray-200 text-xs hover:bg-gray-50">
                取消
              </button>
            </div>
          </div>
        )}

        {/* 现有卡种列表 */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-500 border-b border-gray-200">
                <th className="pb-2 pr-2">名称</th>
                <th className="pb-2 pr-2">对话</th>
                <th className="pb-2 pr-2">生图</th>
                <th className="pb-2 pr-2">天数</th>
                <th className="pb-2 pr-2">每日上限</th>
                <th className="pb-2 pr-2">优先级</th>
                <th className="pb-2 pr-2">颜色</th>
                <th className="pb-2"></th>
              </tr>
            </thead>
            <tbody>
              {plans.map((p, idx) => (
                <tr key={p.id} className="border-b border-gray-50">
                  <td className="py-2 pr-2">
                    <input value={p.label} onChange={(e) => updatePlan(idx, "label", e.target.value)}
                      className="w-full px-2 py-1 rounded border border-gray-200 text-xs outline-none focus:border-blue-400" />
                    <span className="text-[10px] text-gray-400 ml-1">{p.id}</span>
                  </td>
                  <td className="py-2 pr-2">
                    <input type="number" value={p.chatQuota} onChange={(e) => updatePlan(idx, "chatQuota", Number(e.target.value))}
                      className="w-16 px-2 py-1 rounded border border-gray-200 text-xs outline-none focus:border-blue-400" />
                  </td>
                  <td className="py-2 pr-2">
                    <input type="number" value={p.imageQuota} onChange={(e) => updatePlan(idx, "imageQuota", Number(e.target.value))}
                      className="w-16 px-2 py-1 rounded border border-gray-200 text-xs outline-none focus:border-blue-400" />
                  </td>
                  <td className="py-2 pr-2">
                    <input type="number" value={p.durationDays} onChange={(e) => updatePlan(idx, "durationDays", Number(e.target.value))}
                      className="w-16 px-2 py-1 rounded border border-gray-200 text-xs outline-none focus:border-blue-400" />
                  </td>
                  <td className="py-2 pr-2">
                    <input type="number" value={p.dailyLimit} onChange={(e) => updatePlan(idx, "dailyLimit", Number(e.target.value))}
                      className="w-16 px-2 py-1 rounded border border-gray-200 text-xs outline-none focus:border-blue-400" />
                  </td>
                  <td className="py-2 pr-2">
                    <input type="number" value={p.rank} onChange={(e) => updatePlan(idx, "rank", Number(e.target.value))}
                      className="w-12 px-2 py-1 rounded border border-gray-200 text-xs outline-none focus:border-blue-400" />
                  </td>
                  <td className="py-2 pr-2">
                    <select value={p.color || "blue"} onChange={(e) => updatePlan(idx, "color", e.target.value)}
                      className="px-2 py-1 rounded border border-gray-200 text-xs outline-none">
                      {COLORS.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </td>
                  <td className="py-2">
                    <button onClick={() => removePlan(idx)} disabled={plans.length <= 1}
                      className="text-xs text-red-400 hover:text-red-600 disabled:text-gray-300" title="删除">
                      删除
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <button
          onClick={handleSavePlans}
          disabled={plansSaving}
          className="px-5 py-2 rounded-xl bg-blue-500 text-white text-sm hover:bg-blue-600 disabled:bg-gray-300 transition-colors"
        >
          {plansSaving ? "保存中..." : plansSaved ? "卡种已保存 ✓" : "保存卡种配置"}
        </button>
      </div>

      {/* 模型提供商配置 */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
        <h3 className="text-sm font-semibold">AI 模型配置</h3>

        <div>
          <label className="text-xs text-gray-500 mb-2 block">模型提供商</label>
          <div className="flex gap-3">
            <button
              onClick={() => setModelProvider("gemini")}
              className={`flex-1 px-4 py-3 rounded-xl border-2 transition-all ${
                modelProvider === "gemini"
                  ? "border-blue-500 bg-blue-50 text-blue-700"
                  : "border-gray-200 hover:border-gray-300"
              }`}
            >
              <div className="font-medium text-sm">Google Gemini</div>
              <div className="text-xs text-gray-500 mt-0.5">国际版（需科学上网）</div>
            </button>
            <button
              onClick={() => setModelProvider("qwen")}
              className={`flex-1 px-4 py-3 rounded-xl border-2 transition-all ${
                modelProvider === "qwen"
                  ? "border-green-500 bg-green-50 text-green-700"
                  : "border-gray-200 hover:border-gray-300"
              }`}
            >
              <div className="font-medium text-sm">通义千问</div>
              <div className="text-xs text-gray-500 mt-0.5">国内合规（阿里云）</div>
            </button>
          </div>
        </div>

        {modelProvider === "gemini" && (
          <div className="animate-fade-in">
            <label className="text-xs text-gray-500 mb-1 block">Google Gemini API Key</label>
            <input
              type="password"
              value={geminiApiKey}
              onChange={(e) => setGeminiApiKey(e.target.value)}
              placeholder="AIzaSy..."
              className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm outline-none focus:border-blue-500 font-mono"
            />
            <p className="text-xs text-gray-400 mt-1">
              在 <a href="https://aistudio.google.com/app/apikey" target="_blank" className="text-blue-500 hover:underline">Google AI Studio</a> 获取 API Key
            </p>
          </div>
        )}

        {modelProvider === "qwen" && (
          <div className="animate-fade-in">
            <label className="text-xs text-gray-500 mb-1 block">通义千问 API Key</label>
            <input
              type="password"
              value={qwenApiKey}
              onChange={(e) => setQwenApiKey(e.target.value)}
              placeholder="sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
              className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm outline-none focus:border-green-500 font-mono"
            />
            <p className="text-xs text-gray-400 mt-1">
              在 <a href="https://dashscope.console.aliyun.com/apiKey" target="_blank" className="text-blue-500 hover:underline">阿里云控制台</a> 获取 API Key
            </p>
          </div>
        )}
      </div>

      {/* 免费用户配置 */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
        <h3 className="text-sm font-semibold">免费用户配置</h3>

        <div>
          <label className="text-xs text-gray-500 mb-1 block">免费试用期（天）</label>
          <input
            type="number"
            value={freeTrialDays}
            onChange={(e) => setFreeTrialDays(Number(e.target.value))}
            className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm outline-none focus:border-blue-500"
          />
        </div>

        <div>
          <label className="text-xs text-gray-500 mb-1 block">每日免费额度（次）</label>
          <input
            type="number"
            value={freeDailyLimit}
            onChange={(e) => setFreeDailyLimit(Number(e.target.value))}
            className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm outline-none focus:border-blue-500"
          />
        </div>
      </div>

      <button
        onClick={handleSaveSettings}
        disabled={saving}
        className="px-6 py-2.5 rounded-xl bg-blue-500 text-white text-sm hover:bg-blue-600 disabled:bg-gray-300 transition-colors"
      >
        {saving ? "保存中..." : saved ? "已保存 ✓" : "保存系统设置"}
      </button>
    </div>
  );
}

// ========== 管理员管理 Tab ==========
interface AdminInfo {
  username: string;
  role: "super" | "normal";
  permissions: string[];
  createdAt: string;
  createdBy: string;
  lastLogin?: string;
}

function AdminsTab({ session }: { session: AdminSession }) {
  const [admins, setAdmins] = useState<AdminInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newPerms, setNewPerms] = useState<string[]>(["coupons", "messages"]);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const PERM_OPTIONS = [
    { key: "messages", label: "客服消息" },
    { key: "users", label: "用户管理" },
    { key: "coupons", label: "兑换码" },
    { key: "settings", label: "系统设置" },
    { key: "trash", label: "回收站" },
    { key: "admins", label: "管理员" },
    { key: "monitor", label: "访问监控" },
  ];

  const fetchAdmins = useCallback(async () => {
    try {
      const resp = await adminFetch("/api/admin/admins", session);
      if (resp.ok) {
        const data = await resp.json();
        setAdmins(data.admins || []);
      }
    } catch { /* ignore */ }
    setLoading(false);
  }, [session]);

  useEffect(() => { fetchAdmins(); }, [fetchAdmins]);

  const handleCreate = async () => {
    if (!newUsername.trim() || !newPassword) return;
    try {
      const resp = await adminFetch("/api/admin/admins", session, {
        method: "POST",
        body: JSON.stringify({
          action: "create",
          username: newUsername.trim(),
          password: newPassword,
          permissions: newPerms,
        }),
      });
      const data = await resp.json();
      if (resp.ok) {
        setMsg({ ok: true, text: data.message });
        setNewUsername("");
        setNewPassword("");
        setShowCreate(false);
        fetchAdmins();
      } else {
        setMsg({ ok: false, text: data.error });
      }
    } catch { setMsg({ ok: false, text: "网络错误" }); }
    setTimeout(() => setMsg(null), 3000);
  };

  const handleDelete = async (username: string) => {
    if (!confirm(`确定删除管理员 ${username}？`)) return;
    try {
      const resp = await adminFetch("/api/admin/admins", session, {
        method: "POST",
        body: JSON.stringify({ action: "delete", username }),
      });
      if (resp.ok) fetchAdmins();
    } catch { /* ignore */ }
  };

  const togglePerm = (key: string) => {
    setNewPerms((prev) => prev.includes(key) ? prev.filter((p) => p !== key) : [...prev, key]);
  };

  if (loading) return <div className="text-center text-gray-400 py-20">加载中...</div>;

  return (
    <div className="space-y-4">
      {msg && (
        <div className={`p-3 rounded-lg text-sm ${msg.ok ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
          {msg.text}
        </div>
      )}

      {/* 标题栏 */}
      <div className="bg-blue-500 text-white px-4 py-3 rounded-t-xl flex items-center justify-between">
        <h3 className="text-sm font-semibold">管理员列表</h3>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-white text-blue-600 hover:bg-blue-50 font-medium"
        >
          <UserPlus size={14} />
          {showCreate ? "取消" : "新建管理员"}
        </button>
      </div>

      {showCreate && (
        <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
          <input
            value={newUsername}
            onChange={(e) => setNewUsername(e.target.value)}
            placeholder="用户名（2-20位字母数字下划线）"
            className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm outline-none focus:border-blue-500"
          />
          <input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="密码（至少4位）"
            className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm outline-none focus:border-blue-500"
          />
          <div>
            <p className="text-xs text-gray-500 mb-2">权限：</p>
            <div className="flex flex-wrap gap-2">
              {PERM_OPTIONS.map((p) => (
                <button
                  key={p.key}
                  onClick={() => togglePerm(p.key)}
                  className={`px-3 py-1 rounded-lg text-xs border transition-colors ${
                    newPerms.includes(p.key)
                      ? "bg-blue-500 text-white border-blue-500"
                      : "bg-white text-gray-500 border-gray-200"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
          <button
            onClick={handleCreate}
            className="px-4 py-2 rounded-lg bg-blue-500 text-white text-sm hover:bg-blue-600"
          >
            创建
          </button>
        </div>
      )}

      <div className="bg-white rounded-b-xl border border-gray-200 border-t-0 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 text-blue-600 text-xs">
              <th className="text-left px-4 py-3 font-medium">用户名</th>
              <th className="text-left px-4 py-3 font-medium">权限</th>
              <th className="text-left px-4 py-3 font-medium">创建时间</th>
              <th className="text-left px-4 py-3 font-medium">最后登录</th>
              <th className="text-left px-4 py-3 font-medium">操作</th>
            </tr>
          </thead>
          <tbody>
            {admins.map((a) => (
              <tr key={a.username} className="border-t border-gray-100 hover:bg-gray-50">
                <td className="px-4 py-3 font-medium">{a.username}</td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1">
                    {a.permissions.map((p) => (
                      <span key={p} className="text-[10px] bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded">
                        {PERM_OPTIONS.find((o) => o.key === p)?.label || p}
                      </span>
                    ))}
                  </div>
                </td>
                <td className="px-4 py-3 text-xs text-gray-500">{new Date(a.createdAt).toLocaleDateString("zh-CN")}</td>
                <td className="px-4 py-3 text-xs text-gray-500">{a.lastLogin ? new Date(a.lastLogin).toLocaleString("zh-CN") : "-"}</td>
                <td className="px-4 py-3">
                  <button
                    onClick={() => handleDelete(a.username)}
                    className="text-xs text-red-500 hover:underline"
                  >
                    删除
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {admins.length === 0 && (
          <p className="text-center text-gray-400 text-sm py-8">暂无普通管理员</p>
        )}
      </div>
    </div>
  );
}

// ========== 访问监控 Tab ==========
function MonitorTab({ session }: { session: AdminSession }) {
  const [stats, setStats] = useState<{ totalVisits: number; todayVisits: number; activeUsers: number }>({ totalVisits: 0, todayVisits: 0, activeUsers: 0 });
  const [recentLogs, setRecentLogs] = useState<{ userId: string; action: string; ip: string; time: string }[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const resp = await adminFetch("/api/admin/monitor", session);
      if (resp.ok) {
        const data = await resp.json();
        setStats(data.stats || { totalVisits: 0, todayVisits: 0, activeUsers: 0 });
        setRecentLogs(data.logs || []);
      }
    } catch { /* ignore */ }
    setLoading(false);
  }, [session]);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (loading) return <div className="text-center text-gray-400 py-20">加载中...</div>;

  return (
    <div className="space-y-4">
      {/* 统计卡片 */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-xl p-4 border border-gray-200">
          <p className="text-2xl font-bold text-gray-900">{stats.totalVisits}</p>
          <p className="text-xs text-gray-500 mt-1">总访问量</p>
        </div>
        <div className="bg-white rounded-xl p-4 border border-gray-200">
          <p className="text-2xl font-bold text-blue-600">{stats.todayVisits}</p>
          <p className="text-xs text-gray-500 mt-1">今日访问</p>
        </div>
        <div className="bg-white rounded-xl p-4 border border-gray-200">
          <p className="text-2xl font-bold text-green-600">{stats.activeUsers}</p>
          <p className="text-xs text-gray-500 mt-1">活跃用户</p>
        </div>
      </div>

      {/* 操作按钮 */}
      <div className="flex justify-end">
        <button onClick={fetchData} className="px-3 py-1.5 rounded-lg text-xs bg-white border border-gray-200 hover:bg-gray-50">
          刷新
        </button>
      </div>

      {/* 访问日志 */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 text-gray-500 text-xs">
              <th className="text-left px-4 py-3 font-medium">用户</th>
              <th className="text-left px-4 py-3 font-medium">操作</th>
              <th className="text-left px-4 py-3 font-medium">IP</th>
              <th className="text-left px-4 py-3 font-medium">时间</th>
            </tr>
          </thead>
          <tbody>
            {recentLogs.map((log, i) => (
              <tr key={i} className="border-t border-gray-100 hover:bg-gray-50">
                <td className="px-4 py-3 font-mono text-xs">{log.userId.slice(0, 8)}...</td>
                <td className="px-4 py-3 text-xs">{log.action}</td>
                <td className="px-4 py-3 text-xs text-gray-500">{log.ip}</td>
                <td className="px-4 py-3 text-xs text-gray-500">{new Date(log.time).toLocaleString("zh-CN")}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {recentLogs.length === 0 && (
          <p className="text-center text-gray-400 text-sm py-8">暂无访问记录</p>
        )}
      </div>
    </div>
  );
}

// ========== 回收站 Tab ==========
function TrashTab({ session }: { session: AdminSession }) {
  const [items, setItems] = useState<{ id: string; type: string; name: string; deletedAt: string; deletedBy: string }[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const resp = await adminFetch("/api/admin/trash", session);
      if (resp.ok) {
        const data = await resp.json();
        setItems(data.items || []);
      }
    } catch { /* ignore */ }
    setLoading(false);
  }, [session]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleRestore = async (id: string) => {
    await adminFetch("/api/admin/trash/restore", session, {
      method: "POST",
      body: JSON.stringify({ id }),
    });
    fetchData();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("确定要永久删除吗？此操作不可恢复！")) return;
    await adminFetch("/api/admin/trash/delete", session, {
      method: "POST",
      body: JSON.stringify({ id }),
    });
    fetchData();
  };

  if (loading) return <div className="text-center text-gray-400 py-20">加载中...</div>;

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button onClick={fetchData} className="px-3 py-1.5 rounded-lg text-xs bg-white border border-gray-200 hover:bg-gray-50">
          刷新
        </button>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 text-gray-500 text-xs">
              <th className="text-left px-4 py-3 font-medium">类型</th>
              <th className="text-left px-4 py-3 font-medium">名称</th>
              <th className="text-left px-4 py-3 font-medium">删除者</th>
              <th className="text-left px-4 py-3 font-medium">删除时间</th>
              <th className="text-left px-4 py-3 font-medium">操作</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id} className="border-t border-gray-100 hover:bg-gray-50">
                <td className="px-4 py-3">
                  <span className="text-[10px] bg-gray-100 text-gray-600 px-2 py-0.5 rounded">{item.type}</span>
                </td>
                <td className="px-4 py-3 text-sm">{item.name}</td>
                <td className="px-4 py-3 text-xs text-gray-500">{item.deletedBy}</td>
                <td className="px-4 py-3 text-xs text-gray-500">{new Date(item.deletedAt).toLocaleString("zh-CN")}</td>
                <td className="px-4 py-3 flex gap-2">
                  <button onClick={() => handleRestore(item.id)} className="text-xs text-blue-500 hover:underline">
                    恢复
                  </button>
                  <button onClick={() => handleDelete(item.id)} className="text-xs text-red-500 hover:underline">
                    永久删除
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {items.length === 0 && (
          <p className="text-center text-gray-400 text-sm py-8">回收站为空</p>
        )}
      </div>
    </div>
  );
}
