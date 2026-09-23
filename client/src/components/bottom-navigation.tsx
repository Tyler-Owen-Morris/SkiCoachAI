import { Home, Settings, UserPlus } from "lucide-react";
import { useLocation } from "wouter";
import { cn } from "@/lib/utils";

interface BottomNavigationProps {
  active: "home" | "add" | "settings";
}

export default function BottomNavigation({ active }: BottomNavigationProps) {
  const [, setLocation] = useLocation();
  const navItems = [
    { id: "home", icon: Home, label: "Skiers", path: "/" },
    { id: "add", icon: UserPlus, label: "Add skier", path: "/add-skier" },
    { id: "settings", icon: Settings, label: "Settings", path: "/settings" },
  ] as const;

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-neutral-200 px-4 pt-2 safe-bottom z-40">
      <div className="flex items-center justify-around">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = active === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setLocation(item.path)}
              className={cn(
                "flex flex-col items-center space-y-1 py-2 px-3 transition-colors",
                isActive ? "text-primary" : "text-neutral-400 hover:text-neutral-600",
              )}
            >
              <Icon size={22} />
              <span className={cn("text-xs", isActive && "font-medium")}>{item.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
