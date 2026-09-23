import { useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { Cloud, CloudOff, MoreVertical, Pencil, Smartphone, Sparkles, Trash2, UserRound } from "lucide-react";
import { getServices, afterLocalWrite } from "@/app/services";
import { assignNote, deleteNote, editNoteContent, type Note, type Skier } from "@/data/repo";
import { deleteAudio } from "@/voice/recorder";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";

interface NoteCardProps {
  note: Note;
  skiers: Skier[];
  // Show which skier it's filed under (used in the inbox).
  showSkier?: boolean;
  // Unsynced ops for this note, from the outbox.
  waiting?: boolean;
}

function Tag({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] text-neutral-600">
      {icon}
      {children}
    </span>
  );
}

export default function NoteCard({ note, skiers, showSkier, waiting }: NoteCardProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(note.content);
  const [assigning, setAssigning] = useState(false);
  const { toast } = useToast();
  const skier = skiers.find((s) => s.id === note.skierId);
  const needsCoach = !skier || note.assignmentStatus === "ai-uncertain";
  const showAssign = assigning || (showSkier && needsCoach);

  async function saveEdit() {
    await editNoteContent(getServices().db, note.id, draft.trim());
    afterLocalWrite();
    setEditing(false);
  }

  async function reassign(skierId: string) {
    await assignNote(getServices().db, note.id, skierId);
    afterLocalWrite();
    setAssigning(false);
    toast({ title: `Moved to ${skiers.find((s) => s.id === skierId)?.name ?? "skier"}` });
  }

  async function remove() {
    const audio = await deleteNote(getServices().db, note.id);
    if (audio) await deleteAudio(audio);
    afterLocalWrite();
  }

  const sourceTag = !note.content ? null : note.transcriptSource === "cloud" ? (
      <Tag icon={<Cloud size={11} />}>Cloud transcript</Tag>
    ) : note.transcriptSource === "device" ? (
      <Tag icon={<Smartphone size={11} />}>On-device transcript</Tag>
    ) : null;

  return (
    <div className="bg-white rounded-xl p-4 shadow-sm border border-neutral-100">
      <div className="flex justify-between items-start gap-2 mb-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-neutral-500">
            {formatDistanceToNow(new Date(note.recordedAt), { addSuffix: true })}
          </span>
          {showSkier && (
            <Tag icon={<UserRound size={11} />}>{skier ? skier.name : "No skier yet"}</Tag>
          )}
          {sourceTag}
          {note.assignmentStatus === "local-guess" && <Tag icon={<UserRound size={11} />}>Name guess</Tag>}
          {note.assignmentStatus === "ai" && <Tag icon={<Sparkles size={11} />}>Filed by AI</Tag>}
          {note.assignmentStatus === "ai-uncertain" && <Tag icon={<Sparkles size={11} />}>AI unsure — check</Tag>}
          {waiting && <Tag icon={<CloudOff size={11} />}>Not synced yet</Tag>}
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="p-1 -m-1 text-neutral-400" aria-label="Note actions">
              <MoreVertical size={16} />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              onClick={() => {
                setDraft(note.content);
                setEditing(true);
              }}
            >
              <Pencil size={14} className="mr-2" /> Edit text
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setAssigning(true)}>
              <UserRound size={14} className="mr-2" /> Assign to skier
            </DropdownMenuItem>
            <DropdownMenuItem className="text-red-600" onClick={remove}>
              <Trash2 size={14} className="mr-2" /> Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <p className="text-neutral-800 text-sm leading-relaxed whitespace-pre-wrap">
        {note.content || <span className="italic text-neutral-500">No transcript yet — audio saved, will transcribe when online.</span>}
      </p>

      {showAssign && (
        <div className="mt-3">
          <Select onValueChange={reassign}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder={note.skierId ? "Confirm or change skier" : "Assign to a skier"} />
            </SelectTrigger>
            <SelectContent>
              {skiers.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <Dialog open={editing} onOpenChange={setEditing}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit note</DialogTitle>
          </DialogHeader>
          <Textarea rows={6} value={draft} onChange={(e) => setDraft(e.target.value)} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(false)}>
              Cancel
            </Button>
            <Button onClick={saveEdit}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
