import Link from "next/link";
import { notFound } from "next/navigation";
import { ArticleCard } from "@/components/articles/ArticleCard";
import { Footer } from "@/components/site/Footer";
import { Header } from "@/components/site/Header";
import { articles, formatEventDate, getArticleBySlug, getEventByArticleSlug } from "@/lib/data";

export function generateStaticParams() {
  return articles.map((article) => ({ slug: article.slug }));
}

export default async function ArticleDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const article = getArticleBySlug(slug);
  const event = getEventByArticleSlug(slug);

  if (!article || !event) {
    notFound();
  }

  const relatedArticles = articles.filter((item) => item.slug !== article.slug).slice(0, 3);

  return (
    <main className="min-h-screen bg-[#f7f5ef] text-stone-950">
      <Header active="ARTICLES" />
      <section className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="flex flex-col justify-end">
            <p className="text-xs font-semibold tracking-[0.22em] text-stone-500">ARTICLE</p>
            <h1 className="mt-3 font-serif text-5xl leading-none text-stone-950 sm:text-6xl">{article.title}</h1>
            <p className="mt-6 max-w-2xl text-base leading-8 text-stone-600">{article.excerpt}</p>
            <div className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm text-stone-500">
              <span>{formatEventDate(article.date)}</span>
              <span>{event.location}</span>
              <span>{event.category}</span>
            </div>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href={`/events/${event.slug}`} className="bg-stone-950 px-5 py-3 text-xs font-semibold tracking-[0.16em] text-white transition hover:bg-stone-800">
                VIEW EVENT
              </Link>
              {event.youtubeUrl ? (
                <a href={event.youtubeUrl} target="_blank" rel="noreferrer" className="border border-stone-300 bg-white px-5 py-3 text-xs font-semibold tracking-[0.16em] text-stone-950 transition hover:bg-stone-100">
                  WATCH VIDEO
                </a>
              ) : null}
            </div>
          </div>
          <div className="overflow-hidden border border-stone-200 bg-white">
            <img src={article.image} alt={article.title} className="aspect-[4/3] h-full w-full object-cover" />
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-7xl gap-8 px-4 pb-16 sm:px-6 lg:grid-cols-[1fr_320px] lg:px-8">
        <article className="border border-stone-200 bg-white p-6 sm:p-8">
          <div className="prose prose-stone max-w-none">
            <p className="font-serif text-3xl leading-tight text-stone-950">イベントのあとに残るものを、文章として丁寧に拾い直したレポートです。</p>
            <p className="mt-6 text-base leading-8 text-stone-700">
              {event.reportBody ?? article.excerpt}
            </p>
            <p className="mt-6 text-base leading-8 text-stone-700">
              当日の進行だけでなく、場に流れていた空気や参加者同士のやり取り、スタジオのしつらえ、終わったあとに持ち帰られた気づきまでを記録することで、
              一度きりの出来事を次の参加や企画につながる共有知に変えていきます。
            </p>
            <p className="mt-6 text-base leading-8 text-stone-700">
              レシピや技術だけではなく、なぜそのテーマをこの場所で扱ったのか、どんな人が集まり、何が印象に残ったのかまでを含めて、
              GOOD TIME ARCHIVE の記事は「イベントの余韻」を保管するためのレイヤーとして設計しています。
            </p>
          </div>
        </article>

        <aside className="space-y-5">
          <div className="border border-stone-200 bg-white p-5">
            <p className="text-xs font-semibold tracking-[0.18em] text-stone-500">EVENT INFO</p>
            <dl className="mt-4 space-y-4 text-sm">
              <div>
                <dt className="text-stone-500">タイトル</dt>
                <dd className="mt-1 text-stone-950">{event.title}</dd>
              </div>
              <div>
                <dt className="text-stone-500">開催日</dt>
                <dd className="mt-1 text-stone-950">{formatEventDate(event.date)}</dd>
              </div>
              <div>
                <dt className="text-stone-500">場所</dt>
                <dd className="mt-1 text-stone-950">{event.location}</dd>
              </div>
              <div>
                <dt className="text-stone-500">カテゴリ</dt>
                <dd className="mt-1 text-stone-950">{event.category}</dd>
              </div>
            </dl>
          </div>
          {event.host ? (
            <div className="border border-stone-200 bg-white p-5">
              <p className="text-xs font-semibold tracking-[0.18em] text-stone-500">HOST</p>
              <img src={event.host.image} alt={event.host.name} className="mt-4 aspect-square w-full object-cover" />
              <h2 className="mt-4 font-serif text-3xl text-stone-950">{event.host.name}</h2>
              <p className="mt-1 text-sm text-stone-500">{event.host.title}</p>
              <p className="mt-4 text-sm leading-7 text-stone-700">{event.host.bio}</p>
            </div>
          ) : null}
        </aside>
      </section>

      <section className="mx-auto max-w-7xl px-4 pb-16 sm:px-6 lg:px-8">
        <div className="mb-6 flex items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold tracking-[0.22em] text-stone-500">RELATED REPORTS</p>
            <h2 className="mt-2 font-serif text-4xl text-stone-950">続けて読む</h2>
          </div>
          <Link href="/articles" className="text-xs font-semibold tracking-[0.16em] text-stone-950">
            ALL ARTICLES
          </Link>
        </div>
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {relatedArticles.map((item) => (
            <ArticleCard key={item.id} article={item} />
          ))}
        </div>
      </section>
      <Footer />
    </main>
  );
}
