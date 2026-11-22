# Pat the Pet

A static petting simulator with original cat artwork, real-time fur and tail motion, and synthesized purring. It runs in the browser with no runtime dependencies.

## Run locally

From the project root, serve the files over HTTP.

```sh
python -m http.server 8745 --bind 127.0.0.1
```

Open [the local simulator](http://127.0.0.1:8745/). A static host can serve the project root directly.

Stroke the head or back with a mouse or finger. Move outward from the tail to stretch it. Press **Space** to stroke the back or **T** to swish the tail. Use the controls to change the coat, lighting, sound, hand guide, or fullscreen mode. Sound starts off and becomes available after a click, tap, or keypress.

## Add a companion

The coat catalog and sprite rig live in `src/pets.js`. To add a companion in a new pose, supply an alpha WebP texture, a portrait, and texture-relative coordinates for the back and tail. `src/scene.js` handles gestures, hit testing, and spring motion. `src/mesh.js` renders the animated texture and defines how much of each region moves. The current renderer uses a softer image animation when WebGL is unavailable.

The room and cat were generated as original artwork with the built-in OpenAI Image Generation tool and exported as WebP. The coat variations share the cat's sprite and rig. DM Sans and Fraunces are distributed with their SIL Open Font License files in `assets/fonts`.

<details>
<summary>Artwork prompts</summary>

**Cat** (`assets/pets/miso.webp`, transparent background)

> Create one single photorealistic isolated cutout sprite for a cozy virtual cat petting web app, landscape composition, transparent background. One adult fluffy apricot-orange ginger tabby with pale cream cheeks and belly, softly napping with both eyes closed. Seen from three-quarter overhead about 55 degrees above the floor, curled up organically in one large horizontal oval. Cat's face entirely visible at the LEFT side of the frame looking a little toward lower left, top of head at upper left, front paws tucked beneath chin at lower left, wide furry body across middle and right. ONE distinct, fluffy striped tail emerges on the right end of the haunch, gently curls forward outlined against clear transparent negative space to the right and bottom-right of the body. The tail must have a little space between tip and torso so it can be animated, avoid obscuring face. Make the cat fill about 89 percent of image width and 73 percent height, composition centered. Gorgeous believable fine soft individual fur and red/orange mackerel tabby stripes. Photographic, lifelike, naturally proportioned. Soft natural warm late-afternoon window lighting from upper left, moderate contrast. No white stroke or drop shadow outside the cat, no floor cast shadow, no surface, no other objects, full body ears paws and tail in frame. Invisible background alpha, single subject.

**Room** (`assets/room.webp`, with a smaller `assets/room-800.webp` variant)

> Photorealistic warm cozy interior empty background plate for a cat petting web scene. Landscape 3:2 or wider. Top-down overhead close view of a large warm golden-cream linen armchair seat with a gently quilted, nearly smooth oat-colored central cushion, heavily visible fine woven tactile fibers, cushion takes up most of frame. Soft blurry bands and patches of sunlight across it cast from a window out of frame to the upper RIGHT. A narrow sage-green knitted wool throw with subtle ribs drapes in from upper left and trails only along the far LEFT border, occupies less than 20 percent. An understated pale peach piping seam at the very bottom right edge. Scandinavian country house, honey warm color grading and softness, late sun. Quiet and unbusy. The entire center of the cushion is EMPTY and roomy with very gentle light for adding a cat later. No animal or people, no typography, no framing border, no furniture legs, no clutter. Real photographic close-up with very subtle film grain.

</details>
