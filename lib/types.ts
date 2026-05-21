export type EventCategory =
  | "Workshop"
  | "Music"
  | "Talk"
  | "Photo Walk"
  | "Cooking"
  | "Exhibition";

export type EventItem = {
  id: string;
  slug: string;
  title: string;
  subtitle?: string;
  category: EventCategory;
  date: string;
  time?: string;
  location: string;
  image: string;
  description: string;
  youtubeUrl?: string;
  reportBody?: string;
  host?: {
    name: string;
    title: string;
    bio: string;
    image: string;
  };
  status?: "published" | "draft" | "scheduled";
};

export type ArticleItem = {
  id: string;
  title: string;
  slug: string;
  date: string;
  image: string;
  category: string;
  excerpt: string;
};

export type VideoItem = {
  id: string;
  slug: string;
  title: string;
  date: string;
  category: string;
  location: string;
  description: string;
  duration: string;
  thumbnail: string;
  youtubeUrl: string;
};
