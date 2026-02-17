"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { X, Undo2, Eraser, Check, Minus, Plus, Pen, Square, MoveRight, Type } from "lucide-react";
import { cn } from "@/lib/utils";

type AnnotationTool = "pen" | "rect" | "arrow" | "text";

const COLORS = [
  { value: "#FF3C3C", label: "红" },
  { value: "#3B82F6", label: "蓝" },
  { value: "#22C55E", label: "绿" },
  { value: "#F59E0B", label: "黄" },
  { value: "#FFFFFF", label: "白" },
  { value: "#000000", label: "黑" },
];

const TOOL_LIST: { id: AnnotationTool; icon: typeof Pen; label: string }[] = [
  { id: "pen", icon: Pen, label: "画笔" },
  { id: "rect", icon: Square, label: "方框" },
  { id: "arrow", icon: MoveRight, label: "箭头" },
  { id: "text", icon: Type, label: "文字" },
];

interface ImageEditorProps {
  imageSrc: string;
  onSave: (annotatedImageDataUrl: string) => void;
  onClose: () => void;
}

export function ImageEditor({ imageSrc, onSave, onClose }: ImageEditorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [activeTool, setActiveTool] = useState<AnnotationTool>("rect");
  const [brushSize, setBrushSize] = useState(3);
  const [color, setColor] = useState("#FF3C3C");
  const [history, setHistory] = useState<ImageData[]>([]);
  const [canvasReady, setCanvasReady] = useState(false);
  const startPosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const snapshotRef = useRef<ImageData | null>(null);
  const [textInput, setTextInput] = useState<{ x: number; y: number; show: boolean }>({ x: 0, y: 0, show: false });
  const [textValue, setTextValue] = useState("");
  const textInputRef = useRef<HTMLInputElement>(null);

  // 加载图片到 canvas
  useEffect(() => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = canvasRef.current;
      const container = containerRef.current;
      if (!canvas || !container) return;

      const maxW = container.clientWidth - 32;
      const maxH = container.clientHeight - 32;
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
      setHistory([ctx.getImageData(0, 0, w, h)]);
      setCanvasReady(true);
    };
    img.src = imageSrc;
  }, [imageSrc]);

  const getPos = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const sx = canvas.width / rect.width;
    const sy = canvas.height / rect.height;
    if ("touches" in e) {
      const t = e.touches[0] || e.changedTouches[0];
      return { x: (t.clientX - rect.left) * sx, y: (t.clientY - rect.top) * sy };
    }
    return { x: (e.clientX - rect.left) * sx, y: (e.clientY - rect.top) * sy };
  }, []);

  // 绘制箭头辅助函数
  const drawArrow = useCallback((ctx: CanvasRenderingContext2D, fx: number, fy: number, tx: number, ty: number) => {
    const headLen = Math.max(15, brushSize * 5);
    const angle = Math.atan2(ty - fy, tx - fx);
    ctx.beginPath();
    ctx.moveTo(fx, fy);
    ctx.lineTo(tx, ty);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(tx, ty);
    ctx.lineTo(tx - headLen * Math.cos(angle - Math.PI / 6), ty - headLen * Math.sin(angle - Math.PI / 6));
    ctx.moveTo(tx, ty);
    ctx.lineTo(tx - headLen * Math.cos(angle + Math.PI / 6), ty - headLen * Math.sin(angle + Math.PI / 6));
    ctx.stroke();
  }, [brushSize]);

  const startDraw = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    if (textInput.show) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!ctx || !canvas) return;

    const pos = getPos(e);
    startPosRef.current = pos;
    snapshotRef.current = ctx.getImageData(0, 0, canvas.width, canvas.height);

    if (activeTool === "text") {
      // 显示文字输入框
      const rect = canvas.getBoundingClientRect();
      const sx = rect.width / canvas.width;
      setTextInput({
        x: rect.left + pos.x * sx,
        y: rect.top + pos.y * (rect.height / canvas.height),
        show: true,
      });
      setTextValue("");
      setTimeout(() => textInputRef.current?.focus(), 50);
      return;
    }

    setIsDrawing(true);
    if (activeTool === "pen") {
      ctx.beginPath();
      ctx.moveTo(pos.x, pos.y);
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.lineWidth = brushSize;
      ctx.strokeStyle = color;
    }
  }, [getPos, activeTool, brushSize, color, textInput.show]);

  const draw = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!ctx || !canvas) return;
    const pos = getPos(e);

    if (activeTool === "pen") {
      ctx.lineTo(pos.x, pos.y);
      ctx.stroke();
    } else if (activeTool === "rect" || activeTool === "arrow") {
      // 恢复快照再绘制预览
      if (snapshotRef.current) ctx.putImageData(snapshotRef.current, 0, 0);
      ctx.strokeStyle = color;
      ctx.lineWidth = brushSize;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      if (activeTool === "rect") {
        const w = pos.x - startPosRef.current.x;
        const h = pos.y - startPosRef.current.y;
        ctx.beginPath();
        ctx.strokeRect(startPosRef.current.x, startPosRef.current.y, w, h);
      } else {
        drawArrow(ctx, startPosRef.current.x, startPosRef.current.y, pos.x, pos.y);
      }
    }
  }, [isDrawing, getPos, activeTool, brushSize, color, drawArrow]);

  const endDraw = useCallback(() => {
    if (!isDrawing) return;
    setIsDrawing(false);
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!ctx || !canvas) return;
    if (activeTool === "pen") ctx.closePath();
    setHistory((prev) => [...prev, ctx.getImageData(0, 0, canvas.width, canvas.height)]);
  }, [isDrawing, activeTool]);

  // 文字确认
  const commitText = useCallback(() => {
    if (!textValue.trim()) { setTextInput({ x: 0, y: 0, show: false }); return; }
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!ctx || !canvas) return;

    const fontSize = Math.max(16, brushSize * 6);
    ctx.font = `bold ${fontSize}px sans-serif`;
    ctx.fillStyle = color;
    ctx.textBaseline = "top";
    ctx.fillText(textValue, startPosRef.current.x, startPosRef.current.y);

    setHistory((prev) => [...prev, ctx.getImageData(0, 0, canvas.width, canvas.height)]);
    setTextInput({ x: 0, y: 0, show: false });
    setTextValue("");
  }, [textValue, color, brushSize]);

  const handleUndo = useCallback(() => {
    if (history.length <= 1) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!ctx || !canvas) return;
    const newH = history.slice(0, -1);
    ctx.putImageData(newH[newH.length - 1], 0, 0);
    setHistory(newH);
  }, [history]);

  const handleClear = useCallback(() => {
    if (history.length <= 1) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!ctx || !canvas) return;
    ctx.putImageData(history[0], 0, 0);
    setHistory([history[0]]);
  }, [history]);

  const handleSave = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    onSave(canvas.toDataURL("image/png"));
  }, [onSave]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[9999] bg-black/80 flex flex-col">
      {/* 顶部工具栏 */}
      <div className="flex items-center justify-between px-3 py-2.5 bg-[var(--card)] border-b border-[var(--border)] flex-wrap gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          {/* 工具选择 */}
          <div className="flex items-center gap-0.5 bg-[var(--sidebar-hover)] rounded-lg p-0.5">
            {TOOL_LIST.map((t) => (
              <button
                key={t.id}
                onClick={() => setActiveTool(t.id)}
                className={cn(
                  "flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs transition-colors",
                  activeTool === t.id
                    ? "bg-[var(--card)] shadow-sm font-medium"
                    : "text-[var(--muted)] hover:text-[var(--foreground)]"
                )}
              >
                <t.icon size={14} />
                {t.label}
              </button>
            ))}
          </div>

          <div className="h-5 w-px bg-[var(--border)]" />

          {/* 颜色选择 */}
          <div className="flex items-center gap-1">
            {COLORS.map((c) => (
              <button
                key={c.value}
                onClick={() => setColor(c.value)}
                className={cn(
                  "w-6 h-6 rounded-full border-2 transition-transform",
                  color === c.value ? "border-blue-500 scale-110" : "border-[var(--border)]"
                )}
                style={{ backgroundColor: c.value }}
                title={c.label}
              />
            ))}
          </div>

          <div className="h-5 w-px bg-[var(--border)]" />

          {/* 粗细 */}
          <div className="flex items-center gap-1">
            <button
              onClick={() => setBrushSize(Math.max(1, brushSize - 1))}
              className="p-1 rounded hover:bg-[var(--sidebar-hover)] text-[var(--muted)]"
            >
              <Minus size={14} />
            </button>
            <span className="text-xs text-[var(--muted)] w-4 text-center">{brushSize}</span>
            <button
              onClick={() => setBrushSize(Math.min(10, brushSize + 1))}
              className="p-1 rounded hover:bg-[var(--sidebar-hover)] text-[var(--muted)]"
            >
              <Plus size={14} />
            </button>
          </div>

          <div className="h-5 w-px bg-[var(--border)]" />

          {/* 撤销 / 清除 */}
          <button
            onClick={handleUndo}
            disabled={history.length <= 1}
            className={cn(
              "flex items-center gap-1 px-2 py-1 rounded-md text-xs",
              history.length > 1 ? "text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20" : "text-[var(--muted)] cursor-not-allowed"
            )}
          >
            <Undo2 size={14} /> 撤销
          </button>
          <button
            onClick={handleClear}
            disabled={history.length <= 1}
            className={cn(
              "flex items-center gap-1 px-2 py-1 rounded-md text-xs",
              history.length > 1 ? "text-orange-600 hover:bg-orange-50 dark:hover:bg-orange-900/20" : "text-[var(--muted)] cursor-not-allowed"
            )}
          >
            <Eraser size={14} /> 清除
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleSave}
            className="flex items-center gap-1 px-4 py-1.5 rounded-lg bg-blue-500 text-white text-xs font-medium hover:bg-blue-600 transition-colors"
          >
            <Check size={14} /> 保存标注
          </button>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-[var(--sidebar-hover)] text-[var(--muted)]">
            <X size={18} />
          </button>
        </div>
      </div>

      {/* 画布区域 */}
      <div ref={containerRef} className="flex-1 flex items-center justify-center overflow-auto p-4 relative">
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
            "rounded-lg shadow-2xl max-w-full max-h-full",
            canvasReady ? "cursor-crosshair" : "cursor-wait"
          )}
          style={{ touchAction: "none" }}
        />
        {/* 文字输入浮层 */}
        {textInput.show && (
          <div
            className="absolute z-10"
            style={{ left: textInput.x, top: textInput.y }}
          >
            <input
              ref={textInputRef}
              type="text"
              value={textValue}
              onChange={(e) => setTextValue(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") commitText(); if (e.key === "Escape") setTextInput({ x: 0, y: 0, show: false }); }}
              onBlur={commitText}
              placeholder="输入文字..."
              className="px-2 py-1 rounded border-2 text-sm font-bold outline-none min-w-[120px]"
              style={{ borderColor: color, color: color, backgroundColor: "rgba(255,255,255,0.9)" }}
            />
          </div>
        )}
      </div>

      {/* 底部提示 */}
      <div className="px-4 py-2 bg-[var(--card)] border-t border-[var(--border)] text-center">
        <p className="text-[11px] text-[var(--muted)]">
          在图片上标注需要 AI 关注的区域，保存后回到对话框描述你的需求
        </p>
      </div>
    </div>
  );
}
