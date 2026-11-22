const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, value));

// Trace the silhouette in texture space and map its edge through the coat mesh.
export function createOutline(image, aspect, tailCut) {
  const width = 280;
  const height = Math.max(1, Math.round(width * aspect));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });

  function alpha(radius) {
    context.clearRect(0, 0, width, height);
    context.filter = `blur(${radius}px)`;
    context.drawImage(image, 0, 0, width, height);
    context.filter = "none";
    return context.getImageData(0, 0, width, height).data;
  }

  const edge = alpha(1);
  const wide = alpha(3.1);
  const A = (data, x, y) => data[(y * width + x) * 4 + 3];
  const lines = [];
  const point = (x, y) => {
    const i = clamp(Math.round(x), 2, width - 3);
    const j = clamp(Math.round(y), 2, height - 3);
    const nx = A(wide, i + 2, j) - A(wide, i - 2, j);
    const ny = A(wide, i, j + 2) - A(wide, i, j - 2);
    const length = Math.hypot(nx, ny) || 1;
    return { x: (x + .5) / width, y: (y + .5) / width, nx: nx / length, ny: ny / length };
  };

  for (let y = 1; y < height - 2; y++) {
    for (let x = 1; x < Math.min(width - 2, Math.floor(tailCut * width) - 1); x++) {
      const a = A(edge, x, y);
      const b = A(edge, x + 1, y);
      const c = A(edge, x + 1, y + 1);
      const d = A(edge, x, y + 1);
      if (Math.min(a, b, c, d) >= 128 || Math.max(a, b, c, d) < 128) continue;
      const hits = [];
      if ((a >= 128) !== (b >= 128)) hits.push(point(x + (128 - a) / (b - a), y));
      if ((b >= 128) !== (c >= 128)) hits.push(point(x + 1, y + (128 - b) / (c - b)));
      if ((d >= 128) !== (c >= 128)) hits.push(point(x + (128 - d) / (c - d), y + 1));
      if ((a >= 128) !== (d >= 128)) hits.push(point(x, y + (128 - a) / (d - a)));
      for (let i = 0; i + 1 < hits.length; i += 2) {
        const p = hits[i];
        const q = hits[i + 1];
        const dx = q.x - p.x;
        const dy = q.y - p.y;
        const length = Math.hypot(dx, dy);
        if (length > 1e-8) lines.push({ p, q, dx, dy, length, den: length * length });
      }
    }
  }

  return {
    near(cat, u, v) {
      const mat = cat.unmap(u, v);
      const U = mat.u;
      const V = mat.v * aspect;
      let best = Infinity;
      let closest = null;
      for (const line of lines) {
        const { p, dx, dy, den } = line;
        const t = clamp(((U - p.x) * dx + (V - p.y) * dy) / den);
        const ex = p.x + t * dx - U;
        const ey = p.y + t * dy - V;
        const distance = ex * ex + ey * ey;
        if (distance < best) {
          best = distance;
          closest = line;
        }
      }
      if (!closest) return null;
      let sum = 0;
      let x = 0;
      let y = 0;
      let nx = 0;
      let ny = 0;
      const sigma = .014;
      const limit = sigma * sigma * 8;
      for (const line of lines) {
        const p = line.p;
        if (Math.abs(p.x - closest.p.x) > .065 || Math.abs(p.y - closest.p.y) > .065) continue;
        const k = clamp(((U - p.x) * line.dx + (V - p.y) * line.dy) / line.den);
        const ex = p.x + k * line.dx;
        const ey = p.y + k * line.dy;
        const delta = (ex - U) ** 2 + (ey - V) ** 2 - best;
        if (delta > limit) continue;
        const weight = Math.exp(-delta / (2 * sigma * sigma)) * line.length;
        sum += weight;
        x += ex * weight;
        y += ey * weight;
        nx += (p.nx + (line.q.nx - p.nx) * k) * weight;
        ny += (p.ny + (line.q.ny - p.ny) * k) * weight;
      }
      if (!sum) return null;
      x /= sum;
      y /= sum * aspect;
      const norm = Math.hypot(nx, ny) || 1;
      const X = cat.hasMesh ? cat.sample(cat.xy, x, y, 0) : x;
      const Y = cat.hasMesh ? cat.sample(cat.xy, x, y, 1) : y;
      return {
        u: X,
        v: Y,
        restU: x,
        restV: y,
        nx: nx / norm,
        ny: ny / norm,
        distance: Math.hypot(u - X, (v - Y) * aspect),
        zone: x < .30 ? "head" : "back",
      };
    },
  };
}
