# Tonal

Browser-based batch photo grading. Drop in a folder of photos, pick a look or build
your own, crop for Instagram or Facebook, and export the whole set with one
consistent grade applied. Or switch to Video and turn the same photos into a short,
slow-moving film with the look applied to every frame.

**Live:** https://himynameisalexm.github.io/tonal/

Everything runs locally in the browser via WebGL2 and WebCodecs. No uploads, no server,
no accounts.

## Running it

It's static files with no build step: `index.html` is the whole photo editor, and
`video.js` plus `vendor/` load only when you first open Video. Serve the folder over
HTTP (not `file://`, which blocks some of the image decoding APIs and module loading):

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
- Create a look: describe a style in words ("warm moody film", "pale skies and rich
  timber", "like Noir but a bit warmer"), or match a photo you like. Matching
  measures the reference's tones, colour casts and saturation, fits the sliders to
  your photos, then renders and corrects twice. Both run entirely in the browser
- Compare: a before/after divider you drag across the photo (or use the arrow keys);
  hold \ to see the whole original
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

Video (the Photos / Video switch at the top):

- Turns the loaded photos into a 30 s to 1 min film. If they won't all fit in about
  a minute, it picks an even spread across the set; click photos under "Photos in
  the video" to add or remove them
- Timeline of photo cards: drag to reorder, × to remove, click to select and jump to
  it. Space plays and pauses; the arrow keys step between photos
- Slow camera moves on every photo: push in, pull out, pan left or right, rise, or
  still. Auto varies them to suit each photo's shape and the video's shape. Click the
  paused photo to set the point a push-in heads for
- Pace: Luxury (4.5 s per photo, long dissolves, subtle moves), Standard or Quick,
  plus Fit to 30 / 45 / 60 s. Each photo's length can be set from 2 to 8 s
- Transitions: dissolve, through black, or cut. It always fades in from black and
  out to black. Optional 2.39:1 cinematic bars on 16:9
- Text: an opening title and subtitle, a closing title and subtitle, and an optional
  caption per photo. Serif or sans, three sizes, centre / bottom left / bottom
  centre, white or black. On 9:16 it stays clear of where Reels and Stories put
  their buttons
- The current look and Adjust settings grade every frame, with film grain that moves
  like real grain instead of sitting still
- Exports a silent H.264 MP4 at 1080p and 30 fps: 16:9 (1920×1080), 9:16
  (1080×1920), 4:5 (1080×1350) or 1:1 (1080×1080), at 10 Mbit/s for the two
  1920 px shapes and proportionally less for the others. Frames are rendered from
  up-to-3840 px decodes of the originals, with mipmapped textures so fine detail
  doesn't shimmer as the camera moves. A 45 s video from twelve 8192 px photos takes
  about 11 s on an M1 Pro Mac
- The video settings (shape, pace, transitions, text) are remembered; the photo
  order and per-photo moves aren't

Known gaps:

- EXIF metadata other than orientation and resolution (capture date, camera, GPS)
  is stripped on re-encode
- No colour management; everything assumes sRGB
- No RAW or HEIC support
- No per-photo grade overrides; one grade applies to the whole set (crop framing is
  per photo)
- No clarity or sharpening (needs a multi-pass blur)
- No tone curve
- Describing a look understands a built-in vocabulary of style words (about 60
  terms plus modifiers like "very", "slightly", "less", "no"), not any sentence
- JSZip is loaded from cdnjs (pinned with an SRI hash); vendor it locally if you want
  the page to work offline
- Video has no music or audio track; add music where you post it (Instagram,
  Facebook, YouTube) or in another editor
- Video export needs WebCodecs: a current Chrome, Edge, Safari or Firefox on a
  computer. Browsers without an H.264 encoder fall back to VP9 or AV1 in the MP4,
  which some players (QuickTime) won't open. The preview works everywhere
- Video is 1080p only, with no 4K. The preview plays at reduced resolution

## Dependencies

[JSZip](https://stuk.github.io/jszip/) 3.10.1 via cdnjs, and Geist and Newsreader via
Google Fonts. [Mediabunny](https://mediabunny.dev/) 1.61.1 (MPL-2.0) writes the MP4.
It's vendored in `vendor/` as a minified MP4-only build and only loaded when you
export a video; `vendor/mediabunny-LICENSE.txt` has the licence and the rebuild
command. Nothing else.
