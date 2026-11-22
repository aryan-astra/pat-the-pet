const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

function project(x, y, start, end) {
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  const offsetX = x - start[0];
  const offsetY = y - start[1];
  const fraction = clamp((offsetX * dx + offsetY * dy) / (dx * dx + dy * dy), 0, 1);
  return [fraction, Math.hypot(offsetX - fraction * dx, offsetY - fraction * dy)];
}

export function createTail(rig, aspect) {
  const rest = rig.tail.map(([x, y]) => [x, y / aspect]);
  const posed = rest.map(point => point.slice());
  const bones = new Float32Array(rest.length * 3);
  const rotation = new Float32Array(rest.length);
  const radii = rig.tail.map(([, , radius]) => radius);
  const sweep = [0, .65, 1, 1.18, 1.28];
  const curl = [0, -.08, -.43, -.85, -1.05];

  return {
    rest: rest.flat(),
    weight(x, y) {
      let nearest = Infinity;
      let weight = 0;
      for (let i = 0; i < rest.length - 1; i++) {
        const [t, distance] = project(x, y / aspect, rest[i], rest[i + 1]);
        if (distance < nearest) {
          weight = i + t;
          nearest = distance;
        }
      }
      return weight;
    },
    pose(turn, uncurl) {
      for (let i = 0; i < rest.length; i++) {
        rotation[i] = sweep[i] * turn + curl[i] * uncurl;
        if (i > 0) {
          const dx = rest[i][0] - rest[i - 1][0];
          const dy = rest[i][1] - rest[i - 1][1];
          const angle = (rotation[i - 1] + rotation[i]) * .5;
          const c = Math.cos(angle);
          const s = Math.sin(angle);
          posed[i][0] = posed[i - 1][0] + dx * c - dy * s;
          posed[i][1] = posed[i - 1][1] + dx * s + dy * c;
        }
        bones.set([posed[i][0], posed[i][1], rotation[i]], i * 3);
      }
      return bones;
    },
    hit(x, y) {
      for (let i = 0; i < posed.length - 1; i++) {
        const [t, distance] = project(x, y / aspect, posed[i], posed[i + 1]);
        const radius = radii[i] + (radii[i + 1] - radii[i]) * t;
        if (distance < radius) return true;
      }
      return false;
    },
  };
}
