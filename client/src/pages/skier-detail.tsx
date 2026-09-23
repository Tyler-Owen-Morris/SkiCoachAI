import { useState } from "react";
import { useLocation } from "wouter";
import { ArrowLeft, MoreVertical, Send, Trash2 } from "lucide-react";
import { getServices, afterLocalWrite } from "@/app/services";
import { useLocal, useSyncStatus } from "@/app/hooks";
import {
  addTypedNote,
  deleteSkier,
  getSkier,
  latestReadySummary,
  latestSummary,
  listNotesForSkier,
  listSkiers,
  requestSummary,
  unsyncedNoteIds,
} from "@/data/repo";
import VoiceCapture from "@/components/voice-capture";
import LoadingOverlay from "@/components/loading-overlay";
import NoteCard from "@/components/note-card";
import SummaryCard from "@/components/summary-card";
import SyncBadge from "@/components/sync-badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
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

export default function SkierDetail({ params }: { params: { id: string } }) {
  const [, setLocation] = useLocation();
  const [typed, setTyped] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const status = useSyncStatus();
  const { data: skier, isLoading } = useLocal(["skier", params.id], (db) => getSkier(db, params.id));
  const { data: notes = [] } = useLocal(["notes", params.id], (db) => listNotesForSkier(db, params.id));
  const { data: summary = null } = useLocal(["summary", params.id], (db) => latestSummary(db, params.id));
  const { data: ready = null } = useLocal(["summary-ready", params.id], (db) => latestReadySummary(db, params.id));
  const { data: skiers = [] } = useLocal(["skiers"], listSkiers);
  const { data: unsynced } = useLocal(["unsynced"], unsyncedNoteIds);

  if (isLoading) return <LoadingOverlay />;

  if (!skier || skier.deletedAt) {
    return (
      <div className="min-h-screen bg-neutral-50 flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-xl font-medium text-neutral-800 mb-2">Skier not found</h2>
          <Button onClick={() => setLocation("/")} variant="outline">
            Go back
          </Button>
        </div>
      </div>
    );
  }

  async function saveTyped() {
    const content = typed.trim();
    if (!content) return;
    await addTypedNote(getServices().db, params.id, content);
    setTyped("");
    afterLocalWrite();
  }

  async function generateSummary() {
    await requestSummary(getServices().db, params.id);
    afterLocalWrite();
  }

  async function removeSkier() {
    await deleteSkier(getServices().db, params.id);
    afterLocalWrite();
    setLocation("/");
  }

  return (
    <div className="min-h-screen bg-neutral-50 pb-10">
      <header className="bg-white border-b border-neutral-200 sticky top-0 z-40 safe-top">
        <div className="px-4 py-3 flex items-center gap-3">
          <button
            onClick={() => setLocation("/")}
            className="p-2 -ml-2 rounded-full hover:bg-neutral-100"
            aria-label="Back"
          >
            <ArrowLeft className="text-neutral-600" size={20} />
          </button>
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-medium text-neutral-800 truncate">{skier.name}</h2>
            <p className="text-sm text-neutral-600 capitalize">
              {skier.level}
              {skier.age ? ` · age ${skier.age}` : ""}
            </p>
          </div>
          <SyncBadge />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="p-2 -mr-2 rounded-full hover:bg-neutral-100" aria-label="Skier actions">
                <MoreVertical className="text-neutral-600" size={20} />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem className="text-red-600" onClick={() => setConfirmDelete(true)}>
                <Trash2 size={14} className="mr-2" /> Remove skier
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      <div className="p-4 space-y-6">
        <VoiceCapture skiers={skiers} fixedSkier={{ id: skier.id, name: skier.name }} />

        <div className="bg-white rounded-xl p-4 shadow-sm space-y-2">
          <Textarea
            rows={2}
            placeholder={`Or type a note about ${skier.name.split(" ")[0]}…`}
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
          />
          <div className="flex justify-end">
            <Button size="sm" disabled={!typed.trim()} onClick={saveTyped}>
              <Send size={14} className="mr-1" /> Save note
            </Button>
          </div>
        </div>

        <SummaryCard
          summary={summary}
          ready={ready}
          noteCount={notes.length}
          waitingFor={
            !status.signedIn || status.authExpired ? "you sign in" : !status.online ? "you have signal" : null
          }
          onRequest={generateSummary}
        />

        {skier.initialNotes && (
          <div className="bg-white rounded-xl p-4 shadow-sm">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-neutral-500 mb-1">Initial notes</h4>
            <p className="text-sm text-neutral-800 whitespace-pre-wrap">{skier.initialNotes}</p>
          </div>
        )}

        <section className="space-y-3">
          <h3 className="text-lg font-medium text-neutral-800">Notes ({notes.length})</h3>
          {notes.length === 0 ? (
            <div className="bg-white rounded-xl p-8 shadow-sm text-center">
              <h4 className="text-lg font-medium text-neutral-800 mb-2">No notes yet</h4>
              <p className="text-neutral-600">Record your first voice note above.</p>
            </div>
          ) : (
            notes.map((note) => (
              <NoteCard key={note.id} note={note} skiers={skiers} waiting={unsynced?.has(note.id)} />
            ))
          )}
        </section>
      </div>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {skier.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Their notes move to the "Needs a skier" inbox so nothing is lost.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={removeSkier}>Remove</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
