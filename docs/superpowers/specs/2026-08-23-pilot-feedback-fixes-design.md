# Pilot feedback fixes — design (2026-08-23)

Three issues surfaced after the pilot started. All are small, deliberate scope; no schema changes.

## 1. Third-party details can be unknown (hit-and-run)

**Problem:** the client saw the other vehicle but has no details (e.g. it drove off). `tp_details` required name + plate + insurer, hard-blocking the wizard.

**Design:** new optional flag `State.thirdParty.details_unknown` (checkbox on `tp_details`: "אין לי את פרטי הצד השני"). When checked:
- `tp_details.isComplete` passes regardless of the fields; the fields stay visible and optional so partial info (a plate, a name) is still captured.
- The flag persists verbatim inside `claims.summary_json.collected`; the wizard summary shows "מעורב — אין פרטים" when nothing was captured.
- `toClaimData` is unchanged — the TP block keeps whatever was filled; empty fields stay empty on the accident-notice form.
- The `get_tp_insurer` agent task still spawns on track confirmation — in a hit-and-run the agent genuinely still needs to trace the TP insurer, so no suppression.

Optional field (not required) so old localStorage drafts and prefill payloads load unchanged; no persist VERSION bump.

## 2. "The car was parked" on the driver question

**Problem:** when the car was hit while parked, neither "אני (המבוטח)" nor "מישהו אחר" is true, and picking one produces wrong data (or blocks on driver identity).

**Design:** third tap option "אף אחד — הרכב היה חנוי" backed by new optional flag `State.driver.parked`. Selecting it sets `parked: true, isInsured: null`:
- `driver_who.isComplete` accepts `parked`; `driver_details` stays irrelevant (it keys on `isInsured === false`).
- `toClaimData` omits the driver block — a parked car had no driver, so the form's driver section legitimately stays empty; the free-text description carries the story.
- Wizard summary "נהג" row shows "אף אחד — הרכב היה חנוי".

## 3. WhatsApp send-link opens the client's chat

**Problem:** `NewClaimForm`'s "שלח בוואטסאפ" built `wa.me/?text=…` with no phone, dumping the agent into WhatsApp's contact picker even though they just typed the client's number.

**Design:** reuse `waHref(phone, text)` from `lib/wa.ts` (already normalizes 05x → 972). When the phone is empty or not a valid Israeli mobile, fall back to the phone-less link (phone is an optional field).

## Testing

Unit tests on the pure layers: `steps.test.ts` (parked completes `driver_who` and skips `driver_details`; `details_unknown` completes `tp_details`), `claim-state.test.ts` (parked omits driver; partial TP block survives `details_unknown`), `wa` behavior already covered by `wa.test.ts`.
