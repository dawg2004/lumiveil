import Link from "next/link";
import { formatEventDate, getEventByVideoSlug } from "@/lib/data";
import type { VideoItem } from "@/lib/types";

export function VideoEmbedCard({ video, priority = false }: { video: VideoItem; priority?: boolean }) {
  const event = getEventByVideoSlug(video.slug);

  return (
    <article className="overflow-hidden border border-stone-200 bg-white">
      <div className="aspect-video bg-stone-950">
        <iframe
          src={video.youtubeUrl}
          title={video.title}
          className="h-full w-full"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          loading={priority ? "eager" : "lazy"}
        />
      </div>
      <div className="p-5 sm:p-6">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-stone-500">
          <span>{video.category}</span>
          <span>{formatEventDate(video.date)}</span>
          <span>{video.duration}</span>
        </div>
        <h2 className="mt-3 font-serif text-3xl leading-tight text-stone-950">{video.title}</h2>
        <p className="mt-4 text-sm leading-7 text-stone-600">{video.description}</p>
        <div className="mt-5 flex flex-wrap items-center justify-between gap-4 border-t border-stone-200 pt-4">
          <div className="text-sm text-stone-500">
            <p>{video.location}</p>
            {event?.time ? <p className="mt-1">{event.time}</p> : null}
          </div>
          {event ? (
            <Link href={`/events/${event.slug}`} className="border border-stone-300 bg-white px-4 py-3 text-xs font-semibold tracking-[0.16em] text-stone-950 transition hover:bg-stone-100">
              VIEW EVENT
            </Link>
          ) : null}
        </div>
      </div>
    </article>
  );
}
