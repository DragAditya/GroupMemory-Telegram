import { useAuth } from "@/_core/hooks/useAuth";
import DashboardLayout from "@/components/DashboardLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { startLogin } from "@/const";
import { trpc } from "@/lib/trpc";
import { Activity, Bot, Check, ChevronRight, Database, LockKeyhole, MessageCircleMore, RefreshCw, ShieldCheck, TimerReset, Users } from "lucide-react";

function countLabel(value: number) {
  return new Intl.NumberFormat().format(value);
}

function dateLabel(value: Date | string | null) {
  if (!value) return "No activity yet";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "No activity yet" : date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

export default function Home() {
  const { loading, isAuthenticated } = useAuth();
  const dashboard = trpc.groupMemory.dashboard.useQuery(undefined, { enabled: isAuthenticated, retry: false });
  const groups = dashboard.data?.groups ?? [];
  const retainedMessageCount = groups.reduce((total, group) => total + Number(group.messageCount), 0);
  const enabledGroups = groups.filter(group => Boolean(group.memoryEnabled)).length;

  if (!loading && !isAuthenticated) {
    return (
      <div className="min-h-screen bg-[#090b12] text-white grid place-items-center p-6 gm-grid-bg">
        <div className="w-full max-w-md rounded-3xl border border-white/10 bg-white/[0.045] p-8 shadow-2xl backdrop-blur-xl">
          <div className="mb-8 flex size-12 items-center justify-center rounded-2xl bg-cyan-400 text-slate-950"><Bot size={24} /></div>
          <p className="text-sm font-medium text-cyan-200">GroupMemory</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-[-0.04em]">Owner access required.</h1>
          <p className="mt-4 leading-7 text-slate-400">Sign in with the Manus account that owns this bot project to view its operating status.</p>
          <Button onClick={() => startLogin()} className="mt-8 w-full bg-cyan-300 font-semibold text-slate-950 hover:bg-cyan-200">Sign in securely <ChevronRight size={16} /></Button>
        </div>
      </div>
    );
  }

  return (
    <DashboardLayout>
      <div className="gm-grid-bg min-h-full -m-4 px-4 py-6 md:-m-4 md:px-8 md:py-9">
        <div className="mx-auto max-w-7xl space-y-8">
          <header className="flex flex-col justify-between gap-5 border-b border-white/10 pb-7 md:flex-row md:items-end">
            <div>
              <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-cyan-300"><span className="size-1.5 rounded-full bg-cyan-300 shadow-[0_0_12px_#67e8f9]" /> Owner console</div>
              <h1 className="text-3xl font-semibold tracking-[-0.045em] text-white md:text-4xl">Group memory, <span className="text-slate-500">in focus.</span></h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400">A compact operating view of your Telegram group memory: capture state, retention windows, and the messages currently available for grounded retrieval.</p>
            </div>
            <Button variant="outline" onClick={() => dashboard.refetch()} disabled={dashboard.isFetching} className="border-white/12 bg-white/[0.035] text-slate-200 hover:bg-white/[0.08] hover:text-white"><RefreshCw className={dashboard.isFetching ? "animate-spin" : ""} size={15} /> Refresh</Button>
          </header>

          {dashboard.error ? (
            <section className="rounded-2xl border border-rose-400/25 bg-rose-400/[0.07] p-5 text-sm text-rose-100"><div className="flex items-center gap-2 font-semibold"><LockKeyhole size={16} /> Owner-only access</div><p className="mt-2 text-rose-200/80">{dashboard.error.message || "The current account is not allowed to view this dashboard."}</p></section>
          ) : (
            <>
              <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <Metric icon={Users} label="Connected groups" value={countLabel(groups.length)} detail={`${enabledGroups} recording`} tint="cyan" />
                <Metric icon={MessageCircleMore} label="Retained messages" value={countLabel(retainedMessageCount)} detail="within group policies" tint="violet" />
                <Metric icon={ShieldCheck} label="Webhook surface" value="Protected" detail="secret-verified" tint="emerald" />
                <Metric icon={TimerReset} label="Retention cleanup" value={dashboard.data?.retentionJob ? "Scheduled" : "Pending"} detail={dashboard.data?.retentionJob?.lastRunAt ? `last run ${dateLabel(dashboard.data.retentionJob.lastRunAt)}` : "set after publishing"} tint="amber" />
              </section>

              <section className="overflow-hidden rounded-2xl border border-white/10 bg-[#111522]/85 shadow-[0_28px_90px_-42px_rgba(0,0,0,0.95)]">
                <div className="flex flex-col gap-3 border-b border-white/10 px-5 py-5 sm:flex-row sm:items-center sm:justify-between">
                  <div><h2 className="text-base font-semibold text-white">Group status</h2><p className="mt-1 text-sm text-slate-400">Only retained messages are indexed for semantic search and answers.</p></div>
                  <Badge className="w-fit border border-cyan-300/20 bg-cyan-300/10 text-cyan-200 hover:bg-cyan-300/10"><Database size={13} className="mr-1" /> Vector retrieval active</Badge>
                </div>
                {dashboard.isLoading ? <div className="p-10 text-center text-sm text-slate-500">Loading operational status…</div> : groups.length === 0 ? <EmptyState /> : <GroupTable groups={groups} />}
              </section>

              <section className="grid gap-3 lg:grid-cols-3">
                <InfoCard icon={Bot} title="In group" text="Add the bot, grant it the permissions needed to receive messages, then use /memory on when your group is ready." />
                <InfoCard icon={Activity} title="Ask with evidence" text="Use /ask or mention the bot. Every supported answer returns named, dated Telegram sources." />
                <InfoCard icon={TimerReset} title="Retention is strict" text="Each group controls its own 7-, 30-, or 90-day retention period. Expired records are removed by the cleanup job." />
              </section>
            </>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}

function Metric({ icon: Icon, label, value, detail, tint }: { icon: typeof Users; label: string; value: string; detail: string; tint: "cyan" | "violet" | "emerald" | "amber" }) {
  const styles = { cyan: "text-cyan-200 bg-cyan-300/10", violet: "text-violet-200 bg-violet-300/10", emerald: "text-emerald-200 bg-emerald-300/10", amber: "text-amber-200 bg-amber-300/10" }[tint];
  return <article className="rounded-2xl border border-white/10 bg-white/[0.035] p-4 transition-transform duration-200 hover:-translate-y-0.5"><div className={`flex size-9 items-center justify-center rounded-xl ${styles}`}><Icon size={17} /></div><p className="mt-5 text-xs font-medium uppercase tracking-[0.13em] text-slate-500">{label}</p><div className="mt-1 flex items-baseline gap-2"><p className="text-2xl font-semibold tracking-[-0.04em] text-white">{value}</p></div><p className="mt-1 text-xs text-slate-500">{detail}</p></article>;
}

function GroupTable({ groups }: { groups: Array<{ id: number; title: string | null; username: string | null; memoryEnabled: boolean | number; retentionDays: number; lastActivityAt: Date | string | null; messageCount: number | string }> }) {
  return <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left"><thead className="bg-white/[0.025] text-[11px] uppercase tracking-[0.13em] text-slate-500"><tr><th className="px-5 py-3.5 font-medium">Group</th><th className="px-5 py-3.5 font-medium">Memory</th><th className="px-5 py-3.5 font-medium">Retention</th><th className="px-5 py-3.5 font-medium">Messages</th><th className="px-5 py-3.5 font-medium">Last activity</th></tr></thead><tbody>{groups.map(group => <tr key={group.id} className="border-t border-white/[0.07] transition-colors hover:bg-white/[0.025]"><td className="px-5 py-4"><p className="font-medium text-slate-100">{group.title || "Untitled Telegram group"}</p><p className="mt-0.5 text-xs text-slate-500">{group.username ? `@${group.username}` : "Private group"}</p></td><td className="px-5 py-4"><span className={`inline-flex items-center gap-1.5 text-sm ${Boolean(group.memoryEnabled) ? "text-emerald-200" : "text-slate-500"}`}><span className={`size-1.5 rounded-full ${Boolean(group.memoryEnabled) ? "bg-emerald-300" : "bg-slate-600"}`} />{Boolean(group.memoryEnabled) ? "Recording" : "Paused"}</span></td><td className="px-5 py-4 text-sm text-slate-300">{group.retentionDays} days</td><td className="px-5 py-4 text-sm font-medium text-slate-200">{countLabel(Number(group.messageCount))}</td><td className="px-5 py-4 text-sm text-slate-400">{dateLabel(group.lastActivityAt)}</td></tr>)}</tbody></table></div>;
}

function EmptyState() { return <div className="px-6 py-16 text-center"><div className="mx-auto flex size-11 items-center justify-center rounded-2xl bg-white/[0.06] text-slate-300"><Bot size={20} /></div><h3 className="mt-4 font-medium text-slate-100">No groups connected yet</h3><p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">Once GroupMemory receives its first message from a Telegram group, its recording state and retention policy will appear here.</p></div>; }

function InfoCard({ icon: Icon, title, text }: { icon: typeof Bot; title: string; text: string }) { return <article className="rounded-2xl border border-white/10 bg-white/[0.025] p-5"><Icon size={17} className="text-cyan-300" /><h3 className="mt-4 font-medium text-slate-100">{title}</h3><p className="mt-2 text-sm leading-6 text-slate-500">{text}</p></article>; }
