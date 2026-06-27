// Canonical claim data — one shape, all insurers. Mirrors docs/form-field-map.md (§2 core + §5
// growth) and the POC at .pdfwork/formfill/sample-claim.mjs. Templates map a subset of these
// keys to coordinates; the collection flow fills this shape.
export type ClaimType =
  | "own_policy"
  | "third_party_report"
  | "third_party_settlement"
  | "unknown";
export type Fault = "me" | "third_party" | "unknown";
export type InsuranceType = "comprehensive" | "mandatory" | "third_party";
export type VehicleType =
  | "private"
  | "commercial"
  | "truck"
  | "tractor"
  | "scooter"
  | "motorcycle";
export type TripType = "private" | "work" | "to_from_work" | "paid_transport" | "taxi";
export type AreaType = "urban" | "intercity" | "parking" | "junction";
export type LicenseOrigin = "israeli" | "foreign";

export interface ThirdParty {
  vehicle_plate?: string;
  vehicle_type?: VehicleType;
  owner_name?: string;
  driver_name?: string;
  id_number?: string;
  phone?: string;
  address?: string;
  insurer?: string;
  policy_number?: string;
  agent_name?: string;
  damage_description?: string;
}

export interface Witness {
  name?: string;
  address?: string;
  phone?: string;
}

export interface InjuredPerson {
  name?: string;
  id_number?: string;
  address?: string;
  injury_nature?: string;
  age?: string;
  hospitalized?: boolean;
  hospital?: string;
}

export interface BankAccount {
  bank?: string;
  branch?: string;
  account_number?: string;
}

export interface ClaimData {
  agent_name?: string;
  policy_number?: string;
  insurance_type?: InsuranceType; // סוג ביטוח
  claim_type?: ClaimType;
  fault?: Fault; // מי אשם — collect always

  insured?: {
    first_name?: string;
    last_name?: string;
    id_number?: string;
    birth_date?: string;
    street?: string;
    house_no?: string;
    city?: string;
    postal_code?: string;
    address_line?: string; // for forms with a single address cell
    phone?: string;
    mobile?: string;
    email?: string;
  };

  driver?: {
    first_name?: string;
    last_name?: string;
    id_number?: string;
    birth_date?: string;
    address_line?: string;
    phone?: string;
    mobile?: string;
    license_number?: string;
    license_type?: string; // דרגת רישיון
    license_date?: string; // תאריך הוצאת רישיון
    license_origin?: LicenseOrigin; // ישראלי / זר
    relation_to_insured?: string; // קרבה למבוטח
  };

  vehicle?: {
    plate?: string;
    manufacturer?: string;
    model?: string;
    year?: string;
    type?: VehicleType;
    odometer?: string; // מד קילומטר
  };

  accident?: {
    date?: string;
    time?: string;
    location?: string;
    area_type?: AreaType; // עירוני / בין-עירוני / חניון / צומת
    description?: string; // תיאור מילולי
    passengers?: string;
    trip_type?: TripType;
    is_paid_transport?: boolean; // הסעה בשכר (yes/no)
    police?: { notified?: boolean; station?: string; log_number?: string };
  };

  damage?: { insured_vehicle?: string; third_party_vehicle?: string };

  garage?: { name?: string; address?: string; phone?: string; is_arrangement?: boolean }; // מוסך הסדר
  assessor_name?: string;

  third_parties?: ThirdParty[]; // צד ג' — ריבוי מעורבים
  witnesses?: Witness[];
  injured_persons?: InjuredPerson[]; // נפגעי גוף (עד 5)
  bank_account?: BankAccount; // AIG / תבנית כלל

  declarations?: {
    poa_third_party?: boolean; // ייפוי כוח סעיף 68
    data_consent?: boolean; // הסכמת מאגר מידע / משרד התחבורה
    date?: string;
    signatory_name?: string;
  };
}
