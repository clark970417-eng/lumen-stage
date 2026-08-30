# LUMEN STAGE guide captures

These source captures come only from the production application:

- Desktop: `https://lumen-stage.vercel.app/?ui=full`
- Compact/mobile workflow: `https://lumen-stage.vercel.app/?ui=mobile`

Each locale's rebuildable source set is generated under the ignored
`tmp/guide-captures/<locale>` directory instead of being committed. Desktop
captures use a 1920 x 1150 CSS-pixel viewport at 3x device scale
(5760 x 3450 PNG). Compact workflow captures use a 430 x 932 CSS-pixel mobile
viewport at 2x device scale (860 x 1864 PNG). The build embeds those lossless
PNG files directly and never adds a JPEG compression pass.

The numbered names record the visible operation state. The only paired state is
`desktop-03-shaping-before/after`, captured at identical framing before and
after using **Softer light**. All other guide pages use a distinct source image.

Run `node scripts/capture_guide_hidpi.mjs all` to refresh every production
source capture. Run `python3 scripts/build_localized_guides.py` to rebuild the
three public PDFs and their 300 dpi guide-page PNG files. Set
`LUMEN_GUIDE_CAPTURE_DIR` only when an alternate scratch directory is needed.

Guide generation requires Python 3 with Pillow and ReportLab, plus Poppler's
`pdftoppm` on `PATH` for PDF raster verification. The verified workspace used
Pillow 12.3.0 and ReportLab 4.4.9. The capture script uses Playwright and Chrome;
set `LUMEN_PLAYWRIGHT_MODULE` or `LUMEN_CHROME_PATH` only when their default
workspace locations are unavailable.
