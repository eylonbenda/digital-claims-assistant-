// Magic-byte ("file signature") sniffing. A client-declared MIME type is untrusted, so we look at
// the actual leading bytes. Returns a coarse kind for accepted document formats, or null.
export type SniffKind = "jpeg" | "png" | "webp" | "heic" | "pdf";

export const SNIFF_MIME: Record<SniffKind, string> = {
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  heic: "image/heic",
  pdf: "application/pdf",
};

export const SNIFF_EXT: Record<SniffKind, string> = {
  jpeg: "jpg",
  png: "png",
  webp: "webp",
  heic: "heic",
  pdf: "pdf",
};

// HEIC/HEIF major brands (bytes 8–11, after the "ftyp" box marker at offset 4).
const HEIC_BRANDS = new Set(["heic", "heix", "heif", "hevc", "hevx", "mif1", "msf1"]);

export function sniffFileType(b: Uint8Array): SniffKind | null {
  if (b.length < 12) return null;
  const at = (i: number, s: string) => [...s].every((c, k) => b[i + k] === c.charCodeAt(0));

  // JPEG: FF D8 FF
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpeg";
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 &&
    b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a
  ) {
    return "png";
  }
  if (at(0, "%PDF")) return "pdf";
  if (at(0, "RIFF") && at(8, "WEBP")) return "webp"; // RIFF....WEBP
  if (at(4, "ftyp")) {
    const brand = String.fromCharCode(b[8], b[9], b[10], b[11]).toLowerCase();
    if (HEIC_BRANDS.has(brand)) return "heic";
  }
  return null;
}
