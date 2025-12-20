import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { isUnauthorizedError } from "@/lib/authUtils";
import { apiRequest } from "@/lib/queryClient";
import { ArrowLeft, MoreVertical, Sparkles, Archive, Trash2 } from "lucide-react";
import VoiceRecorder from "@/components/voice-recorder";
import LoadingOverlay from "@/components/loading-overlay";
import { Button } from "@/components/ui/button";
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
import { formatDistanceToNow } from "date-fns";
import { useEffect, useState } from "react";

interface Note {
  id: string;
  content: string;
  createdAt: string;
}

interface Summary {
  id: string;
  content: string;
  createdAt: string;
}

interface Skier {
  id: string;
  name: string;
  level: string;
  age?: number;
}

export default function SkierDetail({ params }: { params: { id: string } }) {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
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
  }, [isAuthenticated, authLoading, toast]);

  const { data: skier, isLoading: skierLoading } = useQuery<Skier>({
    queryKey: ["/api/skiers", params.id],
    enabled: isAuthenticated,
  });

  const { data: notes, isLoading: notesLoading } = useQuery<Note[]>({
    queryKey: ["/api/skiers", params.id, "notes"],
    enabled: isAuthenticated,
  });

  const { data: summary } = useQuery<Summary>({
    queryKey: ["/api/skiers", params.id, "summary"],
    enabled: isAuthenticated,
  });

  const createNoteMutation = useMutation({
    mutationFn: async (content: string) => {
      await apiRequest("POST", `/api/skiers/${params.id}/notes`, { content });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/skiers", params.id, "notes"],
      });
      toast({
        title: "Success",
        description: "Voice note saved successfully!",
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
        description: "Failed to save voice note.",
        variant: "destructive",
      });
    },
  });

  const generateSummaryMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", `/api/skiers/${params.id}/summary`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/skiers", params.id, "summary"],
      });
      toast({
        title: "Success",
        description: "AI summary generated!",
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
        description: "Failed to generate summary.",
        variant: "destructive",
      });
    },
  });

  const archiveMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", `/api/skiers/${params.id}/archive`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/skiers"] });
      toast({
        title: "Success",
        description: "Skier archived successfully!",
      });
      setLocation("/");
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
        description: "Failed to archive skier.",
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("DELETE", `/api/skiers/${params.id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/skiers"] });
      toast({
        title: "Success",
        description: "Skier deleted successfully!",
      });
      setLocation("/");
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

  const handleSaveNote = (content: string) => {
    createNoteMutation.mutate(content);
  };

  const handleArchive = () => {
    archiveMutation.mutate();
  };

  const handleDelete = () => {
    setShowDeleteDialog(false);
    deleteMutation.mutate();
  };

  const handleGenerateSummary = () => {
    if (!notes || notes.length === 0) {
      toast({
        title: "Error",
        description: "No notes available to summarize.",
        variant: "destructive",
      });
      return;
    }
    generateSummaryMutation.mutate();
  };

  const goBack = () => {
    setLocation("/");
  };

  if (authLoading || skierLoading || notesLoading) {
    return <LoadingOverlay />;
  }

  if (!skier) {
    return (
      <div className="min-h-screen bg-neutral-50 flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-xl font-medium text-neutral-800 mb-2">
            Skier not found
          </h2>
          <Button onClick={goBack} variant="outline">
            Go Back
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-50">
      {/* Header with back button */}
      <div className="bg-white border-b border-neutral-200 px-4 py-4">
        <div className="flex items-center space-x-4">
          <button
            onClick={goBack}
            className="p-2 rounded-full hover:bg-neutral-100 transition-colors"
          >
            <ArrowLeft className="text-neutral-600" size={20} />
          </button>
          <div className="flex-1">
            <h2 className="text-lg font-medium text-neutral-800">
              {skier.name}
            </h2>
            <p className="text-sm text-neutral-600">{skier.level} Level</p>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button 
                className="p-2 rounded-full hover:bg-neutral-100 transition-colors"
                data-testid="button-skier-menu"
              >
                <MoreVertical className="text-neutral-600" size={20} />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem 
                onClick={handleArchive}
                data-testid="button-archive-skier"
              >
                <Archive className="mr-2" size={16} />
                Archive Skier
              </DropdownMenuItem>
              <DropdownMenuItem 
                onClick={() => setShowDeleteDialog(true)}
                className="text-red-600 focus:text-red-600"
                data-testid="button-delete-skier"
              >
                <Trash2 className="mr-2" size={16} />
                Delete Skier
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {skier.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this skier and all their notes. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDelete}
              className="bg-red-600 hover:bg-red-700"
              data-testid="button-confirm-delete"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div className="p-4 space-y-6">
        {/* Voice Recording Section */}
        <VoiceRecorder onSave={handleSaveNote} />

        {/* Recent Notes */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-medium text-neutral-800">
              Recent Notes
            </h3>
            <Button
              onClick={handleGenerateSummary}
              disabled={
                generateSummaryMutation.isPending ||
                !notes ||
                notes.length === 0
              }
              variant="outline"
              size="sm"
              className="text-primary hover:text-primary-dark"
            >
              {generateSummaryMutation.isPending ? (
                <>Generating...</>
              ) : (
                <>
                  <Sparkles size={16} className="mr-1" />
                  Generate Summary
                </>
              )}
            </Button>
          </div>

          {/* AI Summary Section */}
          {summary && (
            <div className="bg-gradient-to-r from-primary to-secondary p-6 rounded-xl text-white">
              <div className="flex items-start space-x-3">
                <div className="w-8 h-8 bg-white bg-opacity-20 rounded-full flex items-center justify-center flex-shrink-0 mt-1">
                  <Sparkles size={16} />
                </div>
                <div className="flex-1">
                  <h4 className="font-medium mb-2">AI-Generated Summary</h4>
                  <p className="text-sm leading-relaxed opacity-90">
                    {summary.content}
                  </p>
                  <div className="flex items-center justify-between mt-4">
                    <span className="text-xs opacity-75">
                      {formatDistanceToNow(new Date(summary.createdAt), {
                        addSuffix: true,
                      })}
                    </span>
                    <button className="bg-white bg-opacity-20 hover:bg-opacity-30 px-3 py-1 rounded-full text-xs transition-colors">
                      Share Summary
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Notes List */}
          {!notes || notes.length === 0 ? (
            <div className="bg-white rounded-xl p-8 shadow-sm text-center">
              <h4 className="text-lg font-medium text-neutral-800 mb-2">
                No notes yet
              </h4>
              <p className="text-neutral-600">
                Record your first voice note to get started
              </p>
            </div>
          ) : (
            notes.map((note) => (
              <div
                key={note.id}
                className="bg-white rounded-xl p-4 shadow-sm border border-neutral-100"
              >
                <div className="flex justify-between items-start mb-2">
                  <span className="text-xs text-neutral-500">
                    {formatDistanceToNow(new Date(note.createdAt), {
                      addSuffix: true,
                    })}
                  </span>
                  <button className="text-neutral-400 hover:text-neutral-600">
                    <MoreVertical size={12} />
                  </button>
                </div>
                <p className="text-neutral-800 text-sm leading-relaxed">
                  {note.content}
                </p>
              </div>
            ))
          )}
        </div>
      </div>

      {(createNoteMutation.isPending || generateSummaryMutation.isPending) && (
        <LoadingOverlay />
      )}
    </div>
  );
}
