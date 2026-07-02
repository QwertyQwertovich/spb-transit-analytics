"""
fix_districts.py
Try different Overpass queries to get SPb municipal/admin districts
"""
import ssl, json, urllib.request, urllib.parse

SSL_CTX = ssl.create_default_context()
SSL_CTX.check_hostname = False
SSL_CTX.verify_mode = ssl.CERT_NONE

def query_overpass(q):
    url  = "https://overpass-api.de/api/interpreter"
    data = urllib.parse.urlencode({"data": q}).encode("utf-8")
    req  = urllib.request.Request(url, data=data, headers={
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent":   "SPbTransitAnalytics/1.0",
        "Accept":       "application/json",
    })
    with urllib.request.urlopen(req, timeout=120, context=SSL_CTX) as r:
        return json.loads(r.read())

# Try different admin levels for SPb
for level in [5, 6, 7, 8]:
    q = (
        f"[out:json][timeout:30];"
        f"area[\"name\"=\"Санкт-Петербург\"][\"admin_level\"=\"4\"]->.spb;"
        f"(relation[\"admin_level\"=\"{level}\"][\"boundary\"=\"administrative\"](area.spb););"
        f"out tags;"
    )
    raw = query_overpass(q)
    rels = [e for e in raw["elements"] if e["type"] == "relation"]
    names = [r.get("tags",{}).get("name","?") for r in rels[:5]]
    print(f"admin_level={level}: {len(rels)} relations | examples: {names}")
