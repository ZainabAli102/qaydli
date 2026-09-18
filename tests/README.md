# Engine tests

A tiny harness that measures how well the extraction engine reads a fixed set
of real receipts.

## Run

```bash
npm run test:engine
```

## How it works

1. Put the receipt photos in `tests/receipts/` using the names in
   `expected.json` (`taj.jpg`, `pharmacy.jpg`, `bellona.jpg`,
   `homecenter.jpg`, `adham.jpg`, `mvk.jpg`). Images are **not** committed
   (see `.gitignore`).
2. Set `OPENAI_API_KEY` in `.env.local`.
3. The harness runs `extract()` on each image present and compares the result
   to the `expected` block for that case, then prints a per-field accuracy
   table.

Only the fields listed in each case's `expected` block are scored. Numbers pass
within 1%; a `date` given as an array passes if the reading matches any listed
value; `flags` are scored by whether each expected flag code is present. With no
images or no API key, the harness explains what to add and exits cleanly.
