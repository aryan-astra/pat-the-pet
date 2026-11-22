import { createHandArt, handAnchor, handAspect, handPads } from "./hand-art.js";

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

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
  const image = element.querySelector("img");
  const canvas = element.querySelector("canvas");
  const x = { value: 0, velocity: 0 };
  const y = { value: 0, velocity: 0 };
  let width = 0;
  let target;
  let art;
  let angle = -22;
  let curl = .26;
  let lift = .8;
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
    move(px, py, pose, pressure) {
      if (!target || Math.hypot(px - target.x, py - target.y) > Math.max(72, width * .66)) {
        x.value = px;
        y.value = py;
        x.velocity = y.velocity = 0;
      }
      target = { x: px, y: py, pose, pressure };
    },
    draw(delta, reduced, grounding) {
      if (!target) return;
      follow(x, target.x, delta, reduced);
      follow(y, target.y, delta, reduced);
      const weight = reduced ? 1 : 1 - Math.exp(-delta * 17);
      const heading = target.pose === "tail" ? -3 : -24;
      const tilt = clamp(x.velocity * .047 - y.velocity * .023, -20, 24);
      angle += (heading + tilt - angle) * weight;
      lift += (1 - grounding - lift) * weight;
      const flex = target.pose === "tail" ? .83 : target.pose === "head" ? .26 + target.pressure * .19 : -.03;
      curl += (flex + .34 * lift - curl) * weight;
      scale = 1 + lift * .065;
      heightOffset = width * .068 * lift;
      art?.draw(curl);
      element.style.transform = `translate3d(${x.value.toFixed(2)}px, ${(y.value - heightOffset).toFixed(2)}px, 0) translate(-55%, -47%) rotate(${angle.toFixed(2)}deg) scale(${scale.toFixed(3)})`;
      element.style.setProperty("--hand-alpha", (.74 - lift * .25).toFixed(3));
      element.style.setProperty("--hand-shadow", `${(1.2 + lift * 4).toFixed(2)}px`);
    },
    pads() {
      if (!target || !width) return [];
      const radians = angle * Math.PI / 180;
      const c = Math.cos(radians);
      const s = Math.sin(radians);
      const pose = art ? curl : 0;
      return handPads.map(({ x: padX, y: padY, radius, load, bend }) => {
        const dx = (padX - handAnchor[0] + bend[0] * pose) * width * scale;
        const dy = (padY - handAnchor[1] + bend[1] * pose) * width * scale / handAspect;
        return [x.value + dx * c - dy * s, y.value - heightOffset + dx * s + dy * c,
          radius * width * scale, load * (1 - .67 * lift)];
      });
    },
  };
}
