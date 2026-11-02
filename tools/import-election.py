"""Convert the six supplied workbooks into an idempotent, private Firebase import.
Run with --downloads DIR --output DIR. Never embeds operational data in the website/APK.
Uses the Routes sheets, expands merged cells, and preserves source references.
"""
import argparse, collections, hashlib, json, re
from pathlib import Path
import openpyxl

FILES = [
 'B. ZPTC-MPTC ELECTION 2026.xlsx',
 'NORTH ZONE FAIR ZPTC-MPTC ELECTION 2026 19.10.2026 (2).xlsx',
 'EAST ZONE B. ZPTC-MPTC ELECTION 2026 (1).xlsx',
 'B. ZPTC-MPTC ELECTION 2026 Kadiyam PS.xlsx',
 'B. ZPTC-MPTC ELECTION 2026 BMR.xlsx',
 'B. ZPTC-MPTC ELECTION 2026 REVISED OF KOVVUR SUB-DIVISION 10.10.2026.xlsx',
]
ELECTION = 'ZPTC-MPTC 2026'
def clean(v): return re.sub(r'\s+', ' ', str(v or '')).strip()
def norm(v): return re.sub(r'[^a-z0-9]', '', clean(v).lower())
ALIASES = {
 'korukonda':'Korukonda PS', 'gokavaram':'Gokavaram PS', 'seethanagaram':'Seetha Nagaram PS',
 'rajanagaram':'Rajanagaram PS', 'rajahmendravaramruralmandal':'Rajanagaram PS',
 'rajamahendravaramrural':'Rajanagaram PS', 'kadiyam':'Kadiyam PS', 'bommuru':'Bommuru PS',
 'anaparthi':'Anaparthi PS','biccavole':'Biccavolu PS','rangampeta':'Rangampeta PS',
 'mandapetatown':'Mandapeta town PS','mandapetarural':'Mandapeta rural PS', 'angara':'Angara PS','rayavaram':'Rayavaram PS',
 'kovvurtown':'Kovvuru town PS','kovvurrural':'Kovvuru rural PS','chagallu':'Chagallu PS',
 'tallapudi':'Thallapudi PS','devarapalli':'Devarapalli PS','gopalapuram':'Gopalapuram PS',
 'nallajarla':'Nallajarla PS','nallajerla':'Nallajarla PS','nidadavole':'Nidadavolu PS','samisragudem':'Samisragudem PS',
 'peravali':'Peravali PS','undrajavaram':'Undrajavaram PS',
}
def canonical(v): return ALIASES.get(re.sub(r'ps$', '', norm(v)))
def division(ps):
 if ps == 'Bommuru PS': return 'Rajahmundry Urban'
 if ps in ['Korukonda PS','Gokavaram PS','Seetha Nagaram PS','Rajanagaram PS','Kadiyam PS']: return 'Rajahmundry Rural'
 if ps in ['Anaparthi PS','Biccavolu PS','Rangampeta PS','Mandapeta town PS','Mandapeta rural PS','Angara PS','Rayavaram PS']: return 'Mandapeta Sub-division'
 return 'Kovvur Sub-division'
def number(v):
 m = re.search(r'-?\d+(?:\.\d+)?', clean(v))
 return float(m.group()) if m else None
def route_number(v):
 m = re.search(r'\d+', clean(v))
 return int(m.group()) if m else None
def key(prefix, value): return prefix + hashlib.sha256(value.encode()).hexdigest()[:20]
def expanded(sheet):
 rows = [list(r) for r in sheet.values]
 for area in sheet.merged_cells.ranges:
  value = rows[area.min_row-1][area.min_col-1]
  for r in range(area.min_row-1, area.max_row):
   for c in range(area.min_col-1, area.max_col): rows[r][c] = value
 return rows

def category(v):
 v=norm(v)
 if v=='hs' or v.startswith('hyper'): return 'HS'
 if v=='s' or v in ('sensitive','sinsitive'): return 'S'
 if v in ('n','normal','noraml'): return 'N'
 return ''

