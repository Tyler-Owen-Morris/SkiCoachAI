import { useState } from "react";
import { Camera, ImageIcon, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { pickSkierPhoto, type PhotoSource, type SkierPhotoData } from "@/lib/photo";
import { useToast } from "@/hooks/use-toast";

interface PhotoButtonsProps {
  hasPhoto: boolean;
  onPicked(photo: SkierPhotoData): void | Promise<void>;
  onRemove?(): void | Promise<void>;
}

// "Take photo" / "Choose photo" (and "Remove" when there is one).
export default function PhotoButtons({ hasPhoto, onPicked, onRemove }: PhotoButtonsProps) {
  const [busy, setBusy] = useState(false);
  const { toast } = useToast();

  async function pick(source: PhotoSource) {
    setBusy(true);
    try {
      const photo = await pickSkierPhoto(source);
      if (photo) await onPicked(photo);
    } catch (err) {
      toast({
        title: "Couldn't get the photo",
        description:
          err instanceof Error && /denied|permission/i.test(err.message)
            ? "Allow camera and photo access for Ski Coach AI in the iPhone Settings app."
            : err instanceof Error
              ? err.message
              : String(err),
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap gap-2">
      <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => pick("camera")}>
        <Camera size={16} className="mr-1" /> {hasPhoto ? "Retake" : "Take photo"}
      </Button>
      <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => pick("library")}>
        <ImageIcon size={16} className="mr-1" /> Choose photo
      </Button>
      {hasPhoto && onRemove && (
        <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => onRemove()}>
          <Trash2 size={16} className="mr-1" /> Remove
        </Button>
      )}
    </div>
  );
}
