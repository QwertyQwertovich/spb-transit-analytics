import json, os
base = r'C:\Users\alexndr\Documents\Antigravity_projects\avg_speed_analytics\data\processed'

with open(os.path.join(base, 'districts_stats.json'), encoding='utf-8') as f:
    districts = json.load(f)
print('Districts:')
for d in sorted(districts, key=lambda x: x['speed_median'], reverse=True):
    nm = d['district']
    print(f"  {nm}: median={d['speed_median']} km/h, routes={d['routes']}, segs={d['segments']}")

print()
with open(os.path.join(base, 'summary.json'), encoding='utf-8') as f:
    s = json.load(f)
print('Summary:', json.dumps(s, ensure_ascii=False, indent=2))

print()
with open(os.path.join(base, 'transport_types_stats.json'), encoding='utf-8') as f:
    types = json.load(f)
for t in types:
    print(f"  {t['transport_type']}: median={t['speed_median']}, routes={t['routes']}")

print()
with open(os.path.join(base, 'operators_stats.json'), encoding='utf-8') as f:
    ops = json.load(f)
for o in sorted(ops, key=lambda x: x['speed_median'], reverse=True):
    print(f"  {o['operator_name']}: median={o['speed_median']}, routes={o['routes']}")
