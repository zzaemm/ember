# Ember: version rules

The owner wants to be able to open every version of this project.

- `main` always holds the latest working version.
- Commit each finished change with a clear message, and do not bundle unrelated changes.
- When a change is meant to be seen or presented, make it a version:
  1. Add an entry at the top of `CHANGELOG.md`.
  2. Create an annotated tag. Use `vX.0` for a large change to what users see and `vX.Y` for a smaller one.
  3. Push the commit and the tag, then create a GitHub release from the tag.
- Never rewrite published history, move a tag, or force-push. To undo something, add a new commit.
- If the deck changes, copy its source into `deck/` so that the deck is versioned with the app.
- Do not commit the raw FIRMS CSV files or `*.npz` files. They can be rebuilt using `README.md`.
