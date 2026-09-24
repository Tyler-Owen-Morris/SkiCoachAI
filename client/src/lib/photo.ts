import { Camera, MediaTypeSelection } from "@capacitor/camera";
import { isNative } from "@/voice/recorder";

export type PhotoSource = "camera" | "library";

export interface SkierPhotoData {
  photo: string;
  thumb: string;
}

// The part of the source image (in source pixels) that fills the circle.
export interface SquareCrop {
  x: number;
  y: number;
  size: number;
}

// Profile photos are shown in circles: a 640px square is sharp on any phone
// and ~60 KB, so it syncs on one bar of signal.
const PHOTO_SIZE = 640;
const THUMB_SIZE = 192;

function isCancel(err: unknown) {
  const text = `${(err as { code?: string })?.code ?? ""} ${err instanceof Error ? err.message : String(err)}`;
  return /cancel/i.test(text) || /CAMR-0006/.test(text);
}

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Couldn't read that photo"));
    img.src = src;
  });
}

// Browser build: a plain file input (with the camera hint on phones).
function pickFileInBrowser(source: PhotoSource): Promise<string | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    if (source === "camera") input.setAttribute("capture", "environment");
    input.onchange = () => {
      const file = input.files?.[0];
      resolve(file ? URL.createObjectURL(file) : null);
    };
    input.click();
  });
}

// Opens the camera or photo library. Returns an image URL, or null if the
// coach cancels.
export async function pickPhotoSource(source: PhotoSource): Promise<string | null> {
  if (!isNative()) return pickFileInBrowser(source);
  try {
    if (source === "camera") {
      const result = await Camera.takePhoto({
        quality: 85,
        targetWidth: 1600,
        targetHeight: 1600,
        correctOrientation: true,
      });
      return result.webPath ?? (result.thumbnail ? `data:image/jpeg;base64,${result.thumbnail}` : null);
    }
    const { results } = await Camera.chooseFromGallery({ mediaType: MediaTypeSelection.Photo, limit: 1 });
    const first = results[0];
    return first?.webPath ?? (first?.thumbnail ? `data:image/jpeg;base64,${first.thumbnail}` : null);
  } catch (err) {
    if (isCancel(err)) return null;
    throw err;
  }
}

function drawSquare(img: HTMLImageElement, crop: SquareCrop, size: number, quality: number) {
  const out = Math.round(Math.min(size, crop.size));
  const canvas = document.createElement("canvas");
  canvas.width = out;
  canvas.height = out;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Couldn't process the photo");
  ctx.drawImage(img, crop.x, crop.y, crop.size, crop.size, 0, 0, out, out);
  return canvas.toDataURL("image/jpeg", quality);
}

// Turns the chosen square of the source image into the stored photo + thumbnail.
export function cropSkierPhoto(img: HTMLImageElement, crop: SquareCrop): SkierPhotoData {
  return {
    photo: drawSquare(img, crop, PHOTO_SIZE, 0.8),
    thumb: drawSquare(img, crop, THUMB_SIZE, 0.7),
  };
}
