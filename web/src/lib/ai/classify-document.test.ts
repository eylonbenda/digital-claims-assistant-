import { describe, expect, it, vi } from "vitest";
import { CLAIMS_MODEL } from "@/lib/anthropic";
import { detectDocType, parseVerdict } from "./classify-document";

const BYTES = new Uint8Array([1, 2, 3, 4]);
const OTHER = { type: "other", detected: false };

function fake(create: (...args: unknown[]) => unknown) {
  const fn = vi.fn(create);
  return { client: { messages: { create: fn } } as never, fn };
}
const answering = (text: string) => fake(async () => ({ content: [{ type: "text", text }] }));

describe("parseVerdict", () => {
  it("accepts a confident allowlisted type", () => {
    expect(parseVerdict('{"type":"garage_invoice","confident":true}')).toEqual({
      type: "garage_invoice", detected: true,
    });
  });
  it("files an unsure answer as other", () => {
    expect(parseVerdict('{"type":"garage_invoice","confident":false}')).toEqual(OTHER);
  });
  it("files an unknown type, malformed JSON and an explicit other as other", () => {
    expect(parseVerdict('{"type":"made_up","confident":true}')).toEqual(OTHER);
    expect(parseVerdict("not json")).toEqual(OTHER);
    expect(parseVerdict('{"type":"other","confident":true}')).toEqual(OTHER);
  });
});

describe("detectDocType", () => {
  it("returns the model's verdict for a PDF, sent as a document block on the claims model", async () => {
    const { client, fn } = answering('{"type":"appraiser_report","confident":true}');
    expect(await detectDocType(BYTES, "pdf", { client })).toEqual({
      type: "appraiser_report", detected: true,
    });
    const req = fn.mock.calls[0][0] as { model: string; messages: { content: { type: string; source: { media_type: string; data: string } }[] }[] };
    expect(req.model).toBe(CLAIMS_MODEL);
    const block = req.messages[0].content[0];
    expect(block.type).toBe("document");
    expect(block.source.media_type).toBe("application/pdf");
    expect(block.source.data).toBe(Buffer.from(BYTES).toString("base64"));
  });

  it("sends a JPEG as an image block", async () => {
    const { client, fn } = answering('{"type":"car_photo","confident":true}');
    await detectDocType(BYTES, "jpeg", { client });
    const req = fn.mock.calls[0][0] as { messages: { content: { type: string; source: { media_type: string } }[] }[] };
    expect(req.messages[0].content[0]).toMatchObject({ type: "image", source: { media_type: "image/jpeg" } });
  });

  it("never sends a HEIC — the model cannot read it", async () => {
    const { client, fn } = answering('{"type":"car_photo","confident":true}');
    expect(await detectDocType(BYTES, "heic", { client })).toEqual(OTHER);
    expect(fn).not.toHaveBeenCalled();
  });

  it("files as other when no API key is configured", async () => {
    expect(await detectDocType(BYTES, "pdf", { client: null })).toEqual(OTHER);
  });

  it("files as other when the call fails", async () => {
    const { client } = fake(async () => { throw new Error("529 overloaded"); });
    expect(await detectDocType(BYTES, "pdf", { client })).toEqual(OTHER);
  });

  it("files as other when the call outlasts the timeout", async () => {
    const { client } = fake(() => new Promise(() => {}));
    expect(await detectDocType(BYTES, "pdf", { client, timeoutMs: 20 })).toEqual(OTHER);
  });
});
