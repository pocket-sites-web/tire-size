import fs from 'node:fs';
import path from 'node:path';

export type Position = 'all' | 'front' | 'rear' | 'spare';

// One row per OE size printed in an owner's manual (data/tires.json, from the scraper export).
export interface TireRow {
  make: string;
  model: string;
  year: number;
  size: string;
  load_index: string | null;
  speed_rating: string | null;
  position: Position;
  pressure_psi_front: number | null;
  pressure_psi_rear: number | null;
  wheel: string | null;
  trim_note: string | null;
  page: string | null;
  source_url: string | null;
  confidence: number;
  sample?: boolean;
}

export interface Size {
  raw: string; // as printed, e.g. P195/65R15
  code: string; // normalised without the P prefix, e.g. 195/65R15
  slug: string; // 195-65r15
  prefix: '' | 'P' | 'LT' | 'T';
  width: number;
  aspect: number;
  construction: 'R' | 'D';
  rim: number;
}

export interface YearPage {
  make: string;
  makeSlug: string;
  model: string;
  modelSlug: string;
  year: number;
  road: TireRow[]; // all / front / rear
  spare: TireRow[];
  staggered: boolean;
  sample: boolean;
}

export interface Model {
  make: string;
  makeSlug: string;
  model: string;
  modelSlug: string;
  years: YearPage[]; // newest first
  sizes: string[]; // road size codes across all years
  firstYear: number;
  lastYear: number;
}

export interface Make {
  make: string;
  makeSlug: string;
  models: Model[];
}

export const slugify = (s: string) =>
  s.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const SIZE_RE = /^(P|LT|T)?(\d{3})\/(\d{2})(R|D)(\d{2})$/;

export function parseSize(raw: string): Size | null {
  const m = raw.replace(/\s+/g, '').toUpperCase().match(SIZE_RE);
  if (!m) return null;
  const [, prefix = '', w, a, c, r] = m;
  const code = `${prefix === 'P' ? '' : prefix}${w}/${a}${c}${r}`;
  return {
    raw,
    code,
    slug: code.toLowerCase().replace('/', '-'),
    prefix: prefix as Size['prefix'],
    width: +w,
    aspect: +a,
    construction: c as 'R' | 'D',
    rim: +r,
  };
}

// Overall dimensions from the size code (nominal, new tire).
export function dims(s: Size) {
  const sidewallMm = (s.width * s.aspect) / 100;
  const diameterMm = s.rim * 25.4 + 2 * sidewallMm;
  return {
    sidewallMm: Math.round(sidewallMm),
    diameterMm: Math.round(diameterMm),
    diameterIn: +(diameterMm / 25.4).toFixed(1),
    widthIn: +(s.width / 25.4).toFixed(1),
    revsPerMile: Math.round(1609344 / (Math.PI * diameterMm)),
  };
}

const SPEED: Record<string, number> = { L: 75, M: 81, N: 87, P: 93, Q: 99, R: 106, S: 112, T: 118, U: 124, H: 130, V: 149, W: 168, Y: 186 };
export const speedMph = (r: string | null) => (r && SPEED[r] ? SPEED[r] : null);
// Load index → max load per tire in lb (standard table, 70 to 126 covers passenger, LT and temporary spares).
const LOAD_KG: Record<number, number> = {
  70: 335, 71: 345, 72: 355, 73: 365, 74: 375, 75: 387, 76: 400, 77: 412, 78: 425, 79: 437, 80: 450, 81: 462, 82: 475, 83: 487, 84: 500,
  85: 515, 86: 530, 87: 545, 88: 560, 89: 580, 90: 600, 91: 615, 92: 630, 93: 650, 94: 670, 95: 690, 96: 710, 97: 730, 98: 750, 99: 775,
  100: 800, 101: 825, 102: 850, 103: 875, 104: 900, 105: 925, 106: 950, 107: 975, 108: 1000, 109: 1030, 110: 1060, 111: 1090, 112: 1120,
  113: 1150, 114: 1180, 115: 1215, 116: 1250, 117: 1285, 118: 1320, 119: 1360, 120: 1400, 121: 1450, 122: 1500, 123: 1550, 124: 1600,
  125: 1650, 126: 1700,
};
export const loadLb = (li: string | null) => {
  const kg = li ? LOAD_KG[parseInt(li, 10)] : undefined;
  return kg ? Math.round(kg * 2.20462) : null;
};

function loadRows(): TireRow[] {
  const file = path.resolve('data/tires.json');
  const rows: TireRow[] = JSON.parse(fs.readFileSync(file, 'utf8'));
  return rows.filter((r) => r.year >= 2000 && parseSize(r.size));
}

