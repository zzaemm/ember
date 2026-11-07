# This version was rebuilt

The original was made before the project used Git, so its files were not kept. This copy was rebuilt on 7 November 2026 by undoing the recorded edits to v3.0.

## How closely it matches

Screenshots of this rebuild were compared with screenshots taken of the original on the same day, at the same size and in the same browser.

- **v1.0:** 5 of 5 screenshots were byte-for-byte identical. They show the top of the page, so the sections below it were clicked through and tested but not compared.
- **v2.0:** 7 of 7 screenshots were byte-for-byte identical, including one of the full Overview page.

The appearance therefore matches the original where it was compared. The code may still differ in ways a screenshot cannot show, such as comments.

## What is included

- `app/`: the web app and its data, which were carried forward unchanged.
- `pipeline/`: the data pipeline, with only the product name changed back.

The presentation deck and presenter guide for this version are not included.

## How to run it

```bash
python -m http.server 8000 --directory app
```

Then open http://localhost:8000. For the latest version of the project, see the `main` branch.
