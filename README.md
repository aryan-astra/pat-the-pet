# Pat the Pet

A static petting simulator with original overhead artwork, real-time fur and tail motion, and a recording of a real cat purring. It runs in the browser with no runtime dependencies.

## Run locally

From the project root, serve the files over HTTP.

```sh
python -m http.server 8745 --bind 127.0.0.1
```

Open [the local simulator](http://127.0.0.1:8745/). Netlify uses the settings in `netlify.toml` to copy the static site into `dist` and publish it without installing project dependencies.

Stroke the head or back with a mouse or finger. Brush over the tail to follow it with the hand, or press and drag to straighten it. The tail springs back after release and flicks occasionally on its own. Press **Space** to stroke the back or **T** to use the folded grip.

On Snorlax’s cushion, drag any stamp far enough to peel it, then release it on the exposed fabric. The smiling ginger cat stamp physically covers the embroidered face and caption. Keyboard users can peel with **Enter** and move detached stamps with the arrow keys. The purr and paper-peel effects are enabled by default and can be muted with **Sound**. Browsers may require a click, tap, or keyboard interaction before playback.

## Add a companion

The eight companion profiles in `src/pets.js` set size, proportions, breathing, coat softness, and tail flick cadence. Each profile uses an alpha WebP texture, a portrait, and texture-relative tail joints and hit radii. `src/tail.js` fits the grabbed point to the pointer while keeping the tail’s segment lengths fixed. The hand art and contact points share a rig in `src/hand-art.js`, and `src/outline.js` tracks the alpha edge through the changing mesh. `src/fur.js` drives breathing, soft-tissue recoil, and the grain left by a stroke. The WebGL renderer lights raised fibres and renders the tail on a separate articulated layer. With WebGL unavailable, the static cat and hand images still support the comfort meter, coat selection, and sound.

## Credits

- **Sound**. The purr in `Music/bertie-purr.mp3` uses Jim Mowatt’s public-domain recording of Bertie Wooster. The paper-peel effect in `Music/sticker-peel.mp3` is synthesized from filtered noise and short crackles. [Original purr recording at Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Purring_cat_bertie.ogg).
- **Artwork**. The overhead room, cat, two hand poses, eight stamps, and embroidered adaptation of the supplied portrait were created with the built-in OpenAI Image Generation tool and exported as WebP.
- **Fonts**. DM Sans and Fraunces are distributed with their SIL Open Font License files in `assets/fonts`.

<details>
<summary>Artwork prompts</summary>

**Cat** (`assets/pets/miso.webp`, transparent background)

> Original game art, extremely realistic photographic cutout of ONE ginger mackerel tabby sleeping belly-down, straight overhead camera looking vertically down (90 degrees to the floor). Wide 3:2 composition. Body lies horizontally with head at left, spine toward the upper middle, haunch at right. The left cheek and closed eyes tilt slightly toward lower left so one can glimpse the sleeping expression from directly overhead; natural triangular ears are both visible. Front paws folded naturally forward just under the left cheek. Body gently oval, NOT curled into a ball, relaxed loaf. Entire silhouette with generous clear transparent margins. Critical for an animation rig: at the RIGHT EDGE of the haunch, exactly ONE long tapering ginger striped tail extends outward to the RIGHT of the haunch, then gently curves DOWN toward the lower right. After the first small joint at the rump the tail's sides and tip are completely separated from the body by generous clear transparent negative space. Tail has enough length to distinguish the base, middle and tip. Leave a clear margin beyond the tail. The tail never crosses in front of the body, paws or face; it never curls back underneath the torso. Fine authentic directional short cat fur, individualized soft hair tips and layered fur clumps visible especially on the spine, soft natural side lighting from upper left. Warm apricot coat with cream edges, scattered golden natural highlights, normal orange stripes. Avoid smoothed plastic texture and oversharpening. Photoreal hero asset with clean alpha, no surface, no cast shadow, no background, no people, no text, no secondary object.

**Room** (`assets/room.webp`, with a smaller `assets/room-800.webp` variant)

> Wide photographic background plate for a cozy overhead cat simulator. The camera is directly overhead, vertically looking down (90 degrees, orthographic appearance). One roomy empty muted sage/olive-green upholstered loose floor cushion with bounded rounded corners and subtle raised piping, at a very slight diagonal. Beautiful detailed natural woven fabric, with subtle gentle wrinkles; soft warm morning light falling from upper left with diffused window shadow. Thin border of warm creamy oatmeal rug around the cushion just at the corners and edges. Linen / cotton subtle fabric variations. Keep the center of the entire wide cushion empty, generously open, matte, with quiet fine fabric fibers. Subtle little fold at an edge, no strong stripes or objects, natural realistic photography. 3:2 landscape. No animal, human, text, props, furniture legs or logos.

**Hand** (`assets/hand.webp`, transparent background)

> Create an original polished 2D anime game sprite of a single right human hand and short forearm, seen directly from above with the palm toward the table. Center the wrist at the bottom, point the fingers upward, and angle the thumb left. Show all five naturally tapered, gently curved fingers with gaps between them. Use restrained cel shading, delicate outlines, credible knuckle and tendon details, understated nails, soft violet-gray and blush shadows, and pearly highlights from the upper left. Give the ghost hand opaque skin regions so the engine can composite the translucence. Leave clear alpha outside the silhouette and a little margin around every fingertip. Include one pose, with no cat, background, clothing, props, text, or glow cloud.

**Grip** (`assets/hand-grip.webp`, transparent background)

> Match the supplied dorsal-view hand’s proportions, framing, wrist position, rosy ivory and lavender-grey cel shading. Draw a gentle loose C grip, with curled fingertips and an open gap between the thumb and index finger. Keep the imaginary tail out of the image and leave transparent space around the silhouette.

**Stamps** (`assets/stamps/stamp-1.webp` through `stamp-8.webp`)

> Make a four-by-two sheet of eight individual vintage cat postage stickers. Use tactile paper fibers, scalloped ivory edges, and muted postcard inks. Include a sleeping tabby, black cat and star, paw print, smiling ginger cat with a peeled corner, fish toy, moon cat, matchbox cat, and tabby carrying an envelope. Keep each sticker squarely overhead and clear of its neighbors.

**Embroidered portrait** (`assets/supreme-leader-knit.webp`)

> Use only the face and tousled hair from the supplied portrait. Match the cushion with olive and flax stitches and leave clear alpha outside the hair and face. Simplify the embroidery so it reads at stamp size, with the title and credit added in the scene.

</details>
