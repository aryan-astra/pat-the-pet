import { createHandArt, handAnchor, handAspect, handPads } from "./hand-art.js";

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const contactWeights = [.065, .14, .19, .18, .10, .325];

function follow(axis, destination, delta, reduced) {
  if (reduced) {
    axis.value = destination;
    axis.velocity = 0;
    return;
  }
  const frequency = 41;
  const difference = axis.value - destination;
  const decay = Math.exp(-frequency * delta);
  const change = axis.velocity + frequency * difference;
  axis.value = destination + (difference + change * delta) * decay;
  axis.velocity = (axis.velocity - frequency * change * delta) * decay;
  axis.value = clamp(axis.value, destination - 15, destination + 15);
}

export function createHand(element) {
  const image = element.querySelector(".hand-open");
  const gripImage = element.querySelector(".hand-grip");
  const canvas = element.querySelector("canvas");
  const x = { value: 0, velocity: 0 };
  const y = { value: 0, velocity: 0 };
  let width = 0;
  let target;
  let art;
  let angle = -20;
  let curl = .42;
  let lift = 0;
  let gripMix = 0;
  let scale = 1;
  let heightOffset = 0;

  function loadArt() {
    if (art || !image.complete || !image.naturalWidth) return;
    try {
      art = createHandArt(canvas, image);
    } catch {
      art = null;
    }
    if (!art) return;
    art.draw(curl);
    canvas.hidden = false;
    image.hidden = true;
  }

  new ResizeObserver(([entry]) => { width = entry.contentRect.width; }).observe(element);
  image.addEventListener("load", loadArt);
  loadArt();
  canvas.addEventListener("webglcontextlost", event => {
    event.preventDefault();
    art = null;
    canvas.hidden = true;
    image.hidden = false;
  });
  canvas.addEventListener("webglcontextrestored", loadArt);

  return {
    configure(pose) {
      if (!target || Math.hypot(pose.x - target.x, pose.y - target.y) > Math.max(72, width * .66)) {
        x.value = pose.x;
        y.value = pose.y;
        x.velocity = y.velocity = 0;
      }
      target = pose;
    },
    draw(delta, reduced) {
      if (!target) return;
      follow(x, target.x, delta, reduced);
      follow(y, target.y, delta, reduced);
      const weight = reduced ? 1 : 1 - Math.exp(-delta * 17);
      const pressure = target.pressure ?? 0;
      const altitude = target.altitude ?? 0;
      const heading = -20 + (target.angle ?? 0) * 57.2958;
      angle += (heading - angle) * weight;
      lift += (altitude - lift) * weight;
      const tuck = target.tuck ?? 0;
      const grip = Boolean(target.grip && gripImage.complete && gripImage.naturalWidth);
      const desired = target.grip && !grip ? .77 + .19 * pressure
        : .35 - .24 * pressure * (1 - altitude) + .17 * tuck + .20 * altitude;
      curl += (desired - curl) * weight;
      gripMix += (Number(grip) - gripMix) * weight;
      scale = 1 + altitude * .065;
      heightOffset = width * .068 * altitude;
      art?.draw(curl);
      element.style.transform = `translate3d(${x.value.toFixed(2)}px, ${(y.value - heightOffset).toFixed(2)}px, 0) translate(-55%, -47%) rotate(${angle.toFixed(2)}deg) scale(${scale.toFixed(3)})`;
      element.style.setProperty("--hand-alpha", (.80 - lift * .26).toFixed(3));
      element.style.setProperty("--grip-mix", gripMix.toFixed(3));
      element.style.setProperty("--shadow-x", `${(width * (.019 + lift * .052)).toFixed(2)}px`);
      element.style.setProperty("--shadow-y", `${(width * (.025 + lift * .076)).toFixed(2)}px`);
      element.style.setProperty("--shadow-blur", `${(1.7 + width * (.007 + lift * .032)).toFixed(2)}px`);
      element.style.setProperty("--shadow-alpha", (.53 - lift * .24).toFixed(3));
    },
    contacts() {
      if (!target || !width) return [];
      const radians = angle * Math.PI / 180;
      const c = Math.cos(radians);
      const s = Math.sin(radians);
      const pose = art ? curl : 0;
      return handPads.map(({ x: padX, y: padY, radius, bend }, index) => {
        const dx = (padX - handAnchor[0] + bend[0] * pose) * width * scale;
        const dy = (padY - handAnchor[1] + bend[1] * pose) * width * scale / handAspect;
        return {
          x: x.value + dx * c - dy * s,
          y: y.value - heightOffset + dx * s + dy * c,
          radius: radius * width * scale,
          weight: contactWeights[index] * (1 - .52 * lift),
        };
      });
    },
  };
}
