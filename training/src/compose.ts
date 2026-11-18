import type { RecordedSegment } from "./record.ts";
export async function composeVideo(segments: RecordedSegment[], _outPath: string): Promise<void> {
  console.log("compose not built yet; segments:", segments.map((s) => s.file).join(", "));
  process.exit(0);
}
