import { ArticleCard } from "@/components/articles/ArticleCard";
import { Footer } from "@/components/site/Footer";
import { Header } from "@/components/site/Header";
import { articles, events, formatEventDate, getEventByArticleSlug } from "@/lib/data";

export default function ArticlesPage() {
  const featuredArticle = articles[0];
  const supportingArticles = articles.slice(1, 4);

  return (
    <main className="min-h-screen bg-[#f7f5ef] text-stone-950">
      <Header active="ARTICLES" />
      <section className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="grid gap-8 lg:grid-cols-[1fr_0.9fr] lg:items-end">
          <div>
            <p className="text-xs font-semibold tracking-[0.22em] text-stone-500">ARTICLES</p>
            <h1 className="mt-3 font-serif text-6xl leading-none text-stone-950">Studio Reports Archive</h1>
            <p className="mt-5 max-w-2xl text-base leading-8 text-stone-600">
              イベントの空気、会話、手触りを、写真と文章でゆっくり辿るためのアーカイブ。スタジオで起きた出来事を、あとから読み返せる記録として残しています。
            </p>
          </div>
          <img src={articles[2]?.image ?? events[0].image} alt="Articles archive" className="aspect-[16/9] w-full object-cover" />
        </div>

        <div className="mt-10 grid gap-5 xl:grid-cols-[1.35fr_0.65fr]">
          <ArticleCard article={featuredArticle} featured />
          <section className="border border-stone-200 bg-white p-5">
            <div className="flex items-center justify-between">
              <h2 className="font-serif text-3xl">Latest Notes</h2>
              <span className="text-xs font-semibold tracking-[0.16em] text-stone-500">CURATED</span>
            </div>
            <div className="mt-4 divide-y divide-stone-200">
              {supportingArticles.map((article) => {
                const event = getEventByArticleSlug(article.slug);
                return (
                  <a key={article.id} href={`/articles/${article.slug}`} className="block py-5 first:pt-2">
                    <p className="text-[11px] uppercase tracking-[0.14em] text-stone-500">{formatEventDate(article.date)}</p>
                    <h3 className="mt-2 font-serif text-2xl leading-tight">{article.title}</h3>
                    <p className="mt-3 text-sm leading-7 text-stone-600">{article.excerpt}</p>
                    <p className="mt-4 text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">{event?.location ?? "Good Time Studio"}</p>
                  </a>
                );
              })}
            </div>
          </section>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 pb-16 sm:px-6 lg:px-8">
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold tracking-[0.22em] text-stone-500">ALL REPORTS</p>
            <h2 className="mt-2 font-serif text-5xl text-stone-950">読むためのイベントアーカイブ</h2>
          </div>
          <p className="max-w-xl text-sm leading-7 text-stone-500">
            ワークショップ、音楽イベント、トーク、展示の記録を、公開日の新しい順に一覧化しています。
          </p>
        </div>
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {articles.map((article) => (
            <ArticleCard key={article.id} article={article} />
          ))}
        </div>
      </section>
      <Footer />
    </main>
  );
}
