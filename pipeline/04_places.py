"""Stage 4: build the place-name search list from the GeoNames India extract.

Usage: python -I 04_places.py <IN.txt> <app_data_dir>

Keeps states, districts and towns of 15,000 people or more, as [name, lat, lon, kind, state].
GeoNames data is licensed CC BY 4.0, so the app credits it.
"""
import json
import os
import sys

src, out_dir = sys.argv[1], sys.argv[2]
states, rows = {}, []
for line in open(src, encoding="utf-8"):
    f = line.rstrip("\n").split("\t")
    if len(f) < 15:
        continue
    name, lat, lon, fclass, fcode, admin1, pop = f[2] or f[1], float(f[4]), float(f[5]), f[6], f[7], f[10], int(f[14] or 0)
    if fcode == "ADM1":
        states[admin1] = name
    if fclass == "A" and fcode in ("ADM1", "ADM2"):
        rows.append((name, lat, lon, "state" if fcode == "ADM1" else "district", admin1, pop))
    elif fclass == "P" and pop >= 15000:
        rows.append((name, lat, lon, "town", admin1, pop))

clean = lambda s: s.replace("State of ", "").replace(" District", "").replace(" district", "").replace("District of ", "").strip()
seen, out = set(), []
for name, lat, lon, kind, a1, pop in sorted(rows, key=lambda r: -r[5]):
    n = clean(name)
    key = (n.lower(), kind, a1)
    if key in seen or not (5 <= lat <= 37.5 and 66 <= lon <= 100):
        continue
    seen.add(key)
    out.append([n, round(lat, 3), round(lon, 3), kind, clean(states.get(a1, ""))])
path = os.path.join(out_dir, "places.json")
json.dump({"source": "GeoNames (geonames.org), CC BY 4.0", "places": out}, open(path, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
counts = {k: sum(1 for r in out if r[3] == k) for k in ("state", "district", "town")}
print(counts, os.path.getsize(path), "bytes")
for q in ("Wayanad", "Palakkad", "Kochi", "Sheopur", "Tarn Taran", "Nainital", "Similipal", "Lunglei"):
    print(q, [r for r in out if r[0].lower().startswith(q.lower())][:2])
