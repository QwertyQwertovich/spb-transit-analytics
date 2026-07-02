import csv, os, math

data_dir = r'C:\Users\alexndr\Documents\Antigravity_projects\avg_speed_analytics\data'

# Understand shapes structure
print('=== Unique shape_id prefixes in shapes.txt ===')
prefixes = {}
with open(os.path.join(data_dir, 'shapes.txt'), encoding='utf-8-sig') as f:
    for row in csv.DictReader(f):
        sid = row['shape_id']
        prefix = sid.split('-')[0] if '-' in sid else sid
        prefixes[prefix] = prefixes.get(prefix, 0) + 1
print(prefixes)

shapes_count = {}
with open(os.path.join(data_dir, 'shapes.txt'), encoding='utf-8-sig') as f:
    for row in csv.DictReader(f):
        shapes_count[row['shape_id']] = shapes_count.get(row['shape_id'], 0) + 1
print(f'Total unique shape_ids: {len(shapes_count)}')
print('Example shapes:', list(shapes_count.items())[:10])

# stop_times shape_id
print()
print('=== stop_times shape_id samples ===')
with open(os.path.join(data_dir, 'stop_times.txt'), encoding='utf-8-sig') as f:
    for i, row in enumerate(csv.DictReader(f)):
        if i < 10:
            seq = row['stop_sequence']
            sid = row['shape_id']
            dist = row['shape_dist_traveled']
            print(f'  seq={seq}, shape_id={sid}, dist={dist}')

# trips shape_id
print()
print('=== trips shape_id prefixes ===')
tprefixes = {}
with open(os.path.join(data_dir, 'trips.txt'), encoding='utf-8-sig') as f:
    for row in csv.DictReader(f):
        sid = row['shape_id']
        prefix = sid.split('-')[0] if '-' in sid else sid
        tprefixes[prefix] = tprefixes.get(prefix, 0) + 1
print(tprefixes)

# Check a sample shape - look at first and last points of a stage shape
print()
print('=== First stage shape full points ===')
stage_id = None
with open(os.path.join(data_dir, 'stop_times.txt'), encoding='utf-8-sig') as f:
    for row in csv.DictReader(f):
        if row['shape_id'].startswith('stage-'):
            stage_id = row['shape_id']
            break

if stage_id:
    print(f'Stage: {stage_id}')
    with open(os.path.join(data_dir, 'shapes.txt'), encoding='utf-8-sig') as f:
        pts = [r for r in csv.DictReader(f) if r['shape_id'] == stage_id]
    for p in pts:
        print(f"  seq={p['shape_pt_sequence']}, lat={p['shape_pt_lat']}, lon={p['shape_pt_lon']}, dist={p['shape_dist_traveled']}")

# Compute speed for a sample trip
print()
print('=== Speed computation for first trip ===')
first_trip = None
stops = []
with open(os.path.join(data_dir, 'stop_times.txt'), encoding='utf-8-sig') as f:
    for row in csv.DictReader(f):
        if first_trip is None:
            first_trip = row['trip_id']
        if row['trip_id'] == first_trip:
            stops.append(row)
        elif first_trip:
            break

print(f'Trip: {first_trip}, stops: {len(stops)}')
for i in range(1, len(stops)):
    a = stops[i-1]
    b = stops[i]
    def to_sec(t):
        h, m, s = t.split(':')
        return int(h)*3600 + int(m)*60 + int(s)
    dt = to_sec(b['arrival_time']) - to_sec(a['departure_time'])
    dd = float(b['shape_dist_traveled']) - float(a['shape_dist_traveled'])  # km
    spd = (dd / dt * 3600) if dt > 0 else 0
    print(f"  {a['stop_sequence']}→{b['stop_sequence']}: {dd:.2f}km in {dt}s = {spd:.1f} km/h, stage={b['shape_id']}")
