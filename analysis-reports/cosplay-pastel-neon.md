# Test report 1 — pastel neon cosplay portrait

Source: `codex-clipboard-bbbc5d17-f63a-45d4-b46c-20b4c70f7b65.png` (2731×4096 PNG; no original RAW supplied)

## Diagnosis

**Style:** high-key pastel neon / candy-magenta cosplay portrait. The look combines magenta–violet environmental color, compressed bright tones, a clean luminous face, selective skin retouching, and shallow-depth softness. It is not possible to recover the exact preset, plugin, or camera profile from this flattened PNG.

## Evidence

| Observed | Inferred reconstruction | Alternatives | Confidence |
|---|---|---|---|
| Luma P1/P50/P99 ≈ 26/153/246 with effectively no luma clipping | Lifted toe, bright midtones, and a soft highlight shoulder | Naturally low-contrast light plus PNG export | High |
| Mean R and B both exceed G by about 33–38 levels | Strong magenta/violet environment or grading | Pink/blue set lighting is visibly present and may be the main cause | High for the color relationship; Medium for a global grade |
| White costume and bright background stay luminous while most detail survives | Highlights/whites were likely compressed before a small final white lift | Soft source light and exposure choice | Medium |
| Face has smooth color/luminance transitions while eyes, lashes, lips, and hair remain crisp | Masked skin cleanup plus tonal evening; a texture-aware or dodge-and-burn workflow is plausible | Makeup, soft frontal light, focus, and resizing | Medium |
| Bright background shapes spread softly, but subject edges remain comparatively defined | Highlight-limited bloom/diffusion or optical diffusion, not a strong global blur | Defocus bokeh and lens flare | Medium |
| Edge-support metric is low (0.0117; only 0.94% neighbor deltas ≥32) | Broad softness and restrained microcontrast | Scene contains large defocused areas, so the metric is not a sharpening measurement | Low–Medium |

## Likely edit stack

1. Portrait/neutral profile and a cool-magenta WB bias.
2. Exposure lift, raised shadow toe, mild midtone contrast, compressed highlights.
3. HSL separation: pink/magenta and violet emphasized; skin orange kept pale and bright; blue shifted toward periwinkle.
4. Magenta/violet grading in shadows and cool pink highlights.
5. Subject/face masks; background softened and saturated separately.
6. Blemish cleanup plus low-opacity dodge-and-burn or texture-aware skin smoothing.
7. Highlight-only glow/diffusion.
8. Selective eye/hair sharpening; restrained global texture and NR.

## Lightroom / ACR starting recipe

- Profile: Adobe Portrait or Camera Portrait.
- WB: Temperature −5 to −12 from neutral; Tint +18 to +32.
- Exposure +0.20 to +0.45; Contrast −5 to −15.
- Highlights −35 to −55; Shadows +20 to +35; Whites +5 to +15; Blacks +3 to +12.
- Texture −8 to −18 globally; Clarity −5 to −12; Dehaze −2 to −6.
- Tone curve: raise the black toe slightly, add a shallow S through midtones, then flatten the upper shoulder.
- HSL starting points:
  - Red Hue −5 to −15, Saturation +15 to +30.
  - Orange Saturation −8 to −18, Luminance +12 to +25.
  - Blue Hue +8 to +18 toward violet, Saturation +5 to +18, Luminance +8 to +18.
  - Purple/Magenta Saturation +15 to +30, Luminance +5 to +15.
- Color grading: Shadows H285–305/S8–15; Midtones H320–335/S5–10; Highlights H305–325/S6–12; Balance +5 to +20.
- Face mask: Exposure +0.10 to +0.25, Shadows +10, Texture −20 to −35, Saturation −3 to −8.
- Eyes/lashes mask: Texture +15 to +30, Clarity +5 to +15, Sharpness +10 to +25.
- Background mask: Clarity −10 to −25, Saturation +5 to +15; protect the subject edge.

## Photoshop finishing and plugin families

- Clean isolated blemishes first; then low-opacity dodge-and-burn on a neutral-gray Soft Light layer. A Retouch4me Dodge & Burn/Heal–type workflow could produce this, but manual retouching could look identical.
- If using Portraiture-type smoothing, keep strength low and protect eyes, brows, nostrils, lips, jewelry, and hair; the target is smoother tone with retained texture, not a blurred face.
- For glow: create a highlight luminosity mask, blur a merged copy roughly 20–60 px at full resolution, use Screen or low-opacity Normal at 8–18%, and mask it mainly to bright background/white costume. Nik Glamour Glow or Boris Optics diffusion could produce a similar family of effect, but bokeh and optical diffusion remain plausible alternatives.

## Calibration

Match skin brightness before increasing magenta saturation. If the recreation looks plastic, reduce the skin mask rather than adding grain. If bright edges glow everywhere, narrow the luminosity mask—the reference keeps the eyes and costume details more defined than the background.

