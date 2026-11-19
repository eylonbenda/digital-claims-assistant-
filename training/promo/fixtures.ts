import fs from "node:fs";
import path from "node:path";
import { TRAINING_ROOT } from "../src/env.ts";

export const PROMO_FIXTURE_DIR = path.join(TRAINING_ROOT, "fixtures", "promo");
const IMAGE = /\.(png|jpe?g|webp)$/i;

export type PromoFixtures = { licenceFront: string; licenceBack: string; registration: string; cars: string[] };

// The files the "client" uploads in the promo. Documents are always the drawn ones. Car
// pictures are the drawn ones unless the operator put at least three real photos in
// `<dir>/user/` (git-ignored): no legible plate, no person, no customer's identifiable car.
export function promoFixtures(dir = PROMO_FIXTURE_DIR): PromoFixtures {
  const f = (name: string) => path.join(dir, name);
  const userDir = f("user");
  const user = fs.existsSync(userDir)
    ? fs.readdirSync(userDir).filter((n) => IMAGE.test(n)).sort().map((n) => path.join(userDir, n))
    : [];
  return {
    licenceFront: f("licence-front.png"),
    licenceBack: f("licence-back.png"),
    registration: f("registration.png"),
    cars: user.length >= 3 ? user : [f("car-1.png"), f("car-2.png"), f("car-3.png")],
  };
}
