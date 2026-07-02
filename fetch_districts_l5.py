"""
fetch_districts_l5.py
Fetch SPb admin_level=5 districts (18 районов) with full geometry.
"""
import ssl, json, urllib.request, urllib.parse, os

SSL_CTX = ssl.create_default_context()
SSL_CTX.check_hostname = False
SSL_CTX.verify_mode = ssl.CERT_NONE

OUT = r"C:\Users\alexndr\Documents\Antigravity_projects\avg_speed_analytics\data\spb_districts.geojson"

def query_overpass(q):
    url  = "https://overpass-api.de/api/interpreter"
    data = urllib.parse.urlencode({"data": q}).encode("utf-8")
    req  = urllib.request.Request(url, data=data, headers={
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent":   "SPbTransitAnalytics/1.0",
        "Accept":       "application/json",
    })
    with urllib.request.urlopen(req, timeout=180, context=SSL_CTX) as r:
        return json.loads(r.read())

print("Fetching SPb admin_level=5 districts with geometry...")
q = (
    "[out:json][timeout:180];"
    "area[\"name\"=\"Санкт-Петербург\"][\"admin_level\"=\"4\"]->.spb;"
    "(relation[\"admin_level\"=\"5\"][\"boundary\"=\"administrative\"](area.spb););"
    "out body;>;out skel qt;"
)
raw = query_overpass(q)

# Index nodes and ways
nodes = {e["id"]: (e["lon"], e["lat"])
         for e in raw["elements"] if e["type"] == "node"}
ways = {}
for e in raw["elements"]:
    if e["type"] == "way":
        ways[e["id"]] = [nodes[nid] for nid in e.get("nodes", []) if nid in nodes]

def assemble_ring(way_refs, ways):
    segments = [list(ways[ref]) for ref in way_refs if ref in ways and len(ways[ref]) >= 2]
    if not segments:
        return []
    ring = list(segments[0])
    remaining = segments[1:]
    changed = True
    while remaining and changed:
        changed = False
        for seg in list(remaining):
            if ring[-1] == seg[0]:
                ring.extend(seg[1:]); remaining.remove(seg); changed = True
            elif ring[-1] == seg[-1]:
                ring.extend(list(reversed(seg[:-1]))); remaining.remove(seg); changed = True
            elif ring[0] == seg[-1]:
                ring = seg + ring[1:]; remaining.remove(seg); changed = True
            elif ring[0] == seg[0]:
                ring = list(reversed(seg)) + ring[1:]; remaining.remove(seg); changed = True
    return ring

features = []
for e in raw["elements"]:
    if e["type"] != "relation":
        continue
    tags = e.get("tags", {})
    name = tags.get("name", "Неизвестный")
    outer_refs = [
        m["ref"] for m in e.get("members", [])
        if m["type"] == "way" and m.get("role") in ("outer", "")
    ]
    ring = assemble_ring(outer_refs, ways)
    if len(ring) < 3:
        print(f"  WARNING: {name} has only {len(ring)} points, skipping")
        continue
    if ring[0] != ring[-1]:
        ring.append(ring[0])
    features.append({
        "type": "Feature",
        "properties": {"name": name, "admin_level": tags.get("admin_level", "5")},
        "geometry": {"type": "Polygon", "coordinates": [ring]}
    })
    print(f"  OK: {name} ({len(ring)} points)")

geojson = {"type": "FeatureCollection", "features": features}
with open(OUT, "w", encoding="utf-8") as f:
    json.dump(geojson, f, ensure_ascii=False)
print(f"\nSaved {len(features)} districts to {OUT}")
