import type Anthropic from "@anthropic-ai/sdk";
import { CLAIMS_MODEL, getAnthropic } from "@/lib/anthropic";
import type { SniffKind } from "@/lib/files/sniff";

// What the Messages API accepts as a file block. HEIC is storable but not
// readable by the model, so it is never sent.
const IMAGE_MEDIA: Partial<Record<SniffKind, "image/jpeg" | "image/png" | "image/webp">> = {
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

function fileBlock(bytes: Uint8Array, kind: SniffKind) {
  const data = Buffer.from(bytes).toString("base64");
  if (kind === "pdf") {
    return {
      type: "document" as const,
      source: { type: "base64" as const, media_type: "application/pdf" as const, data },
    };
  }
  const media = IMAGE_MEDIA[kind];
  return media
    ? { type: "image" as const, source: { type: "base64" as const, media_type: media, data } }
    : null;
}

export type FileClient = Pick<Anthropic, "messages"> | null;

export type FileQuestion = {
  system: string;
  question: string;
  schema: Record<string, unknown>;
  maxTokens: number;
  timeoutMs: number;
};

// One structured question about one uploaded file. Resolves to the model's JSON
// text, or null when there is nothing to trust: an unreadable format, no API key,
// an error, or a call that outlasts the timeout. Never throws — callers sit on an
// upload path that must succeed whatever the model does.
// `client`: undefined → the configured client; null → behave as if no key is set.
export async function askAboutFile(
  bytes: Uint8Array,
  kind: SniffKind,
  q: FileQuestion,
  client?: FileClient,
): Promise<string | null> {
  const block = fileBlock(bytes, kind);
  if (!block) return null;
  const anthropic = client === undefined ? getAnthropic() : client;
  if (!anthropic) return null;

  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const call = anthropic.messages.create(
      {
        model: CLAIMS_MODEL,
        max_tokens: q.maxTokens,
        system: q.system,
        messages: [{ role: "user", content: [block, { type: "text", text: q.question }] }],
        output_config: { format: { type: "json_schema", schema: q.schema } },
      },
      { timeout: q.timeoutMs, maxRetries: 0 },
    );
    const timeout = new Promise<null>((resolve) => {
      timer = setTimeout(() => resolve(null), q.timeoutMs);
    });
    const res = await Promise.race([call, timeout]);
    if (!res) return null;
    const text = res.content.find((b) => b.type === "text");
    return text && text.type === "text" ? text.text : null;
  } catch {
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}
