// Minimal bidi reordering for drawing form values with pdf-lib + fontkit.
//
// fontkit picks ONE direction per string — from its first non-neutral character — and,
// when that is Hebrew/Arabic, reverses the whole glyph run. Pure Hebrew comes out right,
// but any LTR run inside it is reversed too: "כביש 75" draws as "כביש 57", "Corolla" as
// "allaroC". So a mixed string is split into direction runs (a cut-down Unicode Bidi
// Algorithm for an RTL paragraph: W4, W5, W7, N1/N2, L2, L4) and each run is drawn separately.
// fontkit reverses RTL glyphs but does not mirror them, so brackets in RTL runs are swapped here.
//
// Strings with no RTL letters, and RTL strings with no LTR runs, come back as a single
// run — the existing single drawText path (brackets in an RTL one pre-mirrored).

export type Run = {
  // The text to hand to drawText for this run. fontkit reverses it iff it contains an
  // RTL letter, so RTL runs are given in logical order and neutral-only RTL runs are
  // pre-reversed here.
  text: string;
  rtl: boolean;
};

const RTL = /[֐-׿יִ-ﭏ؀-ۿݐ-ݿﭐ-﷿ﹰ-﻿]/;
const LETTER = /\p{L}/u;
const DIGIT = /[0-9]/;
const NUM_SEP = /[/.,:+\-]/;
// European terminators (Bidi class ET) that attach to an adjacent number (W5): 18%, ₪120.
const NUM_TERM = /[#$%°±‰€£¥¢₪]/;
const MIRROR: Record<string, string> = { "(": ")", ")": "(", "[": "]", "]": "[", "{": "}", "}": "{", "<": ">", ">": "<" };
const mirror = (t: string) => Array.from(t).map((c) => MIRROR[c] ?? c).join("");

type Cls = "R" | "L" | "EN" | "N";

export function visualRuns(s: string): Run[] {
  const chars = Array.from(s);
  if (!chars.some((c) => RTL.test(c))) return [{ text: s, rtl: false }];

  const cls: Cls[] = chars.map((c) =>
    RTL.test(c) ? "R" : DIGIT.test(c) ? "EN" : LETTER.test(c) ? "L" : "N",
  );

  // W4: a single separator between two digits is part of the number (4/12, 054-1234567).
  for (let i = 1; i < cls.length - 1; i++) {
    if (cls[i] === "N" && NUM_SEP.test(chars[i]) && cls[i - 1] === "EN" && cls[i + 1] === "EN") {
      cls[i] = "EN";
    }
  }

  // W5: a sequence of terminators adjacent to a number is part of it.
  for (let i = 0; i < cls.length; i++) {
    if (cls[i] !== "N" || !NUM_TERM.test(chars[i])) continue;
    let j = i;
    while (j < cls.length && cls[j] === "N" && NUM_TERM.test(chars[j])) j++;
    if ((i > 0 && cls[i - 1] === "EN") || (j < cls.length && cls[j] === "EN")) {
      for (let k = i; k < j; k++) cls[k] = "EN";
    }
    i = j - 1;
  }

  // W7: a number whose preceding strong character is Latin behaves as Latin.
  // Otherwise it counts as R when resolving the neutrals around it (N1).
  const strong: ("L" | "R")[] = [];
  let last: "L" | "R" = "R";
  for (let i = 0; i < cls.length; i++) {
    if (cls[i] === "R" || cls[i] === "L") last = cls[i] as "L" | "R";
    strong.push(cls[i] === "EN" ? (last === "L" ? "L" : "R") : cls[i] === "L" ? "L" : "R");
  }

  // Levels: 1 = RTL, 2 = LTR (Latin and numbers). Neutrals take LTR only when both
  // neighbours are LTR; otherwise the paragraph direction (N1/N2, sos/eos = R).
  const level: number[] = cls.map((c) => (c === "R" ? 1 : c === "N" ? 0 : 2));
  for (let i = 0; i < level.length; ) {
    if (level[i] !== 0) {
      i++;
      continue;
    }
    let j = i;
    while (j < level.length && level[j] === 0) j++;
    const before = i > 0 ? strong[i - 1] : "R";
    const after = j < level.length ? strong[j] : "R";
    const lv = before === "L" && after === "L" ? 2 : 1;
    for (let k = i; k < j; k++) level[k] = lv;
    i = j;
  }

  const logical: { text: string; rtl: boolean }[] = [];
  for (let i = 0; i < chars.length; ) {
    let j = i;
    while (j < chars.length && level[j] === level[i]) j++;
    logical.push({ text: chars.slice(i, j).join(""), rtl: level[i] === 1 });
    i = j;
  }
  // L2 for an RTL paragraph: runs go right-to-left; LTR runs keep their inner order.
  // L4: RTL runs get mirrored brackets. Runs with an RTL letter are reversed by fontkit;
  // neutral-only RTL runs are drawn LTR by fontkit, so they are reversed here as well.
  return logical.reverse().map((r) =>
    !r.rtl
      ? r
      : RTL.test(r.text)
        ? { text: mirror(r.text), rtl: true }
        : { text: mirror(Array.from(r.text).reverse().join("")), rtl: true },
  );
}
