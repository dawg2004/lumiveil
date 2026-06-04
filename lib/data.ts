import type { ArticleItem, EventCategory, EventItem, VideoItem } from "./types";

const img = (id: string) => `https://images.unsplash.com/${id}?auto=format&fit=crop&w=1400&q=80`;

export const events: EventItem[] = [
  {
    id: "evt-001",
    slug: "fermentation-workshop",
    title: "発酵ワークショップ",
    subtitle: "シェフ・ミリと学ぶ、昔ながらの味と現代の手仕事。",
    category: "Workshop",
    date: "2025-05-18",
    time: "11:00 - 14:00",
    location: "グッドタイムスタジオ",
    image: img("photo-1556911220-bff31c812dba"),
    description: "麹、季節野菜、家庭で続けられる発酵の基本を、スタジオで実際に手を動かしながら学ぶワークショップ。",
    youtubeUrl: "https://www.youtube.com/embed/dQw4w9WgXcQ",
    reportBody:
      "シェフ・ミリが案内したのは、時間を味方にする食のリズム。塩水を仕込み、熟成した調味料を味見し、待つことで香りや食感がどう変わるのかを体験しました。最後はスタジオの大きなテーブルを囲み、小皿料理と試食ノートを共有する穏やかな午後になりました。",
    host: {
      name: "田中ミリ",
      title: "発酵料理家 / フードエデュケーター",
      bio: "季節の保存食、日本の台所の基礎、家庭で続けやすい発酵をテーマに、スタジオや料理教室でワークショップを行う。",
      image: img("photo-1494790108377-be9c29b29330"),
    },
    status: "published",
  },
  {
    id: "evt-002",
    slug: "pasta-making-class-with-chef-leo",
    title: "シェフ・レオの手打ちパスタ教室",
    category: "Cooking",
    date: "2025-06-02",
    time: "18:30 - 21:00",
    location: "キッチンスタジオ",
    image: img("photo-1551183053-bf91a1d81141"),
    description: "生地作りから詰め物のパスタまで。シェフ・レオと一緒に作り、最後は小さなディナーとして味わいます。",
    status: "published",
  },
  {
    id: "evt-003",
    slug: "jazz-in-the-studio",
    title: "スタジオで聴くジャズの夜",
    category: "Music",
    date: "2025-06-12",
    time: "20:00 - 22:00",
    location: "メインスタジオ",
    image: img("photo-1511192336575-5a79af67a629"),
    description: "小編成カルテットのライブ、ナチュラルワイン、夜更けの会話。スタジオならではの近い距離で音を楽しむ夜。",
    youtubeUrl: "https://www.youtube.com/embed/dQw4w9WgXcQ",
    status: "scheduled",
  },
  {
    id: "evt-004",
    slug: "creator-talk-vol-2",
    title: "クリエイタートーク Vol.2",
    category: "Talk",
    date: "2025-04-26",
    time: "19:00 - 20:30",
    location: "ギャラリールーム",
    image: img("photo-1517245386807-bb43f82c33c4"),
    description: "続けられる創作活動、コミュニティの作り方、仕事としての表現について語り合うトークイベント。",
    status: "published",
  },
  {
    id: "evt-005",
    slug: "film-photography-walk",
    title: "フィルム写真ウォーク",
    category: "Photo Walk",
    date: "2025-03-22",
    time: "9:30 - 12:00",
    location: "スタジオ中庭",
    image: img("photo-1500530855697-b586d89ba3ee"),
    description: "フィルムカメラを持って近所を歩き、光、余白、偶然の風景をゆっくり観察するフォトウォーク。",
    status: "draft",
  },
  {
    id: "evt-006",
    slug: "analog-nights-live-session",
    title: "アナログナイツ・ライブセッション",
    category: "Music",
    date: "2025-02-14",
    time: "20:30 - 23:00",
    location: "リスニングルーム",
    image: img("photo-1493225457124-a3eb161ffa5f"),
    description: "リスニングルームで行われたアンビエントライブ。テープ録音の質感ごと楽しむ一夜。",
    youtubeUrl: "https://www.youtube.com/embed/dQw4w9WgXcQ",
    status: "published",
  },
  {
    id: "evt-007",
    slug: "bread-baking-workshop",
    title: "パン作りワークショップ",
    category: "Workshop",
    date: "2025-01-19",
    time: "10:00 - 13:00",
    location: "キッチンスタジオ",
    image: img("photo-1509440159596-0249088772ff"),
    description: "こねる、発酵を待つ、焼き上げる。生地と火の扱いを学び、焼きたてを囲むワークショップ。",
    status: "published",
  },
  {
    id: "evt-008",
    slug: "photography-exhibition",
    title: "写真展 静かな時間の記録",
    category: "Exhibition",
    date: "2024-12-07",
    time: "12:00 - 19:00",
    location: "ギャラリールーム",
    image: img("photo-1492724441997-5dc865305da7"),
    description: "静物写真とスタジオドキュメントを中心に構成した週末限定の写真展。",
    status: "published",
  },
  {
    id: "evt-009",
    slug: "sourdough-basics",
    title: "サワードウ入門",
    category: "Cooking",
    date: "2024-11-16",
    time: "10:30 - 13:30",
    location: "キッチンスタジオ",
    image: img("photo-1586444248902-2f64eddc13df"),
    description: "スターターの育て方、成形、焼成タイミングまで。家庭で無理なく続けるサワードウの基礎。",
    status: "published",
  },
  {
    id: "evt-010",
    slug: "vinyl-listening-session",
    title: "レコードを聴く会",
    category: "Music",
    date: "2024-10-04",
    time: "19:30 - 22:00",
    location: "リスニングルーム",
    image: img("photo-1461360370896-922624d12aa1"),
    description: "ジャズ、ソウル、現代アンビエントを中心に、レコードの音をじっくり味わうリスニングセッション。",
    status: "published",
  },
  {
    id: "evt-011",
    slug: "the-business-of-creativity",
    title: "クリエイティブを仕事にする",
    category: "Talk",
    date: "2024-09-12",
    time: "18:30 - 20:00",
    location: "メインスタジオ",
    image: img("photo-1556761175-b413da4baf72"),
    description: "価格設定、ポジショニング、チームでの協業。独立したクリエイターが長く働くための実践トーク。",
    status: "published",
  },
];

