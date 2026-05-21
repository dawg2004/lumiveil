import Link from "next/link";
import { formatEventDate, getEventByArticleSlug } from "@/lib/data";
import type { ArticleItem } from "@/lib/types";

export function ArticleCard({ article, featured = false }: { article: ArticleItem; featured?: boolean }) {
  const linkedEvent = getEventByArticleSlug(article.slug);

  return (
    <article className={`interactive-card group border border-stone-200 bg-white ${featured ? "overflow-hidden" : ""}`}>
      <Link href={`/articles/${article.slug}`} className={featured ? "grid h-full md:grid-cols-[1.15fr_0.85fr]" : "block"}>
        <div className={`relative overflow-hidden bg-stone-200 ${featured ? "min-h-[320px]" : "aspect-[4/3]"}`}>
          <img src={article.image} alt={article.title} className="interactive-image h-full w-full object-cover" />
          <div className="absolute left-4 top-4 bg-white px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-stone-950">
            {formatEventDate(article.date)}
          </div>
        </div>
        <div className={`${featured ? "flex flex-col justify-between p-7 lg:p-9" : "p-5"}`}>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">{article.category}</p>
            <h3 className={`mt-3 font-serif leading-tight text-stone-950 ${featured ? "text-4xl lg:text-5xl" : "text-2xl"}`}>{article.title}</h3>
            <p className={`text-stone-600 ${featured ? "mt-5 text-base leading-8" : "mt-4 text-sm leading-7"}`}>{article.excerpt}</p>
          </div>
          <div className="mt-6 flex items-center justify-between gap-4 border-t border-stone-200 pt-4 text-sm text-stone-500">
            <span>{linkedEvent?.location ?? "Good Time Studio"}</span>
            <span className="text-xs font-semibold tracking-[0.16em] text-stone-950">READ REPORT</span>
          </div>
        </div>
      </Link>
    </article>
  );
}
