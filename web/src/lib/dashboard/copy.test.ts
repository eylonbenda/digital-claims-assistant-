import { describe, expect, it } from "vitest";
import {
  ALL_DONE_NOTE, TRACK_LABEL, WAITING_NOTE,
  doActionLine, greeting, hebDate, sendActionLine, unclassifiedLine, waitingLine,
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
});

describe("small lines", () => {
  it("doActionLine", () => {
    expect(doActionLine("פתיחת תביעה מול מבטח הלקוח", 20)).toBe("תורך: פתיחת תביעה מול מבטח הלקוח · באיחור 20 ימים");
    expect(doActionLine("פתיחת תביעה מול מבטח הלקוח", 0)).toBe("תורך: פתיחת תביעה מול מבטח הלקוח");
  });
  it("unclassifiedLine", () =>
    expect(unclassifiedLine(42)).toBe("התיק מחכה לסיווג מסלול כבר 42 יום"));
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
