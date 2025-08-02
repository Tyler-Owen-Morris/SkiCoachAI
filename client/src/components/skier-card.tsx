import { ChevronRight } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface Skier {
  id: string;
  name: string;
  level: string;
  noteCount: number;
  lastNote: string | null;
}

interface SkierCardProps {
  skier: Skier;
  onClick: () => void;
}

export default function SkierCard({ skier, onClick }: SkierCardProps) {
  const getStatusColor = (level: string) => {
    switch (level.toLowerCase()) {
      case "beginner":
        return "bg-orange-500";
      case "intermediate":
        return "bg-secondary";
      case "advanced":
        return "bg-blue-500";
      case "expert":
        return "bg-purple-500";
      default:
        return "bg-neutral-400";
    }
  };

  return (
    <div
      onClick={onClick}
      className="bg-white rounded-xl p-4 shadow-sm border border-neutral-100 hover:shadow-md transition-shadow cursor-pointer"
    >
      <div className="flex items-center space-x-4">
        {/* Avatar placeholder */}
        <div className="w-12 h-12 bg-gradient-to-br from-primary to-secondary rounded-full flex items-center justify-center">
          <span className="text-white font-medium text-lg">
            {skier.name.charAt(0).toUpperCase()}
          </span>
        </div>
        
        <div className="flex-1">
          <h3 className="font-medium text-neutral-800">{skier.name}</h3>
          <p className="text-sm text-neutral-600">
            {skier.level} • {skier.noteCount} notes
          </p>
          <div className="flex items-center space-x-2 mt-1">
            <span className={`inline-block w-2 h-2 rounded-full ${getStatusColor(skier.level)}`}></span>
            <span className="text-xs text-neutral-500">
              {skier.lastNote 
                ? `Last note: ${formatDistanceToNow(new Date(skier.lastNote), { addSuffix: true })}`
                : "No notes yet"
              }
            </span>
          </div>
        </div>
        
        <ChevronRight className="text-neutral-400" size={20} />
      </div>
    </div>
  );
}
