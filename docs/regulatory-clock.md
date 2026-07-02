# Regulatory Clock & Limitation Timers — שעון רגולטורי והתיישנות

> Constants that recur across features: status widget, alerts, checklist blocking logic, dashboard sorting.
> Sourced from the domain research (Harel/Migdal/Clal/Menora claim guides + חוק חוזה הביטוח §28–31
> + רשות שוק ההון circulars 2022-9-2, 2023-023). Cycle-time ranges are field assumptions, not regulated SLAs.

---

## 1. SLA clock (יישוב תביעה)

The regulatory clock **does not start at the accident date** — it starts only when all required
materials are in the insurer's hands. This is the central product leverage: every missing document
is a postponed clock, and the dashboard can show exactly why.

| Event | Regulated deadline | Source |
|---|---|---|
| Insurer requests additional docs | within **14 business days** of identifying the need | חוזר |
| בירור decision / status notice | within **30 days** of receiving ALL required materials | §28 חוק חוזה הביטוח |
| Continued-investigation notice | every **90 days** if unresolved | חוזר |
| Payment of תגמולי ביטוח | within **30 days** of insurer having all docs needed for liability assessment | §27 חוק חוזה הביטוח |

### How this maps to the data model
```
sla_clock_started_at  ← set when no blocking checklist item remains missing
decision_due_at       = sla_clock_started_at + 30 calendar days
```

### Dashboard surfaces
- "**השעון טרם החל — חסר: X, Y**" — until all blocking items are present.
- "**הכרעה נדרשת עד DD/MM/YYYY (N ימים)**" — once the clock has started.
- Red alert when `decision_due_at` is ≤ 7 days away.

---

## 2. Limitation periods (התיישנות)

| Route | Limitation | Legal basis | Notes |
|---|---|---|---|
| `own_policy` | **3 years** | §31 חוק חוזה הביטוח | From the date the insured event became known |
| `third_party_report` / `third_party_settlement` / residual-loss | **7 years** | General civil tort limitation | TP property claim is a civil action, not an insurance-proceeds claim |

> **Critical:** filing a claim with the insurer **does NOT toll** the limitation period.
> Only a **court filing** tolls it.
> The product should track `limitation_deadline` per claim and surface an alert as it approaches.

### Data model field
```
claims.limitation_deadline  ← set at classification:
  own_policy               → submitted_at + 3 years
  third_party_* / residual → submitted_at + 7 years
```

---

## 3. Estimated cycle times (field assumptions — not regulated SLAs)

| Route | Typical range | Blocker |
|---|---|---|
| `own_policy` (smooth) | 7–21 days | Appraiser / out-of-network garage / missing docs |
| `own_policy` (issues) | 14–30+ days | Same |
| `third_party_report` | 21–60+ days | Dispute over liability or damage quantum |
| `third_party_settlement` | 3–10 business days for approval + repair time | Pre-approval required before repair starts |

---

## 4. Related
- Data model fields → [architecture.md](architecture.md) §3
- Checklist blocking semantics → [claim-management.md](claim-management.md) §3
- Dashboard clock widget → [flow.md](flow.md) §4
