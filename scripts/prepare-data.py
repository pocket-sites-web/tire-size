#!/usr/bin/env python3
"""Clean the scraper's tires.json export into data/tires.json for the site.

Usage: python scripts/prepare-data.py path/to/export/tires.json

- normalises sizes (spaces, case, "P 195/65 R15" -> "P195/65R15")
- keeps US rows with a valid size, year >= 2000, confidence >= 0.6
- drops exact duplicates (same make/model/year/size/position), keeping the most confident
- prints a per-make summary and anything it dropped
"""
import json, re, sys, collections

SIZE = re.compile(r'^(P|LT|T)?(\d{3})/(\d{2})(R|D|ZR)(\d{2})$')
POS = {'all', 'front', 'rear', 'spare'}

def norm_size(s):
    s = re.sub(r'\s+', '', (s or '').upper())
    s = s.replace('ZR', 'R')  # ZR is an old speed marking; the site shows radial
    m = SIZE.match(s)
    return s if m else None

KEEP_UPPER = {'GT', 'EV', 'HEV', 'PHEV', 'SUV', 'XL', 'N', 'LX', 'GX', 'RX', 'NX', 'UX', 'IS', 'ES', 'GS', 'LS', 'LC', 'RC', 'RZ', 'TX', 'LM', 'GTI', 'SE', 'LE', 'XLE', 'II', 'III', 'IV', 'FR-S', 'GR', 'GR86', 'BZ4X', 'C-HR', 'CR-V', 'HR-V', 'GT-R', 'NV', 'NV200', 'K5', 'K900', 'EV6', 'EV9'}

ALIASES = {'Rav Plug In Hybrid': 'RAV4 Plug-in Hybrid', 'BZ': 'bZ', 'BZ4X': 'bZ4X', 'BZ Woodland': 'bZ Woodland'}

def norm_model(m):
    """Tidy model names as printed: ELANTRA Hybrid -> Elantra Hybrid, NEXO fuel cell -> Nexo Fuel Cell,
    Plugin -> Plug-in, Lexus ESh -> ES Hybrid. Codes like RAV4, CR-V, GS stay as they are."""
    m = re.sub(r'\s+', ' ', m.strip())
    m = ALIASES.get(m, m)
    if re.fullmatch(r'[A-Z]{2}h', m):
        m = m[:2] + ' Hybrid'
    words = m.split(' ')
    if any(w not in KEEP_UPPER and re.fullmatch(r'[A-Z][A-Z-]{3,}', w) for w in words):
        def word(w):
            if w in KEEP_UPPER or re.search(r'\d', w):
                return w
            return '-'.join(p.capitalize() for p in w.split('-'))
        m = ' '.join(word(w) for w in words)
    m = re.sub(r'\bPlug-?in\b', 'Plug-in', m, flags=re.I)
    return ALIASES.get(m, m)

def num(v):
    try:
        return int(round(float(v))) if v not in (None, '') else None
    except (TypeError, ValueError):
        return None

def main(src):
    rows = json.load(open(src, encoding='utf-8'))
    out, dropped = {}, collections.Counter()
    for r in rows:
        size = norm_size(r.get('size'))
        if not size: dropped['bad size'] += 1; continue
        year = num(r.get('year'))
        if not year or year < 2000: dropped['year'] += 1; continue
        if (r.get('confidence') or 0) < 0.6: dropped['low confidence'] += 1; continue
        pos = (r.get('position') or 'all').lower()
        if pos not in POS: pos = 'all'
        if size.startswith('T'): pos = 'spare'
        clean = {
            'make': r['make'].strip().title() if r['make'].isupper() else r['make'].strip(), 'model': norm_model(r['model']), 'year': year, 'size': size,
            'load_index': str(r['load_index']).strip() if r.get('load_index') else None,
            'speed_rating': (r.get('speed_rating') or '').strip().upper() or None,
            'position': pos,
            'pressure_psi_front': num(r.get('pressure_psi_front')),
            'pressure_psi_rear': num(r.get('pressure_psi_rear')),
            'wheel': r.get('wheel') or None, 'trim_note': r.get('trim_note') or None,
            'page': str(r['page']) if r.get('page') not in (None, '') else None,
            'source_url': r.get('source_url') or None,
            'confidence': float(r.get('confidence') or 0),
        }
        if r.get('sample'): clean['sample'] = True
        # Implausible pressures are extraction noise.
        for k in ('pressure_psi_front', 'pressure_psi_rear'):
            if clean[k] is not None and not (20 <= clean[k] <= 80): clean[k] = None
            # 60 psi on a passenger (non-LT) road tire is the temporary spare's pressure bleeding into the row.
            if clean[k] is not None and clean[k] >= 50 and pos != 'spare' and not size.startswith('LT'): clean[k] = None
        key = (clean['make'], clean['model'], year, size.lstrip('P'), pos)
        if key not in out or clean['confidence'] > out[key]['confidence']:
            if key in out: dropped['duplicate'] += 1
            out[key] = clean
        else:
            dropped['duplicate'] += 1
    final = sorted(out.values(), key=lambda r: (r['make'], r['model'], -r['year'], r['position'], r['size']))
    json.dump(final, open('data/tires.json', 'w', encoding='utf-8'), indent=0, ensure_ascii=False)
    by = collections.defaultdict(set)
    for r in final: by[r['make']].add((r['model'], r['year']))
    print(f'{len(final)} rows written to data/tires.json')
    for mk, ys in sorted(by.items()): print(f'  {mk}: {len(ys)} model-years, {len({m for m, _ in ys})} models')
    if dropped: print('dropped:', dict(dropped))

if __name__ == '__main__':
    main(sys.argv[1])
