import { Home, Settings } from "lucide-react";
import { useLocation } from "wouter";
import type { Equipment } from "@shared/sync";
import { useLocal } from "@/app/hooks";
import { listSkiers } from "@/data/repo";
import { cn } from "@/lib/utils";
import RecordFab from "./record-fab";

interface BottomNavigationProps {
  active: "home" | "settings";
}

function NavItem({
  icon: Icon,
  label,
  active,
  onClick,
}: {
  icon: typeof Home;
  label: string;
  active: boolean;
  onClick(): void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex flex-col items-center space-y-1 py-2 px-3 transition-colors",
        active ? "text-primary" : "text-neutral-400 hover:text-neutral-600",
      )}
    >
      <Icon size={22} />
      <span className={cn("text-xs", active && "font-medium")}>{label}</span>
    </button>
  );
}

// Bottom bar with the quick voice-note button raised in the middle. Notes are
// filed under whichever active skier is named.
export default function BottomNavigation({ active }: BottomNavigationProps) {
  const [, setLocation] = useLocation();
  const { data: skiers = [] } = useLocal(["skiers"], listSkiers);

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-neutral-200 px-4 pt-2 safe-bottom z-40">
      <div className="grid grid-cols-3 items-end">
        <div className="flex justify-center">
          <NavItem icon={Home} label="Skiers" active={active === "home"} onClick={() => setLocation("/")} />
        </div>
        <div className="flex justify-center">
          <RecordFab skiers={skiers} />
        </div>
        <div className="flex justify-center">
          <NavItem
            icon={Settings}
            label="Settings"
            active={active === "settings"}
            onClick={() => setLocation("/settings")}
          />
        </div>
      </div>
    </nav>
  );
}

// Skier page: the same bar with only the mic, filing every note under them
// (on the ski or snowboard tab being viewed).
export function RecordBar({
  skier,
  equipment,
}: {
  skier: { id: string; name: string; equipment: Equipment };
  equipment: Equipment;
}) {
  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-neutral-200 px-4 pt-2 safe-bottom z-40">
      <div className="flex justify-center">
        <RecordFab skiers={[skier]} fixedSkier={skier} equipment={equipment} />
      </div>
    </nav>
  );
}
