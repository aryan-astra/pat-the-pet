const coats = [
  ["miso", "Miso", "Ginger tabby"],
  ["inky", "Inky", "Black shorthair"],
  ["mochi", "Mochi", "Cream shorthair"],
  ["poppy", "Poppy", "Calico"],
  ["ash", "Ash", "Silver tabby"],
  ["domino", "Domino", "Tuxedo"],
  ["fig", "Fig", "Tortoiseshell"],
  ["pebble", "Pebble", "Blue gray"],
  ["bean", "Bean", "Brown tabby"],
  ["sesame", "Sesame", "Seal point"],
];

export const catRig = {
  // Texture coordinates start in the upper left of the uncropped sprite.
  back: [.56, .40],
  tail: [.74, .91],
  tailRoot: [.96, .46],
  tailCurve: [.98, .48, 3.4],
};

export const pets = coats.map(([id, name, coat], index) => ({
  id,
  name,
  coat,
  species: "cat",
  url: new URL(`../assets/pets/${id}.webp`, import.meta.url).href,
  portrait: `${index % 5 * 25}% ${Math.floor(index / 5) * 100}%`,
  rig: catRig,
}));
