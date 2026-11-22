export const coatColumns = 76;
export const coatRows = 48;

const clamp = (value, low = 0, high = 1) => Math.max(low, Math.min(value, high));
const ease = (a, b, value) => {
  const t = clamp((value - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const gaussian = (x, y) => Math.exp(-x * x - y * y);

function oscillator(rate, damping) {
  let position = 0;
  let velocity = 0;
  return {
    update(goal, delta) {
      const steps = Math.max(1, Math.ceil(delta * 170));
      const step = delta / steps;
      for (let i = 0; i < steps; i++) {
        velocity += (rate * rate * (goal - position) - damping * velocity) * step;
        position += velocity * step;
      }
      return position;
    },
    reset() {
      position = 0;
      velocity = 0;
    },
  };
}

export function createCoat(rig, aspect) {
  const metric = 1 / aspect;
  const rowSize = coatColumns + 1;
  const vertices = [];
  for (let y = 0; y <= coatRows; y++) {
    for (let x = 0; x <= coatColumns; x++) {
      const u = x / coatColumns;
      const v = y / coatRows;
      const torso = gaussian((u - .50) / .29, (v - .45) / .30);
      const head = gaussian((u - .19) / .14, (v - .43) / .23);
      const socket = 1 - ease(.71, rig.tailCut - .002, u);
      vertices.push({ u, v, torso, head, socket });
    }
  }

  const xy = new Float32Array(vertices.length * 2);
  const light = new Float32Array(vertices.length * 3);
  const brushedX = new Float32Array(vertices.length);
  const brushedY = new Float32Array(vertices.length);
  const softness = rig.softness ?? 1;
  const relaxation = 1 / Math.sqrt(softness);
  const compression = oscillator(27 * relaxation, 32 * relaxation);
  const driftX = oscillator(22 * relaxation, 23 * relaxation);
  const driftY = oscillator(22 * relaxation, 23 * relaxation);
  const rollX = oscillator(11.5 * relaxation, 10 * relaxation);
  const rollY = oscillator(11.5 * relaxation, 10 * relaxation);
  const springs = [compression, driftX, driftY, rollX, rollY];
  let alphaData;
  let imageWidth = 0;
  let imageHeight = 0;
  let hasMesh = false;
  let lastInput;
  let clock = 0;
  let active = false;

  function sample(data, u, v, channel) {
    const gx = clamp(u * coatColumns, 0, coatColumns - .00001);
    const gy = clamp(v * coatRows, 0, coatRows - .00001);
    const x = Math.floor(gx);
    const y = Math.floor(gy);
    const tx = gx - x;
    const ty = gy - y;
    const a = 2 * (y * rowSize + x) + channel;
    const b = a + rowSize * 2;
    return (data[a] * (1 - tx) + data[a + 2] * tx) * (1 - ty)
      + (data[b] * (1 - tx) + data[b + 2] * tx) * ty;
  }

  function alpha(u, v) {
    if (!alphaData || u < 0 || v < 0 || u >= 1 || v >= 1) return 0;
    return alphaData[4 * (Math.floor(v * imageHeight) * imageWidth + Math.floor(u * imageWidth)) + 3];
  }

  function restZone(u, v) {
    return u < rig.tailCut && alpha(u, v) >= 85 ? (u < .30 ? "head" : "back") : null;
  }

  function unmap(u, v) {
    let x = u;
    let y = v;
    if (hasMesh && x >= 0 && y >= 0 && x <= 1 && y <= 1) {
      for (let pass = 0; pass < 4; pass++) {
        const dx = u - sample(xy, x, y, 0);
        const dy = v - sample(xy, x, y, 1);
        x += dx * .88;
        y += dy * .88;
        if (Math.abs(dx) + Math.abs(dy) < .0004) break;
      }
    }
    return { u: x, v: y, zone: restZone(x, y) };
  }

  const coat = {
    xy, light, alpha, sample, unmap,
    get active() { return active; },
    get hasMesh() { return hasMesh; },
    setImage(image) {
      const mask = document.createElement("canvas");
      imageWidth = mask.width = 256;
      imageHeight = mask.height = Math.round(imageWidth * metric);
      const ctx = mask.getContext("2d", { willReadFrequently: true });
      ctx.drawImage(image, 0, 0, imageWidth, imageHeight);
      alphaData = ctx.getImageData(0, 0, imageWidth, imageHeight).data;
      coat.reset();
    },
    reset() {
      springs.forEach(spring => spring.reset());
      hasMesh = active = false;
      lastInput = undefined;
      clock = 0;
      light.fill(0);
      brushedX.fill(0);
      brushedY.fill(0);
      for (let i = 0; i < vertices.length; i++) {
        xy[i * 2] = vertices[i].u;
        xy[i * 2 + 1] = vertices[i].v;
      }
    },
    contact(landmarks, motion, bounds, edge) {
      if (motion.pressure <= .006) return null;
      const fallback = unmap(motion.u, motion.v);
      let total = 0;
      let x = 0;
      let y = 0;
      const pads = [];
      for (const pad of landmarks) {
        const p = unmap((pad.x - bounds.x) / bounds.width, (pad.y - bounds.y) / bounds.height);
        if (!p.zone) continue;
        pads.push({ u: p.u, v: p.v, size: clamp(pad.radius / bounds.width, .017, .058), weight: pad.weight });
        total += pad.weight;
        x += p.u * pad.weight;
        y += p.v * pad.weight;
      }
      if (total < .02 && !fallback.zone && !edge) return null;
      const u = total ? .66 * x / total + .34 * fallback.u : fallback.u;
      const v = total ? .66 * y / total + .34 * fallback.v : fallback.v;
      return {
        u, v, pads, edge, vx: motion.vx, vy: motion.vy * metric,
        pressure: motion.pressure * clamp(.56 + total * .62, .56, 1),
      };
    },
    draw(delta, input, reduced) {
      clock += delta;
      const pressure = input?.pressure ?? 0;
      const velocity = Math.hypot(input?.vx ?? 0, input?.vy ?? 0);
      const speed = Math.tanh(velocity * 3);
      if (input) {
        const oldX = lastInput?.dirX ?? 0;
        const oldY = lastInput?.dirY ?? 1;
        const blend = 1 - Math.exp(-delta * 24);
        const aimX = velocity > .003 ? input.vx / velocity : oldX;
        const aimY = velocity > .003 ? input.vy / velocity : oldY;
        lastInput = { ...input, dirX: oldX + (aimX - oldX) * blend, dirY: oldY + (aimY - oldY) * blend };
      }
      const motion = lastInput;
      const settle = (reduced ? .35 : 1) * softness;
      const force = compression.update(pressure, delta);
      const shearX = driftX.update((motion?.dirX ?? 0) * speed * pressure, delta);
      const shearY = driftY.update((motion?.dirY ?? 0) * speed * pressure, delta);
      const wobbleX = rollX.update(shearX, delta) - shearX * .46;
      const wobbleY = rollY.update(shearY, delta) - shearY * .46;
      const breathPhase = clock * (rig.breathRate ?? 1.82);
      const breath = reduced ? 0 : (Math.sin(breathPhase) * .82 + Math.sin(breathPhase * 2 - .55) * .18) * (rig.breathDepth ?? 1);
      const fade = Math.exp(-delta * 1.68);
      const deposition = -Math.expm1(-delta * 19 * speed);
      let memory = 0;

      for (let i = 0; i < vertices.length; i++) {
        const { u, v, torso, head, socket } = vertices[i];
        const rx = u - .51;
        const ry = v - .425;
        let du = rx * torso * .036 * breath + torso * (wobbleX * .029) * settle;
        let dv = ry * torso * .079 * breath + torso * (wobbleY * .047) * settle;
        const headLean = head * (wobbleX * .026 + wobbleY * .016) * settle;
        du -= (v - .43) * headLean;
        dv += (u - .18) * headLean;
        let shade = torso * breath * .029;
        let trailX = brushedX[i] * fade;
        let trailY = brushedY[i] * fade;

        if (motion && force > .002) {
          const x = u - motion.u;
          const y = (v - motion.v) * metric;
          if (Math.abs(x) < .26 && Math.abs(y) < .23) {
            const footprint = gaussian(x / .102, y / .089);
            const cushion = gaussian(x / .161, y / .133);
            let fingertip = 0;
            for (const pad of motion.pads) {
              const dx = (u - pad.u) / pad.size;
              const dy = (v - pad.v) * metric / pad.size;
              if (Math.abs(dx) + Math.abs(dy) > 3.4) continue;
              fingertip = Math.max(fingertip, gaussian(dx, dy) * (.56 + pad.weight));
            }
            const relief = footprint * .59 + fingertip * .41;
            const yieldAmount = (1 - .71 * head) * settle;
            du += (shearX * .036 * relief - x * footprint * force * .17) * yieldAmount;
            dv += (shearY * .042 * relief - y * footprint * force * .22) * yieldAmount / metric;
            const rim = motion.edge;
            if (rim && rim.strength > 0) {
              const inward = gaussian((u - rim.u) / .074, (v - rim.v) * metric / .058);
              const bend = inward * rim.strength * force * .026 * settle * (1 - .63 * head);
              du += rim.nx * bend;
              dv += rim.ny * bend / metric;
            }
            const ahead = x * motion.dirX + y * motion.dirY;
            const sideways = -x * motion.dirY + y * motion.dirX;
            const ridge = gaussian((ahead - .059) / .038, sideways / .089) * speed;
            const surfaceSlope = (x * .77 + y * .56) * 3.1;
            shade += force * settle * (surfaceSlope * cushion - .20 * relief + .19 * ridge);
            const add = deposition * pressure * (footprint * .86 + .28 * fingertip);
            trailX += (motion.dirX - trailX) * add;
            trailY += (motion.dirY - trailY) * add;
          }
        }

        brushedX[i] = trailX;
        brushedY[i] = trailY;
        memory = Math.max(memory, Math.abs(trailX), Math.abs(trailY));
        xy[i * 2] = u + clamp(du, -.035, .035) * socket;
        xy[i * 2 + 1] = v + clamp(dv, -.048, .048) * socket;
        light[i * 3] = shade;
        light[i * 3 + 1] = trailX * settle;
        light[i * 3 + 2] = trailY * settle;
      }
      hasMesh = true;
      active = Math.abs(force) + Math.abs(wobbleX) + Math.abs(wobbleY) + memory > .006;
      return coat;
    },
  };
  coat.reset();
  return coat;
}
