# Pat the Pet

A static petting simulator with original overhead artwork, real-time fur and tail motion, and a recording of a real cat purring. It runs in the browser with no runtime dependencies.

## Run locally

From the project root, serve the files over HTTP.

```sh
python -m http.server 8745 --bind 127.0.0.1
```

Open [the local simulator](http://127.0.0.1:8745/). A static host can serve the project root directly.

Stroke the head or back with a mouse or finger. Sweep along the tail to make it curl and swish. Press **Space** to stroke the back or **T** to swish the tail. Use the controls to change the coat, lighting, sound, hand guide, or fullscreen mode. Sound starts off and becomes available after a click, tap, or keypress.

## Add a companion

The coat catalog and sprite rig live in `src/pets.js`. Each pose uses an alpha WebP texture, a portrait, and texture-relative tail joints and hit radii. A fur direction map encodes the axial angle of the hair in red and green and the confidence in blue. `src/fur.js` tracks brushed hair as it settles. `src/contact.js` maps the palm and fingertips onto the coat and smooths out changes in pressure and stroke direction. The WebGL renderer uses those inputs for localized compression, a ridge of fur ahead of the stroke, and a separate articulated tail. With WebGL unavailable, the photo stays still and the hand guide, comfort, coat selection, and sound remain available.

## Credits

- **Purr**. Jim Mowatt's public-domain recording of Bertie Wooster was trimmed, filtered, and crossfaded for a continuous loop. [Original recording at Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Purring_cat_bertie.ogg).
- **Artwork**. The overhead room and cat were generated with the built-in OpenAI Image Generation tool and exported as WebP. The ten coats share the sprite's pose and rig. The translucent hand is an original SVG.
- **Fonts**. DM Sans and Fraunces are distributed with their SIL Open Font License files in `assets/fonts`.

<details>
<summary>Artwork prompts</summary>

**Cat** (`assets/pets/miso.webp`, transparent background)

> Original game art, extremely realistic photographic cutout of ONE ginger mackerel tabby sleeping belly-down, straight overhead camera looking vertically down (90 degrees to the floor). Wide 3:2 composition. Body lies horizontally with head at left, spine toward the upper middle, haunch at right. The left cheek and closed eyes tilt slightly toward lower left so one can glimpse the sleeping expression from directly overhead; natural triangular ears are both visible. Front paws folded naturally forward just under the left cheek. Body gently oval, NOT curled into a ball, relaxed loaf. Entire silhouette with generous clear transparent margins. Critical for an animation rig: at the RIGHT EDGE of the haunch, exactly ONE long tapering ginger striped tail extends outward to the RIGHT of the haunch, then gently curves DOWN toward the lower right. After the first small joint at the rump the tail's sides and tip are completely separated from the body by generous clear transparent negative space. Tail has enough length to distinguish the base, middle and tip. Leave a clear margin beyond the tail. The tail never crosses in front of the body, paws or face; it never curls back underneath the torso. Fine authentic directional short cat fur, individualized soft hair tips and layered fur clumps visible especially on the spine, soft natural side lighting from upper left. Warm apricot coat with cream edges, scattered golden natural highlights, normal orange stripes. Avoid smoothed plastic texture and oversharpening. Photoreal hero asset with clean alpha, no surface, no cast shadow, no background, no people, no text, no secondary object.

**Room** (`assets/room.webp`, with a smaller `assets/room-800.webp` variant)

> Wide photographic background plate for a cozy overhead cat simulator. The camera is directly overhead, vertically looking down (90 degrees, orthographic appearance). One roomy empty muted sage/olive-green upholstered loose floor cushion with bounded rounded corners and subtle raised piping, at a very slight diagonal. Beautiful detailed natural woven fabric, with subtle gentle wrinkles; soft warm morning light falling from upper left with diffused window shadow. Thin border of warm creamy oatmeal rug around the cushion just at the corners and edges. Linen / cotton subtle fabric variations. Keep the center of the entire wide cushion empty, generously open, matte, with quiet fine fabric fibers. Subtle little fold at an edge, no strong stripes or objects, natural realistic photography. 3:2 landscape. No animal, human, text, props, furniture legs or logos.

</details>
