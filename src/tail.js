const clamp = (value, min, max) => Math.max(min, Math.min(value, max));
const angleTo = (from, to) => Math.atan2(to[1] - from[1], to[0] - from[0]);
const wrap = angle => Math.atan2(Math.sin(angle), Math.cos(angle));

function project(x, y, start, end) {
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  const ox = x - start[0];
  const oy = y - start[1];
  const t = clamp((ox * dx + oy * dy) / (dx * dx + dy * dy), 0, 1);
  return [t, Math.hypot(ox - t * dx, oy - t * dy)];
}

function keepDistance(point, anchor, length) {
  const dx = point[0] - anchor[0];
  const dy = point[1] - anchor[1];
  const distance = Math.hypot(dx, dy);
  point[0] = anchor[0] + (distance > .00001 ? dx / distance * length : length);
  point[1] = anchor[1] + (distance > .00001 ? dy / distance * length : 0);
}

export function createTail(rig, aspect) {
  const rest = rig.tail.map(([x, y]) => [x, y / aspect]);
  const posed = rest.map(point => point.slice());
  const joints = new Float32Array(rest.length * 3);
  const radii = rig.tail.map(([, , radius]) => radius);
  const lengths = rest.slice(1).map((end, i) => Math.hypot(end[0] - rest[i][0], end[1] - rest[i][1]));
  const baseAngles = lengths.map((_, i) => angleTo(rest[i], rest[i + 1]));
  const angles = baseAngles.slice();
  const targets = baseAngles.slice();
  const velocity = new Float32Array(lengths.length);
  const root = rest[0];
  const cadence = rig.tailInterval ?? 12;
  let clock = 0;
  let nextFlick = cadence * .79;
  let flickIndex = 0;
  let hadGrip = false;
  let active = false;

  function jointLimit(angle, index, previous) {
    if (index === 0) return clamp(angle, baseAngles[0] - .44, baseAngles[0] + .56);
    return clamp(angle, Math.max(-.29, previous - .34), Math.min(2.46, previous + .79));
  }

  function split(at) {
    const progress = clamp(at, 0, 1) * lengths.length;
    const segment = Math.min(lengths.length - 1, Math.floor(progress));
    return [segment, progress - segment];
  }

  // Joint distances stay fixed as the pointer pulls the weighted point.
  function aimGrip(grip) {
    const [segment, fraction] = split(grip.at);
    const piece = Math.max(.025, fraction);
    const spans = lengths.slice(0, segment).concat(lengths[segment] * piece);
    const total = spans.reduce((sum, length) => sum + length, 0);
    const dx = grip.u - root[0];
    const dy = grip.v / aspect - root[1];
    const aim = Math.hypot(dx, dy) > .004 ? Math.atan2(dy, dx) : baseAngles[0];
    const bearing = clamp(aim, baseAngles[0] - .28, baseAngles[0] + .82);
    const tension = grip.held ? .966 : .62;
    const reach = clamp(Math.hypot(dx, dy), total * tension, total * .997);
    const goal = [root[0] + Math.cos(bearing) * reach, root[1] + Math.sin(bearing) * reach];

    const chain = posed.slice(0, segment + 1).map(point => point.slice());
    const a = posed[segment];
    const b = posed[segment + 1];
    chain.push([a[0] + (b[0] - a[0]) * piece, a[1] + (b[1] - a[1]) * piece]);
    for (let pass = 0; pass < 9; pass++) {
      chain[spans.length] = goal.slice();
      for (let i = spans.length - 1; i >= 0; i--) keepDistance(chain[i], chain[i + 1], spans[i]);
      chain[0] = root.slice();
      for (let i = 0; i < spans.length; i++) keepDistance(chain[i + 1], chain[i], spans[i]);
    }
    for (let i = 0; i <= segment; i++) targets[i] = angleTo(chain[i], chain[i + 1]);
    for (let i = segment + 1; i < lengths.length; i++) {
      const bend = wrap(baseAngles[i] - baseAngles[segment]) * (grip.held ? .23 : .72);
      const twitch = Math.sin(clock * 12.5 - i * .9) * (grip.held ? .031 : .017);
      targets[i] = targets[segment] + bend + twitch;
    }
  }

  return {
    aspect,
    rest: rest.flat(),
    get active() { return active; },
    weight(x, y) {
      let nearest = Infinity;
      let weight = 0;
      for (let i = 0; i < lengths.length; i++) {
        const [t, distance] = project(x, y / aspect, rest[i], rest[i + 1]);
        if (distance < nearest) {
          weight = i + t;
          nearest = distance;
        }
      }
      return weight;
    },
    update(delta, grip, reduced) {
      clock += delta;
      if (grip || hadGrip) nextFlick = clock + cadence * .9;
      if (!grip && clock > nextFlick + 1.55) {
        nextFlick = clock + cadence * (1 + .17 * Math.sin(++flickIndex * 2.7));
      }
      for (let i = 0; i < lengths.length; i++) {
        const phase = (clock - nextFlick - i * .11) / 1.08;
        const flick = reduced || phase <= 0 || phase >= 1 ? 0 :
          Math.sin(phase * Math.PI) ** 2 * Math.sin(phase * Math.PI * 2);
        targets[i] = baseAngles[i] + flick * (.07 + i * .057);
      }
      if (grip) aimGrip(grip);
      for (let i = 0; i < lengths.length; i++) targets[i] = jointLimit(targets[i], i, targets[i - 1]);
      hadGrip = Boolean(grip);

      active = false;
      for (let i = 0; i < lengths.length; i++) {
        const rate = (grip ? (grip.held ? 28 : 23) : 13.4) - i * 1.28;
        const damping = grip || reduced ? rate * 1.97 : rate * 1.18;
        const steps = Math.max(1, Math.ceil(delta * 150));
        const step = delta / steps;
        for (let tick = 0; tick < steps; tick++) {
          velocity[i] += (rate * rate * wrap(targets[i] - angles[i]) - damping * velocity[i]) * step;
          const candidate = angles[i] + velocity[i] * step;
          angles[i] = jointLimit(candidate, i, angles[i - 1]);
          if (angles[i] !== candidate) velocity[i] = 0;
        }
        const rotation = wrap(angles[i] - baseAngles[i]);
        active ||= Math.abs(rotation) > .0008 || Math.abs(velocity[i]) > .003;
        posed[i + 1][0] = posed[i][0] + lengths[i] * Math.cos(angles[i]);
        posed[i + 1][1] = posed[i][1] + lengths[i] * Math.sin(angles[i]);
        joints.set([posed[i][0], posed[i][1], rotation], i * 3);
      }
      const end = posed.at(-1);
      joints.set([end[0], end[1], wrap(angles.at(-1) - baseAngles.at(-1))], lengths.length * 3);
      return joints;
    },
    sample(at) {
      const [i, t] = split(at);
      const a = posed[i];
      const b = posed[i + 1];
      return { u: a[0] + (b[0] - a[0]) * t, v: (a[1] + (b[1] - a[1]) * t) * aspect, angle: angleTo(a, b) };
    },
    closest(x, y) {
      let nearest = null;
      for (let i = 0; i < lengths.length; i++) {
        const [t, distance] = project(x, y / aspect, posed[i], posed[i + 1]);
        const radius = radii[i] + (radii[i + 1] - radii[i]) * t;
        if (!nearest || distance < nearest.distance) nearest = { at: (i + t) / lengths.length, radius, distance };
      }
      return nearest;
    },
  };
}
