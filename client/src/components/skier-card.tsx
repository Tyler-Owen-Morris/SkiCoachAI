import { ChevronRight } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import type { SkierWithStats } from "@/data/repo";

interface SkierCardProps {
  skier: SkierWithStats;
  onClick: () => void;
}

const LEVEL_COLORS: Record<string, string> = {
  beginner: "bg-orange-500",
  intermediate: "bg-secondary",
  advanced: "bg-blue-500",
  expert: "bg-purple-500",
};

export default function SkierCard({ skier, onClick }: SkierCardProps) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left bg-white rounded-xl p-4 shadow-sm border border-neutral-100 hover:shadow-md transition-shadow"
    >
      <div className="flex items-center space-x-4">
        <div className="w-12 h-12 bg-gradient-to-br from-primary to-secondary rounded-full flex items-center justify-center">
          <span className="text-white font-medium text-lg">{skier.name.charAt(0).toUpperCase()}</span>
        </div>

        <div className="flex-1 min-w-0">
          <h3 className="font-medium text-neutral-800 truncate">{skier.name}</h3>
          <p className="text-sm text-neutral-600 capitalize">
            {skier.level} • {skier.noteCount} {skier.noteCount === 1 ? "note" : "notes"}
          </p>
          <div className="flex items-center space-x-2 mt-1">
            <span className={`inline-block w-2 h-2 rounded-full ${LEVEL_COLORS[skier.level] ?? "bg-neutral-400"}`}></span>
            <span className="text-xs text-neutral-500">
              {skier.lastNoteAt
                ? `Last note ${formatDistanceToNow(new Date(skier.lastNoteAt), { addSuffix: true })}`
                : "No notes yet"}
            </span>
          </div>
        </div>

        <ChevronRight className="text-neutral-400" size={20} />
      </div>
    </button>
  );
}
