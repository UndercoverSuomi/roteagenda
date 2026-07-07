// Verkleinert ein Foto clientseitig zu einem kompakten JPEG (Base64),
// bevor es an die Foto-Erkennungs-Route geht. Für Texterkennung reichen
// 1600 px an der langen Kante völlig aus.

const MAX_DIMENSION = 1600;
const JPEG_QUALITY = 0.8;

export async function fileToJpegBase64(
  file: File,
  maxDimension = MAX_DIMENSION,
): Promise<string> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error("Dieses Bildformat wird vom Browser nicht unterstützt.");
  }

  try {
    const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("Bildverarbeitung wird von diesem Browser nicht unterstützt.");
    }

    context.drawImage(bitmap, 0, 0, width, height);

    const dataUrl = canvas.toDataURL("image/jpeg", JPEG_QUALITY);
    const base64 = dataUrl.split(",")[1];
    if (!base64) {
      throw new Error("Das Bild konnte nicht umgewandelt werden.");
    }

    return base64;
  } finally {
    bitmap.close();
  }
}
