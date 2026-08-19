import { useAuth } from "@/_core/hooks/useAuth";
import DashboardLayout from "@/components/DashboardLayout";
import TelegramBotCodeLink from "@/components/TelegramBotCodeLink";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import {
  Activity,
  Bot,
  Check,
  CheckCircle2,
  Database,
  ExternalLink,
  KeyRound,
  LockKeyhole,
  MessageCircleMore,
  RefreshCw,
  ShieldCheck,
  TimerReset,
  Users,
  type LucideIcon,
} from "lucide-react";

type DashboardGroup = {
  id: number;
  title: string | null;
  username: string | null;
  memoryEnabled: boolean | number;
  retentionDays: number;
  lastActivityAt: Date | string | null;
  messageCount: number | string;
  lastVerifiedAt?: Date | string;
};

type OwnerDashboardData = {
  groups: DashboardGroup[];
  metrics: {
    groupCount: number;
    retainedMessageCount: number;
    memoryEnabledGroupCount: number;
    activeGroupCount: number;
  };
  retentionJob?: { lastRunAt: Date | string | null } | null;
  bot?: {
    username: string;
    displayName: string;
    profileUrl: string;
    addToGroupUrl: string;
    canJoinGroups: boolean;
    webhookConfigured: boolean;
    pendingUpdateCount: number;
    lastErrorAt: Date | string | null;
    lastErrorMessage: string | null;
  };
};

function countLabel(value: number) {
  return new Intl.NumberFormat().format(value);
}

function dateLabel(value: Date | string | null | undefined) {
  if (!value) return "No activity yet";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "No activity yet"
    : date.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" }) + " IST";
}

export default function Home() {
  const { loading, isAuthenticated, user } = useAuth();
  const personal = trpc.groupMemory.personalDashboard.useQuery(undefined, { enabled: isAuthenticated, retry: false });
  const owner = trpc.groupMemory.ownerDashboard.useQuery(undefined, {
    enabled: isAuthenticated && Boolean(user?.isProjectOwner),
    retry: false,
  });
  const personalGroups = personal.data?.groups ?? [];
  const personalRetained = personalGroups.reduce((sum, group) => sum + Number(group.messageCount), 0);

  return (
    <DashboardLayout>
      <div className="gm-grid-bg min-h-full -m-4 px-4 py-6 md:px-8 md:py-9">
        <div className="mx-auto max-w-7xl space-y-8">
          <header className="flex flex-col justify-between gap-5 border-b border-white/10 pb-7 lg:flex-row lg:items-end">
            <div>
              <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-cyan-300">
                <span className="size-1.5 rounded-full bg-cyan-300 shadow-[0_0_12px_#67e8f9]" /> Telegram workspace
              </div>
              <h1 className="text-3xl font-semibold tracking-[-0.045em] text-white md:text-4xl">
                Your groups, <span className="text-slate-500">under control.</span>
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400">
                View only the Telegram groups you currently administer. GroupMemory checks that relationship before showing group settings or retained-message totals.
              </p>
            </div>
            <Button
              variant="outline"
              onClick={() => { void personal.refetch(); if (user?.isProjectOwner) void owner.refetch(); }}
              disabled={personal.isFetching || owner.isFetching || loading}
              className="border-white/12 bg-white/[0.035] text-slate-200 hover:bg-white/[0.08] hover:text-white"
            >
              <RefreshCw className={personal.isFetching || owner.isFetching ? "animate-spin" : ""} size={15} /> Refresh access
            </Button>
          </header>

          {personal.data?.requiresTelegramLogin ? <OwnerLinkNotice /> : null}

          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Metric icon={Users} label="My admin groups" value={countLabel(personalGroups.length)} detail="live Telegram checks" tint="cyan" />
            <Metric icon={MessageCircleMore} label="Retained messages" value={countLabel(personalRetained)} detail="across your groups" tint="violet" />
            <Metric icon={ShieldCheck} label="Access model" value="Scoped" detail="admin-verified only" tint="emerald" />
            <Metric icon={TimerReset} label="Your next step" value={personalGroups.length ? "Ask away" : "Open a group"} detail={personalGroups.length ? "Use /ask or reply to an answer" : "Send /status as a group admin"} tint="amber" />
          </section>

          <section className="overflow-hidden rounded-2xl border border-white/10 bg-[#111522]/85 shadow-[0_28px_90px_-42px_rgba(0,0,0,0.95)]">
            <div className="flex flex-col gap-3 border-b border-white/10 px-5 py-5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-base font-semibold text-white">My group memory</h2>
                <p className="mt-1 text-sm text-slate-400">Only groups where your administrator status can be confirmed appear here.</p>
              </div>
              <Badge className="w-fit border border-cyan-300/20 bg-cyan-300/10 text-cyan-200 hover:bg-cyan-300/10"><Database size={13} className="mr-1" /> Tenant-scoped</Badge>
            </div>
            {personal.isLoading ? <LoadingState label="Checking your Telegram group access…" /> : personal.error ? <ErrorState message={personal.error.message} /> : personalGroups.length ? <GroupTable groups={personalGroups} showVerification /> : <PersonalEmptyState />}
          </section>

          <section className="grid gap-3 lg:grid-cols-3">
            <InfoCard icon={KeyRound} title="Unlock a group" text="Open the group in Telegram and send /status as a current administrator. GroupMemory then records a verified dashboard grant." />
            <InfoCard icon={Activity} title="Ask with evidence" text="Use /ask, /search, or reply to a GroupMemory answer. Sources are kept compact and shown in India Standard Time." />
            <InfoCard icon={TimerReset} title="Retention stays local" text="Every group keeps its own 7-, 30-, or 90-day rule. Settings are changed through the protected Telegram admin commands." />
          </section>

          {user?.isProjectOwner ? <OwnerConsole owner={owner.data as OwnerDashboardData | undefined} loading={owner.isLoading} error={owner.error?.message} onRefresh={() => void owner.refetch()} /> : null}
        </div>
      </div>
    </DashboardLayout>
  );
}

