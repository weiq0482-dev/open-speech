"use client";

import { useEffect, useRef } from "react";
import { useChatStore } from "@/store/chat-store";
import { generateDeviceFingerprint } from "@/lib/device-fingerprint";

export function DeviceGuard() {
  const setUserId = useChatStore((s) => s.setUserId);
  const initialized = useRef(false);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    (async () => {
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
    })();
  }, [setUserId]);

  return null;
}
