// Raw attachment bytes. Outbound: the provider's cap is higher, but the packet
// also has to fit the insurer's mailbox. Inbound: above this the message is
// stored without its attachments and flagged.
export const OUTBOUND_MAX_BYTES = 20 * 1024 * 1024;
export const INBOUND_MAX_BYTES = 25 * 1024 * 1024;

export function overBudget(sizes: number[], max: number): boolean {
  return sizes.reduce((sum, n) => sum + n, 0) > max;
}

// Storage object name for the n-th attachment of a message. The original filename
// is third-party input (path characters, Hebrew, anything); it is kept in the
// database row and never used as a path.
export function storageName(index: number, filename: string): string {
  const safe = filename
    .replace(/[^A-Za-z0-9._-]/g, "_")
    .replace(/\.{2,}/g, ".")
    .replace(/^[._]+/, "")
    .slice(-80);
  return `${index}-${safe || "file"}`;
}
