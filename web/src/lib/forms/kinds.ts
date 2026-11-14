// generated_forms.kind is free text; these are the values the app writes.
export const FORM_KIND = { accidentNotice: "accident_notice", demand: "demand_form" } as const;

// What a claim's generated_forms rows mean for readers: only an accident notice
// satisfies the checklist's accident_form; a demand form counts as the
// "demand_form" doc type (union generatedDocTypes into the uploaded-doc set).
export function formFacts(kinds: Iterable<string>): { hasAccidentNotice: boolean; generatedDocTypes: string[] } {
  let hasAccidentNotice = false;
  let hasDemand = false;
  for (const k of kinds) {
    if (k === FORM_KIND.accidentNotice) hasAccidentNotice = true;
    else if (k === FORM_KIND.demand) hasDemand = true;
  }
  return { hasAccidentNotice, generatedDocTypes: hasDemand ? [FORM_KIND.demand] : [] };
}
