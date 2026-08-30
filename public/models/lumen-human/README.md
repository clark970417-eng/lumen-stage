# Everyday Adult character

`human-suited-runtime.glb` is the built-in, fully skinned studio subject used by Lumen Stage.

- Source: MakeHuman / MPFB 2 character distributed by the open-source `kunalkushwaha/vsim` project.
- License: CC0 1.0. The generated human, skin, clothing and shoe assets are public-domain MakeHuman output.
- Rig: 53-bone humanoid skeleton.
- Embedded motion clips: idle, walk, run and wave.
- Runtime treatment: normalized to 1.82 m, opaque PBR materials, shadow casting, real eyeball geometry, and head-bone accessories.

`hair/short04.obj` is the lightweight 1,050-triangle hairstyle used by the built-in subject. Its original `short04.mhmat` is preserved beside it.

- Source: MakeHuman system asset `short04`, mirrored by the MPFB asset dataset.
- License: CC0 1.0, explicitly declared in both source files in September 2020.
- Runtime treatment: scaled to the normalized head, centered from source bounds, assigned the Lumen hair material, and attached to the real head bone.

Upstream attribution and generation notes: <https://github.com/kunalkushwaha/vsim/blob/main/packages/assets/library/CREDITS.md>

`human-female-activewear.glb`, `human-female-dress.glb`, and `human-female-gown.glb` are matching female studio subjects generated with the same MPFB 2 pipeline and 53-bone game-engine rig.

- Body and skin: MakeHuman system assets, CC0 1.0.
- Dress: `toigo_halter_dress_knee_length` by Margaret Toigo, from the MakeHuman Dress 01 CC0 asset pack.
- Gown: `toigo_halter_dress_with_fluted_skirt` by Margaret Toigo, from the MakeHuman Dress 01 CC0 asset pack.
- Runtime treatment: female macro body baked into the mesh, 1024 px embedded PBR maps, fitted and skinned garments, four embedded motion clips, normalized to 1.82 m in the studio.
