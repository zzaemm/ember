"""Stage 1: read FIRMS country CSVs into one compact NumPy file.

Usage: python -I 01_ingest.py <raw_csv_dir> <output.npz>

Filters applied here:
  type == 0                 keep presumed vegetation fire (when the column exists)
  MODIS confidence >= 30    drop MODIS "low" confidence detections
  VIIRS confidence != l     drop VIIRS "low" confidence detections
"""
import csv
import datetime as dt
import glob
import json
import os
import sys
from collections import Counter

import numpy as np

EPOCH = dt.date(2001, 1, 1)
SENSOR = {"Terra": 0, "Aqua": 1, "T": 0, "A": 1, "N": 2, "1": 2}


def ingest(path, audit):
    is_viirs = "viirs" in os.path.basename(path)
    out = []
    with open(path, newline="", encoding="utf-8", errors="replace") as fh:
        reader = csv.DictReader(fh)
        has_type = "type" in (reader.fieldnames or [])
        key = os.path.basename(path)
        audit["files"][key] = {"has_type": has_type, "rows": 0, "kept": 0}
        for row in reader:
            audit["files"][key]["rows"] += 1
            kind = row.get("type", "0")
            audit["type"][("V" if is_viirs else "M") + str(kind)] += 1
            audit["version"][("V" if is_viirs else "M") + row.get("version", "?")] += 1
            if kind not in ("0", "", "0.0"):
                continue
            conf = row["confidence"]
            if is_viirs:
                if conf.strip().lower().startswith("l"):
                    continue
            else:
                try:
                    if float(conf) < 30:
                        continue
                except ValueError:
                    continue
            try:
                y, m, d = map(int, row["acq_date"].split("-"))
                day = (dt.date(y, m, d) - EPOCH).days
                sensor = 2 if is_viirs else SENSOR[row["satellite"]]
                out.append((float(row["latitude"]), float(row["longitude"]), day, sensor,
                            1 if row["daynight"] == "D" else 0, float(row["frp"] or 0)))
            except (KeyError, ValueError):
                audit["bad_rows"] += 1
                continue
            audit["files"][key]["kept"] += 1
    return out


def main(raw_dir, out_path):
    audit = {"files": {}, "type": Counter(), "version": Counter(), "bad_rows": 0}
    rows = []
    for path in sorted(glob.glob(os.path.join(raw_dir, "*.csv"))):
        rows.extend(ingest(path, audit))
        print(os.path.basename(path), audit["files"][os.path.basename(path)], flush=True)
    arr = np.array(rows, dtype=np.float64)
    np.savez(out_path,
             lat=arr[:, 0].astype(np.float32), lon=arr[:, 1].astype(np.float32),
             day=arr[:, 2].astype(np.int32), sensor=arr[:, 3].astype(np.int8),
             isday=arr[:, 4].astype(np.int8), frp=arr[:, 5].astype(np.float32))
    audit["type"] = dict(audit["type"])
    audit["version"] = dict(audit["version"])
    with open(out_path + ".audit.json", "w") as fh:
        json.dump(audit, fh, indent=1)
    print("kept", len(rows), "types", audit["type"], "versions", audit["version"], "bad", audit["bad_rows"])


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
