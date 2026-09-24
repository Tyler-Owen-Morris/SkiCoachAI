import { useState } from "react";
import { useLocation } from "wouter";
import { Archive, ChevronDown, ChevronRight, CircleX, Inbox, Mountain, Search, UserPlus, Users } from "lucide-react";
import { useLocal } from "@/app/hooks";
import { afterLocalWrite, getServices } from "@/app/services";
import { listArchivedSkiers, listInboxNotes, listSkiers, setSkierArchived, unsyncedNoteIds } from "@/data/repo";
import { Button } from "@/components/ui/button";
import SkierAvatar from "@/components/skier-avatar";
import { Input } from "@/components/ui/input";
import SkierCard from "@/components/skier-card";
import BottomNavigation from "@/components/bottom-navigation";
import LoadingOverlay from "@/components/loading-overlay";
import NoteCard from "@/components/note-card";
import SyncBadge from "@/components/sync-badge";

export default function Home() {
  const [searchQuery, setSearchQuery] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [, setLocation] = useLocation();
  const { data: skiers, isLoading } = useLocal(["skiers"], listSkiers);
  const { data: inbox = [] } = useLocal(["inbox"], listInboxNotes);
  const { data: unsynced } = useLocal(["unsynced"], unsyncedNoteIds);
  const { data: archived = [] } = useLocal(["skiers-archived"], listArchivedSkiers);

  if (isLoading || !skiers) return <LoadingOverlay />;

  const query = searchQuery.trim().toLowerCase();
  const filteredSkiers = skiers.filter((s) => s.name.toLowerCase().includes(query));
  const filteredArchived = archived.filter((s) => s.name.toLowerCase().includes(query));
  const archivedOpen = showArchived || (!!query && filteredArchived.length > 0);

  async function unarchive(id: string) {
    await setSkierArchived(getServices().db, id, false);
    afterLocalWrite();
  }
  const activeIds = new Set(skiers.map((s) => s.id));
  const totalNotes =
    skiers.reduce((sum, s) => sum + s.noteCount, 0) + inbox.filter((n) => !n.skierId || !activeIds.has(n.skierId)).length;

  return (
    <div className="min-h-screen bg-neutral-50 pb-36">
      <header className="bg-white shadow-sm border-b border-neutral-200 sticky top-0 z-40 safe-top">
        <div className="px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 bg-primary rounded-full flex items-center justify-center">
              <Mountain className="text-white" size={16} />
            </div>
            <h1 className="text-lg font-medium text-neutral-800">Ski Coach AI</h1>
          </div>
          <div className="flex items-center gap-2">
            <SyncBadge />
            <button
              onClick={() => setLocation("/add-skier")}
              className="p-2 -mr-2 rounded-full text-primary hover:bg-neutral-100"
              aria-label="Add skier"
            >
              <UserPlus size={22} />
            </button>
          </div>
        </div>
      </header>

      <main className="p-4 space-y-6">
        {inbox.length > 0 && (
          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <Inbox size={18} className="text-neutral-600" />
              <h2 className="text-lg font-medium text-neutral-800">Needs a skier</h2>
              <span className="text-sm text-neutral-500">{inbox.length}</span>
            </div>
            {inbox.map((note) => (
              <NoteCard key={note.id} note={note} skiers={skiers} showSkier waiting={unsynced?.has(note.id)} />
            ))}
          </section>
        )}

        <div className="grid grid-cols-2 gap-4">
          <div className="bg-white rounded-xl p-4 shadow-sm">
            <div className="text-2xl font-bold text-primary">{skiers.length}</div>
            <div className="text-sm text-neutral-600">Skiers</div>
          </div>
          <div className="bg-white rounded-xl p-4 shadow-sm">
            <div className="text-2xl font-bold text-secondary">{totalNotes}</div>
            <div className="text-sm text-neutral-600">Notes</div>
          </div>
        </div>

        {skiers.length + archived.length > 4 && (
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-400" size={16} />
            <Input
              type="text"
              inputMode="search"
              enterKeyHint="search"
              autoCorrect="off"
              placeholder="Search skiers..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-12 pr-12 py-3 bg-white rounded-xl border border-neutral-200"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-red-500"
                aria-label="Clear search"
              >
                <CircleX size={20} />
              </button>
            )}
          </div>
        )}

        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-medium text-neutral-800">Your skiers</h2>
            <span className="text-sm text-neutral-600">{filteredSkiers.length}</span>
          </div>

          {filteredSkiers.length === 0 ? (
            <div className="bg-white rounded-xl p-8 shadow-sm text-center">
              <Users className="mx-auto mb-4 text-neutral-400" size={48} />
              <h3 className="text-lg font-medium text-neutral-800 mb-2">
                {query ? "No skiers found" : "No skiers yet"}
              </h3>
              <p className="text-neutral-600 mb-4">
                {query
                  ? "Try a different name."
                  : "Add the skiers you coach so voice notes can be filed under them automatically."}
              </p>
              {!query && (
                <button
                  onClick={() => setLocation("/add-skier")}
                  className="bg-primary text-white px-6 py-2 rounded-lg"
                >
                  Add first skier
                </button>
              )}
            </div>
          ) : (
            filteredSkiers.map((skier) => (
              <SkierCard key={skier.id} skier={skier} onClick={() => setLocation(`/skier/${skier.id}`)} />
            ))
          )}
        </section>

        {archived.length > 0 && (
          <section className="space-y-3">
            <button
              onClick={() => setShowArchived((v) => !v)}
              className="flex items-center gap-2 text-neutral-600"
              aria-expanded={archivedOpen}
            >
              {archivedOpen ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
              <Archive size={16} />
              <span className="font-medium">Archived ({archived.length})</span>
            </button>
            {archivedOpen && (
              <>
                <p className="text-xs text-neutral-500">
                  Archived skiers keep all their notes but aren't matched when you record a quick voice note.
                </p>
                {filteredArchived.map((skier) => (
                  <div
                    key={skier.id}
                    className="flex items-center gap-3 bg-white/70 rounded-xl p-3 border border-neutral-100"
                  >
                    <button
                      onClick={() => setLocation(`/skier/${skier.id}`)}
                      className="flex flex-1 min-w-0 items-center gap-3 text-left opacity-75"
                    >
                      <SkierAvatar name={skier.name} thumb={skier.thumb} className="w-10 h-10" />
                      <div className="min-w-0">
                        <p className="font-medium text-neutral-800 truncate">{skier.name}</p>
                        <p className="text-xs text-neutral-500 capitalize">
                          {skier.level} • {skier.noteCount} {skier.noteCount === 1 ? "note" : "notes"}
                        </p>
                      </div>
                    </button>
                    <Button size="sm" variant="outline" onClick={() => unarchive(skier.id)}>
                      Unarchive
                    </Button>
                  </div>
                ))}
              </>
            )}
          </section>
        )}
      </main>

      <BottomNavigation active="home" />
    </div>
  );
}
