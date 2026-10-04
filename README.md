# Tonal

Browser-based batch photo grading. Drop in a folder of photos, pick a look or build
your own, crop for Instagram or Facebook, and export the whole set with one
consistent grade applied.

**Live:** https://himynameisalexm.github.io/tonal/

Everything runs locally in the browser via WebGL2. No uploads, no server, no accounts.

## Running it

It's a single static file. Open `index.html` over HTTP (not `file://`, which blocks
some of the image decoding APIs):

```bash
python3 -m http.server 8000
# then visit http://localhost:8000
```

## Deploying

GitHub Pages serves `main` from the repo root, so pushing to `main` updates the live
site within a minute or so. Any other static host works too.

## Current state

Working:

- WebGL2 single-pass grading pipeline (exposure, contrast, highlights, shadows,
  whites, blacks, temperature, tint, vibrance, saturation, colour mix for warm
  tones, greens and blues, fade, vignette, grain, split toning)
- 10 built-in looks with a strength slider; each look's swatch previews the current
  photo. Moody: Homestead, Lamplight, Veranda, Overcast, Dusk and Slate, tuned
  against a country-editorial moodboard (creamy whites, muted natural greens, pale
  skies, rich timber, soft blacks that still print with detail). Classic: Ember,
  Rust, Paper and Noir
- Named custom looks saved to `localStorage`
- Crop presets exported at each platform's exact size: Instagram portrait 3:4
  (1080×1440) and 4:5 (1080×1350), square, landscape 1.91:1 and Story/Reel 9:16;
  Facebook post 4:5, square, landscape 1.91:1 (1200×630), cover (851×315) and Story.
  Drag to frame and zoom; each photo keeps its own framing
- Folder or multi-file input; drop files or whole folders anywhere on the page
- Batch export to ZIP, with configurable max long edge and JPEG quality. Full-size
  exports keep every pixel (photos bigger than the browser's WebGL limit are
  rendered in strips) and the original's resolution tag, e.g. 300 dpi for print
- EXIF orientation honoured on load
- Light and dark themes, following the system setting

Known gaps:

- EXIF metadata other than orientation and resolution (capture date, camera, GPS)
  is stripped on re-encode
- No colour management; everything assumes sRGB
- No RAW or HEIC support
- No per-photo grade overrides; one grade applies to the whole set (crop framing is
  per photo)
- No clarity or sharpening (needs a multi-pass blur)
- No tone curve
- JSZip is loaded from cdnjs (pinned with an SRI hash); vendor it locally if you want
  the page to work offline

## Dependencies

[JSZip](https://stuk.github.io/jszip/) 3.10.1 via cdnjs, and Geist and Newsreader via
Google Fonts. Nothing else.
