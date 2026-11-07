# Ember: who presents what

The full word-for-word script is in the speaker notes of each slide. Times total about 8.5 minutes. If your slot is shorter, see "Cutting time" below.

| Speaker | Role | Slides | Time | The one thing they must land |
|---|---|---|---|---|
| 1 | Problem and users | 1–6 | 3 min | A sharper satellite made the record look 5.7× busier, so nobody can compare the years |
| 2 | Earth science | 7–8 | 1.5 min | VIIRS finds 5.6× the hotspots but 1.3× the fire power, so the correction must be local |
| 3 | Validation | 9–10 | 1.5 min | Tested on unseen years: totals within 3%, and we state where it is weak |
| 4 | Live demo | 11–14 | 2.5 min | The site opens on the satellite problem, and any place's answer fits on one screen |
| 5 | Engineering and close | 15–17 | 1.5 min | No server, honest limits, and clear next steps |

Speaker 4 has the most time and risk, so choose your most confident presenter.

## Prepare individually

- **Speaker 1:** Practise the blurry-camera comparison until it sounds natural. Be ready to say the personas are unverified assumptions.
- **Speaker 2:** Be able to explain the k formula in one sentence, and explain why a fire neither sensor saw cannot be recovered.
- **Speaker 3:** Know the Kerala (47%) and Wayanad (113%) weekly errors, and that before 2012 cannot be tested directly. Know that in Kerala one national ratio has lower weekly error (33%).
- **Speaker 4:** Rehearse the demo at least three times. Keep slides 11–13 ready as the fallback.
- **Speaker 5:** Be clear that India is built, and that global is only designed.

## Live demo steps (Speaker 4)

1. **Open the site:** the before and after maps play 2008 to 2014 by themselves, then stop on 2011. Point at the left map jumping in 2012 while the right one stays steady. Drag the slider back to 2011 if needed.
2. **Scroll once to Fire calendar by place, Kerala:** everything for Kerala is on one screen. Read the sentence: fires are detected most often from 12 Feb to 18 Mar. Then point to the two charts, "Why then?" and "How reliable is this?".
3. **Punjab & Haryana:** press the place. The peak moves to 22 Oct – 11 Nov, and the reason changes to stubble burning. Say detections fell, and we do not claim burning fell equally.
4. **Map:** tap near Kochi to show that any area works, and that its reliability changes to Low.
5. **Detailed data:** open the tab, choose **Uttarakhand (approx.)**, press **Unusual weeks**, and hover over the week of 30 Apr in the 2024 row.
6. **Central India:** choose **Central India** and press **All fires detected** to show the autumn band growing in later years.

Direct links open a place in the overview, by adding `#kerala`, `#punjab_haryana`, `#odisha`, `#uttarakhand` or `#central` to the address. Adding `#details` opens Detailed data.

## Never say these

- A bare count of "fires". Say "detections" or "fires detected".
- "Burning in Punjab fell 92%." Say that detections fell by that much.
- "We predict" or "forecast". The calendar shows past patterns.
- "Central India's rise is proven to be crop burning." Our data fits news reports, and field checks should confirm it.
- "Works globally." This release covers India.
- "Kerala 2022 was flagged", or "the Wayanad 2025 fire was detected as unusual". Neither was flagged.

## Cutting time

- **5 minutes:** drop slide 6 (three perspectives) and slide 13 (Uttarakhand), and shorten slide 15.
- **3 minutes:** use slides 2, 4, 7, 9, 11, 12, 14 and 17 only.

## Before you present

- [ ] Replace `[team name]` on slide 1, and the `[Speaker 2]` to `[Speaker 5]` names in the notes.
- [ ] Check the official challenge page. We could not open it, so the requirements came from your description.
- [ ] Call one forest official if you can. Even one conversation strengthens the user story.
- [ ] Ask two people with no background to use the overview for 30 seconds, then say what it tells them.
- [ ] Open each cited paper and source link, and confirm the claim. The Singh et al. 2025 paper was read through a secondary source only.
- [ ] Be able to explain any line of the code. Judges may ask, and your event's rules may require you to disclose AI assistance.
- [ ] Test the app on the presenting laptop, without Wi-Fi, using the steps in `README.md`.
