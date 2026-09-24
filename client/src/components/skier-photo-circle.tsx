import { useState } from "react";
import { Camera, ImageIcon, Trash2 } from "lucide-react";
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
import { pickPhotoSource, type PhotoSource, type SkierPhotoData } from "@/lib/photo";
import { useToast } from "@/hooks/use-toast";
import PhotoCropper from "./photo-cropper";

interface SkierPhotoCircleProps {
  name: string;
  src: string | null;
  // Diameter in CSS px.
  size: number;
  onChange(photo: SkierPhotoData): void | Promise<void>;
  onRemove(): void | Promise<void>;
}

// Round profile photo. Tap it to take or choose a photo (then position it in
// the circle); the trash icon in the corner removes it.
export default function SkierPhotoCircle({ name, src, size, onChange, onRemove }: SkierPhotoCircleProps) {
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const { toast } = useToast();
  const trashSize = Math.max(28, Math.round(size / 4));

  async function pick(source: PhotoSource) {
    try {
      const picked = await pickPhotoSource(source);
      if (picked) setCropSrc(picked);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      toast({
        title: "Couldn't get the photo",
        description: /denied|permission/i.test(message)
          ? "Allow camera and photo access for Ski Coach AI in the iPhone Settings app."
          : message,
        variant: "destructive",
      });
    }
  }

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            className="w-full h-full rounded-full overflow-hidden bg-neutral-100 border-4 border-white shadow-md flex items-center justify-center"
            aria-label={src ? `Change photo of ${name}` : `Add a photo of ${name}`}
          >
            {src ? (
              <img src={src} alt={name} className="w-full h-full object-cover" />
            ) : (
              <span className="flex flex-col items-center text-neutral-500">
                <Camera size={Math.round(size / 4.5)} />
                <span className="text-xs mt-1">Add photo</span>
              </span>
            )}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="center">
          <DropdownMenuItem onClick={() => pick("camera")}>
            <Camera size={14} className="mr-2" /> Take photo
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => pick("library")}>
            <ImageIcon size={14} className="mr-2" /> Choose photo
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {src && (
        <button
          onClick={() => setConfirmRemove(true)}
          className="absolute bottom-0 right-0 rounded-full bg-white border border-neutral-200 shadow flex items-center justify-center text-neutral-500"
          style={{ width: trashSize, height: trashSize }}
          aria-label="Remove photo"
        >
          <Trash2 size={Math.round(trashSize / 2.2)} />
        </button>
      )}

      <PhotoCropper
        src={cropSrc}
        onCancel={() => setCropSrc(null)}
        onDone={async (photo) => {
          setCropSrc(null);
          await onChange(photo);
        }}
      />

      <AlertDialog open={confirmRemove} onOpenChange={setConfirmRemove}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove photo?</AlertDialogTitle>
            <AlertDialogDescription>You can add a new one any time.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => onRemove()}>Remove</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
