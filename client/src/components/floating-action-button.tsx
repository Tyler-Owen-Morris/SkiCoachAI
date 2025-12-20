import { Plus } from "lucide-react";

interface FloatingActionButtonProps {
  onClick: () => void;
}

export default function FloatingActionButton({ onClick }: FloatingActionButtonProps) {
  return (
    <button
      onClick={onClick}
      data-testid="button-add-skier"
      className="fixed bottom-6 right-4 w-14 h-14 bg-accent hover:bg-accent-light text-white rounded-full shadow-lg flex items-center justify-center transition-all duration-200 z-30"
    >
      <Plus size={24} />
    </button>
  );
}
