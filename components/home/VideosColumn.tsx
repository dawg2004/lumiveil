import Link from "next/link";
import { videos } from "@/lib/data";

export function VideosColumn() {
  const lead = videos[0];
  return (
    <section className="border border-stone-200 bg-white p-5">
      <div className="flex items-center justify-between">
        <h2 className="font-serif text-3xl">Videos</h2>
        <Link href="/videos" className="text-xs font-semibold tracking-[0.16em]">View All</Link>
      </div>
      <Link href="/videos" className="relative mt-5 block aspect-video overflow-hidden bg-stone-200">
        <img src={lead.thumbnail} alt={lead.title} className="h-full w-full object-cover" />
        <div className="absolute inset-0 grid place-items-center">
          <span className="grid size-14 place-items-center rounded-full bg-white/90 text-stone-950">▶</span>
        </div>
      </Link>
      <div className="mt-4 space-y-3">
        {videos.slice(0, 3).map((video) => (
          <Link key={video.id} href="/videos" className="flex items-center justify-between gap-3 border-b border-stone-200 pb-3 text-sm">
            <span>{video.title}</span>
            <span className="text-stone-500">{video.duration}</span>
          </Link>
        ))}
      </div>
      <Link href="/videos" className="mt-5 inline-block text-xs font-semibold tracking-[0.16em]">VISIT OUR VIDEO ARCHIVE</Link>
    </section>
  );
}