function OwnerLinkNotice() {
  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-amber-300/25 bg-amber-300/[0.08] p-5 text-amber-50 sm:flex-row sm:items-center sm:justify-between">
      <div><p className="font-semibold">Link your Telegram account</p><p className="mt-1 text-sm leading-6 text-amber-100/75">The owner console is available, but your personal group list needs a verified Telegram identity first.</p></div>
      <div className="flex flex-wrap gap-2"><Button asChild className="bg-amber-300 text-slate-950 hover:bg-amber-200"><a href="/api/auth/telegram/link-owner?returnTo=/">Link with Telegram Login <ExternalLink size={15} /></a></Button><TelegramBotCodeLink compact /></div>
    </section>
  );
}

function OwnerConsole({ owner, loading, error, onRefresh }: { owner: OwnerDashboardData | undefined; loading: boolean; error?: string; onRefresh: () => void }) {
  const groups = owner?.groups ?? [];
  const metrics = owner?.metrics;
  const bot = owner?.bot;
  return (
    <section className="space-y-5 border-t border-white/10 pt-9">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div><div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-violet-300"><LockKeyhole size={13} /> Owner-only administration</div><h2 className="text-2xl font-semibold tracking-[-0.04em] text-white">Platform operations</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">Global statistics, bot connectivity, and every enrolled group. This section is shown only to the durable project owner record.</p></div>
        <Button variant="outline" onClick={onRefresh} disabled={loading} className="border-white/12 bg-white/[0.035] text-slate-200 hover:bg-white/[0.08] hover:text-white"><RefreshCw className={loading ? "animate-spin" : ""} size={15} /> Refresh console</Button>
      </div>
      {error ? <ErrorState message={error} /> : loading ? <LoadingState label="Loading owner operations…" /> : <>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Metric icon={Users} label="All connected groups" value={countLabel(metrics?.groupCount ?? 0)} detail={`${metrics?.activeGroupCount ?? 0} active in 7 days`} tint="cyan" />
          <Metric icon={MessageCircleMore} label="All retained messages" value={countLabel(metrics?.retainedMessageCount ?? 0)} detail="available to grounded search" tint="violet" />
          <Metric icon={CheckCircle2} label="Recording enabled" value={countLabel(metrics?.memoryEnabledGroupCount ?? 0)} detail="groups accepting new memory" tint="emerald" />
          <Metric icon={TimerReset} label="Retention cleanup" value={owner?.retentionJob ? "Scheduled" : "Pending"} detail={owner?.retentionJob?.lastRunAt ? `last run ${dateLabel(owner.retentionJob.lastRunAt)}` : "set after publishing"} tint="amber" />
        </div>
        {bot ? <OwnerBotCard bot={bot} /> : null}
        <section className="overflow-hidden rounded-2xl border border-white/10 bg-[#111522]/85 shadow-[0_28px_90px_-42px_rgba(0,0,0,0.95)]"><div className="flex flex-col gap-3 border-b border-white/10 px-5 py-5 sm:flex-row sm:items-center sm:justify-between"><div><h3 className="text-base font-semibold text-white">All enrolled groups</h3><p className="mt-1 text-sm text-slate-400">Global operational inventory; no message content is displayed here.</p></div><Badge className="w-fit border border-violet-300/20 bg-violet-300/10 text-violet-200 hover:bg-violet-300/10"><ShieldCheck size={13} className="mr-1" /> Owner scope</Badge></div>{groups.length ? <GroupTable groups={groups} /> : <PersonalEmptyState />}</section>
      </>}
    </section>
  );
}

