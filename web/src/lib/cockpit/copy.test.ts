import { describe, expect, it } from "vitest";
import {
  CLASSIFY_LINE, FILL_FORM_LINE, NO_ACTION_LINE,
  chaseLine, formFieldsLine, formReadyLine, milestoneLine, taskLine,
} from "./copy";

describe("cockpit copy", () => {
  it("chaseLine joins labels in Hebrew", () => {
    expect(chaseLine(["תמונות נזק", "רישיון נהיגה"])).toBe("מחכים לתמונות נזק ורישיון נהיגה מהלקוח/ה");
    expect(chaseLine(["רישיון רכב"])).toBe("מחכים לרישיון רכב מהלקוח/ה");
    expect(chaseLine([])).toBe("חסרים מסמכים חוסמים להגשה");
  });
  it("taskLine delegates to dashboard idiom", () => {
    expect(taskLine("בירור מול הראל", 0)).toBe("תורך: בירור מול הראל");
    expect(taskLine("בירור מול הראל", 2)).toBe("תורך: בירור מול הראל · באיחור 2 ימים");
  });
  it("formFieldsLine handles singular/plural", () => {
    expect(formFieldsLine(1)).toBe("נותר שדה חסר אחד בטופס");
    expect(formFieldsLine(3)).toBe("נותרו 3 שדות חסרים בטופס");
  });
  it("formReadyLine names the insurer when known", () => {
    expect(formReadyLine("הראל")).toBe("הטופס מוכן להורדה — הראל");
    expect(formReadyLine(null)).toBe("הטופס מוכן להורדה");
  });
  it("milestoneLine", () => {
    expect(milestoneLine("הוגש למבטח")).toBe("השלב הבא: הוגש למבטח");
  });
  it("constants are non-empty Hebrew", () => {
    for (const s of [CLASSIFY_LINE, FILL_FORM_LINE, NO_ACTION_LINE]) expect(s.length).toBeGreaterThan(5);
  });
});
