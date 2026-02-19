"use client";

import {
  Brain,
  Paint,
  Analysis,
  Creative,
  Briefcase,
  Code,
  Pencil,
  BachelorCap,
  Globe,
  Heart,
  Balance,
  ChartLine,
  Fire,
  MagicWand,
  BookOpen,
  Rocket,
  Music,
  Home,
  Film,
  MessageOne,
  Compass,
} from "@icon-park/react";
import type { ComponentType } from "react";

// ========== 项目 Logo ==========
// 基于 Borromean rings（三环交织）的数学几何图案
// 代表智慧、连接、无限可能
export function AppLogo({ size = 24, className = "", white = false }: { size?: number; className?: string; white?: boolean }) {
  const r = size * 0.25;
  const cx = size / 2;
  const cy = size / 2;
  const offset = size * 0.14;
  const sw = size * 0.08;
  const uid = `logo-${size}-${white ? "w" : "c"}`;

  if (white) {
    return (
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} fill="none" className={className}>
        <circle cx={cx} cy={cy - offset} r={r} stroke="white" strokeWidth={sw} opacity={0.9} />
        <circle cx={cx - offset * 0.87} cy={cy + offset * 0.5} r={r} stroke="white" strokeWidth={sw} opacity={0.7} />
        <circle cx={cx + offset * 0.87} cy={cy + offset * 0.5} r={r} stroke="white" strokeWidth={sw} opacity={0.8} />
      </svg>
    );
  }

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} fill="none" className={className}>
      <circle cx={cx} cy={cy - offset} r={r} stroke={`url(#${uid}-1)`} strokeWidth={sw} />
      <circle cx={cx - offset * 0.87} cy={cy + offset * 0.5} r={r} stroke={`url(#${uid}-2)`} strokeWidth={sw} />
      <circle cx={cx + offset * 0.87} cy={cy + offset * 0.5} r={r} stroke={`url(#${uid}-3)`} strokeWidth={sw} />
      <defs>
        <linearGradient id={`${uid}-1`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#3b82f6" />
          <stop offset="100%" stopColor="#8b5cf6" />
        </linearGradient>
        <linearGradient id={`${uid}-2`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#8b5cf6" />
          <stop offset="100%" stopColor="#ec4899" />
        </linearGradient>
        <linearGradient id={`${uid}-3`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#ec4899" />
          <stop offset="100%" stopColor="#3b82f6" />
        </linearGradient>
      </defs>
    </svg>
  );
}

// ========== 工具按钮图标 ==========
const ICON_PROPS = { theme: "outline" as const, strokeWidth: 3 };

export function IconDeepThink({ size = 20, className = "" }: { size?: number; className?: string }) {
  return <Brain size={size} className={className} {...ICON_PROPS} />;
}

export function IconImageGen({ size = 20, className = "" }: { size?: number; className?: string }) {
  return <Paint size={size} className={className} {...ICON_PROPS} />;
}

export function IconDeepResearch({ size = 20, className = "" }: { size?: number; className?: string }) {
  return <Analysis size={size} className={className} {...ICON_PROPS} />;
}

export function IconMagicWand({ size = 20, className = "" }: { size?: number; className?: string }) {
  return <MagicWand size={size} className={className} {...ICON_PROPS} />;
}

// ========== 专家/Gem 图标映射 ==========
const GEM_ICON_MAP: Record<string, ComponentType<{ size: number; className?: string }>> = {};

// 关键词 → 图标的映射表
const KEYWORD_ICON_ENTRIES: [string[], ComponentType<any>][] = [
  [["灵感", "创意", "头脑", "风暴", "brainstorm"], Creative],
  [["职业", "顾问", "商务", "career", "advisor"], Briefcase],
  [["编码", "代码", "编程", "开发", "程序", "code", "dev"], Code],
  [["写作", "文案", "文章", "编辑", "作文", "write"], Pencil],
  [["学习", "导师", "教育", "辅导", "tutor", "learn"], BachelorCap],
  [["翻译", "语言", "外语", "英语", "translate"], Globe],
  [["研究", "分析", "科研", "数据", "research"], Analysis],
  [["医学", "健康", "医疗", "养生", "health"], Heart],
  [["法律", "法务", "合同", "律师", "legal"], Balance],
  [["投资", "理财", "金融", "财务", "股票", "finance"], ChartLine],
  [["设计", "美术", "UI", "视觉", "design"], Paint],
  [["音乐", "艺术", "art", "music"], Music],
  [["生活", "家居", "美食", "旅行", "life"], Home],
  [["视频", "影视", "拍摄", "剪辑", "video"], Film],
  [["创业", "商业", "项目", "startup"], Rocket],
  [["心理", "情绪", "成长", "psychology"], Compass],
  [["自媒体", "运营", "内容", "media"], MessageOne],
  [["魔法", "助手", "通用", "万能", "magic"], MagicWand],
];

// 根据 Gem 名称返回对应的 IconPark 图标组件
export function GemIcon({ name, size = 20, className = "" }: { name: string; size?: number; className?: string }) {
  // 先检查缓存
  if (GEM_ICON_MAP[name]) {
    const Comp = GEM_ICON_MAP[name];
    return <Comp size={size} className={className} />;
  }

  // 关键词匹配
  const lowerName = name.toLowerCase();
  for (const [keywords, IconComp] of KEYWORD_ICON_ENTRIES) {
    if (keywords.some((kw) => lowerName.includes(kw))) {
      // 缓存结果
      GEM_ICON_MAP[name] = ({ size: s, className: c }) => <IconComp size={s} className={c} {...ICON_PROPS} />;
      return <IconComp size={size} className={className} {...ICON_PROPS} />;
    }
  }

  // 默认图标
  return <MagicWand size={size} className={className} {...ICON_PROPS} />;
}

// ========== 兴趣选择图标映射 ==========
const INTEREST_ICON_MAP: Record<string, ComponentType<any>> = {
  "编程开发": Code,
  "金融投资": ChartLine,
  "医学健康": Heart,
  "法律咨询": Balance,
  "教育学习": BookOpen,
  "设计创意": Paint,
  "商业创业": Rocket,
  "科学研究": Analysis,
  "语言学习": Globe,
  "心理成长": Compass,
  "生活达人": Home,
  "自媒体": Film,
};

export function InterestIcon({ id, size = 20, className = "" }: { id: string; size?: number; className?: string }) {
  const IconComp = INTEREST_ICON_MAP[id];
  if (IconComp) {
    return <IconComp size={size} className={className} {...ICON_PROPS} />;
  }
  return <Creative size={size} className={className} {...ICON_PROPS} />;
}
