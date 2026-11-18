// Statistics from our own owner's-manual tire data (data/tires.json), computed at build time so they
// update whenever new manuals are added.
import fs from 'node:fs';
import path from 'node:path';
import { parseSize, type TireRow, type Size } from './data';

const median = (v: number[]) => { const s = [...v].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const pct = (n: number, d: number) => (d ? (100 * n) / d : 0);

export interface MY { make: string; model: string; year: number; sizes: Size[]; psiRear: number | null; lt: boolean; maxRim: number; minRim: number; aspect: number; width: number; spare: boolean; staggered: boolean; psi: number | null }

let cache: ReturnType<typeof build> | null = null;
export const tireStats = () => (cache ??= build());

function build() {
  const raw: TireRow[] = JSON.parse(fs.readFileSync(path.resolve('data', 'tires.json'), 'utf8')).filter((r: TireRow) => !r.sample);
  const groups = new Map<string, TireRow[]>();
  for (const r of raw) { const k = `${r.make}|${r.model}|${r.year}`; if (!groups.has(k)) groups.set(k, []); groups.get(k)!.push(r); }
  const rows: MY[] = [];
  for (const rs of groups.values()) {
    const isSpare = (r: TireRow) => r.position === 'spare' || parseSize(r.size)?.prefix === 'T';
    const main = rs.filter((r) => !isSpare(r));
    const sizes = main.map((r) => parseSize(r.size)).filter((s): s is Size => !!s);
    if (!sizes.length) continue;
    const psis = main.map((r) => r.pressure_psi_front).filter((p): p is number => !!p);
    const psisR = main.map((r) => r.pressure_psi_rear).filter((p): p is number => !!p);
    rows.push({ make: rs[0].make, model: rs[0].model, year: rs[0].year, sizes, maxRim: Math.max(...sizes.map((s) => s.rim)), minRim: Math.min(...sizes.map((s) => s.rim)),
      aspect: median(sizes.map((s) => s.aspect)), width: median(sizes.map((s) => s.width)), spare: rs.some(isSpare), staggered: main.some((r) => r.position === 'front' || r.position === 'rear'),
      psi: psis.length ? median(psis) : null, psiRear: psisR.length ? median(psisR) : null, lt: sizes.some((x) => x.prefix === 'LT') });
  }
  const years = [...new Set(rows.map((r) => r.year))].sort((a, b) => a - b);
  const makes = [...new Set(rows.map((r) => r.make))].sort();
  const periods: [number, number][] = [[2010, 2014], [2015, 2019], [2020, 2024], [2025, 2026]];
  const inP = ([a, b]: [number, number]) => rows.filter((r) => r.year >= a && r.year <= b);
  const byPeriod = periods.map((p) => { const rs = inP(p); return { label: `${p[0]}–${p[1]}`, n: rs.length,
    meanMaxRim: rs.length ? rs.reduce((a, r) => a + r.maxRim, 0) / rs.length : 0, meanMinRim: rs.length ? rs.reduce((a, r) => a + r.minRim, 0) / rs.length : 0,
    rim19: pct(rs.filter((r) => r.maxRim >= 19).length, rs.length), rim18: pct(rs.filter((r) => r.maxRim >= 18).length, rs.length),
    base18: pct(rs.filter((r) => r.minRim >= 18).length, rs.length), base16: pct(rs.filter((r) => r.minRim <= 16).length, rs.length),
    spare: pct(rs.filter((r) => r.spare).length, rs.length), aspect: rs.length ? median(rs.map((r) => r.aspect)) : 0,
    psi: median(rs.map((r) => r.psi).filter((p): p is number => p !== null)) }; }).filter((p) => p.n);
  const allSizes = rows.flatMap((r) => [...new Set(r.sizes.map((s) => s.code))].map((code) => r.sizes.find((s) => s.code === code)!));
  const sizeCount = new Map<string, { s: Size; n: number }>();
  for (const s of allSizes) { const e = sizeCount.get(s.code) ?? { s, n: 0 }; e.n++; sizeCount.set(s.code, e); }
  const topSizes = [...sizeCount.values()].sort((a, b) => b.n - a.n).slice(0, 12);
  const rimShare = [14, 15, 16, 17, 18, 19, 20, 21, 22].map((d) => ({ rim: d, pct: pct(rows.filter((r) => r.sizes.some((s) => s.rim === d)).length, rows.length) })).filter((x) => x.pct > 0);
  const byYear = years.map((y) => { const rs = rows.filter((r) => r.year === y); return { year: y, n: rs.length, meanMaxRim: rs.reduce((a, r) => a + r.maxRim, 0) / rs.length, rim19: pct(rs.filter((r) => r.maxRim >= 19).length, rs.length), spare: pct(rs.filter((r) => r.spare).length, rs.length) }; });
  // Recommended cold pressures (front, median across a model year's sizes). Light-truck (LT) fitments run much higher, so
  // the distribution and records use passenger fitments only.
  const pr = rows.filter((r) => r.psi !== null && !r.lt);
  const psiDist = new Map<number, number>();
  for (const r of pr) { const k = Math.round(r.psi!); psiDist.set(k, (psiDist.get(k) ?? 0) + 1); }
  const spareRows = raw.filter((r) => r.position === 'spare' || parseSize(r.size)?.prefix === 'T');
  const spareT = spareRows.filter((r) => parseSize(r.size)?.prefix === 'T');
  const spareT60 = spareT.filter((r) => r.pressure_psi_front === 60).length;
  const both = pr.filter((r) => r.psiRear !== null);
  const pressure = {
    n: pr.length, median: median(pr.map((r) => r.psi!)),
    dist: [...psiDist.entries()].sort((a, b) => a[0] - b[0]).filter(([, n]) => n >= 3).map(([psi, n]) => ({ psi, pct: pct(n, pr.length) })),
    diffFR: pct(both.filter((r) => r.psi !== r.psiRear).length, both.length), rearHigher: pct(both.filter((r) => r.psiRear! > r.psi!).length, both.length),
    byMake: makes.map((m) => { const v = pr.filter((r) => r.make === m).map((r) => r.psi!); return { label: m, n: v.length, median: v.length ? median(v) : 0 }; }).filter((x) => x.n),
    byPeriod: periods.map(([a, b]) => { const v = pr.filter((r) => r.year >= a && r.year <= b).map((r) => r.psi!); return { label: `${a}–${b}`, n: v.length, median: v.length ? median(v) : 0 }; }).filter((x) => x.n),
    low: pr.reduce((a, b) => (b.psi! < a.psi! ? b : a)), high: pr.reduce((a, b) => (b.psi! > a.psi! ? b : a)),
    spareT: spareT.length, spareT60: pct(spareT60, spareT.filter((r) => r.pressure_psi_front).length), lt: rows.filter((r) => r.lt).length,
  };
  const biggest = rows.reduce((a, b) => (b.maxRim > a.maxRim ? b : a));
  return { rows, years, makes, models: new Set(rows.map((r) => `${r.make}|${r.model}`)).size, modelYears: rows.length, distinctSizes: sizeCount.size,
    byPeriod, byYear, topSizes, rimShare, biggest, pressure, staggered: rows.filter((r) => r.staggered).length };
}
