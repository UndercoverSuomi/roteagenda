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

    // JPEG kennt keine Transparenz — ohne Füllung würden transparente
    // PNG-Bereiche (Screenshots, Diagramme) schwarz. Weiß ist zudem der
    // beste Kontrast für die Texterkennung.
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
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

// Für den synchronen Erkennungs-Pfad (Route-Handler): Die Appwrite-Site
// bricht Requests nach ~30 s ab — je kleiner das Bild, desto schneller
// antwortet das Modell. Deshalb schrittweise verkleinern, bis das Bild
// unter das Byte-Budget passt.
const SYNC_MAX_DIMENSION = 1280;
const SYNC_MAX_BYTES = 350_000;

export async function fileToJpegBase64(
  file: File,
  maxDimension = SYNC_MAX_DIMENSION,
): Promise<string> {
  let blob = await fileToJpegBlob(file, maxDimension);

  for (const dimension of [1024, 800, 640]) {
    if (blob.size <= SYNC_MAX_BYTES) break;
    blob = await fileToJpegBlob(file, dimension);
  }

  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 0x8000;

  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }

  return btoa(binary);
}
