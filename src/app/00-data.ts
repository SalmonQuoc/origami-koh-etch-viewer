// Data files (data/*.json): etchants, simulator examples and pit examples. The build puts each file into the page as
// <script type="application/json" id="db-NAME">; these loaders turn them into the tables the scenes use.
// The format of each file is described in docs/DATA.md and checked by tools/validate-data.mjs.

type PlaneKey = "100" | "110" | "111" | "210" | "211" | "221" | "310" | "311" | "320" | "331" | "530" | "540";
type RateMap = Partial<Record<PlaneKey, number>>;   // µm/min

interface RateTable { source: string; etchant: string; T_C: number; unit: "um/min" | "um/h"; note?: string; columns: Record<string, RateMap> }
interface EtchantRates {
  table?: string; column?: string;                   // a whole column of a table
  unit?: "um/min" | "um/h"; given?: RateMap;         // rates given by the source for some planes
  others?: { table: string; column: string; scaleBy: PlaneKey };   // the other planes: a table column scaled to match "given"
}
interface EtchantEntry {
  key: string; name: string; T_C: number; conc_wt?: number; rates: EtchantRates; source: string;
  pitKey?: string; pitName?: string; sio2: null | { value: number; unit: "um/min" | "um/h"; source: string };
  Q?: ActEnergies;                                   // activation energies, eV, for moving the rates to another temperature
}
interface ActEnergies { "100": number; "110": number; "111": number; sio2: number; source: string }
interface EtchantDb { format: "origami-etchants-db"; version: number; tables: Record<string, RateTable>; etchants: EtchantEntry[] }

interface SimRate { name: string; r: RateMap; src: string; sio2: number | null; sio2src?: string; custom?: boolean }
interface PitRate { name: string; r: { "100": number; "110": number; "111": number } }

function readDb<T>(name: string): T {
  const el = document.getElementById(`db-${name}`);
  if (!el) throw new Error(`data file ${name}.json is missing from the page (run npm run build)`);
  return JSON.parse(el.textContent || "null") as T;
}

const perMin = (v: number, unit?: string) => unit === "um/h" ? v/60 : v;

// etchants.json -> the simulator table (12 planes where known), the pit table (3 planes), and process data
function loadEtchants(db: EtchantDb) {
  const tableCol = (t: string, c: string): RateMap => {
    const T = db.tables[t]; if (!T || !T.columns[c]) throw new Error(`etchants.json: no table ${t} column ${c}`);
    const out: RateMap = {}; for (const [k, v] of Object.entries(T.columns[c])) out[k as PlaneKey] = perMin(v as number, T.unit); return out;
  };
  const SR: Record<string, SimRate> = {}, PR: Record<string, PitRate> = {}, PIT2SIM: Record<string, string> = {};
  const TBASE: Record<string, number> = {}, PALC: Record<string, number> = {}, TABLES: Record<string, RateMap> = {}, QACT: Record<string, ActEnergies> = {};
  for (const e of db.etchants) {
    let r: RateMap = {};
    const R = e.rates;
    if (R.table) r = tableCol(R.table, R.column as string);
    if (R.given) {
      const g: RateMap = {}; for (const [k, v] of Object.entries(R.given)) g[k as PlaneKey] = perMin(v as number, R.unit);
      if (R.others) {   // other planes: the table column scaled by the ratio of the given and tabulated rate of one plane
        const col = tableCol(R.others.table, R.others.column), k = (g[R.others.scaleBy] as number)/(col[R.others.scaleBy] as number);
        for (const [p, v] of Object.entries(col)) r[p as PlaneKey] = (v as number)*k;
      }
      Object.assign(r, g);
    }
    SR[e.key] = { name: e.name, r, src: e.source, sio2: e.sio2 ? perMin(e.sio2.value, e.sio2.unit) : null, ...(e.sio2 ? { sio2src: e.sio2.source } : {}) };
    if (e.pitKey) {
      PR[e.pitKey] = { name: e.pitName || e.name, r: { "100": r["100"] as number, "110": r["110"] as number, "111": r["111"] as number } };
      PIT2SIM[e.pitKey] = e.key;
    }
    TBASE[e.key] = e.T_C;
    if (e.Q) QACT[e.key] = e.Q;
    if (R.table && e.conc_wt != null) PALC[e.key] = e.conc_wt;   // concentration can be changed in the custom-etchant dialog
  }
  for (const [name, T] of Object.entries(db.tables)) for (const c of Object.keys(T.columns)) TABLES[`${name}:${c}`] = tableCol(name, c);
  return { SR, PR, PIT2SIM, TBASE, PALC, TABLES, QACT };
}

// sim-examples.json -> SPRESETS[wafer] (shapes get the defaults of their type)
interface SimExample { name: string; fk: string; rate: string; t: number; hx: number; hy: number; pre?: number; dxMax?: number; note: string; shapes: any[] }
function loadSimExamples(db: { wafers: Record<string, SimExample[]> }) {
  const out: Record<string, SimExample[]> = {};
  for (const [w, L] of Object.entries(db.wafers)) out[w] = L.map(p => Object.assign({}, p, { shapes: p.shapes.map(s => Object.assign({}, s)) }));
  return out;
}

// pit-examples.json -> OPENINGS[wafer] = [{ name, o: convex polygon, rate, pre }]
interface PitOpening { shape: "rect" | "circle" | "trench110"; w?: number; h?: number; ang?: number; d?: number; l?: number }
function loadPitExamples(db: { wafers: Record<string, { name: string; open: PitOpening; rate: string; pre?: number }[]> }, trench: (w: number, l: number) => number[][]) {
  const poly = (o: PitOpening) => o.shape === "rect" ? Core.rect(0, 0, o.w, o.h, o.ang || 0) : o.shape === "circle" ? Core.circle((o.d as number)/2) : trench(o.w as number, o.l as number);
  const out: Record<string, { name: string; o: number[][]; rate: string; pre?: number }[]> = {};
  for (const [w, L] of Object.entries(db.wafers)) out[w] = L.map(e => Object.assign({ name: e.name, o: poly(e.open), rate: e.rate }, e.pre ? { pre: e.pre } : {}));
  return out;
}
