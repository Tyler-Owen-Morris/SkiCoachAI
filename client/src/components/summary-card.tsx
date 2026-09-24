import { formatDistanceToNow } from "date-fns";
import { CloudOff, Loader2, Sparkles } from "lucide-react";
import type { Summary } from "@/data/repo";
import { Button } from "@/components/ui/button";

interface SummaryCardProps {
  // The most recent request, and the most recent finished summary (which stays
  // visible while a refresh is queued offline).
  summary: Summary | null;
  ready: Summary | null;
  noteCount: number;
  // What a queued summary is waiting for, e.g. "signal" or "sign-in"; null if nothing.
  waitingFor: string | null;
  onRequest(): void;
}

function List({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div>
      <h5 className="text-xs font-semibold uppercase tracking-wide text-neutral-500 mb-1">{title}</h5>
      <ul className="list-disc pl-5 space-y-0.5 text-sm text-neutral-800">
        {items.map((item, i) => (
          <li key={i}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

export default function SummaryCard({ summary, ready, noteCount, waitingFor, onRequest }: SummaryCardProps) {
  const inProgress = summary?.status === "queued" || summary?.status === "pending";
  const content = ready?.content ?? null;

  // Tinted rather than saturated: stands apart from the white cards without
  // being loud.
  return (
    <div className="rounded-xl p-5 border border-sky-100 bg-gradient-to-br from-sky-50 via-white to-emerald-50 shadow-sm text-neutral-800">
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-2">
          <Sparkles size={18} className="text-primary" />
          <h4 className="font-semibold">AI summary</h4>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="bg-white border-sky-200 text-primary hover:bg-sky-50"
          disabled={inProgress || noteCount === 0}
          onClick={onRequest}
        >
          {content ? "Refresh" : "Generate"}
        </Button>
      </div>

      {noteCount === 0 && <p className="text-sm text-neutral-600">Record a few notes first.</p>}

      {summary?.status === "queued" && (
        <p className="text-sm text-neutral-600 flex items-center gap-2">
          <CloudOff size={14} />
          {summary.error
            ? `Waiting: ${summary.error}`
            : waitingFor
              ? `Queued — will generate after ${waitingFor}.`
              : "Queued — will generate shortly."}
        </p>
      )}
      {summary?.status === "pending" && (
        <p className="text-sm text-neutral-600 flex items-center gap-2">
          <Loader2 size={14} className="animate-spin" /> Generating…
        </p>
      )}
      {summary?.status === "error" && <p className="text-sm text-red-700">Couldn't summarize: {summary.error}</p>}

      {content && (
        <div className="space-y-3">
          <p className="text-sm leading-relaxed">{content.overview}</p>
          <List title="Strengths" items={content.strengths} />
          <List title="Work on" items={content.areasToImprove} />
          <List title="Drills" items={content.drills.map((d) => `${d.name} — ${d.why}`)} />
          {content.nextFocus && (
            <div className="bg-white/80 border border-sky-100 rounded-lg p-3 text-sm">
              <span className="font-semibold">Next session: </span>
              {content.nextFocus}
            </div>
          )}
          <p className="text-xs text-neutral-500">
            From {ready?.noteCount ?? "?"} notes · {formatDistanceToNow(new Date(ready!.requestedAt), { addSuffix: true })}
          </p>
        </div>
      )}
    </div>
  );
}
