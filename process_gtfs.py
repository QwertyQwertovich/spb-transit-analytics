"""
process_gtfs.py
Preprocesses Saint-Petersburg GTFS feed into JSON stats for the dashboard.

Outputs (data/processed/):
  summary.json            - city-wide KPIs
  routes_stats.json       - per-route stats (speed, district list, operator, type)
  operators_stats.json    - per-operator aggregated stats
  districts_stats.json    - per-district aggregated stats (weighted by km)
  transport_types_stats.json
  map_shapes.json         - track-* geometries with median speed colour
  spb_districts.geojson   - cached district boundaries
"""

import csv
import json
import math
import os
import ssl
import sys
import urllib.request
from collections import defaultdict

import numpy as np
import pandas as pd
from shapely.geometry import Point, shape

DATA_DIR   = os.path.join(os.path.dirname(__file__), "data")
OUT_DIR    = os.path.join(DATA_DIR, "processed")
DIST_PATH  = os.path.join(DATA_DIR, "spb_districts.geojson")
os.makedirs(OUT_DIR, exist_ok=True)

SSL_CTX = ssl.create_default_context()
SSL_CTX.check_hostname = False
SSL_CTX.verify_mode    = ssl.CERT_NONE


# ─────────────────────────────────────────────
# 1. District boundaries
# ─────────────────────────────────────────────

def assemble_ring(way_refs, ways):
    """Chain way segments into a single closed ring of (lon, lat) coords."""
    # Build adjacency: try to chain ways end-to-end
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
                ring.extend(reversed(seg[:-1])); remaining.remove(seg); changed = True
            elif ring[0] == seg[-1]:
                ring = seg + ring[1:]; remaining.remove(seg); changed = True
            elif ring[0] == seg[0]:
                ring = list(reversed(seg)) + ring[1:]; remaining.remove(seg); changed = True
    return ring


def fetch_districts():
    """Download SPb administrative district polygons from Overpass."""
    if os.path.exists(DIST_PATH):
        print("Districts GeoJSON already cached.")
        return

    print("Fetching SPb district boundaries from Overpass API …")
    import urllib.parse
    query = (
        "[out:json][timeout:90];"
        "area[\"name\"=\"Санкт-Петербург\"][\"admin_level\"=\"4\"]->.spb;"
        "(relation[\"admin_level\"=\"6\"][\"boundary\"=\"administrative\"](area.spb););"
        "out body;>;out skel qt;"
    )
    url  = "https://overpass-api.de/api/interpreter"
    data = urllib.parse.urlencode({"data": query}).encode("utf-8")
    req  = urllib.request.Request(
        url, data=data,
        headers={
            "Content-Type": "application/x-www-form-urlencoded",
            "User-Agent":   "SPbTransitAnalytics/1.0",
            "Accept":       "application/json",
        }
    )
    with urllib.request.urlopen(req, timeout=120, context=SSL_CTX) as r:
        raw = json.loads(r.read())

    # Build node / way index
    nodes = {e["id"]: (e["lon"], e["lat"])
             for e in raw["elements"] if e["type"] == "node"}
    ways  = {}
    for e in raw["elements"]:
        if e["type"] == "way":
            ways[e["id"]] = [nodes[nid] for nid in e.get("nodes", []) if nid in nodes]

    features = []
    for e in raw["elements"]:
        if e["type"] != "relation":
            continue
        name = e.get("tags", {}).get("name", "Неизвестный")
        outer_refs = [
            m["ref"] for m in e.get("members", [])
            if m["type"] == "way" and m.get("role") in ("outer", "")
        ]
        ring = assemble_ring(outer_refs, ways)
        if len(ring) < 3:
            continue
        # Close ring if needed
        if ring[0] != ring[-1]:
            ring.append(ring[0])
        features.append({
            "type": "Feature",
            "properties": {"name": name},
            "geometry": {"type": "Polygon", "coordinates": [ring]}
        })

    geojson = {"type": "FeatureCollection", "features": features}
    with open(DIST_PATH, "w", encoding="utf-8") as f:
        json.dump(geojson, f, ensure_ascii=False)
    print(f"  Saved {len(features)} districts to {DIST_PATH}")


