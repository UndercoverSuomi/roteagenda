// Verkleinert ein Foto clientseitig zu einem kompakten JPEG (Base64),
// bevor es an die Foto-Erkennungs-Route geht. Für Texterkennung reichen
// 1600 px an der langen Kante völlig aus.

const MAX_DIMENSION = 1600;
const JPEG_QUALITY = 0.8;

export async function fileToJpegBlob(
  file: File,
  maxDimension = MAX_DIMENSION,
): Promise<Blob> {
  let bitmap: ImageBitmap;
  try {
    // EXIF-Rotation anwenden — Hochformat-Handyfotos kämen sonst gekippt an.
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    try {
      bitmap = await createImageBitmap(file);
    } catch {
      throw new Error("Dieses Bildformat wird vom Browser nicht unterstützt.");
    }
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

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY),
    );
    if (!blob) {
      throw new Error("Das Bild konnte nicht umgewandelt werden.");
    }

    return blob;
  } finally {
    bitmap.close();
  }
}

export async function fileToJpegBase64(
  file: File,
  maxDimension = MAX_DIMENSION,
): Promise<string> {
  const blob = await fileToJpegBlob(file, maxDimension);
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 0x8000;

  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }

  return btoa(binary);
}
