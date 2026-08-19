import { Button } from "@/components/ui/button";
import { CheckCircle2, Copy, ExternalLink, Loader2, MessageCircleMore, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";

type CodeLink = {
  code: string;
  deepLink: string;
  pollToken: string;
  expiresAt: string;
  ownerLink: boolean;
};

export default function TelegramBotCodeLink({ compact = false }: { compact?: boolean }) {
  const [link, setLink] = useState<CodeLink | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [completed, setCompleted] = useState(false);

  const createCode = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/auth/telegram/code/start", { method: "POST", credentials: "same-origin" });
      const data = await response.json() as Partial<CodeLink> & { error?: string };
      if (!response.ok || !data.code || !data.deepLink || !data.pollToken || !data.expiresAt) {
        throw new Error(data.error || "Unable to create a Telegram link code");
      }
      setCompleted(false);
      setLink(data as CodeLink);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to create a Telegram link code");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!link || completed) return;
    let cancelled = false;
    let timer: number | undefined;
    const poll = async () => {
      try {
        const response = await fetch("/api/auth/telegram/code/status", {
          method: "POST",
          credentials: "same-origin",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ pollToken: link.pollToken }),
        });
        const data = await response.json() as { status?: string; error?: string };
        if (cancelled) return;
        if (response.ok && data.status === "linked") {
          setCompleted(true);
          window.setTimeout(() => window.location.reload(), 550);
          return;
        }
        if (response.status !== 202) {
          setError(data.error || "This link code expired. Create a fresh code and try again.");
          return;
        }
      } catch {
        // A temporary polling failure should not invalidate the code.
      }
      if (!cancelled) timer = window.setTimeout(poll, 2_500);
    };
    timer = window.setTimeout(poll, 1_500);
    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [link, completed]);

  const copyCode = async () => {
    if (link) await navigator.clipboard?.writeText(link.code);
  };

  if (!link) {
    return <Button onClick={() => void createCode()} disabled={loading} variant={compact ? "outline" : "secondary"} className={compact ? "border-amber-300/30 text-amber-100 hover:bg-amber-300/10" : "w-full"}>{loading ? <Loader2 className="animate-spin" size={15} /> : <MessageCircleMore size={15} />}{loading ? "Creating secure code…" : "Link through Telegram bot"}</Button>;
  }

  if (completed) {
    return <div className="rounded-xl border border-emerald-300/25 bg-emerald-300/10 p-3 text-sm text-emerald-50"><span className="flex items-center gap-2 font-medium"><CheckCircle2 size={16} /> Telegram confirmed — opening your dashboard.</span></div>;
  }

  const expires = new Date(link.expiresAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" });
  return <div className="rounded-xl border border-cyan-300/25 bg-cyan-300/[0.08] p-4 text-left"><p className="text-sm font-semibold text-cyan-50">Confirm through the Telegram bot</p><p className="mt-1 text-xs leading-5 text-cyan-100/70">Open the bot link below. Telegram sends <code className="rounded bg-black/20 px-1 py-0.5">/start {link.code}</code> automatically. This code expires at {expires} IST.</p><div className="mt-3 flex flex-wrap gap-2"><Button asChild className="bg-cyan-300 text-slate-950 hover:bg-cyan-200"><a href={link.deepLink} target="_blank" rel="noreferrer">Open bot and confirm <ExternalLink size={15} /></a></Button><Button onClick={() => void copyCode()} variant="outline" className="border-cyan-100/20 text-cyan-50 hover:bg-cyan-100/10"><Copy size={15} /> Copy code</Button><Button onClick={() => void createCode()} variant="ghost" className="text-cyan-100/75 hover:bg-cyan-100/10 hover:text-cyan-50"><RefreshCw size={15} /> New code</Button></div>{error ? <p className="mt-3 text-xs text-rose-200">{error}</p> : null}</div>;
}
