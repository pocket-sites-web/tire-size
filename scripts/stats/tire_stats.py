"""Statistics for cartiresizes.com/statistics/ (NHTSA parts; our own size data is computed at build time).

Usage: python3 scripts/stats/tire_stats.py RECALLS_TXT NHTSA_COMPLAINTS_DIR
  RECALLS_TXT: FLAT_RCL_POST_2010.txt from https://static.nhtsa.gov/odi/ffdd/rcl/FLAT_RCL_POST_2010.zip
  NHTSA_COMPLAINTS_DIR: unzipped COMPLAINTS_RECEIVED_*.txt from https://static.nhtsa.gov/odi/ffdd/cmpl/
Writes src/data/stats/*.json and public/data/*.csv.
"""
import sys, os, json, csv, glob
import pandas as pd
UPPER = {"Bmw": "BMW", "Gmc": "GMC", "Mini": "MINI"}
def nice(x): return " ".join(UPPER.get(w, w) for w in x.title().split())

ROOT = os.path.join(os.path.dirname(__file__), '..', '..')
OUT = os.path.join(ROOT, 'src', 'data', 'stats'); os.makedirs(OUT, exist_ok=True)
PUB = os.path.join(ROOT, 'public', 'data'); os.makedirs(PUB, exist_ok=True)
RCL, CMPL = sys.argv[1], sys.argv[2]
def dump(name, obj):
    with open(os.path.join(OUT, name), 'w') as f: json.dump(obj, f, indent=1)
def has(s, p): return s.str.contains(p, regex=True)

# ---------- 1. Recalls ----------
cols = ['RECORD_ID', 'CAMPNO', 'MAKETXT', 'MODELTXT', 'YEARTXT', 'MFGCAMPNO', 'COMPNAME', 'MFGNAME', 'BGMAN', 'ENDMAN', 'RCLTYPECD', 'POTAFF', 'ODATE', 'INFLUENCED_BY', 'MFGTXT', 'RCDATE', 'DATEA', 'RPNO', 'FMVSS', 'DESC_DEFECT', 'CONEQUENCE_DEFECT', 'CORRECTIVE_ACTION', 'NOTES', 'RCL_CMPT_ID', 'MFR_COMP_NAME', 'MFR_COMP_DESC', 'MFR_COMP_PTNO', 'DO_NOT_DRIVE', 'PARK_OUTSIDE']
r = pd.read_csv(RCL, sep='\t', header=None, names=cols, quoting=csv.QUOTE_NONE, encoding='latin-1', dtype=str, on_bad_lines='skip')
r['MFGNAME'] = r['MFGNAME'].fillna('').str.strip().str.rstrip('.').str.strip().str.replace(', LLC', ' LLC', regex=False).str.replace(', Inc', ' Inc', regex=False)
key = r['MFGNAME'].str.upper().str.replace(r'[^A-Z0-9 ]', '', regex=True).str.replace(r'\s+', ' ', regex=True)
disp = r.assign(k=key, up=r['MFGNAME'].str.isupper()).sort_values('up').groupby('k')['MFGNAME'].first()
r['MFGNAME'] = key.map(disp)
r['pot'] = pd.to_numeric(r['POTAFF'], errors='coerce'); r['yr'] = r['RCDATE'].str[:4]; r['comp0'] = r['COMPNAME'].fillna('').str.split(':').str[0]
camp = r.groupby('CAMPNO').agg(typ=('RCLTYPECD', 'first'), yr=('yr', 'first'), pot=('pot', 'max'), mfr=('MFGNAME', 'first'), desc=('DESC_DEFECT', 'first'), cons=('CONEQUENCE_DEFECT', 'first'),
                               fmvss=('FMVSS', lambda s: ' '.join(s.dropna())), comps=('COMPNAME', lambda s: set(s.dropna())), comp0=('comp0', lambda s: set(s)))
