import Link from "next/link";

const footerLinks = [
  { label: "イベント", href: "/events" },
  { label: "アーカイブ", href: "/articles" },
  { label: "配信動画", href: "/videos" },
  { label: "参加者用アーカイブ", href: "#" },
];

export function Footer() {
  return (
    <footer className="border-t border-stone-200 bg-stone-950 text-stone-100">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-12 sm:px-6 lg:grid-cols-[1.2fr_2fr] lg:px-8">
        <div>
          <div className="font-serif text-2xl leading-none tracking-[0.08em]">
            GOOD TIME
            <span className="block">ARCHIVE</span>
          </div>
          <p className="mt-5 max-w-sm text-sm leading-7 text-stone-400">
            食、音楽、対話、ワークショップを通して生まれた出来事を、写真・記事・映像で記録するスタジオアーカイブ。
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {footerLinks.map((item) => (
            <Link
              key={item.label}
              href={item.href}
              className="border-b border-stone-800 pb-3 text-sm text-stone-400 transition hover:border-stone-500 hover:text-stone-100"
            >
              {item.label}
            </Link>
          ))}
        </div>
      </div>
    </footer>
  );
}
