const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export function createCoatContact() {
  const center = new Float32Array(4);
  const stroke = new Float32Array([1, 0, 0]);
  const pads = new Float32Array(6 * 4);
  let target;
  let lastMove = -Infinity;
  let load = 0;
  let glide = 0;
  let heading = 0;

  return {
    press(x, y, dx, dy, pressure, now, aspect) {
      const distance = Math.hypot(dx, dy / aspect);
      const elapsed = clamp((now - lastMove) / 1000, .008, .075);
      const moved = distance > .001 && distance < .13;
      target = {
        x, y, pressure,
        angle: moved ? Math.atan2(dy / aspect, dx) : target?.angle ?? heading,
        speed: moved ? Math.min(distance / elapsed, 2.8) : 0,
      };
      lastMove = now;
    },
    release() {
      lastMove = -Infinity;
    },
    reset() {
      target = undefined;
      lastMove = -Infinity;
      load = 0;
      glide = 0;
      heading = 0;
      center.fill(0);
      pads.fill(0);
    },
    frame(now, delta, bounds, hand, contains, restingForce, motionScale) {
      const recent = now - lastMove < 125;
      const desired = recent ? target.pressure : target ? restingForce : 0;
      load += (desired - load) * (1 - Math.exp(-delta * (desired > load ? 24 : 11)));
      glide += ((recent ? Math.tanh(target.speed * 1.95) : 0) - glide) * (1 - Math.exp(-delta * 15));
      pads.fill(0);
      if (!target || load < .003) {
        center[2] = 0;
        return { center, stroke, pads };
      }

      const angle = target.angle - heading;
      heading += Math.atan2(Math.sin(angle), Math.cos(angle)) * (1 - Math.exp(-delta * 25));
      const landmarks = hand.pads();
      let weight = 0;
      let totalX = 0;
      let totalY = 0;
      landmarks.forEach(([px, py, radius, intensity], index) => {
        const x = (px - bounds.x) / bounds.width;
        const y = (py - bounds.y) / bounds.height;
        if (!contains(x, y)) return;
        const padRadius = clamp(radius / bounds.width, .014, .062);
        pads.set([x, y, padRadius, intensity], index * 4);
        totalX += x * intensity;
        totalY += y * intensity;
        weight += intensity;
      });
      center[0] = weight ? totalX / weight : target.x;
      center[1] = weight ? totalY / weight : target.y;
      center[2] = load * motionScale;
      center[3] = clamp((landmarks.at(-1)?.[2] || 30) / bounds.width, .043, .092);
      stroke[0] = Math.cos(heading);
      stroke[1] = Math.sin(heading);
      stroke[2] = Math.min(1, glide);
      return { center, stroke, pads };
    },
  };
}
