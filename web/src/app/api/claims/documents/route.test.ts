import { describe, expect, it } from "vitest";
import { POST } from "./route";
import { ALL_TRACK_ITEMS, CLIENT_UPLOAD_DOC_TYPES } from "@/lib/claims/checklist";

// The type allow-list runs before any Storage/DB access, so an empty file shows
// which side of it a type lands on: allowed → "empty file", refused → "invalid
// document type".
async function post(type: string) {
  const fd = new FormData();
  fd.append("token", "t");
  fd.append("type", type);
  fd.append("file", new File([], "x.jpg"));
  const res = await POST(new Request("http://localhost/api/claims/documents", { method: "POST", body: fd }));
  return { status: res.status, error: ((await res.json()) as { error: string }).error };
}

describe("POST /api/claims/documents type allow-list", () => {
  it.each([...CLIENT_UPLOAD_DOC_TYPES])("accepts client-suppliable %s", async (type) => {
    expect(await post(type)).toEqual({ status: 400, error: "empty file" });
  });

  const agentOnly = [
    ...new Set(ALL_TRACK_ITEMS.filter((i) => i.clientSuppliable === false).map((i) => i.docType!)),
  ];
  it.each([...agentOnly, "payment_notice", "rejection_letter", "other"])("refuses agent-side %s", async (type) => {
    expect(await post(type)).toEqual({ status: 400, error: `invalid document type: ${type}` });
  });
});
