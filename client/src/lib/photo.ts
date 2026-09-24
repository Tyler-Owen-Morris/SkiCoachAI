import { Camera, MediaTypeSelection } from "@capacitor/camera";
import { isNative } from "@/voice/recorder";

export type PhotoSource = "camera" | "library";

export interface SkierPhotoData {
  photo: string;
  thumb: string;
}

// Big enough to recognize someone on a phone screen, small enough to sync on
// one bar of signal (~100 KB).
const PHOTO_MAX = 900;
const THUMB_SIZE = 192;

function isCancel(err: unknown) {
  const text = `${(err as { code?: string })?.code ?? ""} ${err instanceof Error ? err.message : String(err)}`;
  return /cancel/i.test(text) || /CAMR-0006/.test(text);
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Couldn't read that photo"));
    img.src = src;
  });
}

function toJpeg(img: HTMLImageElement, max: number, square: boolean, quality: number) {
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  let sx = 0;
  let sy = 0;
  let sw = w;
  let sh = h;
  let outW: number;
  let outH: number;
  if (square) {
    // Center crop for avatars.
    const side = Math.min(w, h);
    sx = (w - side) / 2;
    sy = (h - side) / 2;
    sw = sh = side;
    outW = outH = Math.min(max, side);
  } else {
    const scale = Math.min(1, max / Math.max(w, h));
    outW = Math.round(w * scale);
    outH = Math.round(h * scale);
  }
  const canvas = document.createElement("canvas");
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Couldn't process the photo");
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, outW, outH);
  return canvas.toDataURL("image/jpeg", quality);
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

// Returns null if the coach cancels.
export async function pickSkierPhoto(source: PhotoSource): Promise<SkierPhotoData | null> {
  let src: string | null = null;
  if (isNative()) {
    try {
      if (source === "camera") {
        const result = await Camera.takePhoto({
          quality: 85,
          targetWidth: 1600,
          targetHeight: 1600,
          correctOrientation: true,
        });
        src = result.webPath ?? (result.thumbnail ? `data:image/jpeg;base64,${result.thumbnail}` : null);
      } else {
        const { results } = await Camera.chooseFromGallery({ mediaType: MediaTypeSelection.Photo, limit: 1 });
        const first = results[0];
        src = first?.webPath ?? (first?.thumbnail ? `data:image/jpeg;base64,${first.thumbnail}` : null);
      }
    } catch (err) {
      if (isCancel(err)) return null;
      throw err;
    }
  } else {
    src = await pickFileInBrowser(source);
  }
  if (!src) return null;
  const img = await loadImage(src);
  return {
    photo: toJpeg(img, PHOTO_MAX, false, 0.75),
    thumb: toJpeg(img, THUMB_SIZE, true, 0.7),
  };
}