def load_district_lookup():
    """Returns list of (shapely_shape, district_name)."""
    with open(DIST_PATH, encoding="utf-8") as f:
        gj = json.load(f)
    polys = []
    for feat in gj["features"]:
        try:
            geom = shape(feat["geometry"])
            name = feat["properties"]["name"]
            polys.append((geom, name))
        except Exception:
            pass
    return polys


def point_to_district(lat, lon, polys):
    pt = Point(lon, lat)
    for geom, name in polys:
        if geom.contains(pt):
            return name
    # Fallback: nearest centroid
    best_dist, best_name = float("inf"), "Неизвестный"
    for geom, name in polys:
        d = geom.centroid.distance(pt)
        if d < best_dist:
            best_dist, best_name = d, name
    return best_name


# ─────────────────────────────────────────────
# 2. Load GTFS tables
# ─────────────────────────────────────────────

def read_csv(name):
    path = os.path.join(DATA_DIR, name)
    return pd.read_csv(path, dtype=str, encoding="utf-8-sig")


def time_to_sec(t):
    """HH:MM:SS → seconds (handles >24h times)."""
    h, m, s = t.split(":")
    return int(h) * 3600 + int(m) * 60 + int(s)


# ─────────────────────────────────────────────
# 3. Main processing
# ─────────────────────────────────────────────

