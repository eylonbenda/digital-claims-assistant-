// Canonical claim data — ONE shape for all insurers. Mirrors the documented canonical
// schema in docs/form-field-map.md (§2 core + §5 growth). Templates map a subset of these
// keys to coordinates; the collection flow will fill this same shape from the conversation.
// Enum values stay as keys here (so checkbox forms map them to boxes); free-text forms get
// the Hebrew label via formfill/labels.mjs.
export default {
  // ── Policy / agent ────────────────────────────────────────────────────────
  agent_name: 'ישראל ישראלי',
  policy_number: '40123567',
  insurance_type: 'comprehensive',   // comprehensive | mandatory | third_party   (סוג ביטוח)
  claim_type: 'own_policy',          // own_policy | third_party_report | third_party_settlement | unknown
  fault: 'me',                       // me | third_party | unknown   (מי אשם — נאסוף תמיד)

  // ── א. מבוטח ──────────────────────────────────────────────────────────────
  insured: {
    first_name: 'דנה',
    last_name: 'כהן',
    id_number: '302154687',
    birth_date: '01/01/1990',
    street: 'הרצל',
    house_no: '12',
    city: 'רעננה',
    postal_code: '4350000',
    address_line: 'רחוב הרצל ראשון לציון',   // for forms with a single address cell
    phone: '09-7654321',
    mobile: '054-1234567',
    email: 'dana@example.com',
  },

  // ── ב. נהג (קרבה למבוטח + רישיון) ────────────────────────────────────────
  driver: {
    first_name: 'דנה',
    last_name: 'כהן',
    id_number: '302154687',
    birth_date: '01/01/1990',
    address_line: 'רחוב הרצל ראשון לציון',
    phone: '09-7654321',
    mobile: '054-1234567',
    license_number: '7654321',
    license_type: 'B',               // דרגת רישיון
    license_date: '01/06/2008',      // תאריך הוצאת רישיון
    license_origin: 'israeli',       // israeli | foreign   (רישיון ישראלי/זר — מנורה·שלמה)
    relation_to_insured: 'בעל הרכב', // קרבה למבוטח
  },

  // ── ג. רכב המבוטח ─────────────────────────────────────────────────────────
  vehicle: {
    plate: '12-345-67',
    manufacturer: 'טויוטה',
    model: 'קורולה',
    year: '2020',
    type: 'private',                 // private | commercial | truck | tractor | scooter | motorcycle
    odometer: '85000',               // מד קילומטר (ליברה)
  },

  // ── ד. התאונה ─────────────────────────────────────────────────────────────
  accident: {
    date: '22/06/2026',
    time: '14:30',
    location: 'צומת אחוזה רעננה',
    area_type: 'junction',           // urban | intercity | parking | junction   (ליברה·AIG)
    description: 'נסעתי ישר דרך הצומת ורכב צד ג׳ פגע בי מצד ימין',
    passengers: '2',
    trip_type: 'private',            // private | work | to_from_work | paid_transport | taxi
    is_paid_transport: false,        // הסעה בשכר (שאלת כן/לא נפרדת — מנורה)
    police: { notified: false, station: '', log_number: '' },
  },

  // ── מוקדי נזק ─────────────────────────────────────────────────────────────
  damage: {
    insured_vehicle: 'פגיעה בדלת ימנית קדמית ובכנף',
    third_party_vehicle: 'נזק בפגוש אחורי',
  },

  // ── מוסך + שמאי ───────────────────────────────────────────────────────────
  garage: { name: 'מוסך הסדר רעננה', address: 'רעננה', phone: '09-7654321', is_arrangement: true }, // מוסך הסדר כן/לא
  assessor_name: 'שמאי אבי לוי',

  // ── צד ג' (מערך — ריבוי מעורבים; ההבדלה החדה של המוצר) ───────────────────
  third_parties: [
    {
      vehicle_plate: '88-999-00',
      vehicle_type: 'private',
      owner_name: 'משה לוי',
      driver_name: 'משה לוי',
      id_number: '111222333',
      phone: '052-9876543',
      address: 'רחוב ויצמן 5 תל אביב',
      insurer: 'הראל',
      policy_number: '99887766',
      agent_name: 'סוכנות ביטוח כהן',
      damage_description: 'נזק בכנף קדמית שמאלית',
    },
  ],

  // ── עדים ──────────────────────────────────────────────────────────────────
  witnesses: [
    { name: 'יוסי אברהם', address: 'רעננה', phone: '050-1112222' },
  ],

  // ── נפגעי גוף (מערך עד 5, + אשפוז) ───────────────────────────────────────
  injured_persons: [
    { name: 'דנה כהן', id_number: '302154687', address: 'רחוב הרצל ראשון לציון', injury_nature: 'חבלה קלה בצוואר', age: '36', hospitalized: false, hospital: '' },
  ],

  // ── חשבון בנק לתשלום (AIG / תבנית כלל) ──────────────────────────────────
  bank_account: { bank: 'בנק הפועלים', branch: '601', account_number: '123456' },

  // ── הצהרות / חתימה ────────────────────────────────────────────────────────
  declarations: {
    poa_third_party: true,           // ייפוי כוח לתביעת צד ג' (סעיף 68 לחוק חוזה הביטוח)
    data_consent: true,              // הסכמת מאגר מידע / משרד התחבורה
    date: '26/06/2026',
    signatory_name: 'דנה כהן',
  },
};
