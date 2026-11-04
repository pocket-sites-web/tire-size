# Car Tire Sizes

Factory tire size by make, model and year, from owner's manuals. Astro static site, deployed by Cloudflare Pages (build `npm run build`, output `dist`).

## Pages
- `/[make]/[model]/[year]/`: the main landing page ("2015 nissan altima tire size"): every factory size, load/speed, pressure, spare, source page.
- `/[make]/[model]/`: sizes by year table + year picker.
- `/[make]/`, `/makes/`, `/sizes/`, `/sizes/[size]/` (dimensions + cars that use it), `/how-to-read-tire-size/`, about, sources, privacy, contact.

## Data
`data/tires.json`, one row per size, exported from the vehicle DB on Jon's PC (`data\exports\tires.json`):

```json
{"make":"Toyota","model":"Corolla","year":2010,"size":"P195/65R15","load_index":"89","speed_rating":"S",
 "position":"all|front|rear|spare","pressure_psi_front":32,"pressure_psi_rear":32,"wheel":"6.5J x 15",
 "trim_note":null,"page":"433","source_url":"","confidence":0.9}
```
Rows with `"sample": true` are placeholders and show a "Sample data" label.

## Launch switches (`src/lib/site.ts`)
- `PREVIEW = true`: noindex on every page, robots.txt blocks all, banner shown. Set to `false` at launch.
- `SITE_URL`, `SITE_NAME`; `AMAZON_TAG` (booforgen-20); SimpleTire links once approved.
