import Link from "next/link";
import { articles, formatEventDate } from "@/lib/data";

export function ReportsColumn() {
  return (
    <section className="border border-stone-200 bg-white p-5">
      <div className="flex items-center justify-between">
        <h2 className="font-serif text-3xl">Reports</h2>
        <Link href="/articles" className="text-xs font-semibold tracking-[0.16em]">View All</Link>
      </div>
      <div className="mt-5 divide-y divide-stone-200">
        {articles.slice(0, 4).map((article) => (
          <Link key={article.id} href={`/articles/${article.slug}`} className="flex gap-4 py-4 first:pt-0">
            <img src={article.image} alt={article.title} className="size-20 shrink-0 object-cover" />
            <div>
              <p className="text-[11px] uppercase tracking-[0.14em] text-stone-500">{formatEventDate(article.date)}</p>
              <h3 className="mt-1 font-serif text-lg leading-tight">{article.title}</h3>
            </div>
          </Link>
        ))}
      </div>
      <Link href="/articles" className="mt-3 inline-block border border-stone-300 px-4 py-3 text-xs font-semibold tracking-[0.16em]">VIEW ALL REPORTS</Link>
    </section>
  );
}
