"""Stage 3: turn the Natural Earth land TopoJSON into a small land outline for the app.

Usage: python -I 03_landmap.py <land-50m.json> <app_data_dir>

The output holds land and coastlines only, clipped to South Asia. It has no national borders.
"""
import json
import os
import sys

W, E, S, N = 56.0, 108.0, -4.0, 44.0


def decode(topo):
    sx, sy = topo["transform"]["scale"]
    tx, ty = topo["transform"]["translate"]
    arcs = []
    for arc in topo["arcs"]:
        x = y = 0
        pts = []
        for dx, dy in arc:
            x += dx
            y += dy
            pts.append((x * sx + tx, y * sy + ty))
        arcs.append(pts)
    return arcs


def ring_points(ring, arcs):
    out = []
    for i in ring:
        pts = arcs[i] if i >= 0 else arcs[~i][::-1]
        out.extend(pts[1:] if out else pts)
    return out


def clip_edge(pts, inside, cross):
    out = []
    for i, cur in enumerate(pts):
        prev = pts[i - 1]
        if inside(cur):
            if not inside(prev):
                out.append(cross(prev, cur))
            out.append(cur)
        elif inside(prev):
            out.append(cross(prev, cur))
    return out


def at_x(a, b, x):
    return (x, a[1] + (b[1] - a[1]) * (x - a[0]) / (b[0] - a[0]))


def at_y(a, b, y):
    return (a[0] + (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]), y)


def clip(pts):
    """Sutherland-Hodgman clip to the box. Any straight edges it adds lie off the visible map."""
    for inside, cross in ((lambda p: p[0] >= W, lambda a, b: at_x(a, b, W)),
                          (lambda p: p[0] <= E, lambda a, b: at_x(a, b, E)),
                          (lambda p: p[1] >= S, lambda a, b: at_y(a, b, S)),
                          (lambda p: p[1] <= N, lambda a, b: at_y(a, b, N))):
        if not pts:
            return []
        pts = clip_edge(pts, inside, cross)
    return pts


def main(src, out_dir):
    topo = json.load(open(src))
    arcs = decode(topo)
    obj = topo["objects"]["land"]
    geoms = obj["geometries"] if obj["type"] == "GeometryCollection" else [obj]
    rings = []
    for g in geoms:
        polys = g["arcs"] if g["type"] == "MultiPolygon" else [g["arcs"]]
        for poly in polys:
            # Holes such as inland seas keep their own ring and are filled even-odd in the browser.
            for ring in poly:
                pts = clip(ring_points(ring, arcs))
                if len(pts) < 3:
                    continue
                clean = []
                for lon, lat in pts:
                    p = [round(lon, 2), round(lat, 2)]
                    if not clean or clean[-1] != p:
                        clean.append(p)
                if len(clean) >= 3:
                    rings.append(clean)
    path = os.path.join(out_dir, "land.json")
    json.dump({"source": "Natural Earth 1:50m land via world-atlas. Public domain. No borders.", "rings": rings}, open(path, "w"), separators=(",", ":"))
    print("rings", len(rings), "points", sum(map(len, rings)), "bytes", os.path.getsize(path))


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
