const clamp = (value, low, high) => Math.max(low, Math.min(value, high));

export function createCoatContact() {
  const motion = { u: 0, v: 0, vx: 0, vy: 0, pressure: 0 };
  let target;
  let lastMove = -Infinity;

  return {
    press(u, v, dx, dy, pressure, now, aspect) {
      const elapsed = clamp((now - lastMove) / 1000, .007, .075);
      const moved = Math.hypot(dx, dy / aspect) < .18;
      target = {
        u, v, pressure,
        vx: moved ? clamp(dx / elapsed, -1.9, 1.9) : 0,
        vy: moved ? clamp(dy / elapsed, -2.6, 2.6) : 0,
      };
      lastMove = now;
    },
    release() {
      lastMove = -Infinity;
    },
    reset() {
      target = undefined;
      lastMove = -Infinity;
      motion.vx = motion.vy = motion.pressure = 0;
    },
    frame(now, delta, restingPressure) {
      const dragging = now - lastMove < 116;
      const pressure = dragging ? target.pressure : target ? restingPressure : 0;
      const follow = 1 - Math.exp(-delta * (pressure > motion.pressure ? 28 : 14));
      const damp = 1 - Math.exp(-delta * 23);
      motion.pressure += (pressure - motion.pressure) * follow;
      motion.vx += ((dragging ? target.vx : 0) - motion.vx) * damp;
      motion.vy += ((dragging ? target.vy : 0) - motion.vy) * damp;
      if (target) {
        motion.u = target.u;
        motion.v = target.v;
      }
      return motion;
    },
  };
}
