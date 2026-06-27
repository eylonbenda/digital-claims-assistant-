import type { NextRequest } from "next/server";
import { templates, fillForm } from "@/lib/formfill";
import type { Template } from "@/lib/formfill/engine";
import sampleClaim from "@/lib/formfill/sample-claim";

export const runtime = "nodejs"; // needs fs to read the template PDF + font

function resolve(insurer: string): Template | undefined {
  return templates[insurer as keyof typeof templates];
}

async function pdfResponse(template: Template, data: unknown, insurer: string) {
  const pdf = await fillForm(template, data);
  // Copy into a fresh ArrayBuffer-backed view so the bytes satisfy BlobPart's typing.
  const body = new Blob([new Uint8Array(pdf)], { type: "application/pdf" });
  return new Response(body, {
    headers: {
      "content-disposition": `inline; filename="${insurer}-accident-notice.pdf"`,
    },
  });
}

function notFound(insurer: string) {
  return Response.json(
    { error: `unknown insurer: ${insurer}`, available: Object.keys(templates) },
    { status: 404 }
  );
}

// GET — fill with the demo claim (preview).
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ insurer: string }> }
) {
  const { insurer } = await params;
  const template = resolve(insurer);
  return template ? pdfResponse(template, sampleClaim, insurer) : notFound(insurer);
}

// POST — fill with the canonical claim data in the request body.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ insurer: string }> }
) {
  const { insurer } = await params;
  const template = resolve(insurer);
  if (!template) return notFound(insurer);
  const data = await req.json().catch(() => ({}));
  return pdfResponse(template, data, insurer);
}