camp = camp[camp['yr'].between('2010', '2025')]
tr = camp[camp['typ'] == 'T'].copy()
tt = (tr['desc'].fillna('') + ' ' + tr['cons'].fillna('')).str.upper()
THEMES = {
    'Sidewall markings or labelling wrong or missing': r'MARK|LABEL|DOT|TIN\b|IDENTIFICATION NUMBER|SIDEWALL (?:MAY )?(?:BE )?(?:INCORRECT|MISSING)|LOAD (?:RANGE|INDEX|RATING)[^.]{0,30}(?:INCORRECT|MISLABEL)',
    'Tread or belt separation': r'TREAD (?:AND/OR BELT )?SEPARAT|BELT (?:EDGE )?SEPARAT|TREAD SEPARAT|DETREAD',
    'Sidewall cracks, bulges or cuts': r'SIDEWALL (?:CRACK|BULGE|BUBBLE|SEPARAT|CUT|DAMAGE|FAIL)|BULGE|BUBBLE',
    'Bead problems': r'\bBEAD',
    'Air loss or blowout risk': r'AIR LOSS|LOSS OF (?:AIR|INFLATION|TIRE PRESSURE)|BLOW ?OUT|RAPID (?:AIR )?LOSS|DEFLAT',
    'Manufacturing defect (curing, compound, cords)': r'CURE|CURING|COMPOUND|CORD|SPLICE|CONTAMINAT|MOLD',
}
mark = has(tt, THEMES['Sidewall markings or labelling wrong or missing']) | tr['comps'].apply(lambda s: 'TIRES:MARKINGS' in s)
rc = {'years': [2010, 2025], 'tire_campaigns': int(len(tr)), 'tires': int(tr['pot'].sum()),
      'markings': int(mark.sum()), 'markings_tires': int(tr.loc[mark, 'pot'].sum()), 'markings_pct': round(100 * mark.mean(), 1),
      'fmvss139': int(tr['fmvss'].str.contains(r'\b139\b').sum()),
      'structural': int((~mark).sum()), 'structural_tires': int(tr.loc[~mark, 'pot'].sum())}
rc['themes'] = sorted([{'theme': k, 'n': int(has(tt, p).sum())} for k, p in THEMES.items()], key=lambda x: -x['n'])
rc['tire_by_year'] = {y: {'campaigns': int(len(g)), 'tires': int(g['pot'].sum())} for y, g in tr.groupby('yr')}
mf = tr.groupby('mfr').agg(n=('pot', 'size'), veh=('pot', 'sum')).sort_values('n', ascending=False).head(12)
rc['tire_by_mfr'] = [{'mfr': k, 'campaigns': int(v['n']), 'tires': int(v['veh'])} for k, v in mf.iterrows()]
big = tr.sort_values('pot', ascending=False).head(8)
rc['largest'] = [{'mfr': v['mfr'], 'year': v['yr'], 'tires': int(v['pot']), 'campaign': k} for k, v in big.iterrows()]
vr = camp[camp['typ'] == 'V']
vt = (vr['desc'].fillna('') + ' ' + vr['cons'].fillna('')).str.upper()
vtire = vr['comp0'].apply(lambda s: 'TIRES' in s); vwheel = vr['comp0'].apply(lambda s: 'WHEELS' in s)
plac = vr['fmvss'].str.contains(r'\b110\b') | has(vt, r'PLACARD|TIRE (?:AND LOADING )?INFORMATION LABEL')
rc.update({'vehicle_campaigns': int(len(vr)), 'vehicle_tire': int(vtire.sum()), 'vehicle_tire_vehicles': int(vr.loc[vtire, 'pot'].sum()),
           'vehicle_wheel': int(vwheel.sum()), 'vehicle_wheel_vehicles': int(vr.loc[vwheel, 'pot'].sum()),
           'placard': int(plac.sum()), 'placard_vehicles': int(vr.loc[plac, 'pot'].sum()),
           'lug': int((vwheel & has(vt, r'LUG|WHEEL NUT|STUD')).sum()), 'wheel_detach': int((vwheel & has(vt, r'WHEEL (?:MAY |COULD )?(?:DETACH|SEPARAT|COME OFF)|DETACH|LOSS OF A WHEEL|WHEEL SEPARATION')).sum())})
dump('tire-recalls.json', rc)
with open(os.path.join(PUB, 'tire-recalls-by-year.csv'), 'w', newline='') as f:
    w = csv.writer(f); w.writerow(['year_recall_filed', 'tire_recall_campaigns', 'tires_potentially_affected'])
    for y, v in rc['tire_by_year'].items(): w.writerow([y, v['campaigns'], v['tires']])

# ---------- 2. Complaints ----------
names = ['CMPLID', 'ODINO', 'MFR_NAME', 'MAKETXT', 'MODELTXT', 'YEARTXT', 'CRASH', 'FAILDATE', 'FIRE', 'INJURED', 'DEATHS', 'COMPDESC', 'CITY', 'STATE', 'VIN', 'DATEA', 'LDATE', 'MILES', 'OCCURENCES', 'CDESCR', 'CMPL_TYPE'] + [f'f{i}' for i in range(22, 52)]
parts = [pd.read_csv(fp, sep='\t', header=None, names=names, usecols=['ODINO', 'MAKETXT', 'MODELTXT', 'YEARTXT', 'CRASH', 'INJURED', 'LDATE', 'COMPDESC', 'CDESCR', 'f46'], quoting=csv.QUOTE_NONE, encoding='latin-1', dtype=str, on_bad_lines='skip') for fp in sorted(glob.glob(os.path.join(CMPL, 'COMPLAINTS_RECEIVED_*.txt')))]
c = pd.concat(parts, ignore_index=True)
c = c.groupby('ODINO').agg(ptype=('f46', 'first'), make=('MAKETXT', 'first'), model=('MODELTXT', 'first'), year=('YEARTXT', 'first'), ld=('LDATE', 'first'), crash=('CRASH', 'first'),
                           inj=('INJURED', 'first'), txt=('CDESCR', 'first'), comp=('COMPDESC', lambda s: '|'.join(s.dropna()))).reset_index()
