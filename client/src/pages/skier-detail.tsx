import { useState } from "react";
import { useLocation } from "wouter";
import { Archive, ArchiveRestore, ArrowLeft, MoreVertical, Pencil, Trash2 } from "lucide-react";
import type { Equipment } from "@shared/sync";
import { getServices, afterLocalWrite } from "@/app/services";
import { useLocal, useSyncStatus } from "@/app/hooks";
import {
  deleteSkier,
  getSkier,
  getSkierPhoto,
  latestReadySummary,
  latestSummary,
  listNotesForSkier,
  listSkiers,
  noteCountsByEquipment,
  requestSummary,
  setSkierArchived,
  setSkierPhoto,
  unsyncedNoteIds,
} from "@/data/repo";
import type { SkierPhotoData } from "@/lib/photo";
import SkierPhotoCircle from "@/components/skier-photo-circle";
import EquipmentToggle from "@/components/equipment-toggle";
import { RecordBar } from "@/components/bottom-navigation";
import LoadingOverlay from "@/components/loading-overlay";
import NoteCard from "@/components/note-card";
import SummaryCard from "@/components/summary-card";
import SyncBadge from "@/components/sync-badge";
import { Button } from "@/components/ui/button";
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

// Everything a coach needs to recognize a skier is at the top (photo, name,
// notes about them), then the AI summary, then every note. Ski and snowboard
// notes and summaries are kept apart; the switch picks which set is shown and
// which set the pinned mic records into.
export default function SkierDetail({ params }: { params: { id: string } }) {
  const [, setLocation] = useLocation();
  const [confirmDelete, setConfirmDelete] = useState(false);
  // null = follow what they currently ride.
  const [viewed, setViewed] = useState<Equipment | null>(null);
  const status = useSyncStatus();
  const { data: skier, isLoading } = useLocal(["skier", params.id], (db) => getSkier(db, params.id));
  const tab: Equipment = viewed ?? skier?.equipment ?? "ski";
  const { data: notes = [] } = useLocal(["notes", params.id, tab], (db) => listNotesForSkier(db, params.id, tab));
  const { data: counts = { ski: 0, snowboard: 0 } } = useLocal(["note-counts", params.id], (db) =>
    noteCountsByEquipment(db, params.id),
  );
  const { data: summary = null } = useLocal(["summary", params.id, tab], (db) => latestSummary(db, params.id, tab));
  const { data: ready = null } = useLocal(["summary-ready", params.id, tab], (db) =>
    latestReadySummary(db, params.id, tab),
  );
  const { data: skiers = [] } = useLocal(["skiers"], listSkiers);
  const { data: unsynced } = useLocal(["unsynced"], unsyncedNoteIds);
  const { data: photo = null } = useLocal(["photo", params.id], (db) => getSkierPhoto(db, params.id));

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

  const firstName = skier.name.split(" ")[0];

  async function generateSummary() {
    await requestSummary(getServices().db, params.id, tab);
    afterLocalWrite();
  }

  async function setArchived(archived: boolean) {
    await setSkierArchived(getServices().db, params.id, archived);
    afterLocalWrite();
  }

  async function savePhoto(picked: SkierPhotoData) {
    await setSkierPhoto(getServices().db, params.id, picked);
    afterLocalWrite();
  }

  async function removePhoto() {
    await setSkierPhoto(getServices().db, params.id, null);
    afterLocalWrite();
  }

  async function removeSkier() {
    await deleteSkier(getServices().db, params.id);
    afterLocalWrite();
    setLocation("/");
  }

  return (
    <div className="min-h-screen bg-neutral-50 pb-36">
      <header className="bg-white border-b border-neutral-200 sticky top-0 z-40 safe-top">
        <div className="px-4 py-3 flex items-center gap-3">
          <button
            onClick={() => setLocation("/")}
            className="p-2 -ml-2 rounded-full hover:bg-neutral-100"
            aria-label="Back"
          >
            <ArrowLeft className="text-neutral-600" size={20} />
          </button>
          <h1 className="flex-1 min-w-0 text-base font-medium text-neutral-800 truncate">{skier.name}</h1>
          <SyncBadge />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="p-2 -mr-2 rounded-full hover:bg-neutral-100" aria-label="Skier actions">
                <MoreVertical className="text-neutral-600" size={20} />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setLocation(`/skier/${skier.id}/edit`)}>
                <Pencil size={14} className="mr-2" /> Edit details
              </DropdownMenuItem>
              {skier.archivedAt ? (
                <DropdownMenuItem onClick={() => setArchived(false)}>
                  <ArchiveRestore size={14} className="mr-2" /> Unarchive skier
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem onClick={() => setArchived(true)}>
                  <Archive size={14} className="mr-2" /> Archive skier
                </DropdownMenuItem>
              )}
              <DropdownMenuItem className="text-red-600" onClick={() => setConfirmDelete(true)}>
                <Trash2 size={14} className="mr-2" /> Remove skier
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      <div className="p-4 space-y-5">
        {skier.archivedAt && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-center gap-3">
            <Archive className="text-amber-700 shrink-0" size={18} />
            <p className="text-sm text-amber-900 flex-1">
              Archived. Quick voice notes from the home screen won't be matched to {firstName}.
            </p>
            <Button size="sm" variant="outline" onClick={() => setArchived(false)}>
              Unarchive
            </Button>
          </div>
        )}

        {/* Who they are: photo, name, and the coach's notes for spotting them. */}
        <section className="bg-white rounded-xl shadow-sm p-5 flex flex-col items-center text-center">
          <SkierPhotoCircle
            name={skier.name}
            src={photo?.photo ?? photo?.thumb ?? null}
            size={144}
            onChange={savePhoto}
            onRemove={removePhoto}
          />
          <h2 className="mt-3 text-xl font-semibold text-neutral-800">{skier.name}</h2>
          <p className="text-sm text-neutral-600 capitalize">
            {skier.level} {skier.equipment === "snowboard" ? "snowboarder" : "skier"}
            {skier.age ? ` · age ${skier.age}` : ""}
          </p>
          {skier.initialNotes ? (
            <p className="mt-3 text-sm text-neutral-700 whitespace-pre-wrap">{skier.initialNotes}</p>
          ) : (
            <button
              onClick={() => setLocation(`/skier/${skier.id}/edit`)}
              className="mt-3 text-sm text-primary"
            >
              Add how to spot {firstName}
            </button>
          )}
        </section>

        <EquipmentToggle value={tab} onChange={setViewed} counts={counts} />

        <SummaryCard
          summary={summary}
          ready={ready}
          noteCount={notes.length}
          waitingFor={
            !status.signedIn || status.authExpired ? "you sign in" : !status.online ? "you have signal" : null
          }
          onRequest={generateSummary}
        />

        <section className="space-y-3">
          <h3 className="text-lg font-medium text-neutral-800">
            {tab === "snowboard" ? "Snowboard" : "Ski"} notes ({notes.length})
          </h3>
          {notes.length === 0 ? (
            <div className="bg-white rounded-xl p-8 shadow-sm text-center">
              <h4 className="text-lg font-medium text-neutral-800 mb-2">No notes yet</h4>
              <p className="text-neutral-600">
                Tap the mic below to record a {tab === "snowboard" ? "snowboard" : "ski"} note about {firstName}.
              </p>
            </div>
          ) : (
            notes.map((note) => (
              <NoteCard key={note.id} note={note} skiers={skiers} waiting={unsynced?.has(note.id)} />
            ))
          )}
        </section>
      </div>

      <RecordBar skier={{ id: skier.id, name: skier.name, equipment: skier.equipment }} equipment={tab} />

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
