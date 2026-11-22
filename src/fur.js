export function createFurField() {
  const width = 72;
  const height = 48;
  const values = new Float32Array(width * height * 3);
  const pixels = new Uint8Array(values.length);
  let energy = 0;

  const field = {
    width, height, pixels, version: 0,
    clear() {
      values.fill(0);
      energy = 0;
      for (let index = 0; index < pixels.length; index += 3) {
        pixels[index] = 128;
        pixels[index + 1] = 128;
        pixels[index + 2] = 0;
      }
      field.version++;
    },
    brush(x, y, dx, dy, pressure) {
      const speed = Math.hypot(dx, dy);
      const tx = speed > .001 ? dx / speed : .85;
      const ty = speed > .001 ? dy / speed : .52;
      const strength = pressure * Math.min(.91, .54 + speed * 8);
      const cx = x * width - .5;
      const cy = y * height - .5;
      for (let row = Math.max(0, Math.floor(cy - 8)); row <= Math.min(height - 1, cy + 8); row++) {
        for (let col = Math.max(0, Math.floor(cx - 8)); col <= Math.min(width - 1, cx + 8); col++) {
          const ox = col - cx;
          const oy = row - cy;
          const across = -ox * ty + oy * tx;
          const along = ox * tx + oy * ty;
          const influence = strength * Math.exp(-along * along / 25 - across * across / 13);
          if (influence < .025) continue;
          const index = (row * width + col) * 3;
          values[index] += (tx - values[index]) * influence;
          values[index + 1] += (ty - values[index + 1]) * influence;
          values[index + 2] += (1 - values[index + 2]) * influence;
        }
      }
      energy = 1;
    },
    settle(delta) {
      if (!energy) return;
      const relax = Math.exp(-delta * 2.7);
      energy *= relax;
      if (energy < .004) {
        field.clear();
        return;
      }
      for (let index = 0; index < pixels.length; index += 3) {
        values[index] *= relax;
        values[index + 1] *= relax;
        values[index + 2] *= relax;
        pixels[index] = 128 + values[index] * 126;
        pixels[index + 1] = 128 + values[index + 1] * 126;
        pixels[index + 2] = values[index + 2] * 255;
      }
      field.version++;
    },
    get active() { return energy > 0; },
  };
  field.clear();
  return field;
}
