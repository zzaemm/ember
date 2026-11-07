# Ember

A burning activity calendar that places NASA MODIS (2001–2025) and VIIRS S-NPP (2012–2025) hotspot detections for India on one comparable scale. It is built for NASA Space Apps, Kerala.

## Run the app

The app is static. Browsers block data loading from a directly opened file, so serve the folder:

```bash
python -m http.server 8000 --directory app
```

Then open http://localhost:8000. Google Fonts are the only online dependency, and the app falls back to system fonts without Wi-Fi.

To host it, upload the `app` folder to any static host, such as GitHub Pages or Netlify.

## Working with versions

Every version is listed in `CHANGELOG.md`, and on the repository's Releases page, where each one can be downloaded as a zip file.

To see all versions:

```bash
git tag --list
```

To open a version without changing anything:

```bash
git switch --detach v3.0
```

To return to the latest version:

```bash
git switch main
```

## Rebuild the data

Needs Python 3.12 with NumPy and SciPy. Download the FIRMS country files into a folder of their own:

- `https://firms.modaps.eosdis.nasa.gov/data/country/modis/YYYY/modis_YYYY_India.csv` for 2001–2025
- `https://firms.modaps.eosdis.nasa.gov/data/country/viirs-snpp/YYYY/viirs-snpp_YYYY_India.csv` for 2012–2025

Then run these from the `pipeline` folder, replacing the paths with your own:

```bash
python -I 01_ingest.py path/to/csv_folder path/to/ingest.npz
```

```bash
python -I 02_harmonize.py path/to/ingest.npz regions.json ../app/data
```

The land map comes from `land-50m.json` in the world-atlas package on jsDelivr (Natural Earth, public domain). To rebuild it:

```bash
python -I 03_landmap.py path/to/land-50m.json ../app/data
```

## Files

- `pipeline/03_landmap.py` trims the land outline to South Asia. It holds land and coastlines only, with no borders.
- `app/data/events.json` holds the hand-checked reasons and news stories. Edit this file to add a story. The app calculates its satellite comparison.
- `pipeline/01_ingest.py` filters the CSV files and packs them into one NumPy file.
- `pipeline/02_harmonize.py` applies the mask, learns the correction, validates it and exports the app data.
- `pipeline/regions.json` holds the preset areas. These are approximate and are not official boundaries.
- `app/index.html` and `app/app.js` are the web app.
- `app/data/grid.txt` holds gzip plus base64 columns, sorted by cell and week: `frp:u32`, then `week`, `m`, `v`, `p×10` and `h×10` as `u16`.
- `app/data/validation.json` holds every validation result.
- `TEAM_PARTS.md` is the presenter guide.
- `deck/project/` holds the source of the slides and speaker notes, and `deck/screenshots/` holds the images they use. The live deck is a separate private link.
- `CHANGELOG.md` lists every version.

## Method in brief

1. Keep type 0 detections, MODIS confidence of 30 or more, and VIIRS nominal or high confidence. Remove ~2 km spots with July–September detections in 4 or more years (4% of detections).
2. Adjust days with one MODIS satellite, using a factor learned from 2003–2011.
3. Learn `k = (ΣVIIRS + λ·k_wider) / (ΣMODIS + λ)` from 2012–2019, per 0.25° cell, month and day or night pass, with separate factors for counts and fire power. λ = 50.
4. Use VIIRS where it operated, and corrected MODIS elsewhere.
5. Test on 2020–2025, and by leaving out each year of 2012–2019 in turn.

## Key results for India

| Test | No correction | Ember |
|---|---|---|
| Total ÷ real VIIRS, 2020–2025 | 0.18 | 1.03 |
| Typical weekly error, 2020–2025 | 82% | 12% |
| Step at the 2012 join (MODIS alone: 1.02) | 5.69 | 1.10 |
| Typical weekly error, leave one year out, 2012–2019 | 82% | 13% |

Weaker areas: Kerala 47% and the Wayanad area 113% typical weekly error.

## Known limits

Detections are not fires. The correction uses fixed ratios, so it cannot recover changes in fire size or burning time, or fires neither sensor saw. Records before 2012 cannot be tested directly. 2001 to mid-2002 rests on Terra alone. MODIS product versions in the archive change over time. The persistent heat mask may also remove some real fires in places that burn during the monsoon. This release covers India only.
