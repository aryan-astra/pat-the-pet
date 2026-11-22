const fieldWidth = 84;
const fieldHeight = 56;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export function createFurField() {
  const size = fieldWidth * fieldHeight;
  const depth = new Float32Array(size);
  const momentum = new Float32Array(size);
  const load = new Float32Array(size);
  const napX = new Float32Array(size);
  const napY = new Float32Array(size);
  const comb = new Float32Array(size);
  const pixels = new Uint8Array(size * 4);
  let energy = 0;

  const field = {
    width: fieldWidth, height: fieldHeight, pixels, version: 0,
    clear() {
      for (const buffer of [depth, momentum, load, napX, napY, comb]) buffer.fill(0);
      pixels.fill(128);
      for (let i = 2; i < pixels.length; i += 4) pixels[i] = 0;
      energy = 0;
      field.version++;
    },
    advance(delta, contact) {
      const pressure = contact.center[2];
      if (pressure > .007) energy = 1;
      if (!energy) return;
      if (pressure <= .007) {
        energy *= Math.exp(-delta * 2);
        if (energy < .008) {
          field.clear();
          return;
        }
      }

      load.fill(0);
      const fade = Math.exp(-delta * 1.8);
      for (let i = 0; i < size; i++) {
        napX[i] *= fade;
        napY[i] *= fade;
        comb[i] *= fade;
      }
      if (pressure > .007) {
        const [directionX, directionY, glide] = contact.stroke;
        const slipX = directionX * (.36 + .64 * glide);
        const slipY = directionY * (.36 + .64 * glide);
        const combRate = 1 - Math.exp(-delta * glide * 15);
        let loaded = false;
        for (let i = 0; i < contact.pads.length; i += 4) {
          const weight = contact.pads[i + 3] * pressure;
          if (weight < .015) continue;
          stamp(contact.pads[i], contact.pads[i + 1], contact.pads[i + 2], weight,
            directionX, directionY, glide, slipX, slipY, combRate);
          loaded = true;
        }
        if (!loaded) stamp(contact.center[0], contact.center[1], .029, pressure * .66,
          directionX, directionY, glide, slipX, slipY, combRate);
      }

      // A damped height field rebounds after the contact moves on. Neighbor
      // coupling keeps the pressure from looking like six isolated dots.
      const iterations = Math.ceil(delta * 108);
      const step = delta / iterations;
      for (let j = 0; j < iterations; j++) {
        for (let y = 1; y < fieldHeight - 1; y++) {
          for (let x = 1; x < fieldWidth - 1; x++) {
            const i = y * fieldWidth + x;
            const current = depth[i];
            const laplacian = depth[i - 1] + depth[i + 1]
              + depth[i - fieldWidth] + depth[i + fieldWidth] - 4 * current;
            const spring = 218 * (clamp(load[i], -.85, .61) - current);
            momentum[i] += (spring + 96 * laplacian - 21 * momentum[i]) * step;
          }
        }
        for (let i = 0; i < size; i++) depth[i] += momentum[i] * step;
      }

      for (let i = 0; i < size; i++) {
        const pixel = i * 4;
        pixels[pixel] = 128 + clamp(napX[i], -1, 1) * 126;
        pixels[pixel + 1] = 128 + clamp(napY[i], -1, 1) * 126;
        pixels[pixel + 2] = clamp(comb[i], 0, 1) * 255;
        pixels[pixel + 3] = 128 + clamp(depth[i], -.99, .99) * 126;
      }
      field.version++;
    },
    get active() { return energy > 0; },
  };

  function stamp(x, y, radius, weight, dx, dy, glide, slipX, slipY, combRate) {
    const centerX = x * fieldWidth - .5;
    const centerY = y * fieldHeight - .5;
    const spread = Math.max(1.18, radius * fieldWidth * 1.12);
    const limit = spread * 2.8;
    const sink = .72 + radius * 5;
    for (let row = Math.max(1, Math.floor(centerY - limit)); row <= Math.min(fieldHeight - 2, centerY + limit); row++) {
      for (let col = Math.max(1, Math.floor(centerX - limit)); col <= Math.min(fieldWidth - 2, centerX + limit); col++) {
        const ox = (col - centerX) / spread;
        const oy = (row - centerY) / spread;
        const along = ox * dx + oy * dy;
        const across = -ox * dy + oy * dx;
        const footprint = Math.exp(-1.4 * along * along - 1.15 * across * across);
        const pushed = along - 1.13;
        const shoulder = Math.exp(-3.1 * pushed * pushed - 1.5 * across * across);
        const i = row * fieldWidth + col;
        load[i] += weight * (shoulder * glide * .91 - sink * footprint);
        const deposit = combRate * weight * (footprint + .18 * shoulder);
        napX[i] += (slipX - napX[i]) * deposit;
        napY[i] += (slipY - napY[i]) * deposit;
        comb[i] += (1 - comb[i]) * deposit;
      }
    }
  }

  field.clear();
  return field;
}
