import { VideoEmbedCard } from "@/components/videos/VideoEmbedCard";
import { Footer } from "@/components/site/Footer";
import { Header } from "@/components/site/Header";
import { formatEventDate, videos } from "@/lib/data";

export default function VideosPage() {
  const featuredVideo = videos[0];
  const secondaryVideos = videos.slice(1);

  return (
    <main className="min-h-screen bg-[#f7f5ef] text-stone-950">
      <Header active="VIDEOS" />
      <section className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="grid gap-8 lg:grid-cols-[1fr_0.9fr] lg:items-end">
          <div>
            <p className="text-xs font-semibold tracking-[0.22em] text-stone-500">VIDEOS</p>
            <h1 className="mt-3 font-serif text-6xl leading-none text-stone-950">Studio Video Archive</h1>
            <p className="mt-5 max-w-2xl text-base leading-8 text-stone-600">
              スタジオで行われたワークショップやライブ、トークの記録映像をまとめたページです。記事よりも先に雰囲気を掴みたいときに、そのまま再生して見られます。
            </p>
          </div>
          <div className="border border-stone-200 bg-white p-5">
            <p className="text-xs font-semibold tracking-[0.18em] text-stone-500">NOW PLAYING</p>
            <h2 className="mt-3 font-serif text-3xl text-stone-950">{featuredVideo.title}</h2>
            <p className="mt-3 text-sm leading-7 text-stone-600">{featuredVideo.description}</p>
            <div className="mt-5 flex flex-wrap gap-x-4 gap-y-2 text-sm text-stone-500">
              <span>{formatEventDate(featuredVideo.date)}</span>
              <span>{featuredVideo.location}</span>
              <span>{featuredVideo.duration}</span>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 pb-16 sm:px-6 lg:px-8">
        <div className="grid gap-8">
          <VideoEmbedCard video={featuredVideo} priority />
          {secondaryVideos.length ? (
            <>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="text-xs font-semibold tracking-[0.22em] text-stone-500">MORE VIDEOS</p>
                  <h2 className="mt-2 font-serif text-5xl text-stone-950">埋め込みでそのまま見る</h2>
                </div>
                <p className="max-w-xl text-sm leading-7 text-stone-500">
                  YouTube へ飛ばずに、このページ上で各イベントの映像を順にチェックできる構成です。
                </p>
              </div>
              <div className="grid gap-6 xl:grid-cols-2">
                {secondaryVideos.map((video) => (
                  <VideoEmbedCard key={video.id} video={video} />
                ))}
              </div>
            </>
          ) : null}
        </div>
      </section>
      <Footer />
    </main>
  );
}
