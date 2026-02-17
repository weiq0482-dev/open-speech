"use client";

import { useEffect, useRef } from "react";
import { useChatStore } from "@/store/chat-store";
import { generateDeviceFingerprint } from "@/lib/device-fingerprint";

export function DeviceGuard() {
  const setUserId = useChatStore((s) => s.setUserId);
  const authToken = useChatStore((s) => s.authToken);
  const userEmail = useChatStore((s) => s.userEmail);
  const initialized = useRef(false);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    // 已登录邮箱用户：验证 token 有效性，跳过设备指纹
    if (authToken && userEmail) {
      fetch("/api/auth/me", {
        headers: { Authorization: `Bearer ${authToken}` },
      })
        .then((resp) => {
          if (resp.ok) return resp.json();
          // token 过期，清除登录态，走设备指纹流程
          useChatStore.getState().logout();
          return null;
        })
        .then((data) => {
          if (data?.userId) {
            setUserId(data.userId);
          } else {
            registerDevice();
          }
        })
        .catch(() => registerDevice());
      return;
    }

    // 未登录：设备指纹注册
    registerDevice();

    async function registerDevice() {
      try {
        const fingerprint = await generateDeviceFingerprint();

        const resp = await fetch("/api/device", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fingerprint }),
        });

        if (resp.ok) {
          const data = await resp.json();
          if (data.userId) {
            setUserId(data.userId);
          }
        }
      } catch (err) {
        console.warn("[DeviceGuard] 设备注册失败，使用本地 ID", err);
      }
    }
  }, [setUserId, authToken, userEmail]);

  return null;
}
