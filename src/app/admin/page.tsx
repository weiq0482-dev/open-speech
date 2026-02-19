"use client";

import { useState, useEffect, useRef, useCallback } from "react";

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

type TabKey = "messages" | "users" | "coupons" | "settings";

// ========== 工具函数 ==========
function adminFetch(url: string, key: string, options?: RequestInit) {
  return fetch(url, {
    ...options,
    headers: { "x-admin-key": key, "Content-Type": "application/json", ...options?.headers },
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

function planBadge(plan: string) {
  const colors: Record<string, string> = {
    free: "bg-gray-100 text-gray-600",
    trial: "bg-blue-100 text-blue-700",
    monthly: "bg-amber-100 text-amber-700",
    quarterly: "bg-purple-100 text-purple-700",
  };
  const labels: Record<string, string> = {
    free: "免费", trial: "体验卡", monthly: "月卡", quarterly: "季卡",
  };
  return (
    <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${colors[plan] || "bg-gray-100 text-gray-600"}`}>
      {labels[plan] || plan}
    </span>
  );
}

// ========== 主组件 ==========
export default function AdminPage() {
  const [authed, setAuthed] = useState(false);
  const [keyInput, setKeyInput] = useState("");
  const [adminKey, setAdminKey] = useState("");
  const [activeTab, setActiveTab] = useState<TabKey>("messages");

  useEffect(() => {
    const saved = localStorage.getItem("openspeech-admin-key");
    if (saved) {
      // 验证已保存的密钥是否仍然有效
      fetch("/api/admin/users", { headers: { "x-admin-key": saved } })
        .then((r) => {
          if (r.ok) {
            setAdminKey(saved);
            setAuthed(true);
          } else {
            localStorage.removeItem("openspeech-admin-key");
            setLoginError("密钥已过期，请重新输入");
          }
        })
        .catch(() => {
          // 网络错误时仍允许进入（可能离线）
          setAdminKey(saved);
          setAuthed(true);
        });
    }
  }, []);

  const [loginError, setLoginError] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);

  const handleLogin = async () => {
    if (!keyInput.trim()) return;
    setLoginLoading(true);
    setLoginError("");
    try {
      const resp = await fetch("/api/admin/users", {
        headers: { "x-admin-key": keyInput.trim() },
      });
      if (resp.ok) {
        localStorage.setItem("openspeech-admin-key", keyInput.trim());
        setAdminKey(keyInput.trim());
        setAuthed(true);
      } else {
        setLoginError("密钥错误，请重新输入");
      }
    } catch {
      setLoginError("网络连接失败，请稍后重试");
    }
    setLoginLoading(false);
  };

  const handleLogout = () => {
    localStorage.removeItem("openspeech-admin-key");
    setAdminKey("");
    setAuthed(false);
  };

  if (!authed) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="bg-white rounded-2xl shadow-xl p-8 max-w-sm w-full">
          <h1 className="text-xl font-bold mb-2 text-center">OpenSpeech</h1>
          <p className="text-xs text-gray-400 text-center mb-6">管理后台</p>
          <input
            type="password"
            value={keyInput}
            onChange={(e) => setKeyInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleLogin()}
            placeholder="输入管理密钥"
            className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-gray-50 text-sm outline-none focus:border-blue-500 mb-4"
          />
          {loginError && (
            <p className="text-xs text-red-500 mb-3 text-center">{loginError}</p>
          )}
          <button
            onClick={handleLogin}
            disabled={loginLoading}
            className="w-full px-4 py-3 rounded-xl bg-blue-500 text-white text-sm font-medium hover:bg-blue-600 transition-colors disabled:bg-gray-300"
          >
            {loginLoading ? "验证中..." : "进入管理"}
          </button>
        </div>
      </div>
    );
  }

  const tabs: { key: TabKey; label: string }[] = [
    { key: "messages", label: "客服消息" },
    { key: "users", label: "用户管理" },
    { key: "coupons", label: "兑换码" },
    { key: "settings", label: "系统设置" },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 顶部导航 */}
      <header className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <h1 className="text-lg font-bold">OpenSpeech 管理后台</h1>
          <nav className="flex gap-1">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  activeTab === tab.key ? "bg-blue-50 text-blue-600" : "text-gray-600 hover:bg-gray-100"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>
        <button onClick={handleLogout} className="text-xs text-gray-400 hover:text-red-500 transition-colors">
          退出
        </button>
      </header>

      {/* 内容区 */}
      <div className="p-6">
        {activeTab === "messages" && <MessagesTab adminKey={adminKey} />}
        {activeTab === "users" && <UsersTab adminKey={adminKey} />}
        {activeTab === "coupons" && <CouponsTab adminKey={adminKey} />}
        {activeTab === "settings" && <SettingsTab adminKey={adminKey} />}
      </div>
    </div>
  );
}

// ========== 客服消息 Tab ==========
function MessagesTab({ adminKey }: { adminKey: string }) {
  const [threads, setThreads] = useState<Thread[]>([]);
  const [activeUserId, setActiveUserId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const fetchThreads = useCallback(async () => {
    try {
      const resp = await adminFetch("/api/admin/threads", adminKey);
      if (resp.ok) {
        const data = await resp.json();
        setThreads(data.threads || []);
      }
    } catch { /* ignore */ }
  }, [adminKey]);

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
      const resp = await adminFetch("/api/admin/reply", adminKey, {
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
function UsersTab({ adminKey }: { adminKey: string }) {
  const [users, setUsers] = useState<UserInfo[]>([]);
  const [suspicious, setSuspicious] = useState<UserInfo[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<"all" | "free" | "paid" | "locked" | "suspicious">("all");
  const [lockReason, setLockReason] = useState("");
  const [actionUserId, setActionUserId] = useState<string | null>(null);

  const fetchUsers = useCallback(async () => {
    try {
      const resp = await adminFetch("/api/admin/users", adminKey);
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
  }, [adminKey]);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  const handleLock = async (userId: string) => {
    await adminFetch("/api/admin/users/lock", adminKey, {
      method: "POST",
      body: JSON.stringify({ userId, reason: lockReason || "管理员手动锁定" }),
    });
    setActionUserId(null);
    setLockReason("");
    fetchUsers();
  };

  const handleUnlock = async (userId: string) => {
    await adminFetch("/api/admin/users/unlock", adminKey, {
      method: "POST",
      body: JSON.stringify({ userId }),
    });
    fetchUsers();
  };

  const filteredUsers = users.filter((u) => {
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

      {/* 筛选 */}
      <div className="flex gap-2">
        {(["all", "free", "paid", "locked", "suspicious"] as const).map((f) => {
          const labels: Record<string, string> = { all: "全部", free: "免费用户", paid: "付费用户", locked: "已锁定", suspicious: "可疑" };
          return (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                filter === f ? "bg-blue-500 text-white" : "bg-white text-gray-600 border border-gray-200 hover:bg-gray-50"
              }`}
            >
              {labels[f]} ({f === "all" ? total : f === "suspicious" ? suspicious.length : users.filter((u) => {
                if (f === "free") return u.plan === "free";
                if (f === "paid") return u.plan !== "free";
                if (f === "locked") return !!u.locked;
                return false;
              }).length})
            </button>
          );
        })}
        <button onClick={fetchUsers} className="ml-auto px-3 py-1.5 rounded-lg text-xs bg-white border border-gray-200 hover:bg-gray-50">
          刷新
        </button>
      </div>

      {/* 用户列表 */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 text-gray-500 text-xs">
              <th className="text-left px-4 py-3 font-medium">用户</th>
              <th className="text-left px-4 py-3 font-medium">套餐</th>
              <th className="text-left px-4 py-3 font-medium">对话/生图</th>
              <th className="text-left px-4 py-3 font-medium">今日用量</th>
              <th className="text-left px-4 py-3 font-medium">兑换码</th>
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
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs">{shortId(user.userId)}</span>
                      {user.userId.startsWith("em_") && (
                        <span className="text-[9px] bg-green-100 text-green-700 px-1 rounded">邮箱</span>
                      )}
                    </div>
                    {user.email && (
                      <span className="text-[10px] text-gray-400">{user.email}</span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3">{planBadge(user.plan)}</td>
                <td className="px-4 py-3 text-xs">
                  {user.plan === "free" ? "-" : `${user.chatRemaining} / ${user.imageRemaining}`}
                </td>
                <td className="px-4 py-3 text-xs">
                  <span className={user.dailyFreeUsed >= 4 ? "text-red-500 font-semibold" : ""}>
                    {user.dailyFreeUsed}
                  </span>
                </td>
                <td className="px-4 py-3 text-xs text-gray-500">
                  {user.redeemCode ? (
                    <span className="font-mono text-[10px] bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded">{user.redeemCode}</span>
                  ) : "-"}
                </td>
                <td className="px-4 py-3 text-xs text-gray-500">
                  {user.createdAt ? new Date(user.createdAt).toLocaleDateString("zh-CN") :
                   user.freeTrialStarted ? new Date(user.freeTrialStarted).toLocaleDateString("zh-CN") : "-"}
                </td>
                <td className="px-4 py-3">
                  {user.locked ? (
                    <span className="text-[10px] bg-red-100 text-red-700 px-2 py-0.5 rounded font-medium">
                      已锁定
                    </span>
                  ) : suspicious.some((s) => s.userId === user.userId) ? (
                    <span className="text-[10px] bg-amber-100 text-amber-700 px-2 py-0.5 rounded font-medium">
                      可疑
                    </span>
                  ) : (
                    <span className="text-[10px] bg-green-100 text-green-700 px-2 py-0.5 rounded font-medium">
                      正常
                    </span>
                  )}
                </td>
                <td className="px-4 py-3">
                  {user.locked ? (
                    <button onClick={() => handleUnlock(user.userId)} className="text-xs text-blue-500 hover:underline">
                      解锁
                    </button>
                  ) : actionUserId === user.userId ? (
                    <div className="flex items-center gap-1">
                      <input
                        value={lockReason}
                        onChange={(e) => setLockReason(e.target.value)}
                        placeholder="原因"
                        className="px-2 py-1 border border-gray-200 rounded text-xs w-24"
                      />
                      <button onClick={() => handleLock(user.userId)} className="text-xs text-red-500 hover:underline">
                        确认
                      </button>
                      <button onClick={() => setActionUserId(null)} className="text-xs text-gray-400 hover:underline">
                        取消
                      </button>
                    </div>
                  ) : (
                    <button onClick={() => setActionUserId(user.userId)} className="text-xs text-red-500 hover:underline">
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
function CouponsTab({ adminKey }: { adminKey: string }) {
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [plan, setPlan] = useState<"trial" | "monthly" | "quarterly">("trial");
  const [count, setCount] = useState(5);
  const [generating, setGenerating] = useState(false);
  const [newCodes, setNewCodes] = useState<string[]>([]);

  const fetchCoupons = useCallback(async () => {
    try {
      const resp = await adminFetch("/api/admin/coupons", adminKey);
      if (resp.ok) {
        const data = await resp.json();
        setCoupons(data.coupons || []);
      }
    } catch { /* ignore */ }
  }, [adminKey]);

  useEffect(() => { fetchCoupons(); }, [fetchCoupons]);

  const [genError, setGenError] = useState("");

  const handleGenerate = async () => {
    setGenerating(true);
    setGenError("");
    try {
      const resp = await adminFetch("/api/admin/coupons/generate", adminKey, {
        method: "POST",
        body: JSON.stringify({ plan, count, createdBy: "super_admin" }),
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
            onChange={(e) => setPlan(e.target.value as "trial" | "monthly" | "quarterly")}
            className="px-3 py-2 rounded-lg border border-gray-200 text-sm"
          >
            <option value="trial">体验卡（7天）</option>
            <option value="monthly">月卡（30天）</option>
            <option value="quarterly">季卡（90天）</option>
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
                  <td className="px-4 py-3">{planBadge(c.plan)}</td>
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
function SettingsTab({ adminKey }: { adminKey: string }) {
  const [freeTrialDays, setFreeTrialDays] = useState(30);
  const [freeDailyLimit, setFreeDailyLimit] = useState(5);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    adminFetch("/api/admin/settings", adminKey).then((r) => r.json()).then((d) => {
      if (d.settings) {
        setFreeTrialDays(d.settings.freeTrialDays || 30);
        setFreeDailyLimit(d.settings.freeDailyLimit || 5);
      }
    }).catch(() => {});
  }, [adminKey]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await adminFetch("/api/admin/settings", adminKey, {
        method: "POST",
        body: JSON.stringify({ freeTrialDays, freeDailyLimit }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch { /* ignore */ }
    setSaving(false);
  };

  return (
    <div className="max-w-lg">
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

        <button
          onClick={handleSave}
          disabled={saving}
          className="px-6 py-2.5 rounded-xl bg-blue-500 text-white text-sm hover:bg-blue-600 disabled:bg-gray-300 transition-colors"
        >
          {saving ? "保存中..." : saved ? "已保存 ✓" : "保存设置"}
        </button>
      </div>
    </div>
  );
}
