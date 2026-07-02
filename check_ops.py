import json, sys, os
sys.stdout.reconfigure(encoding='utf-8')
base = r'C:\Users\alexndr\Documents\Antigravity_projects\avg_speed_analytics\data\processed'

with open(os.path.join(base, 'operators_stats.json'), encoding='utf-8') as f:
    ops = json.load(f)
for o in sorted(ops, key=lambda x: x['speed_median'], reverse=True):
    oid = o['operator_id']
    nm  = o['operator_name']
    med = o['speed_median']
    rt  = o['routes']
    print(f"id={oid} | {nm} | med={med} | routes={rt}")

print()
with open(os.path.join(base, 'routes_stats.json'), encoding='utf-8') as f:
    routes = json.load(f)

from collections import Counter
types = Counter(r['transport_type'] for r in routes)
print('transport_type counts:', dict(types))

ops_names = Counter(r['operator_name'] for r in routes)
print()
print('operator names in routes:')
for k,v in sorted(ops_names.items(), key=lambda x: -x[1]):
    print(f"  {v:4d}  {k}")
