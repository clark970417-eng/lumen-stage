# Test report 2 — saturated Japan street scene

Source: `Screenshot 2026-08-29 at 9.54.45 PM.png` (1110×1326 screenshot; no original supplied)

## Diagnosis

**Style:** vivid travel-postcard / computational-HDR urban landscape. The result relies on aggressive color separation, lifted shadows, protected highlights, and strong local contrast rather than soft-focus or portrait-retouch plugins.

## Evidence

| Observed | Inferred reconstruction | Alternatives | Confidence |
|---|---|---|---|
| Luma P1/P50/P99 ≈ 34/150/238 with almost no luma clipping | HDR-like highlight recovery and shadow lift | Modern phone computational HDR may be baked into capture | High for the tonal shape; Medium for manual editing |
| Saturation median ≈56, P95 ≈241, P99 ≈254 | Selective saturation/vibrance and strong HSL channel work | Highly colored real scene plus phone rendering | High |
| Sky is strongly cyan-blue, blossoms pink, foliage yellow-green, and rails clean red | Blues/aquas, magentas, greens, and reds were separated and boosted | Vivid camera profile | Medium–High |
| Fine wires, masonry, leaves, and rails have hard local separation | Positive texture/clarity/dehaze and substantial output sharpening | Naturally detailed architecture and screenshot scaling | High |
| Edge-support metric is 0.0506 and 11.65% of neighbor deltas exceed 32 | Much stronger microcontrast than the portrait test | Scene content itself contains many edges | Medium |
| Whole-image channel means are nearly balanced, but shadows average red-dominant because of rails/scene content | No strong global WB cast is required; color changes are likely channel/local | Scene composition invalidates using channel means as WB | Medium |

## Likely edit stack

1. Vivid/landscape or smartphone HDR base rendering.
2. Highlight compression, strong shadow recovery, anchored blacks.
3. Midtone S-curve plus texture, clarity, and dehaze.
4. HSL boosts for aqua/blue sky, magenta blossoms, green foliage, and red rails.
5. Separate sky and foliage masks; possible selective brightening of buildings/steps.
6. Strong detail sharpening with moderate masking and light NR.

## Lightroom / ACR starting recipe

- Profile: Adobe Landscape or Camera Vivid; reduce global saturation if this starts too intense.
- WB: near neutral; Temperature −2 to −7 and Tint +2 to +7 from a neutral starting point.
- Exposure +0.05 to +0.25; Contrast +5 to +15.
- Highlights −35 to −60; Shadows +35 to +55; Whites +5 to +15; Blacks −8 to −18.
- Texture +15 to +25; Clarity +18 to +32; Dehaze +7 to +14.
- Tone curve: anchored black point, modest lower-mid lift, steeper midtone S, compressed upper shoulder.
- HSL starting points:
  - Red Saturation +15 to +30, Luminance 0 to +8.
  - Yellow Hue −5 to −15, Saturation +5 to +18.
  - Green Hue +5 to +15 toward aqua, Saturation +10 to +25, Luminance +5 to +12.
  - Aqua Saturation +18 to +35, Luminance −5 to −15.
  - Blue Hue −8 to −18 toward aqua, Saturation +20 to +40, Luminance −8 to −18.
  - Magenta Saturation +15 to +30, Luminance +8 to +18.
- Color grading: optional and restrained—Shadows H195–210/S3–7; Highlights H40–55/S2–6.
- Sky gradient: Highlights −15 to −30, Dehaze +8 to +15, Saturation +10 to +20.
- Tree/blossom mask: Shadows +10 to +25, Texture +10 to +20, Saturation +5 to +12.
- Sharpening: Amount 55–80, Radius 0.6–0.9, Detail 30–50, Masking 30–55; Luminance NR 5–15.

## Photoshop and plugin-family assessment

No portrait-retouch family is relevant. There is little evidence for Nik Glamour Glow, classic soft focus, or Boris Optics diffusion: bright edges do not show broad halo spread, and the image emphasizes crisp structure instead. A tone-mapping/HDR workflow, a vivid phone pipeline, or Lightroom/ACR with strong clarity/dehaze is a better explanation.

If reproducing in Photoshop, use a low-radius High Pass or edge-masked Smart Sharpen only after resizing. Avoid global Soft Light contrast layers at high opacity; they will crush the already saturated red and blue channels.

## Calibration

Reduce blue/aqua saturation first if the sky turns electric, then lower clarity if wires and masonry develop halos. Keep white buildings close to neutral; if they turn cyan, the blue look is coming from WB rather than targeted HSL/sky work.

