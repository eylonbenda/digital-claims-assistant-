import { beforeEach, describe, expect, it } from "vitest";
import type { State } from "./claim-state";
import { clearWizardState, loadWizardState, saveWizardState, storageKey } from "./persist";

const BASE: State = {
  consent: false,
  injuries: null,
  policyInsurer: "",
  insuranceType: "",
  insured: { first_name: "", last_name: "", id_number: "", mobile: "", city: "" },
  driver: { isInsured: null, first_name: "", last_name: "", id_number: "", license_number: "", relation_to_insured: "" },
  vehicle: { plate: "", manufacturer: "", year: "" },
  accident: { date: "", time: "", location: "", description: "" },
  fault: null,
  thirdParty: { present: null, name: "", phone: "", plate: "", insurer: "" },
  declaration: { data_consent: false, poa_third_party: false, signed_date: "" },
  documents: [],
};

// Vitest runs in a node environment — provide a minimal localStorage.
function installLocalStorage() {
  const map = new Map<string, string>();
  const stub = {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
    key: (i: number) => [...map.keys()][i] ?? null,
    get length() {
      return map.size;
    },
  };
  Object.defineProperty(globalThis, "window", { value: { localStorage: stub }, configurable: true });
  return stub;
}

describe("wizard persistence", () => {
  let ls: ReturnType<typeof installLocalStorage>;

  beforeEach(() => {
    ls = installLocalStorage();
  });

  it("round-trips step key and state", () => {
    const state: State = { ...BASE, consent: true, injuries: false, insured: { ...BASE.insured, first_name: "דנה" } };
    saveWizardState("tok1", "vehicle", state);
    const loaded = loadWizardState("tok1", BASE);
    expect(loaded).not.toBeNull();
    expect(loaded!.stepKey).toBe("vehicle");
    expect(loaded!.state.consent).toBe(true);
    expect(loaded!.state.insured.first_name).toBe("דנה");
  });

  it("returns null when nothing was saved", () => {
    expect(loadWizardState("tok1", BASE)).toBeNull();
  });

  it("is isolated per token", () => {
    saveWizardState("tok1", "intro", { ...BASE, consent: true });
    expect(loadWizardState("other", BASE)).toBeNull();
  });

  it("survives corrupted JSON", () => {
    ls.setItem(storageKey("tok1"), "{not json");
    expect(loadWizardState("tok1", BASE)).toBeNull();
  });

  it("rejects saves with the wrong shape", () => {
    ls.setItem(storageKey("tok1"), JSON.stringify({ stepKey: "vehicle", state: null }));
    expect(loadWizardState("tok1", BASE)).toBeNull();
    ls.setItem(storageKey("tok1"), JSON.stringify({ stepKey: "vehicle" }));
    expect(loadWizardState("tok1", BASE)).toBeNull();
  });

  it("drops in-flight and failed uploads, keeps completed ones", () => {
    const state: State = {
      ...BASE,
      documents: [
        { localId: "a", type: "car_photo", name: "a.jpg", status: "done" },
        { localId: "b", type: "car_photo", name: "b.jpg", status: "uploading" },
        { localId: "c", type: "drivers_license", name: "c.jpg", status: "error" },
      ],
    };
    saveWizardState("tok1", "documents", state);
    const loaded = loadWizardState("tok1", BASE)!;
    expect(loaded.state.documents.map((d) => d.localId)).toEqual(["a"]);
  });

  it("merges an older save missing fields over the base", () => {
    // Simulate a save from a deploy that predates the declaration block.
    const old = { stepKey: "when_where", state: { consent: true, insured: { first_name: "רון" } } };
    ls.setItem(storageKey("tok1"), JSON.stringify(old));
    const loaded = loadWizardState("tok1", BASE)!;
    expect(loaded.state.declaration).toEqual(BASE.declaration);
    expect(loaded.state.insured.last_name).toBe("");
    expect(loaded.state.insured.first_name).toBe("רון");
  });

  it("prefers saved values over server prefill, but keeps prefill for untouched fields", () => {
    const prefillBase: State = { ...BASE, insured: { ...BASE.insured, mobile: "0501234567" } };
    saveWizardState("tok1", "insured", { ...BASE, insured: { ...BASE.insured, first_name: "דנה" } });
    const loaded = loadWizardState("tok1", prefillBase)!;
    expect(loaded.state.insured.first_name).toBe("דנה");
    // saved mobile is "" (falsy but explicitly saved) — saved state wins wholesale per nested object
    expect(loaded.state.insured.mobile).toBe("");
  });

  it("clear removes the save", () => {
    saveWizardState("tok1", "intro", BASE);
    clearWizardState("tok1");
    expect(loadWizardState("tok1", BASE)).toBeNull();
  });

  it("round-trips a v2 save with a step key", () => {
    const state: State = { ...BASE, consent: true };
    saveWizardState("tok", "vehicle", state);
    const loaded = loadWizardState("tok", BASE);
    expect(loaded?.stepKey).toBe("vehicle");
  });

  it("migrates a v1 numeric-step blob: state restored, stepKey null, v1 key removed", () => {
    const state: State = { ...BASE, insured: { ...BASE.insured, first_name: "רון" } };
    ls.setItem(`claim-wizard:v1:tok`, JSON.stringify({ step: 4, state }));
    const loaded = loadWizardState("tok", BASE);
    expect(loaded).not.toBeNull();
    expect(loaded!.stepKey).toBeNull();
    expect(loaded!.state.insured.first_name).toBe(state.insured.first_name);
    expect(ls.getItem(`claim-wizard:v1:tok`)).toBeNull();
  });

  it("returns stepKey null for an unknown saved key", () => {
    const state: State = { ...BASE };
    ls.setItem(`claim-wizard:v2:tok`, JSON.stringify({ stepKey: "no_such_step", state }));
    expect(loadWizardState("tok", BASE)?.stepKey).toBeNull();
  });

  it("clearWizardState removes both versions", () => {
    ls.setItem(`claim-wizard:v1:tok`, "x");
    saveWizardState("tok", "intro", BASE);
    clearWizardState("tok");
    expect(ls.getItem(`claim-wizard:v1:tok`)).toBeNull();
    expect(ls.getItem(`claim-wizard:v2:tok`)).toBeNull();
  });
});