def convert(downloads):
 routes, sites, warnings, summaries = {}, {}, [], []
 duplicates=0
 # The explicitly named East Zone copy takes precedence over its generic duplicate.
 order=[FILES[2],FILES[0],FILES[1],FILES[3],FILES[4],FILES[5]]
 for filename in order:
  book=openpyxl.load_workbook(downloads/filename, data_only=True)
  sheet=book['3. Routes']; rows=expanded(sheet)
  ps={'NORTH': 'Korukonda PS'}.get(filename.split()[0], '')
  if 'Kadiyam' in filename: ps='Kadiyam PS'
  if 'BMR' in filename: ps='Bommuru PS'
  rv='';villages='';prefix='Route ';header=None;count=0
  for rownum,row in enumerate(rows,1):
   if norm(row[3])=='routemobile':
    if header is not None and prefix!='Rjy Rural Route ':
     warnings.append({'file':filename,'row':rownum,'issue':'Second route table lacks a police-station heading; excluded duplicate appendix'})
     break
    header={norm(v):i for i,v in enumerate(row) if v is not None};continue
   if header is None:continue
   rawps=clean(row[0]);current=canonical(rawps)
   if rawps.startswith('RAJAMAHENDRAVARAM RURAL'):
    current='Rajanagaram PS';prefix='Rjy Rural Route ';rv='';villages=''
   elif current and current!=ps:prefix='Route '
   if current and current!=ps:ps=current;rv='';villages=''
   if row[3] is not None:
    n=route_number(row[3]);rv=(prefix+str(n)) if n else ''
   if not ps or not rv:continue
   if filename==FILES[0] and any(r['ps']==ps and FILES[2] in r['sourceFiles'] for r in routes.values()):continue
   vi=header.get('villagescovered',header.get('wardscovered'))
   if vi is not None and row[vi] is not None:villages=clean(row[vi])
   rid=key('e26_r_',ps+'|'+rv)
   r=routes.setdefault(rid,{'election':ELECTION,'sd':division(ps),'ps':ps,'route':rv,'force':'route','villages':[], 'sourceFiles':[]})
   if villages and villages not in r['villages']:r['villages'].append(villages)
   if filename not in r['sourceFiles']:r['sourceFiles'].append(filename)
   ni=header['pollingstationlocationpsl'];name=clean(row[ni])
   if not name or name.isdigit():continue
   ci=next(i for h,i in header.items() if h.startswith('category'))
   cat=category(row[ci])
   if not cat:continue
   lat=number(row[header['lat']]);lng=number(row[header['long']])
   if lat is not None and lng is not None and 80<=lat<=83 and 16<=lng<=18:
    lat,lng=lng,lat;warnings.append({'file':filename,'row':rownum,'issue':'Latitude/longitude columns reversed; swapped'})
   if lat is None or lng is None or not (16<=lat<=18 and 80<=lng<=83):
    warnings.append({'file':filename,'row':rownum,'issue':'Missing/invalid district coordinates; map pin omitted','lat':lat,'lng':lng});lat=lng=None
   identity='|'.join([ps,rv,norm(name),str(lat),str(lng)])
   sid=key('e26_s_',identity)
   source={'file':filename,'sheet':'3. Routes','row':rownum}
   if sid in sites:
    sites[sid]['sources'].append(source);duplicates+=1;continue
   site={'el':ELECTION,'sd':division(ps),'ps':ps,'route':rv,'name':name,'cat':cat,'booths':clean(row[header['noofbooths']]),'voters':number(row[header['noofvoters']]) or 0,'sources':[source]}
   if lat is not None:site.update(lat=lat,lng=lng)
   sites[sid]=site;count+=1
  summaries.append({'file':filename,'uniqueLocations':count})
 for r in routes.values():r['villages']=', '.join(r['villages'])
 report={'files':summaries,'routes':len(routes),'locations':len(sites),'duplicateLocationRowsSkipped':duplicates,'locationsWithoutCoordinates':sum('lat' not in s for s in sites.values()),'routesByPS':dict(collections.Counter(r['ps'] for r in routes.values())),'warnings':warnings,
 'routesWithoutLocations':[(r['ps'],r['route']) for r in routes.values() if not any(r['ps']==site['ps'] and r['route']==site['route'] for site in sites.values())],
 'notes':['Route sheets are authoritative for this import because Data sheets have inconsistent route columns (e.g. all Rangampeta booths say route 6). The image states 152 routes and 698 locations; workbook route plans differ.','Generic and East Zone workbooks overlap; East Zone is retained first and duplicate locations are removed.','Rajamahendravaram Rural Mandal is listed under Rajanagaram PS in the image; its routes have a distinct Rjy Rural prefix.','Coordinates outside 16–18 N and 80–83 E are omitted for review. Reversed latitude/longitude pairs are swapped only when both match district ranges.']}
 return {'routes':routes,'stations':sites},report
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--downloads',type=Path,required=True);p.add_argument('--output',type=Path,required=True);a=p.parse_args()
 data,report=convert(a.downloads);a.output.mkdir(parents=True,exist_ok=True)
 (a.output/'election-config.json').write_text(json.dumps(data,indent=2,ensure_ascii=False)+'\n')
 (a.output/'import-report.json').write_text(json.dumps(report,indent=2,ensure_ascii=False)+'\n')
 print(json.dumps({k:v for k,v in report.items() if k!='warnings'},indent=2));print('Warnings:',len(report['warnings']))
