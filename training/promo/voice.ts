// Makes the narrator's sound files from the script: one request to ElevenLabs per line of
// `narration.md`, saved where `promo:edit` looks for them. A line is made again only when
// its words, the voice or the model changed, so a wording change costs one line.
//
//   npm run promo:voice                      both audiences
//   npm run promo:voice -- --audience garage [--only chase,turn] [--force]
//   npm run promo:voice -- --voices          the Hebrew voices this account can use
import { config } from "dotenv";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { Audience } from "./copy.ts";
import { VOICED, type VoiceId } from "./narration.ts";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TRAINING_ROOT = path.join(HERE, "..");
const API = "https://api.elevenlabs.io";
const DEFAULT_MODEL = "eleven_v4"; // the quality model that speaks Hebrew (multilingual_v2 does not)
const SECTION: Record<Audience, string> = { garage: "מוסך", agent: "סוכן ביטוח" };

// The script's lines for one audience, read from the tables in narration.md.
export function scriptLines(markdown: string, audience: Audience): Record<VoiceId, string> {
  const section = markdown.split(/^## /m).find((s) => s.split("\n")[0].trim() === SECTION[audience]) ?? "";
  const lines = {} as Record<VoiceId, string>;
  for (const id of VOICED) {
    const row = new RegExp(`^\\|\\s*${id}\\s*\\|(.*)\\|\\s*$`, "m").exec(section);
    const text = row?.[1].trim();
    if (!text) throw new Error(`narration.md has no ${audience} line for: ${id}`);
    if (audience === "garage" && text.includes("סוכן")) throw new Error(`the garage line "${id}" says "סוכן"`);
    lines[id] = text;
  }
  return lines;
}

// Words the voice reads wrong without help, spelled the way they are said. Add a word here
// when a line comes back mispronounced; the script itself stays in plain spelling.
const SAY: Record<string, string> = { "אופן־תיק": "אוֹפֶּן־תִיק" };
export const spoken = (text: string) => Object.entries(SAY).reduce((t, [from, to]) => t.replaceAll(from, to), text);

type Ask = { text: string; voiceId: string; model: string; key: string; previous?: string; next?: string };
export function ttsRequest(o: Ask): { url: string; init: { method: "POST"; headers: Record<string, string>; body: string } } {
  return {
    url: `${API}/v1/text-to-speech/${encodeURIComponent(o.voiceId)}?output_format=mp3_44100_128`,
    init: {
      method: "POST",
      headers: { "xi-api-key": o.key, "Content-Type": "application/json" },
      body: JSON.stringify({
        text: o.text,
        model_id: o.model,
        language_code: "he",
        ...(o.previous ? { previous_text: o.previous } : {}),
        ...(o.next ? { next_text: o.next } : {}),
      }),
    },
  };
}

// What a sound file was made from, kept beside it; a different stamp means "make it again".
export const stamp = (o: { text: string; voiceId: string; model: string }) =>
  createHash("sha256").update(JSON.stringify([o.text, o.voiceId, o.model])).digest("hex");

type ListedVoice = { voice_id: string; name: string; category?: string; labels?: Record<string, string>; verified_languages?: { language: string; model_id?: string }[] };
export const hebrewVoices = (voices: ListedVoice[]) => voices.filter((v) => v.verified_languages?.some((l) => l.language === "he"));

async function refuse(res: Response, what: string): Promise<never> {
  const body = (await res.text()).slice(0, 400);
  throw new Error(`ElevenLabs refused ${what} (HTTP ${res.status}): ${body}`);
}

async function listVoices(key: string): Promise<void> {
  const all: ListedVoice[] = [];
  for (let token: string | undefined, page = 0; page < 20; page++) {
    const res = await fetch(`${API}/v2/voices?page_size=100${token ? `&next_page_token=${encodeURIComponent(token)}` : ""}`, { headers: { "xi-api-key": key } });
    if (!res.ok) await refuse(res, "the voice list");
    const data = (await res.json()) as { voices: ListedVoice[]; has_more?: boolean; next_page_token?: string };
    all.push(...data.voices);
    if (!data.has_more || !data.next_page_token) break;
    token = data.next_page_token;
  }
  const he = hebrewVoices(all);
  console.log(`${all.length} voices in this account, ${he.length} verified for Hebrew.`);
  for (const v of he.length > 0 ? he : all) {
    console.log(`${v.voice_id}  ${v.name.padEnd(28)} ${v.category ?? ""}  ${[v.labels?.gender, v.labels?.age, v.labels?.accent].filter(Boolean).join(", ")}`);
  }
  if (he.length === 0) console.log("None is marked as Hebrew. Add a Hebrew voice from the ElevenLabs voice library to the account, then run this again.");
}

async function speak(audience: Audience, o: { key: string; voiceId: string; model: string; only?: VoiceId[]; force: boolean }): Promise<void> {
  const lines = scriptLines(fs.readFileSync(path.join(HERE, "narration.md"), "utf8"), audience);
  const dir = path.join(TRAINING_ROOT, "fixtures", "promo", "voice", audience);
  fs.mkdirSync(dir, { recursive: true });
  for (const [i, id] of VOICED.entries()) {
    if (o.only && !o.only.includes(id)) continue;
    const text = spoken(lines[id]), file = path.join(dir, `${id}.mp3`), note = path.join(dir, `${id}.made`);
    const made = stamp({ text, voiceId: o.voiceId, model: o.model });
    if (!o.force && fs.existsSync(file) && fs.existsSync(note) && fs.readFileSync(note, "utf8") === made) {
      console.log(`${audience}/${id}  unchanged`);
      continue;
    }
    const prev = VOICED[i - 1], next = VOICED[i + 1];
    const { url, init } = ttsRequest({ text, voiceId: o.voiceId, model: o.model, key: o.key, previous: prev && spoken(lines[prev]), next: next && spoken(lines[next]) });
    const res = await fetch(url, init);
    if (!res.ok) await refuse(res, `the line ${audience}/${id}`);
    const sound = Buffer.from(await res.arrayBuffer());
    if (sound.length < 1000) throw new Error(`ElevenLabs returned no sound for ${audience}/${id}`);
    // A line recorded by hand under another type would otherwise win over the new file.
    for (const other of [".wav", ".m4a"]) fs.rmSync(path.join(dir, id + other), { force: true });
    fs.writeFileSync(file, sound);
    fs.writeFileSync(note, made);
    console.log(`${audience}/${id}  made (${text.length} characters)`);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  (async () => {
    config({ path: path.join(TRAINING_ROOT, ".env.local"), quiet: true });
    const args = process.argv.slice(2), value = (flag: string) => (args.includes(flag) ? args[args.indexOf(flag) + 1] : undefined);
    const key = process.env.ELEVENLABS_API_KEY?.trim();
    if (!key) throw new Error("set ELEVENLABS_API_KEY in training/.env.local");
    if (args.includes("--voices")) return listVoices(key);
    const voiceId = process.env.ELEVENLABS_VOICE_ID?.trim();
    if (!voiceId) throw new Error("set ELEVENLABS_VOICE_ID in training/.env.local (`npm run promo:voice -- --voices` lists them)");
    const model = process.env.ELEVENLABS_MODEL?.trim() || DEFAULT_MODEL;
    const audience = value("--audience");
    if (audience !== undefined && audience !== "garage" && audience !== "agent") throw new Error("--audience is garage or agent");
    const only = value("--only")?.split(",").map((s) => s.trim());
    const unknown = only?.filter((id) => !(VOICED as readonly string[]).includes(id)) ?? [];
    if (unknown.length > 0) throw new Error(`--only names no such line: ${unknown.join(", ")}`);
    for (const a of (audience ? [audience] : ["garage", "agent"]) as Audience[]) {
      await speak(a, { key, voiceId, model, only: only as VoiceId[] | undefined, force: args.includes("--force") });
    }
  })().catch((e) => { console.error(String(e instanceof Error ? e.message : e)); process.exit(1); });
}
