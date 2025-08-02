import { Home, Mic, TrendingUp, Settings } from "lucide-react";
import { cn } from "@/lib/utils";

interface BottomNavigationProps {
  active: string;
}

export default function BottomNavigation({ active }: BottomNavigationProps) {
  const navItems = [
    { id: "home", icon: Home, label: "Home" },
    { id: "record", icon: Mic, label: "Record" },
    { id: "analytics", icon: TrendingUp, label: "Analytics" },
    { id: "settings", icon: Settings, label: "Settings" },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-neutral-200 px-4 py-2">
      <div className="flex items-center justify-around">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = active === item.id;
          
          return (
            <button
              key={item.id}
              className={cn(
                "flex flex-col items-center space-y-1 py-2 px-3 transition-colors",
                isActive ? "text-primary" : "text-neutral-400 hover:text-neutral-600"
              )}
            >
              <Icon size={20} />
              <span className={cn(
                "text-xs",
                isActive ? "font-medium" : ""
              )}>
                {item.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
