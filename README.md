# Tonal

Browser-based batch photo grading. Drop in a folder of JPEGs, pick a look or build
your own, and export the whole set with one consistent grade applied.

Everything runs locally in the browser via WebGL2. No uploads, no server, no accounts.

## Running it

It's a single static file. Open `index.html` over HTTP (not `file://`, which blocks
some of the image decoding APIs):

```bash
python3 -m http.server 8000
# then visit http://localhost:8000
```

## Deploying

Any static host works. For GitHub Pages: push to `main`, then
Settings → Pages → Source: *Deploy from a branch* → `main` / `/ (root)`.

## Current state

Working:

- WebGL2 single-pass grading pipeline (exposure, contrast, highlights, shadows,
  whites, blacks, temperature, tint, vibrance, saturation, fade, vignette, grain,
  split toning)
- 8 built-in looks with a strength slider
- Named custom looks saved to `localStorage`
- Folder or multi-file input, drag and drop
- Batch export to ZIP, with configurable max long edge and JPEG quality
- EXIF orientation honoured on load

Known gaps:

- EXIF metadata other than orientation (capture date, camera, GPS) is stripped on
  re-encode
- No colour management; everything assumes sRGB
- No RAW support
- No per-photo overrides; one grade applies to the whole set
- No clarity or sharpening (needs a multi-pass blur)
- No tone curve
- JSZip is loaded from cdnjs; vendor it locally if you want the page to work offline

## Dependencies

[JSZip](https://stuk.github.io/jszip/) 3.10.1 via cdnjs, and Inter via Google Fonts.
Nothing else.