let cache: Make[] | null = null;

export function getMakes(): Make[] {
  if (cache) return cache;
  const byModel = new Map<string, TireRow[]>();
  for (const r of loadRows()) {
    const k = `${r.make}|${r.model}`;
    if (!byModel.has(k)) byModel.set(k, []);
    byModel.get(k)!.push(r);
  }
  const makes = new Map<string, Make>();
  for (const rows of byModel.values()) {
    const { make, model } = rows[0];
    const byYear = new Map<number, TireRow[]>();
    for (const r of rows) {
      if (!byYear.has(r.year)) byYear.set(r.year, []);
      const list = byYear.get(r.year)!;
      const code = parseSize(r.size)!.code;
      // One row per size and position; keep the most confident.
      const i = list.findIndex((x) => parseSize(x.size)!.code === code && x.position === r.position);
      if (i === -1) list.push(r);
      else if (r.confidence > list[i].confidence) list[i] = r;
    }
    const posOrder: Record<Position, number> = { all: 0, front: 1, rear: 2, spare: 3 };
    const years: YearPage[] = [...byYear.entries()]
      .map(([year, list]) => {
        list.sort((a, b) => posOrder[a.position] - posOrder[b.position] || parseSize(a.size)!.rim - parseSize(b.size)!.rim || a.size.localeCompare(b.size));
        const road = list.filter((r) => r.position !== 'spare');
        return {
          make, makeSlug: slugify(make), model, modelSlug: slugify(model), year,
          road,
          spare: list.filter((r) => r.position === 'spare'),
          staggered: road.some((r) => r.position === 'front') && road.some((r) => r.position === 'rear'),
          sample: list.some((r) => r.sample),
        };
      })
      .filter((y) => y.road.length > 0)
      .sort((a, b) => b.year - a.year);
    if (!years.length) continue;
    const m: Model = {
      make, makeSlug: slugify(make), model, modelSlug: slugify(model), years,
      sizes: [...new Set(years.flatMap((y) => y.road.map((r) => parseSize(r.size)!.code)))].sort(bySize),
      firstYear: Math.min(...years.map((y) => y.year)),
      lastYear: Math.max(...years.map((y) => y.year)),
    };
    if (!makes.has(make)) makes.set(make, { make, makeSlug: slugify(make), models: [] });
    makes.get(make)!.models.push(m);
  }
  cache = [...makes.values()]
    .map((mk) => ({ ...mk, models: mk.models.sort((a, b) => a.model.localeCompare(b.model)) }))
    .sort((a, b) => a.make.localeCompare(b.make));
  return cache;
}

export function bySize(a: string, b: string) {
  const x = parseSize(a)!, y = parseSize(b)!;
  return x.rim - y.rim || x.width - y.width || x.aspect - y.aspect;
}

export const getModels = () => getMakes().flatMap((m) => m.models);
export const getYearPages = () => getModels().flatMap((m) => m.years);

// Road sizes (not spares) with the model-years that use them.
export function getSizes(): { size: Size; uses: YearPage[] }[] {
  const map = new Map<string, { size: Size; uses: YearPage[] }>();
  for (const y of getYearPages()) for (const r of y.road) {
    const s = parseSize(r.size)!;
    if (!map.has(s.code)) map.set(s.code, { size: s, uses: [] });
    const e = map.get(s.code)!;
    if (!e.uses.includes(y)) e.uses.push(y);
  }
  return [...map.values()].sort((a, b) => bySize(a.size.code, b.size.code));
}

export const yearRange = (m: Model) => (m.firstYear === m.lastYear ? `${m.firstYear}` : `${m.firstYear} to ${m.lastYear}`);
export const sizeHref = (code: string) => `/sizes/${parseSize(code)!.slug}/`;
export const yearHref = (y: { makeSlug: string; modelSlug: string; year: number }) => `/${y.makeSlug}/${y.modelSlug}/${y.year}/`;

export function listSizes(codes: string[]): string {
  if (codes.length <= 1) return codes.join('');
  return `${codes.slice(0, -1).join(', ')} or ${codes[codes.length - 1]}`;
}

export const positionLabel = (p: Position) => ({ all: 'Front and rear', front: 'Front', rear: 'Rear', spare: 'Spare' })[p];

export function pressureText(r: TireRow): string | null {
  const f = r.pressure_psi_front, b = r.pressure_psi_rear;
  if (f && b && f !== b) return `${f} psi front, ${b} psi rear`;
  if (f || b) return `${f ?? b} psi`;
  return null;
}