def main():
    import urllib.parse  # needed inside function for Overpass

    fetch_districts()
    polys = load_district_lookup()
    print(f"Loaded {len(polys)} district polygons")

    print("Reading GTFS tables …")
    routes_df         = read_csv("routes.txt")
    trips_df          = read_csv("trips.txt")
    stop_times_df     = read_csv("stop_times.txt")
    stops_df          = read_csv("stops.txt")
    operators_df      = read_csv("operators.txt")
    operator_routes_df = read_csv("operator_routes.txt")

    # ── Stops → district ──────────────────────────────
    print("Assigning stops to districts …")
    stops_df["stop_lat"] = pd.to_numeric(stops_df["stop_lat"], errors="coerce")
    stops_df["stop_lon"] = pd.to_numeric(stops_df["stop_lon"], errors="coerce")
    stops_df = stops_df.dropna(subset=["stop_lat", "stop_lon"])

    stop_district = {}
    for _, row in stops_df.iterrows():
        d = point_to_district(row["stop_lat"], row["stop_lon"], polys)
        stop_district[row["stop_id"]] = d
    print(f"  Assigned {len(stop_district)} stops")

    # ── Operators ─────────────────────────────────────
    route_to_operator = dict(
        zip(operator_routes_df["route_id"], operator_routes_df["operator_id"])
    )
    op_names = dict(zip(operators_df["operator_id"], operators_df["operator_name"]))

    # ── Routes meta ──────────────────────────────────
    routes_meta = {}
    for _, r in routes_df.iterrows():
        op_id   = route_to_operator.get(r["route_id"], "")
        op_name = op_names.get(op_id, "Неизвестный")
        routes_meta[r["route_id"]] = {
            "short_name":     r.get("route_short_name", ""),
            "long_name":      r.get("route_long_name", ""),
            "transport_type": r.get("transport_type", "bus"),
            "urban":          r.get("urban", "1"),
            "operator_id":    op_id,
            "operator_name":  op_name,
        }

    # ── Trips → route ─────────────────────────────────
    trip_to_route = dict(zip(trips_df["trip_id"], trips_df["route_id"]))
    trip_to_shape = dict(zip(trips_df["trip_id"], trips_df["shape_id"]))

    # ── Compute segment speeds ────────────────────────
    print("Computing segment speeds from stop_times (3.5 M rows) …")
    st = stop_times_df.copy()
    st["stop_sequence"]       = pd.to_numeric(st["stop_sequence"], errors="coerce")
    st["shape_dist_traveled"] = pd.to_numeric(st["shape_dist_traveled"], errors="coerce")
    st = st.dropna(subset=["stop_sequence", "shape_dist_traveled"])
    st = st.sort_values(["trip_id", "stop_sequence"])

    # Shift within each trip to get next stop values
    st["next_dist"]    = st.groupby("trip_id")["shape_dist_traveled"].shift(-1)
    st["next_arr"]     = st.groupby("trip_id")["arrival_time"].shift(-1)
    st["next_stop_id"] = st.groupby("trip_id")["stop_id"].shift(-1)

    # Drop last stop of each trip (no next)
    seg = st.dropna(subset=["next_dist", "next_arr"]).copy()

    # Distance delta (km)
    seg["dist_km"] = seg["next_dist"] - seg["shape_dist_traveled"]

    # Time delta (seconds)
    def batch_time_to_sec(series):
        parts = series.str.split(":", expand=True).astype(float)
        return parts[0] * 3600 + parts[1] * 60 + parts[2]

    seg["t0"] = batch_time_to_sec(seg["departure_time"])
    seg["t1"] = batch_time_to_sec(seg["next_arr"])
    seg["dt_sec"] = seg["t1"] - seg["t0"]

    # Speed km/h, filter outliers
    valid = (seg["dist_km"] > 0) & (seg["dt_sec"] > 0)
    seg = seg[valid].copy()
    seg["speed_kmh"] = seg["dist_km"] / seg["dt_sec"] * 3600
    seg = seg[(seg["speed_kmh"] >= 1) & (seg["speed_kmh"] <= 120)]

    # Join route_id and district
    seg["route_id"] = seg["trip_id"].map(trip_to_route)
    seg["district"] = seg["stop_id"].map(stop_district).fillna("Неизвестный")

    print(f"  Valid segments: {len(seg):,}")

    # ── Clean and normalize Meta ──────────────────────
    print("Normalizing metadata and filtering …")
    route_districts_set = seg.groupby("route_id")["district"].apply(set).to_dict()
    
    EXCLUDED_OPS = {"ИП Гиляев", "ИП Марковчин", "ИП Кулик", "ООО \"ПТК\"", "ИП \"Гиляев\"", "ИП \"Марковчин\"", "ИП \"Кулик\""}
    SUBURBAN = {"Кронштадтский район", "Курортный район", "Петродворцовый район", "Пушкинский район", "Колпинский район", "Красносельский район"}
    
    clean_meta = {}
    for rid, m in routes_meta.items():
        op = m.get("operator_name", "Неизвестный")
        # Ensure no accidental quotes in excluded check
        if op in EXCLUDED_OPS or any(x in op for x in ["ИП Гиляев", "ИП Марковчин", "ИП Кулик", "ПТК"]):
            continue
            
        tt = m.get("transport_type", "bus")
        if tt == "trolley": tt = "trolleybus"
        
        if "Горэлектротранс" in op:
            op = f'{op} (трамвай)' if tt == 'tram' else f'{op} (троллейбус)'
            
        if tt == "bus":
            dists = route_districts_set.get(rid, set())
            if not dists.intersection(SUBURBAN):
                tt = "bus_city"
                
        clean_meta[rid] = {
            "operator_name": op,
            "transport_type": tt,
            "urban": str(m.get("urban", "1")),
            "short_name": m.get("short_name", ""),
            "long_name": m.get("long_name", "")
        }

    # Filter segments to only valid routes
    seg = seg[seg["route_id"].isin(clean_meta.keys())].copy()
    
    # Assign cleaned meta to segments
    seg["operator_name"]  = seg["route_id"].map(lambda r: clean_meta[r]["operator_name"])
    seg["transport_type"] = seg["route_id"].map(lambda r: clean_meta[r]["transport_type"])
    seg["urban"]          = seg["route_id"].map(lambda r: clean_meta[r]["urban"])

    print(f"  Segments after filtering: {len(seg):,}")

    # ── Aggregate: per-route ───────────────────────────
    print("Aggregating per route …")
    route_agg = (
        seg.groupby("route_id")
        .agg(
            speed_median=("speed_kmh", "median"),
            speed_mean  =("speed_kmh", "mean"),
            speed_p25   =("speed_kmh", lambda x: x.quantile(0.25)),
            speed_p75   =("speed_kmh", lambda x: x.quantile(0.75)),
            speed_min   =("speed_kmh", "min"),
            speed_max   =("speed_kmh", "max"),
            total_km    =("dist_km", "sum"),
            segments    =("speed_kmh", "count"),
        )
        .reset_index()
    )

    # Districts per route (weighted by km)
    dist_per_route = (
        seg.groupby(["route_id", "district"])["dist_km"]
        .sum()
        .reset_index()
        .rename(columns={"dist_km": "district_km"})
    )
    # All districts a route passes through (sorted by km)
    route_districts = (
        dist_per_route.sort_values("district_km", ascending=False)
        .groupby("route_id")["district"]
        .apply(list)
        .reset_index()
        .rename(columns={"district": "districts"})
    )

    route_agg = route_agg.merge(route_districts, on="route_id", how="left")

    # Attach meta
    def get_meta(rid, key, default=""):
        return clean_meta.get(rid, {}).get(key, default)

    route_agg["short_name"]     = route_agg["route_id"].map(lambda r: get_meta(r, "short_name"))
    route_agg["long_name"]      = route_agg["route_id"].map(lambda r: get_meta(r, "long_name"))
    route_agg["transport_type"] = route_agg["route_id"].map(lambda r: get_meta(r, "transport_type"))
    route_agg["operator_name"]  = route_agg["route_id"].map(lambda r: get_meta(r, "operator_name"))
    route_agg["urban"]          = route_agg["route_id"].map(lambda r: get_meta(r, "urban"))

    routes_out = route_agg.round(2).to_dict(orient="records")
    # districts list → serializable
    for r in routes_out:
        if not isinstance(r.get("districts"), list):
            r["districts"] = []

    with open(os.path.join(OUT_DIR, "routes_stats.json"), "w", encoding="utf-8") as f:
        json.dump(routes_out, f, ensure_ascii=False, indent=None)
    print(f"  routes_stats.json: {len(routes_out)} routes")

    # ── Aggregate: OLAP Cube ───────────────────────────
    print("Building OLAP Cube (operator, district, transport_type, urban) …")
    import itertools
    dims = ["operator_name", "district", "transport_type", "urban"]
    cube_records = []
    
    def powerset(iterable):
        s = list(iterable)
        return itertools.chain.from_iterable(itertools.combinations(s, r) for r in range(len(s)+1))

    for group_cols in powerset(dims):
        group_cols = list(group_cols)
        if len(group_cols) == 0:
            agg = pd.DataFrame([{
                "speed_median": seg["speed_kmh"].median(),
                "speed_mean": seg["speed_kmh"].mean(),
                "speed_p25": seg["speed_kmh"].quantile(0.25),
                "speed_p75": seg["speed_kmh"].quantile(0.75),
                "dist_km": seg["dist_km"].sum(),
                "route_id": seg["route_id"].nunique()
            }])
            for d in dims: agg[d] = "All"
        else:
            agg = seg.groupby(group_cols).agg(
                speed_median=("speed_kmh", "median"),
                speed_mean=("speed_kmh", "mean"),
                speed_p25=("speed_kmh", lambda x: x.quantile(0.25)),
                speed_p75=("speed_kmh", lambda x: x.quantile(0.75)),
                dist_km=("dist_km", "sum"),
                route_id=("route_id", "nunique")
            ).reset_index()
            for d in dims:
                if d not in group_cols:
                    agg[d] = "All"
                    
        for _, row in agg.iterrows():
            cube_records.append({
                "operator_name": row["operator_name"],
                "district": row["district"],
                "transport_type": row["transport_type"],
                "urban": row["urban"],
                "speed_median": round(float(row["speed_median"]), 2),
                "speed_mean": round(float(row["speed_mean"]), 2),
                "speed_p25": round(float(row["speed_p25"]), 2),
                "speed_p75": round(float(row["speed_p75"]), 2),
                "total_km": round(float(row["dist_km"]), 2),
                "routes": int(row["route_id"])
            })

    with open(os.path.join(OUT_DIR, "cube_stats.json"), "w", encoding="utf-8") as f:
        json.dump(cube_records, f, ensure_ascii=False, separators=(",", ":"))
    print(f"  cube_stats.json: {len(cube_records)} records")

    # ── Summary ───────────────────────────────────────
    summary = {
        "total_routes":       int(route_agg["route_id"].nunique()),
        "total_operators":    int(seg["operator_name"].nunique()),
        "total_stops":        int(len(stops_df)),
        "total_districts":    int(seg["district"].nunique()),
        "city_speed_median":  round(float(seg["speed_kmh"].median()), 2),
        "city_speed_mean":    round(float(seg["speed_kmh"].mean()), 2),
        "city_speed_p25":     round(float(seg["speed_kmh"].quantile(0.25)), 2),
        "city_speed_p75":     round(float(seg["speed_kmh"].quantile(0.75)), 2),
        "transport_types":    list(seg["transport_type"].unique()),
        "total_km_analyzed":  round(float(seg["dist_km"].sum()), 0),
    }
    with open(os.path.join(OUT_DIR, "summary.json"), "w", encoding="utf-8") as f:
        json.dump(summary, f, ensure_ascii=False, indent=2)
    print("  summary.json:", summary)

    # ── Map shapes: track-* with speed colour ─────────
    print("Building map shapes …")
    # Median speed per route
    route_speed = dict(zip(route_agg["route_id"], route_agg["speed_median"]))

    # trip → route → speed  (only keep distinct shape_ids)
    trips_df["route_id"]     = trips_df["route_id"].astype(str)
    trips_df["speed_median"] = trips_df["route_id"].map(route_speed)

    # Use only one trip per shape to avoid duplicates
    trips_unique = (
        trips_df[trips_df["shape_id"].str.startswith("track-", na=False)]
        .dropna(subset=["speed_median"])
        .drop_duplicates(subset=["shape_id"])
    )

    # Load shapes for track-* ids we need
    needed_shapes = set(trips_unique["shape_id"].tolist())
    print(f"  Loading {len(needed_shapes)} unique track shapes …")

    shapes_df = pd.read_csv(
        os.path.join(DATA_DIR, "shapes.txt"),
        dtype={"shape_id": str, "shape_pt_lat": float, "shape_pt_lon": float,
               "shape_pt_sequence": int},
        encoding="utf-8-sig",
    )
    shapes_df = shapes_df[shapes_df["shape_id"].isin(needed_shapes)]
    shapes_df = shapes_df.sort_values(["shape_id", "shape_pt_sequence"])

    # Group into features; trim first+last point (stop spikes)
    map_features = []
    for shape_id, grp in shapes_df.groupby("shape_id"):
        coords = list(zip(grp["shape_pt_lon"], grp["shape_pt_lat"]))
        if len(coords) < 2:
            continue
        # Trim first and last point (the "needle" spike to stop location)
        coords = coords[1:-1] if len(coords) > 4 else coords

        trip_row = trips_unique[trips_unique["shape_id"] == shape_id].iloc[0]
        route_id  = trip_row["route_id"]
        meta      = clean_meta.get(route_id)
        
        if not meta:
            continue

        map_features.append({
            "shape_id":       shape_id,
            "route_id":       route_id,
            "short_name":     meta.get("short_name", ""),
            "transport_type": meta.get("transport_type", "bus"),
            "operator_name":  meta.get("operator_name", ""),
            "speed_median":   round(float(trip_row["speed_median"]), 2),
            "coords":         [[round(c[0], 6), round(c[1], 6)] for c in coords],
        })

    with open(os.path.join(OUT_DIR, "map_shapes.json"), "w", encoding="utf-8") as f:
        json.dump(map_features, f, ensure_ascii=False, separators=(",", ":"))
    print(f"  map_shapes.json: {len(map_features)} shapes")

    print("\nDone! All files written to", OUT_DIR)


if __name__ == "__main__":
    main()
