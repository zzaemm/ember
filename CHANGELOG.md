# Versions

Each version below has a Git tag and a GitHub release. See "Working with versions" in `README.md` for how to open one.

## v3.0: Ember

Tag: `v3.0`. The `main` branch starts here.

- Renamed the product from AgniCal to Ember.
- Replaced the pixel maps with real land and coastlines and a smooth heat layer, with no borders drawn.
- Added before and after correction maps with a year slider and a play button.
- Added a "Why then?" reason for each place.
- Added hand-checked news stories by year, each compared with the satellite record, and a Google News search link for any year.
- Removed Wayanad and the Amritsar area as separate presets, because tapping the map now covers small areas.
- Renamed "Against normal" to "Unusual weeks" and explained it on screen.
- Deck: 20 slides, with new slides for the before and after map and for why fires burned.

## v2.0: AgniCal simple overview (rebuilt)

Tag: `v2.0`.

- A plain Overview page with one clear answer, and technical panels moved under Detailed data.
- Rebuilt copy: 7 of 7 screenshots were byte-for-byte identical to the original, including the full Overview page.

## v1.0: AgniCal dashboard (rebuilt)

Tag: `v1.0`.

- The first version: a single analyst dashboard with a pixel map and a year-by-week calendar.
- Rebuilt copy: 5 of 5 screenshots were byte-for-byte identical to the original. They show the top of the page, so the sections below it were tested but not compared.

## About the rebuilt versions

v1.0 and v2.0 were made before the project used Git, so they were rebuilt on 7 November 2026 by undoing the recorded edits to v3.0. They sit on their own line of history, separate from `main`, so opening them with a tag works as normal, but they will not appear in the `main` commit log. Each contains the app and pipeline but not the deck.
