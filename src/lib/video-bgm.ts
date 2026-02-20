// ========== 背景音乐库 ==========
// 内置免版权背景音乐，按风格分类，AI根据内容自动推荐

export interface BGMTrack {
  id: string;
  name: string;
  category: BGMCategory;
  mood: string;
  bpm: number;
  duration: number;      // 秒
  url: string;           // 音频文件URL（公共CDN或本地）
  license: string;
}

export type BGMCategory = "relaxed" | "professional" | "inspiring" | "tech" | "storytelling" | "news" | "upbeat" | "ambient";

// 内置免版权 BGM（使用公共域音乐或CC0许可）
// 实际部署时需替换为真实音频URL
export const BGM_LIBRARY: BGMTrack[] = [
  // 轻松休闲
  { id: "bgm_relaxed_01", name: "午后阳光", category: "relaxed", mood: "温暖舒适", bpm: 90, duration: 180, url: "/audio/bgm/relaxed-01.mp3", license: "CC0" },
  { id: "bgm_relaxed_02", name: "微风轻语", category: "relaxed", mood: "轻松自在", bpm: 85, duration: 200, url: "/audio/bgm/relaxed-02.mp3", license: "CC0" },
  // 专业商务
  { id: "bgm_pro_01", name: "商业节拍", category: "professional", mood: "专业稳重", bpm: 110, duration: 180, url: "/audio/bgm/pro-01.mp3", license: "CC0" },
  { id: "bgm_pro_02", name: "企业印象", category: "professional", mood: "大气庄重", bpm: 100, duration: 190, url: "/audio/bgm/pro-02.mp3", license: "CC0" },
  // 激励振奋
  { id: "bgm_inspire_01", name: "梦想起航", category: "inspiring", mood: "振奋人心", bpm: 130, duration: 180, url: "/audio/bgm/inspire-01.mp3", license: "CC0" },
  { id: "bgm_inspire_02", name: "突破极限", category: "inspiring", mood: "充满力量", bpm: 140, duration: 170, url: "/audio/bgm/inspire-02.mp3", license: "CC0" },
  // 科技感
  { id: "bgm_tech_01", name: "数字脉冲", category: "tech", mood: "科技前沿", bpm: 120, duration: 180, url: "/audio/bgm/tech-01.mp3", license: "CC0" },
  { id: "bgm_tech_02", name: "未来代码", category: "tech", mood: "赛博朋克", bpm: 115, duration: 190, url: "/audio/bgm/tech-02.mp3", license: "CC0" },
  // 故事叙述
  { id: "bgm_story_01", name: "岁月如歌", category: "storytelling", mood: "温情回忆", bpm: 80, duration: 200, url: "/audio/bgm/story-01.mp3", license: "CC0" },
  { id: "bgm_story_02", name: "星空漫步", category: "storytelling", mood: "浪漫梦幻", bpm: 75, duration: 210, url: "/audio/bgm/story-02.mp3", license: "CC0" },
  // 新闻播报
  { id: "bgm_news_01", name: "聚焦时刻", category: "news", mood: "严肃客观", bpm: 105, duration: 180, url: "/audio/bgm/news-01.mp3", license: "CC0" },
  { id: "bgm_news_02", name: "新闻前线", category: "news", mood: "紧张关注", bpm: 110, duration: 175, url: "/audio/bgm/news-02.mp3", license: "CC0" },
  // 活泼欢快
  { id: "bgm_upbeat_01", name: "阳光满溢", category: "upbeat", mood: "欢快活力", bpm: 135, duration: 180, url: "/audio/bgm/upbeat-01.mp3", license: "CC0" },
  { id: "bgm_upbeat_02", name: "快乐出发", category: "upbeat", mood: "青春动感", bpm: 128, duration: 185, url: "/audio/bgm/upbeat-02.mp3", license: "CC0" },
  // 环境氛围
  { id: "bgm_ambient_01", name: "静水深流", category: "ambient", mood: "宁静深远", bpm: 60, duration: 240, url: "/audio/bgm/ambient-01.mp3", license: "CC0" },
  { id: "bgm_ambient_02", name: "林间晨曦", category: "ambient", mood: "自然清新", bpm: 65, duration: 220, url: "/audio/bgm/ambient-02.mp3", license: "CC0" },
];

// BGM 分类信息
export const BGM_CATEGORIES: Record<BGMCategory, { label: string; icon: string }> = {
  relaxed: { label: "轻松休闲", icon: "☕" },
  professional: { label: "专业商务", icon: "💼" },
  inspiring: { label: "激励振奋", icon: "🔥" },
  tech: { label: "科技感", icon: "🤖" },
  storytelling: { label: "故事叙述", icon: "📖" },
  news: { label: "新闻播报", icon: "📰" },
  upbeat: { label: "活泼欢快", icon: "🎵" },
  ambient: { label: "环境氛围", icon: "🌿" },
};

// 根据视频风格自动推荐 BGM
export function recommendBGM(videoStyle: string, _scriptContent?: string): BGMTrack[] {
  const styleToCategory: Record<string, BGMCategory[]> = {
    knowledge: ["professional", "tech", "ambient"],
    news: ["news", "professional"],
    story: ["storytelling", "relaxed", "ambient"],
    product: ["inspiring", "upbeat", "professional"],
  };

  const preferredCategories = styleToCategory[videoStyle] || ["relaxed", "professional"];
  const recommended = BGM_LIBRARY.filter((t) => preferredCategories.includes(t.category));

  // 按推荐优先级排序（第一个类别最优先）
  recommended.sort((a, b) => {
    const aIdx = preferredCategories.indexOf(a.category);
    const bIdx = preferredCategories.indexOf(b.category);
    return aIdx - bIdx;
  });

  return recommended.slice(0, 4);
}

// 获取指定分类的 BGM
export function getBGMByCategory(category: BGMCategory): BGMTrack[] {
  return BGM_LIBRARY.filter((t) => t.category === category);
}
