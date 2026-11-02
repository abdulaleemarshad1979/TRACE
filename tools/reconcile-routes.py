"""Create a reviewable route plan at supplied per-area counts, preserving every location.

Input and output contain private deployment data; keep them outside version control.
Changed coverage is explicitly marked proposed, never represented as a source plan.
"""
import argparse, copy, json, math
from pathlib import Path

def reconcile(source, targets):
    data = copy.deepcopy(source)
    output, changes = {}, []
    covered = set()
    for target in targets:
        ps, prefix, count = target['ps'], target.get('prefix', 'Route '), target['count']
        selected = {key: route for key, route in source['routes'].items() if route['ps'] == ps and route['route'].startswith(prefix)}
        groups = []
        for key, route in selected.items():
            sites = [sid for sid, site in data['stations'].items() if site['ps'] == ps and site['route'] == route['route']]
            covered.update(sites)
            if sites:
                groups.append({'key': key, 'route': copy.deepcopy(route), 'sites': sites, 'sources': [route['route']], 'changed': False})
            else:
                changes.append({'ps': ps, 'sourceRoutes': [route['route']], 'action': 'Removed empty route', 'locations': 0})
        def center(group):
            points = [data['stations'][sid] for sid in group['sites'] if 'lat' in data['stations'][sid]]
            if not points: return None
            return (sum(p['lat'] for p in points)/len(points), sum(p['lng'] for p in points)/len(points))
        while len(groups) > count:
            candidates = []
            for i, a in enumerate(groups):
                for j in range(i + 1, len(groups)):
                    ca, cb = center(a), center(groups[j])
                    distance = math.hypot(ca[0] - cb[0], (ca[1] - cb[1]) * math.cos(math.radians(ca[0]))) if ca and cb else float('inf')
                    candidates.append((distance, len(a['sites']) + len(groups[j]['sites']), i, j))
            _, _, i, j = min(candidates)
            a, b = groups[i], groups.pop(j)
            a['sites'] += b['sites']; a['sources'] += b['sources']; a['changed'] = True
        while len(groups) < count:
            a = max(groups, key=lambda g: len(g['sites']))
            if len(a['sites']) < 2: raise ValueError('Not enough locations to split routes')
            ordered = sorted(a['sites'], key=lambda sid: (data['stations'][sid].get('lat', 0), data['stations'][sid].get('lng', 0), sid))
            midpoint = len(ordered)//2
            new_no = max(int(g['route']['route'].split()[-1]) for g in groups) + 1
            b = copy.deepcopy(a); b.update(key=a['key'] + '_split' + str(new_no), sites=ordered[midpoint:], changed=True)
            b['route']['route'] = prefix + str(new_no)
            a.update(sites=ordered[:midpoint], changed=True); groups.append(b)
        for group in groups:
            route = group['route']
            if group['changed']:
                route['villages'] = ', '.join(dict.fromkeys(r.get('villages', '') for r in selected.values() if r['route'] in group['sources'] and r.get('villages')))
                route.update(coverageStatus='proposed', sourceRoutes=group['sources'], coverageNote='Proposed consolidation/split to match the requested count. Review polling coverage before field use.')
                changes.append({'ps': ps, 'route': route['route'], 'sourceRoutes': group['sources'], 'action': 'Proposed coverage', 'locations': len(group['sites'])})
                for sid in group['sites']:
                    site = data['stations'][sid]
                    site['sourceRoute'] = site.get('sourceRoute', site['route'])
                    site['route'] = route['route']; site['coverageStatus'] = 'proposed'
            output[group['key']] = route
    assert covered == set(data['stations']), 'Every location must be covered exactly by a target area'
    assert len(output) == sum(t['count'] for t in targets)
    assert len(data['stations']) == len(source['stations'])
    assert all(any(r['ps'] == s['ps'] and r['route'] == s['route'] for r in output.values()) for s in data['stations'].values())
    data['routes'] = output
    data['routePlan'] = {'total': len(output), 'coverageStatus': 'review-changed-routes', 'proposedRoutes': sum(r.get('coverageStatus') == 'proposed' for r in output.values()), 'note': '152-route plan. Gokavaram uses the workbook count of 7. Changed polling coverage is proposed and requires review before field use.'}
    return data, changes

if __name__ == '__main__':
    p = argparse.ArgumentParser(); p.add_argument('--source', type=Path, required=True); p.add_argument('--targets', type=Path, required=True); p.add_argument('--output', type=Path, required=True)
    a = p.parse_args(); data, changes = reconcile(json.loads(a.source.read_text()), json.loads(a.targets.read_text()))
    a.output.mkdir(parents=True, exist_ok=True)
    (a.output/'reconciled-config.json').write_text(json.dumps(data, indent=2)+'\n')
    (a.output/'route-changes.json').write_text(json.dumps(changes, indent=2)+'\n')
    print(json.dumps(data['routePlan']))
