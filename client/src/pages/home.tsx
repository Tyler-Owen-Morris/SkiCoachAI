import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { isUnauthorizedError } from "@/lib/authUtils";
import { apiRequest } from "@/lib/queryClient";
import { Input } from "@/components/ui/input";
import { Search, Users, FileText, ChevronDown, ChevronRight, MoreVertical, RotateCcw, Trash2 } from "lucide-react";
import SkierCard from "@/components/skier-card";
import FloatingActionButton from "@/components/floating-action-button";
import LoadingOverlay from "@/components/loading-overlay";
import SmartVoiceRecorder from "@/components/smart-voice-recorder";
import { useLocation } from "wouter";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

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
  const [archivedOpen, setArchivedOpen] = useState(false);
  const [deleteSkierId, setDeleteSkierId] = useState<string | null>(null);
  const [deleteSkierName, setDeleteSkierName] = useState<string>("");
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: skiers, isLoading, error } = useQuery<SkierWithStats[], Error>({
    queryKey: ["/api/skiers"],
  });

  const { data: archivedSkiers } = useQuery<SkierWithStats[], Error>({
    queryKey: ["/api/skiers/archived"],
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

  const unarchiveMutation = useMutation({
    mutationFn: async (skierId: string) => {
      await apiRequest("POST", `/api/skiers/${skierId}/unarchive`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/skiers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/skiers/archived"] });
      toast({
        title: "Success",
        description: "Skier restored successfully!",
      });
    },
    onError: (error: Error) => {
      if (isUnauthorizedError(error)) {
        toast({
          title: "Unauthorized",
          description: "You are logged out. Logging in again...",
          variant: "destructive",
        });
        setTimeout(() => {
          window.location.href = "/api/login";
        }, 500);
        return;
      }
      toast({
        title: "Error",
        description: "Failed to restore skier.",
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (skierId: string) => {
      await apiRequest("DELETE", `/api/skiers/${skierId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/skiers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/skiers/archived"] });
      toast({
        title: "Success",
        description: "Skier deleted successfully!",
      });
    },
    onError: (error: Error) => {
      if (isUnauthorizedError(error)) {
        toast({
          title: "Unauthorized",
          description: "You are logged out. Logging in again...",
          variant: "destructive",
        });
        setTimeout(() => {
          window.location.href = "/api/login";
        }, 500);
        return;
      }
      toast({
        title: "Error",
        description: "Failed to delete skier.",
        variant: "destructive",
      });
    },
  });

  const handleUnarchive = (skierId: string) => {
    unarchiveMutation.mutate(skierId);
  };

  const handleDeleteConfirm = () => {
    if (deleteSkierId) {
      deleteMutation.mutate(deleteSkierId);
      setDeleteSkierId(null);
      setDeleteSkierName("");
    }
  };

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

        {/* Archived Skiers Section */}
        {archivedSkiers && archivedSkiers.length > 0 && (
          <Collapsible open={archivedOpen} onOpenChange={setArchivedOpen}>
            <CollapsibleTrigger className="flex items-center justify-between w-full py-2" data-testid="button-toggle-archived">
              <div className="flex items-center space-x-2">
                {archivedOpen ? (
                  <ChevronDown size={16} className="text-neutral-500" />
                ) : (
                  <ChevronRight size={16} className="text-neutral-500" />
                )}
                <h2 className="text-lg font-medium text-neutral-600">Archived Skiers</h2>
              </div>
              <span className="text-sm text-neutral-500">{archivedSkiers.length} archived</span>
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-2 mt-2">
              {archivedSkiers.map((skier: SkierWithStats) => (
                <div
                  key={skier.id}
                  className="bg-neutral-100 rounded-xl p-4 flex items-center justify-between"
                  data-testid={`card-archived-skier-${skier.id}`}
                >
                  <div>
                    <h3 className="font-medium text-neutral-700">{skier.name}</h3>
                    <p className="text-sm text-neutral-500">
                      {skier.level} Level • {skier.noteCount} notes
                    </p>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button 
                        className="p-2 rounded-full hover:bg-neutral-200 transition-colors"
                        data-testid={`button-archived-menu-${skier.id}`}
                      >
                        <MoreVertical className="text-neutral-500" size={16} />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem 
                        onClick={() => handleUnarchive(skier.id)}
                        data-testid={`button-unarchive-${skier.id}`}
                      >
                        <RotateCcw className="mr-2" size={16} />
                        Unarchive Skier
                      </DropdownMenuItem>
                      <DropdownMenuItem 
                        onClick={() => {
                          setDeleteSkierId(skier.id);
                          setDeleteSkierName(skier.name);
                        }}
                        className="text-red-600 focus:text-red-600"
                        data-testid={`button-delete-archived-${skier.id}`}
                      >
                        <Trash2 className="mr-2" size={16} />
                        Delete Skier
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              ))}
            </CollapsibleContent>
          </Collapsible>
        )}
      </main>

      <AlertDialog open={!!deleteSkierId} onOpenChange={(open) => !open && setDeleteSkierId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleteSkierName}?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this skier and all their notes. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDeleteConfirm}
              className="bg-red-600 hover:bg-red-700"
              data-testid="button-confirm-delete"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <FloatingActionButton onClick={handleAddSkier} />
    </div>
  );
}