c['make'] = c['make'].replace({'MERCEDES BENZ': 'MERCEDES-BENZ'})
c['yr'] = c['ld'].str[:4]; c = c[c['yr'].between('2015', '2025')].copy(); c['txt'] = c['txt'].fillna('').str.upper()
v = c[c['ptype'] == 'V'].copy(); tcomp = c[c['ptype'] == 'T']
vtc = v['comp'].str.contains('TIRES'); vwc = v['comp'].str.contains('WHEELS')
tirev = v[vtc]; allt = pd.concat([tirev, tcomp])
at = allt['txt']
CT = {
    'Blowout or sudden air loss': r'BLOW ?OUT|BLEW (?:OUT|UP)|EXPLOD|SUDDEN(?:LY)? (?:LOST|LOSS OF) (?:AIR|PRESSURE)',
    'Tread separation': r'TREAD (?:SEPARAT|CAME OFF|PEEL|DELAMIN)|SEPARATION OF THE TREAD|DE-?TREAD|BELT SEPARAT',
    'Sidewall bubble, bulge or crack': r'BUBBLE|BULGE|SIDEWALL (?:CRACK|SPLIT|FAIL|SEPARAT|TEAR|DAMAGE)|CRACK(?:S|ED|ING)? (?:IN|ON) THE SIDEWALL',
    'Premature or uneven wear': r'PREMATURE(?:LY)? WEAR|WORE OUT|WORN OUT|UNEVEN(?:LY)? WEAR|EXCESSIVE(?:LY)? WEAR|INNER (?:EDGE|TREAD)|CUPPING|WEAR(?:ING)? (?:ON THE )?INSIDE',
    'Tire pressure (TPMS) problems': r'\bTPMS\b|TIRE PRESSURE (?:MONITOR|SENSOR|LIGHT|WARNING)',
    'Slow leak or won\'t hold air': r'SLOW LEAK|LEAK(?:S|ING|ED)? AIR|WON.?T HOLD AIR|NOT HOLD(?:ING)? AIR|LOSING AIR|LOSES AIR',
    'Cracking or dry rot': r'DRY ?ROT|WEATHER CRACK|CRACKING|CRACKS',
    'Spare tire or jack': r'SPARE TIRE|SPARE\b|DONUT|JACK\b',
}
cc = {'years': [2015, 2025], 'vehicle_total': int(len(v)), 'vehicle_tire': int(vtc.sum()), 'vehicle_tire_pct': round(100 * vtc.mean(), 2),
      'vehicle_wheel': int(vwc.sum()), 'tire_product': int(len(tcomp)), 'all_tire': int(len(allt)),
      'crash': int((allt['crash'] == 'Y').sum()), 'injury': int((pd.to_numeric(allt['inj'], errors='coerce').fillna(0) > 0).sum()),
      'crash_pct': round(100 * (allt['crash'] == 'Y').mean(), 1), 'crash_pct_vehicle_all': round(100 * (v['crash'] == 'Y').mean(), 1)}
cc['themes'] = sorted([{'theme': k, 'n': int(has(at, p).sum())} for k, p in CT.items()], key=lambda x: -x['n'])
cc['by_year'] = {y: int(len(g)) for y, g in allt.groupby('yr')}
mk = v.groupby('make').size(); mt = tirev.groupby('make').size()
tb = pd.DataFrame({'all': mk, 't': mt}).fillna(0); tb = tb[tb['all'] >= 3000]; tb['pct'] = 100 * tb['t'] / tb['all']
cc['by_make'] = [{'make': nice(m), 'complaints': int(x['all']), 'tire': int(x['t']), 'pct': round(x['pct'], 1)} for m, x in tb.sort_values('pct', ascending=False).iterrows()]
top = tirev[(tirev['year'] != '9999') & (tirev['make'] != 'UNKNOWN')].groupby(['year', 'make', 'model']).size().sort_values(ascending=False).head(12)
cc['top_model_years'] = [{'model': f'{y} {nice(a)} {nice(b)}', 'n': int(n)} for (y, a, b), n in top.items()]
dump('tire-complaints.json', cc)
with open(os.path.join(PUB, 'tire-complaints-by-make.csv'), 'w', newline='') as f:
    w = csv.writer(f); w.writerow(['make', 'nhtsa_vehicle_complaints_2015_2025', 'complaints_listing_tires_component', 'pct'])
    for x in cc['by_make']: w.writerow([x['make'], x['complaints'], x['tire'], x['pct']])
print('ok', rc['tire_campaigns'], cc['all_tire'])
