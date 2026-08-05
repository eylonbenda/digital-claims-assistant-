// Israeli-specific input plausibility checks for the collection wizard.
// These power *gentle, non-blocking* warnings — never hard gates: edge cases
// (temporary IDs, diplomatic/old plates) must still be able to submit.

// ת"ז check digit (Luhn variant): pad to 9 digits, weights 1,2 alternating,
// sum the digit-sums of the products, valid when the total is divisible by 10.
export function isValidIsraeliId(value: string): boolean {
  const digits = value.replace(/\D/g, "");
  if (digits.length < 5 || digits.length > 9) return false;
  const padded = digits.padStart(9, "0");
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    const product = Number(padded[i]) * (i % 2 === 0 ? 1 : 2);
    sum += product > 9 ? product - 9 : product;
  }
  return sum % 10 === 0;
}

// Israeli plates are 7–8 digits today (5–6 on old vehicles). Dashes/spaces are
// formatting. "Implausible" = letters in it, or more than 8 digits.
export function isPlausiblePlate(value: string): boolean {
  if (/[^\d\s-]/.test(value.trim())) return false;
  const digits = value.replace(/\D/g, "");
  return digits.length >= 5 && digits.length <= 8;
}
