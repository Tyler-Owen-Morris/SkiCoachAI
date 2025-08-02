import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { isUnauthorizedError } from "@/lib/authUtils";
import { Input } from "@/components/ui/input";
import { Search, Users, FileText } from "lucide-react";
import SkierCard from "@/components/skier-card";
import BottomNavigation from "@/components/bottom-navigation";
import FloatingActionButton from "@/components/floating-action-button";
import LoadingOverlay from "@/components/loading-overlay";
import SmartVoiceRecorder from "@/components/smart-voice-recorder";
import { useLocation } from "wouter";

interface SkierWithStats {
  id: string;
  name: string;
  level: string;
  age?: number;
  noteCount: number;
  lastNote: string | null;
  createdAt: string;
}

export default function Home() {
  const [searchQuery, setSearchQuery] = useState("");
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: skiers, isLoading, error } = useQuery<SkierWithStats[], Error>({
    queryKey: ["/api/skiers"],
  });

  // Handle auth errors with useEffect instead of onError
  if (error && isUnauthorizedError(error)) {
    toast({
      title: "Unauthorized",
      description: "You are logged out. Logging in again...",
      variant: "destructive",
    });
    setTimeout(() => {
      window.location.href = "/api/login";
    }, 500);
  }

  const filteredSkiers = skiers?.filter((skier: SkierWithStats) =>
    skier.name.toLowerCase().includes(searchQuery.toLowerCase())
  ) || [];

  const totalSkiers = skiers?.length || 0;
  const totalNotes = skiers?.reduce((sum: number, skier: SkierWithStats) => sum + skier.noteCount, 0) || 0;

  const handleSkierClick = (skierId: string) => {
    setLocation(`/skier/${skierId}`);
  };

  const handleAddSkier = () => {
    setLocation("/add-skier");
  };

  if (isLoading) {
    return <LoadingOverlay />;
  }

  return (
    <div className="min-h-screen bg-neutral-50 pb-20">
      {/* Header */}
      <header className="bg-white shadow-sm border-b border-neutral-200 sticky top-0 z-40">
        <div className="px-4 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 bg-primary rounded-full flex items-center justify-center">
              <FileText className="text-white text-sm" size={16} />
            </div>
            <h1 className="text-xl font-medium text-neutral-800">Ski Coach AI</h1>
          </div>
          <button className="p-2 rounded-full hover:bg-neutral-100 transition-colors">
            <span className="text-neutral-600">⋮</span>
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="p-4 space-y-6">
        {/* Quick Stats */}
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-white rounded-xl p-4 shadow-sm">
            <div className="text-2xl font-bold text-primary">{totalSkiers}</div>
            <div className="text-sm text-neutral-600">Total Skiers</div>
          </div>
          <div className="bg-white rounded-xl p-4 shadow-sm">
            <div className="text-2xl font-bold text-secondary">{totalNotes}</div>
            <div className="text-sm text-neutral-600">Voice Notes</div>
          </div>
        </div>

        {/* Smart Voice Recorder */}
        <SmartVoiceRecorder skiers={(skiers as SkierWithStats[]) || []} />

        {/* Search Bar */}
        <div className="relative">
          <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-neutral-400" size={16} />
          <Input
            type="text"
            placeholder="Search skiers..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-12 pr-4 py-3 bg-white rounded-xl border border-neutral-200 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
          />
        </div>

        {/* Skier List */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-medium text-neutral-800">Your Skiers</h2>
            <span className="text-sm text-neutral-600">{filteredSkiers.length} skiers</span>
          </div>
          
          {filteredSkiers.length === 0 ? (
            <div className="bg-white rounded-xl p-8 shadow-sm text-center">
              <Users className="mx-auto mb-4 text-neutral-400" size={48} />
              <h3 className="text-lg font-medium text-neutral-800 mb-2">
                {searchQuery ? "No skiers found" : "No skiers yet"}
              </h3>
              <p className="text-neutral-600 mb-4">
                {searchQuery 
                  ? "Try adjusting your search terms" 
                  : "Add your first skier to get started with voice notes and AI summaries"
                }
              </p>
              {!searchQuery && (
                <button
                  onClick={handleAddSkier}
                  className="bg-primary text-white px-6 py-2 rounded-lg hover:bg-primary-dark transition-colors"
                >
                  Add First Skier
                </button>
              )}
            </div>
          ) : (
            filteredSkiers.map((skier: SkierWithStats) => (
              <SkierCard
                key={skier.id}
                skier={skier}
                onClick={() => handleSkierClick(skier.id)}
              />
            ))
          )}
        </div>
      </main>

      <BottomNavigation active="home" />
      <FloatingActionButton onClick={handleAddSkier} />
    </div>
  );
}
