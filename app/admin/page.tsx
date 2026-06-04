import { cookies } from "next/headers";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { AdminSidebar } from "@/components/admin/AdminSidebar";
import { ContentComposer } from "@/components/admin/ContentComposer";
import { EditorialTools } from "@/components/admin/EditorialTools";
import { EventsTable } from "@/components/admin/EventsTable";
import { PastArticlesEditor } from "@/components/admin/PastArticlesEditor";
import { PublishingQueue } from "@/components/admin/PublishingQueue";
import { QuickLinks } from "@/components/admin/QuickLinks";
import { RecentActivity } from "@/components/admin/RecentActivity";
import { StatCard } from "@/components/admin/StatCard";
import { VideoLinksManager } from "@/components/admin/VideoLinksManager";
import { ADMIN_ACCESS_COOKIE } from "@/lib/admin-access";

function AdminDashboard() {
  return (
    <main className="min-h-screen bg-[#f3efe6] text-stone-950 lg:grid lg:grid-cols-[280px_1fr]">
      <AdminSidebar />
      <section className="p-4 sm:p-6 lg:p-8">
        <AdminHeader />
        <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Total Events" value="128" />
          <StatCard label="Published Articles" value="42" />
          <StatCard label="Videos Linked" value="31" />
          <StatCard label="Draft Posts" value="8" />
        </div>
        <div className="mt-6 grid gap-6 xl:grid-cols-2">
          <RecentActivity />
          <QuickLinks />
        </div>
        <div id="new-post" className="mt-6 scroll-mt-6">
          <ContentComposer />
        </div>
        <div className="mt-6">
          <EditorialTools />
        </div>
        <div className="mt-6">
          <PastArticlesEditor />
        </div>
        <div className="mt-6 grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
          <PublishingQueue />
          <VideoLinksManager />
        </div>
        <div className="mt-6">
          <EventsTable />
        </div>
      </section>
    </main>
  );
}

function AdminAccessGate({ hasError, nextPath }: { hasError: boolean; nextPath: string }) {
  return (
    <main className="min-h-screen bg-[#f3efe6] px-4 py-16 text-stone-950 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-3xl border border-stone-200 bg-white p-8 sm:p-10">
        <p className="text-xs font-semibold tracking-[0.22em] text-stone-500">PRIVATE ADMIN ACCESS</p>
        <h1 className="mt-3 font-serif text-2xl leading-tight text-stone-950 sm:text-3xl">管理ページのパスワード</h1>
        <p className="mt-5 max-w-2xl text-base leading-8 text-stone-600">
          このページは管理用です。共有パスワードを入力すると、記事編集やイベント管理画面に入れます。
        </p>
        <form action="/admin/access" method="post" className="mt-8 grid gap-4 sm:max-w-md">
          <input type="hidden" name="next" value={nextPath} />
          <input
            type="password"
            name="password"
            placeholder="パスワードを入力"
            aria-label="管理ページのパスワード"
            className="h-12 border border-stone-300 bg-[#fbfaf7] px-4 text-sm text-stone-950 outline-none transition focus:border-stone-950"
            required
          />
          <button className="h-12 bg-stone-950 px-5 text-xs font-semibold tracking-[0.18em] text-white transition hover:bg-stone-800">
            ENTER ADMIN
          </button>
          {hasError ? <p className="text-sm text-red-600">パスワードが違います。もう一度確認してください。</p> : null}
        </form>
      </div>
    </main>
  );
}

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const cookieStore = await cookies();
  const params = await searchParams;
  const hasAccess = cookieStore.get(ADMIN_ACCESS_COOKIE)?.value === "granted";
  const nextPath = params.next?.startsWith("/admin") ? params.next : "/admin";

  if (!hasAccess) {
    return <AdminAccessGate hasError={params.error === "1"} nextPath={nextPath} />;
  }

  return <AdminDashboard />;
}
