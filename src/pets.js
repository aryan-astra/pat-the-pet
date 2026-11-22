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
  back: [.52, .40],
  tailCut: .797,
  // Each joint is [x, y, hit radius] in texture space. Radius is relative to width.
  tail: [[.816, .367, .034], [.881, .404, .033], [.945, .540, .034], [.935, .718, .030], [.851, .887, .016]],
  flow: new URL("../assets/pets/fur-flow.webp", import.meta.url).href,
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
