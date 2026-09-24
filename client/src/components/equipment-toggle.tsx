import type { Equipment } from "@shared/sync";
import { cn } from "@/lib/utils";

const OPTIONS: { value: Equipment; label: string; icon: string }[] = [
  { value: "ski", label: "Ski", icon: "⛷️" },
  { value: "snowboard", label: "Snowboard", icon: "🏂" },
];

interface EquipmentToggleProps {
  value: Equipment;
  onChange(value: Equipment): void;
  // Optional note counts shown next to each label (skier page tabs).
  counts?: Record<Equipment, number>;
  className?: string;
}

// Two-way switch between ski and snowboard.
export default function EquipmentToggle({ value, onChange, counts, className }: EquipmentToggleProps) {
  return (
    <div role="tablist" className={cn("grid grid-cols-2 rounded-xl bg-neutral-100 p-1", className)}>
      {OPTIONS.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(option.value)}
            className={cn(
              "flex items-center justify-center gap-2 rounded-lg py-2 text-sm font-medium transition-colors",
              selected ? "bg-white text-neutral-900 shadow-sm" : "text-neutral-500",
            )}
          >
            <span aria-hidden>{option.icon}</span>
            {option.label}
            {counts && <span className="text-xs text-neutral-400">{counts[option.value]}</span>}
          </button>
        );
      })}
    </div>
  );
}