export const articles: ArticleItem[] = events.slice(0, 5).map((event, index) => ({
  id: `art-00${index + 1}`,
  title: `${event.title}｜スタジオレポート`,
  slug: `${event.slug}-report`,
  date: event.date,
  image: event.image,
  category: event.category,
  excerpt: event.description,
}));

export const videos: VideoItem[] = events
  .filter((event) => event.youtubeUrl)
  .map((event, index) => ({
    id: `vid-00${index + 1}`,
    slug: `${event.slug}-video`,
    title: event.title,
    date: event.date,
    category: event.category,
    location: event.location,
    description: event.description,
    duration: index === 0 ? "12:48" : "08:24",
    thumbnail: event.image,
    youtubeUrl: event.youtubeUrl ?? "",
  }));

export const categories: EventCategory[] = ["Workshop", "Music", "Talk", "Photo Walk", "Cooking", "Exhibition"];

export const partners = ["GOOD HOOD", "WORKSHOP", "EAT", "FOOD PHOTO", "TOWN COMMUNITY", "YOYOGIUEHAR"];

export function getEventBySlug(slug: string) {
  return events.find((event) => event.slug === slug);
}

export function getArticleBySlug(slug: string) {
  return articles.find((article) => article.slug === slug);
}

export function getEventByArticleSlug(slug: string) {
  const eventSlug = slug.endsWith("-report") ? slug.slice(0, -"-report".length) : slug;
  return getEventBySlug(eventSlug);
}

export function getEventByVideoSlug(slug: string) {
  const eventSlug = slug.endsWith("-video") ? slug.slice(0, -"-video".length) : slug;
  return getEventBySlug(eventSlug);
}

export function formatEventDate(date: string) {
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" }).format(new Date(`${date}T00:00:00`));
}
