const coats = [
  ["miso", "Snorlax", "Ginger tabby", { size: 1.035, shape: .96, breathRate: 1.55, breathDepth: 1.14, softness: 1.16, tailInterval: 14 }],
  ["inky", "Inky", "Black shorthair", { size: .97, shape: 1.04, breathRate: 1.78, breathDepth: .94, softness: .94, tailInterval: 12 }],
  ["mochi", "Mochi", "Cream shorthair", { size: .81, shape: .97, breathRate: 2.20, breathDepth: 1.08, softness: 1.06, tailInterval: 10 }],
  ["ash", "Ash", "Silver tabby", { size: .92, shape: 1.03, breathRate: 1.97, breathDepth: .87, softness: .90, tailInterval: 13.5 }],
  ["domino", "Domino", "Tuxedo", { size: .99, shape: 1, breathRate: 1.66, breathDepth: 1.03, softness: 1.03, tailInterval: 11.6 }],
  ["pebble", "Pebble", "Blue gray", { size: .89, shape: .94, breathRate: 1.87, breathDepth: 1.12, softness: 1.19, tailInterval: 15 }],
  ["bean", "Bean", "Brown tabby", { size: .84, shape: 1.06, breathRate: 2.11, breathDepth: .85, softness: .87, tailInterval: 10.8 }],
  ["sesame", "Sesame", "Seal point", { size: .91, shape: 1.09, breathRate: 2.03, breathDepth: .91, softness: .88, tailInterval: 12.8 }],
];

export const catRig = {
  back: [.52, .40],
  tailCut: .797,
  // Each joint is [x, y, hit radius] in texture space. Radius is relative to width.
  tail: [[.816, .367, .034], [.881, .404, .033], [.945, .540, .034], [.935, .718, .030], [.851, .887, .016]],
  flow: new URL("../assets/pets/fur-flow.webp", import.meta.url).href,
};

export const pets = coats.map(([id, name, coat, profile], index) => ({
  id,
  name,
  coat,
  species: "cat",
  url: new URL(`../assets/pets/${id}.webp`, import.meta.url).href,
  portrait: `${index % 4 * 100 / 3}% ${Math.floor(index / 4) * 100}%`,
  rig: { ...catRig, ...profile },
}));
