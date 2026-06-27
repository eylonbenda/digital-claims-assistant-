import type { NextRequest } from "next/server";
import { analyzeClaim } from "@/lib/ai/analyze";
import type { ClaimData } from "@/lib/formfill/types";

export const runtime = "nodejs";
export const maxDuration = 60; // adaptive thinking can take a little while

// POST collected claim data -> { summary, missing, proposed_claim_type, rationale }
export async function POST(req: NextRequest) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json(
      { error: "ה-AI אינו מוגדר. יש להגדיר ANTHROPIC_API_KEY ב-.env.local." },
      { status: 503 }
    );
  }

  let data: ClaimData;
  try {
    data = (await req.json()) as ClaimData;
  } catch {
    return Response.json({ error: "גוף הבקשה אינו JSON תקין" }, { status: 400 });
  }

  try {
    const analysis = await analyzeClaim(data);
    return Response.json(analysis);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "ניתוח נכשל";
    return Response.json({ error: msg }, { status: 500 });
  }
}
