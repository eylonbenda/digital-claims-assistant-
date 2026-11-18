// A send the provider later reports as bounced or failed. The claim stays "sent" —
// reverting it would hide that a send was attempted — and the clerk gets a task.
export const BOUNCE_TASK_TITLE = "המייל למבטחת חזר — לבדוק כתובת ולשלוח שוב";

export type FailureStore = {
  // Flags the outbound message as failed. Null when there is no such message or it
  // is already flagged, which is what makes a redelivered event a no-op.
  markDeliveryFailed(providerId: string): Promise<{ claimId: string | null } | null>;
  addTask(claimId: string, title: string): Promise<void>;
};

export async function recordDeliveryFailure(
  providerId: string,
  store: FailureStore,
): Promise<"ignored" | "recorded"> {
  const marked = await store.markDeliveryFailed(providerId);
  if (!marked) return "ignored";
  if (marked.claimId) await store.addTask(marked.claimId, BOUNCE_TASK_TITLE);
  return "recorded";
}
