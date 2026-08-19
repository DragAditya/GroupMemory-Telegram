import { useAuth } from "@/_core/hooks/useAuth";
import DashboardLayout from "@/components/DashboardLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { startLogin } from "@/const";
import { trpc } from "@/lib/trpc";
import { Activity, Bot, Check, CheckCircle2, ChevronRight, Copy, Database, ExternalLink, Link2, LockKeyhole, MessageCircleMore, RefreshCw, ShieldCheck, TimerReset, Users } from "lucide-react";

function countLabel(value: number) {
  return new Intl.NumberFormat().format(value);
}

function dateLabel(value: Date | string | null) {
  if (!value) return "No activity yet";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "No activity yet" : date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

export default function Home() {
  const { loading, isAuthenticated } = useAuth({ redirectOnUnauthenticated: true });
  const dashboard = trpc.groupMemory.dashboard.useQuery(undefined, { enabled: isAuthenticated, retry: false });
  const groups = dashboard.data?.groups ?? [];
  const bot = dashboard.data?.bot;
  const retainedMessageCount = groups.reduce((total, group) => total + Number(group.messageCount), 0);
  const enabledGroups = groups.filter(group => Boolean(group.memoryEnabled)).length;

  if (!loading && !isAuthenticated) {
    return (
      <div className="min-h-screen bg-[#090b12] text-white grid place-items-center p-6 gm-grid-bg">
        <div className="w-full max-w-md rounded-3xl border border-white/10 bg-white/[0.045] p-8 shadow-2xl backdrop-blur-xl">
          <div className="mb-8 flex size-12 items-center justify-center rounded-2xl bg-cyan-400 text-slate-950"><Bot size={24} /></div>
          <p className="text-sm font-medium text-cyan-200">GroupMemory</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-[-0.04em]">Owner access required.</h1>
          <p className="mt-4 leading-7 text-slate-400">Opening secure sign-in with the Manus account that owns this bot project.</p>
          <Button onClick={() => startLogin()} className="mt-8 w-full bg-cyan-300 font-semibold text-slate-950 hover:bg-cyan-200">Continue to sign in <ChevronRight size={16} /></Button>
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

              {bot ? <BotConnectionCard bot={bot} /> : null}

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

function BotConnectionCard({ bot }: { bot: { username: string; displayName: string; profileUrl: string; addToGroupUrl: string; canJoinGroups: boolean; supportsInlineQueries: boolean; webhookConfigured: boolean; pendingUpdateCount: number; lastErrorAt: Date | string | null; lastErrorMessage: string | null } }) {
  const copyBotUsername = async () => { await navigator.clipboard?.writeText(`@${bot.username}`); };
  return <section className="overflow-hidden rounded-2xl border border-cyan-300/20 bg-[radial-gradient(circle_at_82%_10%,rgba(34,211,238,0.16),transparent_35%),#111522] shadow-[0_28px_90px_-42px_rgba(0,0,0,0.95)]"><div className="grid gap-6 p-5 lg:grid-cols-[1.15fr_0.85fr] lg:p-7"><div><div className="flex items-center gap-3"><div className="flex size-12 items-center justify-center rounded-2xl bg-cyan-300 text-slate-950 shadow-[0_0_32px_rgba(103,232,249,0.24)]"><Bot size={23} /></div><div><p className="text-xs font-semibold uppercase tracking-[0.15em] text-cyan-200">Your Telegram bot</p><h2 className="mt-1 text-xl font-semibold tracking-[-0.035em] text-white">{bot.displayName} <span className="text-slate-500">@{bot.username}</span></h2></div></div><p className="mt-5 max-w-xl text-sm leading-6 text-slate-400">Add GroupMemory to a Telegram group, make it an admin, then turn on memory. Telegram will ask you to choose the group — the dashboard never gets access to your personal chats.</p><div className="mt-5 flex flex-wrap gap-2"><Button asChild className="bg-cyan-300 font-semibold text-slate-950 hover:bg-cyan-200"><a href={bot.addToGroupUrl} target="_blank" rel="noreferrer">Add bot to a group <ExternalLink size={15} /></a></Button><Button asChild variant="outline" className="border-white/12 bg-white/[0.035] text-slate-200 hover:bg-white/[0.08] hover:text-white"><a href={bot.profileUrl} target="_blank" rel="noreferrer">Open @{bot.username} <Link2 size={15} /></a></Button><Button onClick={copyBotUsername} variant="ghost" className="text-slate-400 hover:bg-white/[0.06] hover:text-white"><Copy size={15} /> Copy username</Button></div></div><div className="rounded-2xl border border-white/10 bg-black/20 p-5"><p className="text-xs font-semibold uppercase tracking-[0.13em] text-slate-500">Connection checks</p><div className="mt-4 space-y-3 text-sm"><StatusLine ok={bot.webhookConfigured} label="Webhook connected" detail={bot.webhookConfigured ? `${bot.pendingUpdateCount} updates waiting` : "Not configured"} /><StatusLine ok={bot.canJoinGroups} label="Can be added to groups" detail={bot.canJoinGroups ? "Enabled in BotFather" : "Enable group access in BotFather"} /><StatusLine ok={bot.supportsInlineQueries} label="Mention questions" detail={bot.supportsInlineQueries ? "Inline queries enabled" : "Use @GroupMemory in chat"} /></div>{bot.lastErrorMessage ? <p className="mt-4 rounded-xl border border-amber-300/20 bg-amber-300/[0.08] p-3 text-xs leading-5 text-amber-100">Latest Telegram delivery note: {bot.lastErrorMessage}{bot.lastErrorAt ? ` (${dateLabel(bot.lastErrorAt)})` : ""}</p> : null}</div></div><div className="border-t border-white/10 bg-white/[0.025] px-5 py-4 lg:px-7"><div className="flex flex-col gap-3 text-sm text-slate-400 sm:flex-row sm:items-center sm:justify-between"><p><span className="font-medium text-slate-200">Quick start:</span> Add bot → make admin → turn off BotFather Group Privacy → send <code className="rounded bg-white/[0.06] px-1.5 py-0.5 text-cyan-100">/memory on</code>.</p><Badge className="w-fit border border-cyan-300/20 bg-cyan-300/10 text-cyan-200 hover:bg-cyan-300/10"><Check size={13} className="mr-1" /> @{bot.username}</Badge></div></div></section>;
}

function StatusLine({ ok, label, detail }: { ok: boolean; label: string; detail: string }) { return <div className="flex items-start gap-2.5"><CheckCircle2 size={17} className={ok ? "mt-0.5 shrink-0 text-emerald-300" : "mt-0.5 shrink-0 text-slate-600"} /><div><p className={ok ? "font-medium text-slate-200" : "font-medium text-slate-400"}>{label}</p><p className="mt-0.5 text-xs text-slate-500">{detail}</p></div></div>; }

function EmptyState() { return <div className="px-6 py-16 text-center"><div className="mx-auto flex size-11 items-center justify-center rounded-2xl bg-white/[0.06] text-slate-300"><Bot size={20} /></div><h3 className="mt-4 font-medium text-slate-100">No groups connected yet</h3><p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">Use the add-to-group button above. Once GroupMemory receives its first group message, the group’s recording state and retention policy will appear here.</p></div>; }

function InfoCard({ icon: Icon, title, text }: { icon: typeof Bot; title: string; text: string }) { return <article className="rounded-2xl border border-white/10 bg-white/[0.025] p-5"><Icon size={17} className="text-cyan-300" /><h3 className="mt-4 font-medium text-slate-100">{title}</h3><p className="mt-2 text-sm leading-6 text-slate-500">{text}</p></article>; }
