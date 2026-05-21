# GOOD TIME ARCHIVE

Studio event archive site built with Next.js App Router, TypeScript, and Tailwind CSS.

## Run Locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Build

```bash
npm run build
```

## Pages

- `/` - Editorial home page with featured event, reports, videos, popular events, partners, upcoming events, newsletter, and footer.
- `/articles` - Article archive with featured report, latest notes, and report grid.
- `/articles/[slug]` - Article detail page linked to the related studio event.
- `/videos` - YouTube-focused video archive with embedded sessions and links back to events.
- `/videos` はパスワード保護付き。`VIDEO_ARCHIVE_PASSWORD` が未設定の場合は一時的に `goodtime-video` を使用。
- `/events` - Event archive with category controls, year/month/sort UI, sidebar filters, cards, and pagination.
- `/events/fermentation-workshop` - Event detail page with hero, YouTube embed, report body, gallery, host, event sidebar, and related events.
- `/admin` - CMS-style dashboard shell with stats, recent activity, quick links, and event management table.

## Data

Initial fixed data lives in `lib/data.ts`, with shared types in `lib/types.ts`. The shape is intended to be easy to replace later with Supabase Auth, Postgres, and Storage.
