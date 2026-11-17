import type { APIRoute } from 'astro';
import { tireStats } from '../../lib/tirestats';

// CSV download for /statistics/wheel-size-trends/: one row per model year in our owner's-manual data.
export const GET: APIRoute = () => {
  const q = (v: string | number) => (/[",]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
  const rows = [...tireStats().rows].sort((a, b) => a.make.localeCompare(b.make) || a.model.localeCompare(b.model) || a.year - b.year);
  const lines = [['make', 'model', 'model_year', 'smallest_wheel_in', 'largest_wheel_in', 'oe_sizes', 'spare_listed', 'front_pressure_psi'].join(','),
    ...rows.map((r) => [r.make, r.model, r.year, r.minRim, r.maxRim, [...new Set(r.sizes.map((s) => s.code))].join(' '), r.spare ? 1 : 0, r.psi ?? ''].map(q).join(','))];
  return new Response(lines.join('\n') + '\n', { headers: { 'Content-Type': 'text/csv; charset=utf-8' } });
};