function Metric({ icon: Icon, label, value, detail, tint }: { icon: LucideIcon; label: string; value: string; detail: string; tint: "cyan" | "violet" | "emerald" | "amber" }) {
  const styles = { cyan: "text-cyan-200 bg-cyan-300/10", violet: "text-violet-200 bg-violet-300/10", emerald: "text-emerald-200 bg-emerald-300/10", amber: "text-amber-200 bg-amber-300/10" }[tint];
  return <article className="rounded-2xl border border-white/10 bg-white/[0.035] p-4 transition-transform duration-200 hover:-translate-y-0.5"><div className={`flex size-9 items-center justify-center rounded-xl ${styles}`}><Icon size={17} /></div><p className="mt-5 text-xs font-medium uppercase tracking-[0.13em] text-slate-500">{label}</p><p className="mt-1 text-2xl font-semibold tracking-[-0.04em] text-white">{value}</p><p className="mt-1 text-xs text-slate-500">{detail}</p></article>;
}

function GroupTable({ groups, showVerification = false }: { groups: DashboardGroup[]; showVerification?: boolean }) {
  return <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left"><thead className="bg-white/[0.025] text-[11px] uppercase tracking-[0.13em] text-slate-500"><tr><th className="px-5 py-3.5 font-medium">Group</th><th className="px-5 py-3.5 font-medium">Memory</th><th className="px-5 py-3.5 font-medium">Retention</th><th className="px-5 py-3.5 font-medium">Messages</th><th className="px-5 py-3.5 font-medium">Last activity</th>{showVerification ? <th className="px-5 py-3.5 font-medium">Access confirmed</th> : null}</tr></thead><tbody>{groups.map(group => <tr key={group.id} className="border-t border-white/[0.07] transition-colors hover:bg-white/[0.025]"><td className="px-5 py-4"><p className="font-medium text-slate-100">{group.title || "Untitled Telegram group"}</p><p className="mt-0.5 text-xs text-slate-500">{group.username ? `@${group.username}` : "Private group"}</p></td><td className="px-5 py-4"><span className={`inline-flex items-center gap-1.5 text-sm ${Boolean(group.memoryEnabled) ? "text-emerald-200" : "text-slate-500"}`}><span className={`size-1.5 rounded-full ${Boolean(group.memoryEnabled) ? "bg-emerald-300" : "bg-slate-600"}`} />{Boolean(group.memoryEnabled) ? "Recording" : "Paused"}</span></td><td className="px-5 py-4 text-sm text-slate-300">{group.retentionDays} days</td><td className="px-5 py-4 text-sm font-medium text-slate-200">{countLabel(Number(group.messageCount))}</td><td className="px-5 py-4 text-sm text-slate-400">{dateLabel(group.lastActivityAt)}</td>{showVerification ? <td className="px-5 py-4 text-xs text-slate-400">{dateLabel(group.lastVerifiedAt)}</td> : null}</tr>)}</tbody></table></div>;
}

