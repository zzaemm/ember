# Ember handoff

Status as of 11 November 2026. Ember is a NASA Space Apps (Kerala) project: a fire calendar for India built from NASA MODIS and VIIRS hotspot records, corrected onto one scale.

## Where things are

- **Code:** this folder (`agnical`). Private GitHub repo `zzaemm/ember`, branch `main`.
- **Versions:** tags `v1.0` and `v2.0` (rebuilt copies on their own history), and `v3.0`, `v4.0` and `v5.0` on `main`. `v5.0` is commit `833bb87`, the redesign. Rules for new versions are in `CLAUDE.md`, and the list is in `CHANGELOG.md`.
- **Live app (private link):** https://claude.ai/artifact/Huuk9PSDusG2RYzgVP1pTU. It still shows **v4.0**, because the v5 redesign has not been published.
- **Live deck (private link):** https://claude.ai/artifact/MEJqx4Hg1rS1aVqL2aHE83. Its screenshots show the v4 layout. The deck source is in `deck/`, and the presenter guide is `TEAM_PARTS.md`.

## Run it

```bash
python -m http.server 8000 --directory app
```

Then open http://localhost:8000 for the overview, or http://localhost:8000/details.html for the detailed data.

```bash
node tests/search.test.js
```

## Done in v5.1: seven code-review fixes and search only

All seven are on disk and `node --check` passes. The search self-check prints `search: ok`. I didn't open the pages in a browser after these fixes.

1. Searching a state without a ready-made region now says "the area around the centre of X" instead of claiming the whole state (`app/search.js`).
2. A failed download of `data/places.json` no longer breaks search until reload; the next keystroke retries.
3. "No satellite records near X" now clears the old area's title, text and charts.
4. New self-check `tests/search.test.js`. The search logic moved to `app/search.js`, which `index.html` loads.
5. Removed unused code and files: `S.view`, `assets/backgrounds/index.json` and `assets/icons/icon.css` with its links.
6. `drawTrend` height is now a plain `84`.
7. `details.html#accuracy` keeps its address instead of being replaced by `#kerala`.

The script version is bumped to `?v=5.4`.

The region buttons were also removed in v5.1: search plus a Clear button. Committed, tagged `v5.1`, pushed and published.

## Still open

- **Design kit check (`design-taste-frontend`):** the last full run was interrupted with about 11 issues left. Most were phone layout problems: uneven gaps between sections at 390px, a sideways scroll at 320px, and the slider's tap size. One waiver is in `.taste-skill/waivers.json`, for the footer logo, a false alarm. Rerun:
  `node "C:\Users\muham\.agents\skills\design-taste-frontend\scripts\gate.mjs" app/index.html` from this folder.
- **Publish v5:** republish the app link so it matches `main`. The upload needs `index.html`, `details.html`, `app.js`, `search.js`, `favicon.svg`, `assets/` and `data/`.
- **Deck:** update the screenshots and the demo notes for the v5 layout. The overview and detailed data are now separate pages, and there's a search box.
- **2026 data, not done:** NASA has no public 2026 country file yet. Options are a free FIRMS MAP_KEY, which the team must request themselves, or a 7-day snapshot. Nothing has been decided.
- **Before presenting:** see the checklist at the end of `TEAM_PARTS.md`. It covers team names, checking the official brief and sources, and testing offline on the presenting laptop.

## Data notes

- **Raw NASA files:** these aren't in the repo. `README.md` explains how to download them and rebuild with `pipeline/01` to `03`.
- **Place search:** `pipeline/04_places.py` builds it from GeoNames `IN.txt` (CC BY 4.0, credited in the footer).
- **Land map:** Natural Earth 1:50m, with no borders drawn, on purpose.
