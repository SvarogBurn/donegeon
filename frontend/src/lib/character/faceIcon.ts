import { FACE_ICON_MAX } from "../../../../shared/constants";
import { FACE, type Pixel } from "./compose";

/** Art pixels stay sharp this big, where a phone would blur a 21x21 picture stretched to its icon's size. */
const SCALE = 8;
/** stone-200: a dark face would vanish into a dark notification shade with nothing behind it. */
const BACKGROUND = "#e7e5e4";

/** A face as a PNG data URL, for a notification's icon. Undefined if it can't be drawn or wouldn't fit in a push: the cheer goes without. */
export function faceIcon(pixels: Pixel[]) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = FACE * SCALE;
  const paint = canvas.getContext("2d");
  if (!paint) return undefined;
  paint.fillStyle = BACKGROUND;
  paint.fillRect(0, 0, canvas.width, canvas.height);
  for (const { x, y, w, fill } of pixels) {
    paint.fillStyle = fill;
    paint.fillRect(x * SCALE, y * SCALE, w * SCALE, SCALE);
  }
  const url = canvas.toDataURL("image/png");
  return url.length <= FACE_ICON_MAX ? url : undefined;
}
