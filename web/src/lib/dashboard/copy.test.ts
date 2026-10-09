import { describe, expect, it } from "vitest";
import {
  ALL_DONE_NOTE, TRACK_LABEL, WAITING_NOTE,
  alsoLine, doActionLine, greeting, hebDate, pendingClientLine, sendActionLine, unclassifiedLine, waitingLine,
} from "./copy";

describe("greeting", () => {
  // 06:00 UTC = 09:00 Israel (summer, UTC+3)
  it("morning at 09:00 Israel time", () =>
    expect(greeting(new Date("2026-08-11T06:00:00Z"))).toBe("בוקר טוב"));
  it("afternoon at 13:00 Israel time", () =>
    expect(greeting(new Date("2026-08-11T10:00:00Z"))).toBe("צהריים טובים"));
  it("evening at 20:00 Israel time — the 22:43-בוקר-טוב bug", () =>
    expect(greeting(new Date("2026-08-11T17:00:00Z"))).toBe("ערב טוב"));
  it("night at 02:00 Israel time", () =>
    expect(greeting(new Date("2026-08-11T23:00:00Z"))).toBe("לילה טוב"));
});

describe("hebDate", () => {
  it("renders weekday + day + month in Hebrew", () => {
    const s = hebDate(new Date("2026-08-11T06:00:00Z")); // Tuesday
    expect(s).toContain("יום שלישי");
    expect(s).toContain("11 באוגוסט");
  });
});

describe("sendActionLine", () => {
  const NOW = new Date("2026-08-11T06:00:00Z");
  it("names the missing docs and the last reminder age", () => {
    const s = sendActionLine(
      { taskKey: "chase_missing_docs", docLabels: ["רישיון נהיגה", "תמונות נזק"], lastSentAt: "2026-08-06T06:00:00Z" },
      NOW,
    );
    expect(s).toBe("מחכים לרישיון נהיגה ותמונות נזק מהלקוח · תזכורת אחרונה לפני 5 ימים");
  });
  it("no docs listed → generic; never sent → טרם נשלחה תזכורת", () => {
    const s = sendActionLine({ taskKey: "chase_missing_docs", docLabels: [], lastSentAt: null }, NOW);
    expect(s).toBe("מחכים למסמכים מהלקוח · טרם נשלחה תזכורת");
  });
  it("tp-insurer chase has its own line", () => {
    const s = sendActionLine({ taskKey: "get_tp_insurer", docLabels: [], lastSentAt: null }, NOW);
    expect(s).toBe("מחכים לפרטי המבטח של הצד השני מהלקוח · טרם נשלחה תזכורת");
  });
  it("reminderTail: sent today → תזכורת נשלחה היום", () => {
    const s = sendActionLine({ taskKey: "chase_missing_docs", docLabels: [], lastSentAt: NOW.toISOString() }, NOW);
    expect(s).toBe("מחכים למסמכים מהלקוח · תזכורת נשלחה היום");
  });
  it("reminderTail: sent 1 day ago → תזכורת אחרונה אתמול", () => {
    const s = sendActionLine(
      { taskKey: "chase_missing_docs", docLabels: [], lastSentAt: new Date(NOW.getTime() - 86_400_000).toISOString() },
      NOW,
    );
    expect(s).toBe("מחכים למסמכים מהלקוח · תזכורת אחרונה אתמול");
  });
});

describe("small lines", () => {
  it("doActionLine", () => {
    expect(doActionLine("פתיחת תביעה מול מבטח הלקוח", 20)).toBe("תורך: פתיחת תביעה מול מבטח הלקוח · באיחור 20 ימים");
    expect(doActionLine("פתיחת תביעה מול מבטח הלקוח", 0)).toBe("תורך: פתיחת תביעה מול מבטח הלקוח");
  });
  it("doActionLine singular day form", () =>
    expect(doActionLine("פתיחת תביעה מול מבטח הלקוח", 1)).toBe("תורך: פתיחת תביעה מול מבטח הלקוח · באיחור יום אחד"));
  it("unclassifiedLine", () =>
    expect(unclassifiedLine(42)).toBe("התיק מחכה לסיווג מסלול כבר 42 יום"));
  it("unclassifiedLine singular day", () =>
    expect(unclassifiedLine(1)).toBe("התיק מחכה לסיווג מסלול כבר יום אחד"));
  it("waitingLine with and without a tracked task", () => {
    expect(waitingLine({ title: "מעקב תשובת מבטח", due_at: "2026-08-20T00:00:00Z" })).toBe("במעקב: מעקב תשובת מבטח · עד 20.8");
    expect(waitingLine(null)).toBe("אין פעולות פתוחות");
  });
  it("constants exist", () => {
    expect(TRACK_LABEL.unknown).toBe("טרם סווג");
    expect(WAITING_NOTE.length).toBeGreaterThan(0);
    expect(ALL_DONE_NOTE).toContain("✅");
  });
});

describe("alsoLine", () => {
  it("includes the overdue days clause when > 0", () =>
    expect(alsoLine("לוודא דוח שמאי", 25)).toBe("וגם: לוודא דוח שמאי (באיחור 25 ימים)"));
  it("suppresses the clause at 0", () =>
    expect(alsoLine("לוודא דוח שמאי", 0)).toBe("וגם: לוודא דוח שמאי"));
  it("singular day form at 1", () =>
    expect(alsoLine("לוודא דוח שמאי", 1)).toBe("וגם: לוודא דוח שמאי (באיחור יום אחד)"));
});

describe("pendingClientLine", () => {
  const now = new Date("2026-10-09T12:00:00Z");
  it("no draft → not started, aged from link creation", () => {
    expect(pendingClientLine(null, "2026-10-07T09:00:00Z", now)).toBe("הלקוח עוד לא התחיל למלא · הקישור נוצר לפני 2 ימים");
    expect(pendingClientLine({}, "2026-10-09T09:00:00Z", now)).toBe("הלקוח עוד לא התחיל למלא · הקישור נוצר היום");
  });
  it("draft → furthest step + last activity", () => {
    expect(
      pendingClientLine({ max_step_key: "documents", saved_at: "2026-10-08T10:00:00Z" }, "2026-10-01T00:00:00Z", now),
    ).toBe("הלקוח הגיע עד העלאת המסמכים ולא סיים · פעילות אחרונה אתמול");
  });
  it("unknown step key degrades to a generic phrase", () => {
    expect(
      pendingClientLine({ max_step_key: "nope", saved_at: "2026-10-09T10:00:00Z" }, "2026-10-01T00:00:00Z", now),
    ).toBe("הלקוח התחיל למלא ולא סיים · פעילות אחרונה היום");
  });
});

describe("sendActionLine — finish_wizard", () => {
  it("names the unfinished form", () => {
    expect(
      sendActionLine({ taskKey: "finish_wizard", docLabels: [], lastSentAt: null }, new Date("2026-10-09T12:00:00Z")),
    ).toBe("הלקוח לא סיים למלא את הטופס · טרם נשלחה תזכורת");
  });
});
