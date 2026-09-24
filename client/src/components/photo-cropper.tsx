import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Slider } from "@/components/ui/slider";
import { cropSkierPhoto, loadImage, type SkierPhotoData } from "@/lib/photo";

interface PhotoCropperProps {
  // Image URL to crop; the dialog is open while this is set.
  src: string | null;
  onCancel(): void;
  onDone(photo: SkierPhotoData): void;
}

const VIEW = 288; // on-screen size of the crop square, in CSS px
const MAX_ZOOM = 4;

interface View {
  zoom: number; // 1 = image just covers the circle
  x: number; // image center offset from the view center, in CSS px
  y: number;
}

// Drag to move, pinch (or the slider) to zoom, so the right face sits in the
// circle. The circle shows exactly what the profile picture will be.
export default function PhotoCropper({ src, onCancel, onDone }: PhotoCropperProps) {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [view, setView] = useState<View>({ zoom: 1, x: 0, y: 0 });
  const [error, setError] = useState<string | null>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ dist: number; zoom: number } | null>(null);

  useEffect(() => {
    setImg(null);
    setError(null);
    setView({ zoom: 1, x: 0, y: 0 });
    if (!src) return;
    loadImage(src)
      .then(setImg)
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, [src]);

  const baseScale = img ? VIEW / Math.min(img.naturalWidth, img.naturalHeight) : 1;

  // Keep the circle fully covered by the image.
  function clamp(next: View): View {
    if (!img) return next;
    const zoom = Math.min(MAX_ZOOM, Math.max(1, next.zoom));
    const scale = baseScale * zoom;
    const maxX = (img.naturalWidth * scale - VIEW) / 2;
    const maxY = (img.naturalHeight * scale - VIEW) / 2;
    return {
      zoom,
      x: Math.min(maxX, Math.max(-maxX, next.x)),
      y: Math.min(maxY, Math.max(-maxY, next.y)),
    };
  }

  function onPointerDown(e: React.PointerEvent) {
    (e.target as Element).setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinch.current = { dist: Math.hypot(a.x - b.x, a.y - b.y), zoom: view.zoom };
    }
  }

  function onPointerMove(e: React.PointerEvent) {
    const prev = pointers.current.get(e.pointerId);
    if (!prev) return;
    const point = { x: e.clientX, y: e.clientY };
    pointers.current.set(e.pointerId, point);
    if (pointers.current.size >= 2 && pinch.current) {
      const [a, b] = [...pointers.current.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const zoom = pinch.current.zoom * (dist / pinch.current.dist);
      setView((v) => clamp({ ...v, x: (v.x * zoom) / v.zoom, y: (v.y * zoom) / v.zoom, zoom }));
    } else {
      setView((v) => clamp({ ...v, x: v.x + point.x - prev.x, y: v.y + point.y - prev.y }));
    }
  }

  function onPointerUp(e: React.PointerEvent) {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
  }

  function onWheel(e: React.WheelEvent) {
    const zoom = view.zoom * (e.deltaY < 0 ? 1.08 : 1 / 1.08);
    setView((v) => clamp({ ...v, x: (v.x * zoom) / v.zoom, y: (v.y * zoom) / v.zoom, zoom }));
  }

  function done() {
    if (!img) return;
    const scale = baseScale * view.zoom;
    const size = VIEW / scale;
    const cx = img.naturalWidth / 2 - view.x / scale;
    const cy = img.naturalHeight / 2 - view.y / scale;
    onDone(cropSkierPhoto(img, { x: cx - size / 2, y: cy - size / 2, size }));
  }

  const scale = baseScale * view.zoom;

  return (
    <Dialog open={!!src} onOpenChange={(open) => !open && onCancel()}>
      <DialogContent className="max-w-sm">
        <DialogTitle>Position the photo</DialogTitle>
        <DialogDescription>Drag to move and pinch to zoom so their face fills the circle.</DialogDescription>
        <div
          className="relative mx-auto overflow-hidden rounded-lg bg-neutral-900 touch-none select-none"
          style={{ width: VIEW, height: VIEW }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onWheel={onWheel}
        >
          {img && (
            <img
              src={img.src}
              alt=""
              draggable={false}
              className="absolute max-w-none pointer-events-none"
              style={{
                width: img.naturalWidth * scale,
                height: img.naturalHeight * scale,
                left: VIEW / 2 - (img.naturalWidth * scale) / 2 + view.x,
                top: VIEW / 2 - (img.naturalHeight * scale) / 2 + view.y,
              }}
            />
          )}
          {/* Dim everything outside the circle. */}
          <div
            className="absolute inset-0 pointer-events-none rounded-full"
            style={{ boxShadow: "0 0 0 999px rgba(0,0,0,0.55)" }}
          />
          <div className="absolute inset-0 pointer-events-none rounded-full border-2 border-white/80" />
          {!img && !error && <p className="absolute inset-0 flex items-center justify-center text-white text-sm">Loading…</p>}
          {error && <p className="absolute inset-0 flex items-center justify-center text-white text-sm p-4">{error}</p>}
        </div>
        <Slider
          aria-label="Zoom"
          min={1}
          max={MAX_ZOOM}
          step={0.01}
          value={[view.zoom]}
          onValueChange={([zoom]) =>
            setView((v) => clamp({ ...v, x: (v.x * zoom) / v.zoom, y: (v.y * zoom) / v.zoom, zoom }))
          }
        />
        <div className="flex gap-2 justify-end">
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button onClick={done} disabled={!img}>
            Use photo
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
