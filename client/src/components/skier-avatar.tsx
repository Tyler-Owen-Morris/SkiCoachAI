import { cn } from "@/lib/utils";

interface SkierAvatarProps {
  name: string;
  thumb: string | null;
  className?: string;
}

// Photo thumbnail when there is one, otherwise the first initial.
export default function SkierAvatar({ name, thumb, className }: SkierAvatarProps) {
  if (thumb) {
    return <img src={thumb} alt={name} className={cn("w-12 h-12 rounded-full object-cover shrink-0", className)} />;
  }
  return (
    <div
      className={cn(
        "w-12 h-12 shrink-0 bg-gradient-to-br from-primary to-secondary rounded-full flex items-center justify-center",
        className,
      )}
    >
      <span className="text-white font-medium text-lg">{name.charAt(0).toUpperCase()}</span>
    </div>
  );
}
