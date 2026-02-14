"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { X, Undo2, Eraser, Send, Minus, Plus, Pen } from "lucide-react";
import { cn } from "@/lib/utils";

interface ImageEditorProps {
  imageSrc: string;
  onSubmit: (annotatedImageDataUrl: string, instruction: string) => void;
  onClose: () => void;
}

export function ImageEditor({ imageSrc, onSubmit, onClose }: ImageEditorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [brushSize, setBrushSize] = useState(20);
  const [instruction, setInstruction] = useState("");
  const [history, setHistory] = useState<ImageData[]>([]);
  const [canvasReady, setCanvasReady] = useState(false);
  const imgRef = useRef<HTMLImageElement | null>(null);

  // 加载图片到 canvas
  useEffect(() => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      imgRef.current = img;
      const canvas = canvasRef.current;
      if (!canvas) return;

      // 根据容器大小适配 canvas
      const container = containerRef.current;
      if (!container) return;
      const maxW = container.clientWidth - 32;
      const maxH = container.clientHeight - 200;

      let w = img.naturalWidth;
      let h = img.naturalHeight;
      const scale = Math.min(maxW / w, maxH / h, 1);
      w = Math.round(w * scale);
      h = Math.round(h * scale);

      canvas.width = w;
      canvas.height = h;

      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.drawImage(img, 0, 0, w, h);

      // 保存初始状态
      setHistory([ctx.getImageData(0, 0, w, h)]);
      setCanvasReady(true);
    };
    img.src = imageSrc;
  }, [imageSrc]);

  // 获取 canvas 相对坐标
  const getPos = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    if ("touches" in e) {
      const touch = e.touches[0] || e.changedTouches[0];
      return {
        x: (touch.clientX - rect.left) * scaleX,
        y: (touch.clientY - rect.top) * scaleY,
      };
    }
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  }, []);

  // 画笔绘制
  const startDraw = useCallback(
    (e: React.MouseEvent | React.TouchEvent) => {
      e.preventDefault();
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      if (!ctx || !canvas) return;

      setIsDrawing(true);
      const { x, y } = getPos(e);

      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.lineWidth = brushSize;
      // 半透明红色标记
      ctx.strokeStyle = "rgba(255, 60, 60, 0.5)";
    },
    [getPos, brushSize]
  );

  const draw = useCallback(
    (e: React.MouseEvent | React.TouchEvent) => {
      e.preventDefault();
      if (!isDrawing) return;
      const ctx = canvasRef.current?.getContext("2d");
      if (!ctx) return;
      const { x, y } = getPos(e);
      ctx.lineTo(x, y);
      ctx.stroke();
    },
    [isDrawing, getPos]
  );

  const endDraw = useCallback(() => {
    if (!isDrawing) return;
    setIsDrawing(false);
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!ctx || !canvas) return;
    ctx.closePath();
    // 保存到历史
    setHistory((prev) => [...prev, ctx.getImageData(0, 0, canvas.width, canvas.height)]);
  }, [isDrawing]);

  // 撤销
  const handleUndo = useCallback(() => {
    if (history.length <= 1) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!ctx || !canvas) return;

    const newHistory = history.slice(0, -1);
    const prevState = newHistory[newHistory.length - 1];
    ctx.putImageData(prevState, 0, 0);
    setHistory(newHistory);
  }, [history]);

  // 清除标记（恢复原图）
  const handleClear = useCallback(() => {
    if (history.length <= 1) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!ctx || !canvas) return;

    const initial = history[0];
    ctx.putImageData(initial, 0, 0);
    setHistory([initial]);
  }, [history]);

  // 提交
  const handleSubmit = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !instruction.trim()) return;
    const dataUrl = canvas.toDataURL("image/png");
    onSubmit(dataUrl, instruction.trim());
  }, [instruction, onSubmit]);

  // ESC 关闭
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[9999] bg-black/80 flex flex-col">
      {/* 顶部工具栏 */}
      <div className="flex items-center justify-between px-4 py-3 bg-[var(--card)] border-b border-[var(--border)]">
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium">标记编辑区域</span>
          <div className="h-4 w-px bg-[var(--border)]" />

          {/* 画笔大小 */}
          <div className="flex items-center gap-1.5">
            <Pen size={14} className="text-[var(--muted)]" />
            <button
              onClick={() => setBrushSize(Math.max(5, brushSize - 5))}
              className="p-1 rounded hover:bg-[var(--sidebar-hover)] text-[var(--muted)]"
            >
              <Minus size={14} />
            </button>
            <span className="text-xs text-[var(--muted)] w-6 text-center">{brushSize}</span>
            <button
              onClick={() => setBrushSize(Math.min(80, brushSize + 5))}
              className="p-1 rounded hover:bg-[var(--sidebar-hover)] text-[var(--muted)]"
            >
              <Plus size={14} />
            </button>
          </div>

          <div className="h-4 w-px bg-[var(--border)]" />

          {/* 撤销 / 清除 */}
          <button
            onClick={handleUndo}
            disabled={history.length <= 1}
            className={cn(
              "flex items-center gap-1 px-2 py-1 rounded-md text-xs transition-colors",
              history.length > 1
                ? "text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20"
                : "text-[var(--muted)] cursor-not-allowed"
            )}
          >
            <Undo2 size={14} />
            撤销
          </button>
          <button
            onClick={handleClear}
            disabled={history.length <= 1}
            className={cn(
              "flex items-center gap-1 px-2 py-1 rounded-md text-xs transition-colors",
              history.length > 1
                ? "text-orange-600 hover:bg-orange-50 dark:hover:bg-orange-900/20"
                : "text-[var(--muted)] cursor-not-allowed"
            )}
          >
            <Eraser size={14} />
            清除标记
          </button>
        </div>

        <button
          onClick={onClose}
          className="p-2 rounded-full hover:bg-[var(--sidebar-hover)] text-[var(--muted)]"
        >
          <X size={20} />
        </button>
      </div>

      {/* 画布区域 */}
      <div
        ref={containerRef}
        className="flex-1 flex items-center justify-center overflow-auto p-4"
      >
        <canvas
          ref={canvasRef}
          onMouseDown={startDraw}
          onMouseMove={draw}
          onMouseUp={endDraw}
          onMouseLeave={endDraw}
          onTouchStart={startDraw}
          onTouchMove={draw}
          onTouchEnd={endDraw}
          className={cn(
            "rounded-xl shadow-2xl max-w-full max-h-full",
            canvasReady ? "cursor-crosshair" : "cursor-wait"
          )}
          style={{ touchAction: "none" }}
        />
      </div>

      {/* 底部输入栏 */}
      <div className="px-4 py-3 bg-[var(--card)] border-t border-[var(--border)]">
        <div className="max-w-2xl mx-auto flex items-center gap-2">
          <div className="flex-1 relative">
            <input
              type="text"
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmit();
                }
              }}
              placeholder="描述要修改的内容，如「把红色标记区域改成蓝色天空」"
              className="w-full px-4 py-2.5 rounded-xl border border-[var(--border)] bg-[var(--background)] text-sm outline-none focus:border-blue-400 transition-colors"
            />
          </div>
          <button
            onClick={handleSubmit}
            disabled={!instruction.trim() || history.length <= 1}
            className={cn(
              "p-2.5 rounded-xl transition-colors",
              instruction.trim() && history.length > 1
                ? "bg-gemini-blue text-white hover:bg-blue-600"
                : "bg-[var(--sidebar-hover)] text-[var(--muted)] cursor-not-allowed"
            )}
          >
            <Send size={18} />
          </button>
        </div>
        <p className="text-center text-[10px] text-[var(--muted)] mt-1.5">
          用画笔在图片上标记要修改的区域，然后描述修改内容
        </p>
      </div>
    </div>
  );
}
