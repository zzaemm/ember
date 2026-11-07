"""Stage 2: harmonize MODIS to VIIRS equivalents, validate, and export app data.

Usage: python -I 02_harmonize.py <ingest.npz> <regions.json> <app_data_dir>

Method
  1. Fill single-platform MODIS days (Terra only before Aqua) with a factor learned from
     2003-2011, when both platforms were operating.
  2. Learn k = sum(VIIRS) / sum(MODIS) from 2012-2019 per 0.25 degree cell x month x day/night,
     shrunk toward coarser ratios: k = (sumV + lam * k_parent) / (sumM + lam).
     The chain is national month/overpass -> 1 degree cell -> 0.25 degree cell.
  3. Harmonized record = VIIRS where it is available, else MODIS x k.
  4. Test on 2020-2025, which played no part in fitting k.
"""
import base64
import datetime as dt
import gzip
import json
import os
import sys

import numpy as np

LAT0, LON0, RES = 5.0, 66.0, 0.25
NLAT, NLON = 124, 136
EPOCH = dt.date(2001, 1, 1)
YEARS = list(range(2001, 2026))
NDAYS = (dt.date(2026, 1, 1) - EPOCH).days
TERRA, AQUA, VIIRS = 0, 1, 2

_dates = [EPOCH + dt.timedelta(days=i) for i in range(NDAYS)]
D_YEAR = np.array([d.year for d in _dates], dtype=np.int16)
D_MONTH = np.array([d.month - 1 for d in _dates], dtype=np.int8)
D_DOY = np.array([d.timetuple().tm_yday - 1 for d in _dates], dtype=np.int16)
D_WBIN = np.minimum(D_DOY // 7, 51)
D_WEEK = (D_YEAR - 2001) * 52 + D_WBIN
NWEEKS = 52 * len(YEARS)


def ratio_tables(cell, cell1, month, isday, num, den, lam):
    """Hierarchical ratio of sums: national -> 1 degree -> 0.25 degree."""
    sn = month * 2 + isday
    numer = np.bincount(sn, num, 24)
    denom = np.bincount(sn, den, 24)
    glob = num.sum() / max(den.sum(), 1e-9)
    k_nat = (numer + 5 * glob) / (denom + 5)
    n1 = cell1.max() + 1 if cell1.size else 1
    n1 = NLAT * NLON
    s1 = cell1.astype(np.int64) * 24 + sn
    num1 = np.bincount(s1, num, n1 * 24)
    den1 = np.bincount(s1, den, n1 * 24)
    k_1 = (num1 + lam * np.tile(k_nat, n1)) / (den1 + lam)
    s0 = cell.astype(np.int64) * 24 + sn
    num0 = np.bincount(s0, num, NLAT * NLON * 24)
    den0 = np.bincount(s0, den, NLAT * NLON * 24)
    parent = k_1[parent_stratum_index()]
    return (num0 + lam * parent) / (den0 + lam), k_nat, glob


_PARENT = None


def parent_stratum_index():
    global _PARENT
    if _PARENT is None:
        ids = np.arange(NLAT * NLON)
        ila, ilo = ids // NLON, ids % NLON
        c1 = (ila // 4) * NLON + (ilo // 4)
        _PARENT = np.repeat(c1, 24) * 24 + np.tile(np.arange(24), NLAT * NLON)
    return _PARENT


def metrics(pred, obs):
    pred, obs = np.asarray(pred, float), np.asarray(obs, float)
    use = (pred > 0) | (obs > 0)
    p, o = pred[use], obs[use]
    if len(o) < 3:
        return None
    rl = np.corrcoef(np.log1p(p), np.log1p(o))[0, 1]
    return {"n": int(len(o)), "bias_ratio": round(float(p.sum() / max(o.sum(), 1e-9)), 3),
            "mae": round(float(np.abs(p - o).mean()), 2),
            "nmae": round(float(np.abs(p - o).sum() / max(o.sum(), 1e-9)), 3),
            "r_log": round(float(rl), 3), "r": round(float(np.corrcoef(p, o)[0, 1]), 3)}


def in_poly(lat, lon, poly):
    inside = np.zeros(len(lat), bool)
    n = len(poly)
    for i in range(n):
        y1, x1 = poly[i]
        y2, x2 = poly[(i + 1) % n]
        cross = ((y1 > lat) != (y2 > lat)) & (lon < (x2 - x1) * (lat - y1) / (y2 - y1 + 1e-12) + x1)
        inside ^= cross
    return inside


def critical_window(profile, share):
    """Smallest contiguous, circular run of weeks holding at least `share` of the total."""
    total = profile.sum()
    if total <= 0:
        return None
    doubled = np.concatenate([profile, profile])
    cum = np.concatenate([[0], np.cumsum(doubled)])
    best = None
    for length in range(1, 53):
        sums = cum[length:length + 52] - cum[:52]
        i = int(np.argmax(sums))
        if sums[i] >= share * total - 1e-9:
            best = (i, length)
            break
    return best


def main(npz, regions_path, out_dir):
    os.makedirs(out_dir, exist_ok=True)
    data = np.load(npz)
    lat, lon, day = data["lat"], data["lon"], data["day"]
    sensor, isday, frp = data["sensor"], data["isday"].astype(np.int64), data["frp"].astype(np.float64)
    ok = (day >= 0) & (day < NDAYS)
    lat, lon, day, sensor, isday, frp = lat[ok], lon[ok], day[ok], sensor[ok], isday[ok], frp[ok]
    print("detections", len(lat), {s: int((sensor == s).sum()) for s in (0, 1, 2)})

    # Persistent heat source mask. Vegetation fires are rare in the Jul-Sep monsoon, so a ~2 km
    # bin that shows detections in those months across 4+ separate years is treated as a
    # non-vegetation source (coal seam fire, steel plant, flare). The mask includes neighbouring
    # bins, because MODIS and VIIRS geolocation differ slightly.
    bin_la = np.floor((lat - LAT0) / 0.02).astype(np.int64)
    bin_lo = np.floor((lon - LON0) / 0.02).astype(np.int64)
    bin_key = bin_la * 100000 + bin_lo
    monsoon = (D_MONTH[day] >= 6) & (D_MONTH[day] <= 8)
    pairs = np.unique(np.stack([bin_key[monsoon], D_YEAR[day][monsoon].astype(np.int64)], 1), axis=0)
    keys, yrs = np.unique(pairs[:, 0], return_counts=True)
    persistent = keys[yrs >= 4]
    dilated = np.unique(np.concatenate([persistent + da * 100000 + dl for da in (-1, 0, 1) for dl in (-1, 0, 1)]))
    masked = np.isin(bin_key, dilated)
    u_key, u_n = np.unique(bin_key[masked], return_counts=True)
    top = np.argsort(-u_n)[:15]
    mask_info = {"persistent_bins": int(len(persistent)),
                 "removed_detections": int(masked.sum()), "removed_share_pct": round(100 * float(masked.mean()), 2),
                 "removed_by_sensor_pct": {n: round(100 * float(masked[sensor == s].mean()), 2) for n, s in (("terra", 0), ("aqua", 1), ("viirs", 2))},
                 "top": [{"lat": round(float(LAT0 + (u_key[i] // 100000) * 0.02), 2), "lon": round(float(LON0 + (u_key[i] % 100000) * 0.02), 2), "n": int(u_n[i])} for i in top]}
    print("persistent mask", mask_info)
    keep = ~masked
    lat, lon, day, sensor, isday, frp = lat[keep], lon[keep], day[keep], sensor[keep], isday[keep], frp[keep]

    ila = np.floor((lat - LAT0) / RES).astype(np.int64)
    ilo = np.floor((lon - LON0) / RES).astype(np.int64)
    assert ila.min() >= 0 and ila.max() < NLAT and ilo.min() >= 0 and ilo.max() < NLON
    cell = ila * NLON + ilo
    cell1 = (ila // 4) * NLON + (ilo // 4)
    month = D_MONTH[day].astype(np.int64)
    year = D_YEAR[day]
    week = D_WEEK[day].astype(np.int64)

    # Daily national counts decide which sensors were operating.
    n_t = np.bincount(day[sensor == TERRA], minlength=NDAYS)
    n_a = np.bincount(day[sensor == AQUA], minlength=NDAYS)
    n_v = np.bincount(day[sensor == VIIRS], minlength=NDAYS)
    aqua_first = int(np.argmax(n_a > 0))
    print("first Aqua day", EPOCH + dt.timedelta(days=aqua_first))

    # Step 1: single-platform MODIS days.
    both_era = (year >= 2003) & (year <= 2011) & (sensor != VIIRS)
    modis_all = (sensor == TERRA) | (sensor == AQUA)

    def zero_runs(counts, min_len):
        """True on days inside a run of at least min_len consecutive zero-count days."""
        out = np.zeros(NDAYS, bool)
        start = None
        for i in range(NDAYS + 1):
            if i < NDAYS and counts[i] == 0:
                start = i if start is None else start
            elif start is not None:
                if i - start >= min_len:
                    out[start:i] = True
                start = None
        return out

    # A day with no detections can simply be a day with no fires, above all in the monsoon.
    # A platform counts as down before its first data, or for 5+ silent days outside Jun-Sep.
    dry_season = (D_MONTH < 5) | (D_MONTH > 8)
    aqua_down = (np.arange(NDAYS) < aqua_first) | (zero_runs(n_a, 5) & dry_season)
    terra_down = zero_runs(n_t, 5) & dry_season
    t_only = (n_t > 0) & aqua_down
    a_only = (n_a > 0) & terra_down
    print("Aqua down days after launch", int((aqua_down & (np.arange(NDAYS) >= aqua_first)).sum()), "Terra down days", int(terra_down.sum()))
    w_mod = np.where(modis_all, 1.0, 0.0)
    for s, single_days, label in ((TERRA, t_only, "terra"), (AQUA, a_only, "aqua")):
        m = both_era
        num = np.ones(m.sum())
        den = (sensor[m] == s).astype(float)
        f, _, g = ratio_tables(cell[m], cell1[m], month[m], isday[m], num, den, 50.0)
        idx = (cell * 24 + month * 2 + isday).astype(np.int64)
        apply = (sensor == s) & single_days[day]
        w_mod[apply] = f[idx[apply]]
        print(f"single-platform factor ({label}) national {g:.3f}; days {int(single_days.sum())}; detections {int(apply.sum())}")

    is_v = sensor == VIIRS
    is_m = modis_all
    # MODIS counts as absent only for a long silent run. The June 2001 Terra outage is the known case.
    modis_ok = ~zero_runs(n_t + n_a, 10) | ((D_MONTH >= 6) & (D_MONTH <= 8) & (D_YEAR > 2002))
    modis_ok[(np.arange(NDAYS) >= (dt.date(2001, 6, 15) - EPOCH).days) & (np.arange(NDAYS) <= (dt.date(2001, 7, 3) - EPOCH).days)] = False
    v_first = int(np.argmax(n_v > 0))
    v_silent = zero_runs(n_v, 3)
    v_silent[:v_first] = True

    # Step 2 uses days when both records were operating. Partial VIIRS outages are found afterward.
    both_days = ~v_silent & modis_ok
    stratum = cell * 24 + month * 2 + isday

    def fit(train_mask, lam):
        v = train_mask & is_v
        m = train_mask & is_m
        c = np.concatenate([cell[v], cell[m]])
        c1 = np.concatenate([cell1[v], cell1[m]])
        mo = np.concatenate([month[v], month[m]])
        dn = np.concatenate([isday[v], isday[m]])
        num_c = np.concatenate([np.ones(v.sum()), np.zeros(m.sum())])
        den_c = np.concatenate([np.zeros(v.sum()), w_mod[m]])
        num_f = np.concatenate([frp[v], np.zeros(m.sum())])
        den_f = np.concatenate([np.zeros(v.sum()), frp[m] * w_mod[m]])
        k, kn, kg = ratio_tables(c, c1, mo, dn, num_c, den_c, lam)
        kf, kfn, kfg = ratio_tables(c, c1, mo, dn, num_f, den_f, lam)
        return k, kf, kn, kg, kfg

    def cm_predict(k, mask):
        cm = cell[mask] * (25 * 12) + (year[mask] - 2001) * 12 + month[mask]
        return cm

    def cellmonth_arrays(k, mask):
        m = mask & is_m
        v = mask & is_v
        size = NLAT * NLON * 300
        key = lambda s: cell[s] * 300 + (year[s] - 2001) * 12 + month[s]
        pred = np.bincount(key(m), w_mod[m] * k[stratum[m]], size)
        obs = np.bincount(key(v), minlength=size).astype(float)
        return pred, obs

    # Choose the shrinkage strength with 2012-2017 -> 2018-2019, inside the training period.
    valid_both = both_days[day]
    base_mask = valid_both
    best = None
    for lam in (5, 10, 20, 50, 100, 200, 500):
        k, *_ = fit(base_mask & (year >= 2012) & (year <= 2017), float(lam))
        p, o = cellmonth_arrays(k, base_mask & (year >= 2018) & (year <= 2019))
        score = float(np.abs(np.log1p(p) - np.log1p(o))[(p > 0) | (o > 0)].mean())
        print(f"lambda {lam}: tuning log-MAE {score:.4f}")
        if best is None or score < best[1]:
            best = (lam, score)
    lam = float(best[0])
    print("chosen lambda", lam)

    train = base_mask & (year >= 2012) & (year <= 2019)
    k, kf, k_nat, k_glob, kf_glob = fit(train, lam)
    print("national k", round(k_glob, 2), "FRP k", round(kf_glob, 3))
    print("k percentiles", np.percentile(k[np.unique(stratum[train])], [1, 10, 50, 90, 99]).round(2))

    # Partial VIIRS outage: far fewer detections than MODIS implies on a busy day.
    expected = np.bincount(day[is_m], w_mod[is_m] * k[stratum[is_m]], NDAYS)
    viirs_ok = ~v_silent & ~((expected >= 100) & (n_v < 0.1 * expected))
    both_days &= viirs_ok
    valid_both = both_days[day]
    outage = [str(EPOCH + dt.timedelta(days=int(i))) for i in np.where(~viirs_ok & (D_YEAR >= 2012) & modis_ok)[0]]
    print("VIIRS gap days after 2012 filled from MODIS:", len(outage), outage[:40])
    no_data = [str(EPOCH + dt.timedelta(days=int(i))) for i in np.where(~viirs_ok & ~modis_ok)[0]]
    print("days with no data from either:", len(no_data), no_data[:40])

    # Weights per detection.
    w_p = np.where(is_m, w_mod * k[stratum], 0.0)
    w_pf = np.where(is_m, w_mod * kf[stratum] * frp, 0.0)
    w_h = np.where(is_v & viirs_ok[day], 1.0, np.where(is_m & ~viirs_ok[day], w_p, 0.0))
    w_hf = np.where(is_v & viirs_ok[day], frp, np.where(is_m & ~viirs_ok[day], w_pf, 0.0))

    # Cell x week sparse table.
    key = cell * NWEEKS + week
    uniq, inv = np.unique(key, return_inverse=True)
    n = len(uniq)
    t_m = np.bincount(inv[is_m], minlength=n)
    t_v = np.bincount(inv[is_v], minlength=n)
    t_p = np.bincount(inv, w_p, n)
    t_h = np.bincount(inv, w_h, n)
    t_f = np.bincount(inv, w_hf, n)
    t_cell = (uniq // NWEEKS).astype(np.int64)
    t_week = (uniq % NWEEKS).astype(np.int64)
    print("cell-week rows", n, "max m", t_m.max(), "v", t_v.max(), "p", round(t_p.max()), "h", round(t_h.max()), "frp", round(t_f.max()))

    cell_ids, first = np.unique(t_cell, return_index=True)
    remap = np.zeros(NLAT * NLON, np.int64) - 1
    remap[cell_ids] = np.arange(len(cell_ids))
    offsets = np.concatenate([first, [n]])
    clat = LAT0 + (cell_ids // NLON) * RES + RES / 2
    clon = LON0 + (cell_ids % NLON) * RES + RES / 2

    # Export values: count columns in tenths so small corrected values survive; FRP in whole MW.
    def u16(a, scale):
        scaled = np.rint(a * scale)
        clipped = int((scaled > 65535).sum())
        if clipped:
            print("  clipped", clipped, "values at scale", scale)
        return np.clip(scaled, 0, 65535).astype("<u2")

    columns = {"week": t_week.astype("<u2"), "m": u16(t_m, 1), "v": u16(t_v, 1),
               "p": u16(t_p, 10), "h": u16(t_h, 10)}
    # The u32 column comes first so that every typed array stays aligned in the browser.
    # Gzip plus base64 text keeps the file small and servable by any static host.
    raw = np.rint(t_f).astype("<u4").tobytes() + b"".join(columns[c].tobytes() for c in ("week", "m", "v", "p", "h"))
    with open(os.path.join(out_dir, "grid.txt"), "wb") as fh:
        fh.write(base64.b64encode(gzip.compress(raw, 9)))
    print("grid raw bytes", len(raw))

    # Regions.
    regions = json.load(open(regions_path))["regions"]
    reg_cells = {}
    for r in regions:
        reg_cells[r["id"]] = np.ones(len(cell_ids), bool) if r["poly"] is None else in_poly(clat, clon, r["poly"])

    def weekly(col, mask_cells):
        chosen = mask_cells[remap[t_cell]]
        return np.bincount(t_week[chosen], col[chosen], NWEEKS)

    # Validation over the held-out years, on days when both sensors operated.
    test = valid_both & viirs_ok[day] & (year >= 2020) & (year <= 2025)
    ok_days_week = np.bincount(D_WEEK, (both_days & viirs_ok).astype(int), NWEEKS)
    cmask = {}
    vm = test & is_v
    mm = test & is_m

    def agg(mask, weight, level, reg_mask=None):
        s = mask if reg_mask is None else mask & reg_mask[remap[cell]]
        if level == "cell_month":
            keys = cell[s] * 300 + (year[s] - 2001) * 12 + month[s]
            return np.bincount(keys, weight[s], NLAT * NLON * 300)
        if level == "week":
            return np.bincount(week[s], weight[s], NWEEKS)
        if level == "month":
            return np.bincount((year[s] - 2001) * 12 + month[s], weight[s], 300)
        if level == "year":
            return np.bincount(year[s] - 2001, weight[s], 25)

    one = np.ones(len(lat))
    nat_month = k_nat[month * 2 + isday]
    methods = {"no correction": w_mod, "single national ratio": w_mod * k_glob,
               "national by month": w_mod * nat_month, "AgniCal stratified": w_mod * k[stratum]}
    validation = {"lambda": lam, "k_global": round(float(k_glob), 2), "kfrp_global": round(float(kf_glob), 2),
                  "aqua_first": str(EPOCH + dt.timedelta(days=aqua_first)), "levels": {}}
    for level in ("cell_month", "week", "month"):
        validation["levels"][level] = {}
        for rname in [r["id"] for r in regions]:
            rmask = reg_cells[rname]
            if level == "cell_month" and rname != "india":
                continue
            obs = agg(vm, one, level, rmask)
            validation["levels"][level][rname] = {
                name: metrics(agg(mm, w, level, rmask), obs) for name, w in methods.items()}
    # FRP.
    obsf = agg(vm, frp, "week")
    validation["frp_week_india"] = {
        "no correction": metrics(agg(mm, frp * w_mod, "week"), obsf),
        "AgniCal stratified": metrics(agg(mm, frp * w_mod * kf[stratum], "week"), obsf)}

    # Yearly national ratio shows how stable the sensor relationship is, and any drift.
    yr_v = np.bincount(year[is_v & valid_both] - 2001, minlength=25).astype(float)
    yr_m = np.bincount(year[is_m & valid_both] - 2001, w_mod[is_m & valid_both], 25)
    yr_p = np.bincount(year[is_m & valid_both] - 2001, w_p[is_m & valid_both], 25)
    validation["yearly"] = [{"year": y, "viirs": int(yr_v[i]), "modis": int(yr_m[i]), "predicted": int(yr_p[i]),
                             "ratio": round(float(yr_v[i] / yr_m[i]), 2) if yr_m[i] else None}
                            for i, y in enumerate(YEARS) if y >= 2012]
    # Same test split by period, to expose orbit drift in the MODIS platforms.
    validation["period_bias"] = {}
    for lo, hi in ((2020, 2021), (2022, 2023), (2024, 2025)):
        s = (year >= lo) & (year <= hi) & valid_both & viirs_ok[day]
        v_sum = float((s & is_v).sum())
        validation["period_bias"][f"{lo}-{hi}"] = round(float(w_p[s & is_m].sum()) / max(v_sum, 1), 3)

    # Calendar tests per region.
    w_y = lambda arr, y: arr[(y - 2001) * 52:(y - 2000) * 52]
    raw_splice = np.where(t_v > 0, t_v, 0).astype(float)
    pre2012 = t_week < 11 * 52
    raw_col = np.where(pre2012, t_m.astype(float), t_v.astype(float))
    tests = {}
    for r in regions:
        rm = reg_cells[r["id"]]
        h_w = weekly(t_h, rm)
        raw_w = weekly(raw_col, rm)
        m_w = weekly(t_m.astype(float), rm)
        res = {}
        for label, series in (("raw_splice", raw_w), ("harmonized", h_w), ("modis_only", m_w)):
            base = series[:11 * 52].reshape(11, 52)
            exceed, total = 0, 0
            for wk in range(52):
                pool = base[:, [(wk - 1) % 52, wk, (wk + 1) % 52]].ravel()
                thr = np.percentile(pool, 90)
                test_vals = series[(2020 - 2001) * 52 + wk::52][:6]
                busy = test_vals >= 3
                exceed += int(((test_vals > thr) & busy).sum())
                total += len(test_vals)
            res[label] = round(100 * exceed / total, 1)
        clim = h_w[:(2020 - 2001) * 52].reshape(19, 52).mean(axis=0)
        future = h_w[(2020 - 2001) * 52:].reshape(6, 52)
        win80 = critical_window(clim, 0.80)
        win50 = critical_window(clim, 0.50)
        def capture(win):
            if not win:
                return None, None
            idx = [(win[0] + j) % 52 for j in range(win[1])]
            return (round(100 * float(future[:, idx].sum() / max(future.sum(), 1e-9)), 1),
                    [round(100 * float(future[y, idx].sum() / max(future[y].sum(), 1e-9)), 1) for y in range(6)])
        c80, c80y = capture(win80)
        c50, _ = capture(win50)
        res.update({"season_start_bin": win80[0] if win80 else None, "season_len": win80[1] if win80 else None,
                    "capture80": c80, "capture80_by_year": c80y, "core_start_bin": win50[0] if win50 else None,
                    "core_len": win50[1] if win50 else None, "capture50": c50,
                    "uniform80": round(100 * win80[1] / 52, 1) if win80 else None,
                    "annual_h": [round(float(w_y(h_w, y).sum())) for y in YEARS],
                    "annual_m": [round(float(w_y(m_w, y).sum())) for y in YEARS],
                    "annual_v": [round(float(w_y(weekly(t_v.astype(float), rm), y).sum())) for y in YEARS],
                    "cells": int(rm.sum())})
        tests[r["id"]] = res
    validation["calendar"] = tests
    validation["persistent_mask"] = mask_info

    # Skill test without orbit drift: leave one year out inside 2012-2019.
    in_period = valid_both & (year >= 2012) & (year <= 2019)
    loyo = {r["id"]: {"pred": np.zeros(NWEEKS), "obs": np.zeros(NWEEKS)} for r in regions}
    loyo_naive = {r["id"]: np.zeros(NWEEKS) for r in regions}
    for y in range(2012, 2020):
        ky, *_ = fit(in_period & (year != y), lam)
        s_m = in_period & (year == y) & is_m
        s_v = in_period & (year == y) & is_v
        for r in regions:
            rm = reg_cells[r["id"]]
            a = s_m & rm[remap[cell]]
            b = s_v & rm[remap[cell]]
            loyo[r["id"]]["pred"] += np.bincount(week[a], w_mod[a] * ky[stratum[a]], NWEEKS)
            loyo[r["id"]]["obs"] += np.bincount(week[b], minlength=NWEEKS).astype(float)
            loyo_naive[r["id"]] += np.bincount(week[a], w_mod[a], NWEEKS)
    validation["leave_one_year_out_week"] = {}
    for r in regions:
        rid = r["id"]
        from scipy.stats import spearmanr
        p, o = loyo[rid]["pred"], loyo[rid]["obs"]
        use = (p > 0) | (o > 0)
        m = metrics(p, o)
        n0 = metrics(loyo_naive[rid], o)
        if m:
            m["spearman"] = round(float(spearmanr(p[use], o[use]).statistic), 3)
            m["median_abs_error"] = round(float(np.median(np.abs(p[use] - o[use]))), 2)
            m["variance_ratio"] = round(float(p[use].var() / max(o[use].var(), 1e-9)), 2)
        validation["leave_one_year_out_week"][rid] = {"AgniCal stratified": m, "no correction": n0}

    # Is a constant ratio reasonable? A log-log slope of 1 says yes.
    size = NLAT * NLON * 300
    ck = lambda s: cell[s] * 300 + (year[s] - 2001) * 12 + month[s]
    tm = np.bincount(ck(train & is_m), w_mod[train & is_m], size)
    tv = np.bincount(ck(train & is_v), minlength=size).astype(float)
    both = (tm > 0) & (tv > 0)
    slope, intercept = np.polyfit(np.log(tm[both]), np.log(tv[both]), 1)
    validation["loglog"] = {"slope": round(float(slope), 3), "intercept": round(float(intercept), 3), "n": int(both.sum())}
    miss = (tm == 0) & (tv > 0)
    validation["modis_blind"] = {"cellmonths_share_pct": round(100 * float(miss.sum() / max(((tm > 0) | (tv > 0)).sum(), 1)), 1),
                                 "viirs_share_pct": round(100 * float(tv[miss].sum() / max(tv.sum(), 1)), 1)}

    # Year-by-year sensor ratios, separated by platform, to reveal drift.
    def by_year(mask):
        return np.bincount(year[mask] - 2001, minlength=25).astype(float)
    vy = by_year(is_v & valid_both)
    ty = by_year((sensor == TERRA) & valid_both)
    ay = by_year((sensor == AQUA) & valid_both)
    validation["platform_ratio"] = [{"year": y, "v_over_terra": round(float(vy[y - 2001] / max(ty[y - 2001], 1)), 2),
                                     "v_over_aqua": round(float(vy[y - 2001] / max(ay[y - 2001], 1)), 2)} for y in range(2012, 2026)]

    # Class agreement and season timing, per region, comparing corrected MODIS with real VIIRS.
    agreement = {}
    for r in regions:
        rm = reg_cells[r["id"]]
        v_w = weekly(t_v.astype(float), rm)
        p_w = weekly(t_p, rm)
        base = v_w[(2012 - 2001) * 52:(2020 - 2001) * 52].reshape(8, 52)
        pairs_cls = []
        for wk in range(52):
            pool = base[:, [(wk - 1) % 52, wk, (wk + 1) % 52]].ravel()
            lo, hi = np.percentile(pool, 10), np.percentile(pool, 90)
            if hi < 3:
                continue
            for yi in range(2020, 2026):
                i = (yi - 2001) * 52 + wk
                if ok_days_week[i] < 4:
                    continue
                cl = lambda v: 0 if v < lo else (2 if v > hi else 1)
                pairs_cls.append((cl(p_w[i]), cl(v_w[i])))
        res = {"weeks": len(pairs_cls)}
        if pairs_cls:
            a = np.array(pairs_cls)
            conf = np.zeros((3, 3))
            for i, j in a:
                conf[i, j] += 1
            obs_ag = np.trace(conf) / conf.sum()
            wgt = 1 - np.abs(np.subtract.outer(np.arange(3), np.arange(3))) / 2
            e = np.outer(conf.sum(1), conf.sum(0)) / conf.sum()
            po, pe = (wgt * conf).sum() / conf.sum(), (wgt * e).sum() / conf.sum()
            res.update({"agreement_pct": round(100 * float(obs_ag), 1), "weighted_kappa": round(float((po - pe) / max(1 - pe, 1e-9)), 3)})
        # Timing: anchor each season year in the quiet part of the year.
        clim = v_w[(2012 - 2001) * 52:].reshape(14, 52).mean(axis=0)
        win = critical_window(clim, 0.8)
        errs_on, errs_pk = [], []
        if win:
            anchor = (win[0] + win[1] + (52 - win[1]) // 2) % 52
            for yi in range(2012, 2026):
                begin = (yi - 2001) * 52 + anchor - (52 if anchor > win[0] else 0)
                if begin < 11 * 52 or begin + 52 > NWEEKS:
                    continue
                pv, ov = p_w[begin:begin + 52], v_w[begin:begin + 52]
                if ov.sum() < 30 or pv.sum() < 30:
                    continue
                on = lambda x: int(np.argmax(np.cumsum(x) >= 0.1 * x.sum()))
                errs_on.append(abs(on(pv) - on(ov)))
                errs_pk.append(abs(int(np.argmax(pv)) - int(np.argmax(ov))))
        res.update({"onset_mae_weeks": round(float(np.mean(errs_on)), 2) if errs_on else None,
                    "peak_mae_weeks": round(float(np.mean(errs_pk)), 2) if errs_pk else None,
                    "peak_median_weeks": float(np.median(errs_pk)) if errs_pk else None, "seasons": len(errs_on)})
        # Step at the January 2012 join: 2012-2016 mean over 2007-2011 mean.
        ann = lambda s: np.array([s[(y - 2001) * 52:(y - 2000) * 52].sum() for y in YEARS])
        raw_a = ann(weekly(raw_col, rm))
        h_a = ann(weekly(t_h, rm))
        m_a = ann(weekly(t_m.astype(float), rm))
        step = lambda a: round(float(a[11:16].mean() / max(a[6:11].mean(), 1e-9)), 2)
        res.update({"step_raw": step(raw_a), "step_harmonized": step(h_a), "step_modis_only": step(m_a)})
        agreement[r["id"]] = res
    validation["agreement"] = agreement

    # Weekly source quality: 0 VIIRS, 1 MODIS Terra+Aqua, 2 Terra or Aqua only, 3 partial, 4 no data.
    src = np.zeros(NWEEKS, np.int8)
    for wk in range(NWEEKS):
        d = D_WEEK == wk
        if not d.any():
            src[wk] = 4
            continue
        v_share = viirs_ok[d].mean()
        have = (viirs_ok[d] | modis_ok[d]).mean()
        if have == 0:
            src[wk] = 4
        elif have < 0.6:
            src[wk] = 3
        elif v_share >= 0.5:
            src[wk] = 0
        elif (t_only[d] | a_only[d]).mean() >= 0.5:
            src[wk] = 2
        else:
            src[wk] = 1

    # Per-cell summary for the map and AOI reliability.
    train_v = np.bincount(remap[cell[train & is_v]], minlength=len(cell_ids))
    train_m = np.bincount(remap[cell[train & is_m]], w_mod[train & is_m], len(cell_ids))
    meta = {
        "version": 1, "region": "India", "built": str(dt.date.today()),
        "grid": {"lat0": LAT0, "lon0": LON0, "res": RES},
        "years": [YEARS[0], YEARS[-1]], "weeksPerYear": 52, "nRows": int(n),
        "columns": ["frp:u32", "week:u16", "m:u16", "v:u16", "p:u16/10", "h:u16/10"],
        "cells": {"lat": [round(float(x), 3) for x in clat], "lon": [round(float(x), 3) for x in clon],
                  "offset": [int(x) for x in offsets], "trainV": [int(x) for x in train_v],
                  "trainM": [round(float(x)) for x in train_m]},
        "regions": [{"id": r["id"], "name": r["name"], "story": r["story"], "poly": r["poly"],
                     "cells": [int(i) for i in np.where(reg_cells[r["id"]])[0]]} for r in regions],
        "source": [int(x) for x in src],
        "gaps": {"viirsFilled": outage, "noData": no_data},
    }
    json.dump(meta, open(os.path.join(out_dir, "meta.json"), "w"), separators=(",", ":"))
    json.dump(validation, open(os.path.join(out_dir, "validation.json"), "w"), indent=1)
    print("files", {f: os.path.getsize(os.path.join(out_dir, f)) for f in os.listdir(out_dir)})


if __name__ == "__main__":
    main(*sys.argv[1:4])