function OwnerBotCard({ bot }: { bot: { username: string; displayName: string; profileUrl: string; addToGroupUrl: string; canJoinGroups: boolean; webhookConfigured: boolean; pendingUpdateCount: number; lastErrorAt: Date | string | null; lastErrorMessage: string | null } }) {
  return <section className="overflow-hidden rounded-2xl border border-cyan-300/20 bg-[radial-gradient(circle_at_82%_10%,rgba(34,211,238,0.16),transparent_35%),#111522] p-5 shadow-[0_28px_90px_-42px_rgba(0,0,0,0.95)]"><div className="grid gap-5 lg:grid-cols-[1.15fr_0.85fr]"><div><div className="flex items-center gap-3"><div className="flex size-12 items-center justify-center rounded-2xl bg-cyan-300 text-slate-950"><Bot size={23} /></div><div><p className="text-xs font-semibold uppercase tracking-[0.15em] text-cyan-200">Bot connection</p><h3 className="mt-1 text-xl font-semibold tracking-[-0.035em] text-white">{bot.displayName} <span className="text-slate-500">@{bot.username}</span></h3></div></div><p className="mt-4 max-w-xl text-sm leading-6 text-slate-400">Add GroupMemory directly from here, make it a group administrator, disable Group Privacy in BotFather, then send <code className="rounded bg-white/[0.06] px-1.5 py-0.5 text-cyan-100">/memory on</code>.</p><div className="mt-5 flex flex-wrap gap-2"><Button asChild className="bg-cyan-300 font-semibold text-slate-950 hover:bg-cyan-200"><a href={bot.addToGroupUrl} target="_blank" rel="noreferrer">Add bot to a group <ExternalLink size={15} /></a></Button><Button asChild variant="outline" className="border-white/12 bg-white/[0.035] text-slate-200 hover:bg-white/[0.08] hover:text-white"><a href={bot.profileUrl} target="_blank" rel="noreferrer">Open bot <ExternalLink size={15} /></a></Button></div></div><div className="rounded-2xl border border-white/10 bg-black/20 p-5"><p className="text-xs font-semibold uppercase tracking-[0.13em] text-slate-500">Live checks</p><div className="mt-4 space-y-3 text-sm"><StatusLine ok={bot.webhookConfigured} label="Webhook connected" detail={bot.webhookConfigured ? `${bot.pendingUpdateCount} updates waiting` : "Not configured"} /><StatusLine ok={bot.canJoinGroups} label="Can join groups" detail={bot.canJoinGroups ? "Enabled in BotFather" : "Enable group access in BotFather"} /></div>{bot.lastErrorMessage ? <p className="mt-4 rounded-xl border border-amber-300/20 bg-amber-300/[0.08] p-3 text-xs leading-5 text-amber-100">Latest Telegram delivery note: {bot.lastErrorMessage}{bot.lastErrorAt ? ` (${dateLabel(bot.lastErrorAt)})` : ""}</p> : null}</div></div></section>;
}

function StatusLine({ ok, label, detail }: { ok: boolean; label: string; detail: string }) { return <div className="flex items-start gap-2.5"><CheckCircle2 size={17} className={ok ? "mt-0.5 shrink-0 text-emerald-300" : "mt-0.5 shrink-0 text-slate-600"} /><div><p className={ok ? "font-medium text-slate-200" : "font-medium text-slate-400"}>{label}</p><p className="mt-0.5 text-xs text-slate-500">{detail}</p></div></div>; }
function LoadingState({ label }: { label: string }) { return <div className="p-10 text-center text-sm text-slate-500">{label}</div>; }
function ErrorState({ message }: { message: string }) { return <div className="m-5 rounded-2xl border border-rose-400/25 bg-rose-400/[0.07] p-5 text-sm text-rose-100"><div className="flex items-center gap-2 font-semibold"><LockKeyhole size={16} /> Dashboard access unavailable</div><p className="mt-2 text-rose-200/80">{message || "The current session cannot read this data."}</p></div>; }
function PersonalEmptyState() { return <div className="px-6 py-16 text-center"><div className="mx-auto flex size-11 items-center justify-center rounded-2xl bg-white/[0.06] text-slate-300"><Bot size={20} /></div><h3 className="mt-4 font-medium text-slate-100">No verified groups yet</h3><p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">Open a group you administer and send <code className="rounded bg-white/[0.06] px-1.5 py-0.5 text-cyan-100">/status</code>. GroupMemory will verify your admin role and show that group here.</p></div>; }
function InfoCard({ icon: Icon, title, text }: { icon: LucideIcon; title: string; text: string }) { return <article className="rounded-2xl border border-white/10 bg-white/[0.025] p-5"><Icon size={17} className="text-cyan-300" /><h3 className="mt-4 font-medium text-slate-100">{title}</h3><p className="mt-2 text-sm leading-6 text-slate-500">{text}</p></article>; }
