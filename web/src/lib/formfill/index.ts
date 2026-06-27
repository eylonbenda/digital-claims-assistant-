import hachshara from "./templates/hachshara";
import migdal from "./templates/migdal";
import menora from "./templates/menora";

// Registry of insurer templates. Add a new insurer = add one template file here.
export const templates = { hachshara, migdal, menora } as const;
export type InsurerKey = keyof typeof templates;

export { fillForm } from "./engine";
export type { ClaimData } from "./types";
