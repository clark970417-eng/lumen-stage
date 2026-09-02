# Studio subjects


`rocketbox-male.glb` and `rocketbox-female.glb` are the built-in studio
subjects.

- Source: Microsoft Rocketbox `Male_Adult_01` and `Female_Adult_01`, from
  <https://github.com/microsoft/Microsoft-Rocketbox>.
- License: MIT.
- Rig: 3ds Max Biped, 80 bones, including real eye bones (`Bip01_LEye`,
  `Bip01_REye`), eyelid bones (`Bip01_LEyeBlinkTop` and friends) and eyebrow
  bones — which is why the studio no longer cuts sockets into a face and parks
  a sphere behind them.
- Blendshapes: the 24 ARKit and FACS shapes the expression controls can drive,
  pruned from the 175 the source ships. glTF stores a full set of per-vertex
  deltas per target, and carrying all of them made a fifty megabyte file.
- Built by `scripts/rocketbox-convert.html`, which is served by the dev server
  and run in a browser: it loads the source FBX with three's FBXLoader, folds
  the bind matrix into the geometry (glTF cannot express one), downsizes the
  2048 TGA maps to 1024 JPEG, and exports through GLTFExporter. The source FBX
  and TGA files are not vendored — they are ~180 MB and are fetched from the
  upstream repository when the converter is re-run.

`rocketbox-business-male.glb` and `rocketbox-business-female.glb` are the same
two people in business dress — which here means two different people, because a
Rocketbox avatar wears its clothes in its body map.

- Source: Microsoft Rocketbox `Business_Male_01` and `Business_Female_01`, from
  the same repository and under the same MIT license.
- Built by the same converter, which now takes the avatars to build from the
  query string (`?jobs=name:fbx:prefix,...`) rather than having the first two
  it ever converted written into it. Per avatar it needs four files from
  upstream: the `_facial.fbx` export and the `body_color`, `head_color` and
  `opacity_color` TGA maps, about 42 MB. The normal and specular maps are not
  used and are not fetched.
- Same rig, same 24 blendshapes, same 0.9 alpha cutoff on the lash atlas, so
  every pose, expression, gaze and hand shape already works on them.

Every converted actor is then passed through `scripts/shrink-morphs.mjs`.

- glTF stores a morph target as a delta for every vertex in the mesh, moving or
  not, and the source FBX leaves float noise on most of the ones that do not
  move. Measured across the shipped four: 56% of the deltas are exactly zero,
  another 42% move less than a micron, and about 2% move far enough to see on a
  1.74 m figure. That data was 58-66% of every file.
- The script drops deltas below ten microns and stores the rest as sparse
  accessors, which is what sparse accessors are for. Largest resulting change to
  any vertex in any shape: two microns. The four actors went from 47.8 MB to
  21.8 MB with no visible difference at full expression.
- It is idempotent, so re-running it over an already-converted actor is safe.

## Removed MakeHuman subjects

`human-suited-runtime.glb` and the four `human-female-*.glb` actors were the
studio's original subjects, replaced by the Rocketbox pair because they ship no
eye geometry at all — no eyeballs, no lids, no brows — which is why the studio
used to cut a socket into each face and park a sphere behind it.

They were deleted once the wardrobe learned to pick an actor, which was the last
thing they could still have been used for. They were 19.8 MB of a deploy nothing
could select. Their provenance, licences (CC0 1.0, MakeHuman / MPFB 2 via the
`kunalkushwaha/vsim` project) and the conversion notes are in the git history at
the commit that removed them, and the files come back with a checkout if a
matching Rocketbox avatar is ever wanted for each outfit.

The socket-cutting and prosthetic-eye code stays, because it is what makes an
eyeless model somebody imports themselves usable.

`hair/short04.obj` is the complete scalp-shell hairstyle used by the built-in subjects. Its original `short04.mhmat` is preserved beside it.

- Source: MakeHuman system asset `short04`, mirrored by the MPFB asset dataset.
- License: CC0 1.0, explicitly declared in the source mesh and material in September 2020.
- Runtime treatment: scaled to the normalized head, centered from source bounds, given directional fibre colour and normal detail, and attached to the real head bone.

Upstream attribution and generation notes: <https://github.com/kunalkushwaha/vsim/blob/main/packages/assets/library/CREDITS.md>

`human-female-activewear.glb`, `human-female-dress.glb`, and `human-female-gown.glb` are matching female studio subjects generated with the same MPFB 2 pipeline and 53-bone game-engine rig.

- Body and skin: MakeHuman system assets, CC0 1.0.
- Dress: `toigo_halter_dress_knee_length` by Margaret Toigo, from the MakeHuman Dress 01 CC0 asset pack.
- Gown: `toigo_halter_dress_with_fluted_skirt` by Margaret Toigo, from the MakeHuman Dress 01 CC0 asset pack.
- Runtime treatment: female macro body baked into the mesh, 1024 px embedded PBR maps, fitted and skinned garments, four embedded motion clips, normalized to 1.82 m in the studio.

`human-female-casual.glb` is the matching everyday female subject: a shirt-and-jeans outfit with low shoes, exported through the same MPFB 2 pipeline and 53-bone game-engine rig.

- Body and skin: MakeHuman system asset `young_caucasian_female`, CC0 1.0.
- Outfit: MakeHuman system asset `female_casualsuit01`, CC0 1.0.
- Shoes: MakeHuman system asset `shoes02`, CC0 1.0.
- Runtime treatment: female macro body baked into the mesh, 1024 px embedded PBR maps, fitted and skinned garments, four embedded motion clips, normalized to 1.82 m in the studio.
