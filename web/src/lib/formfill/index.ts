import hachshara from "./templates/hachshara";
import migdal from "./templates/migdal";
import menora from "./templates/menora";
import harel from "./templates/harel";
import aig from "./templates/aig";
import shlomo from "./templates/shlomo";
import libra from "./templates/libra";
import phoenix from "./templates/phoenix";
import ayalon from "./templates/ayalon";
import shomera from "./templates/shomera";
import clal from "./templates/clal";

// Registry of insurer templates. Add a new insurer = add one template file here.
export const templates = {
  hachshara,
  migdal,
  menora,
  harel,
  aig,
  shlomo,
  libra,
  phoenix,
  ayalon,
  shomera,
  clal,
} as const;
export type InsurerKey = keyof typeof templates;

export { fillForm } from "./engine";
export type { ClaimData } from "./types";
