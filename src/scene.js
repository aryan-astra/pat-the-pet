import { createMesh } from "./mesh.js";

const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(value, max));
const spring = (speed, damping) => {
  let velocity = 0;
  let value = 0;
  return (target, delta) => {
    velocity += ((target - value) * speed - damping * velocity) * delta;
    value += velocity * delta;
    return value;
  };
};

export function createScene(scene, onMood) {
  const surface = scene.querySelector(".pet-surface");
  const sprite = scene.querySelector(".cat-sprite");
  const canvas = scene.querySelector("canvas");
  const halo = scene.querySelector(".hand-halo");
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)");
  const hitGrid = document.createElement("canvas");
  hitGrid.width = 120;
  hitGrid.height = 80;
  const hitContext = hitGrid.getContext("2d", { willReadFrequently: true });
  const pressure = spring(160, 21);
  const sway = spring(72, 12);
  const stretch = spring(86, 14);
  const drift = spring(106, 18);
  let mesh;
  let alpha;
  let rig;
  let texture;
  let area;
  let bounds;
  let location;
  let playback;
  let pointer;
  let visible = true;
  let frameId = 0;
  let lastFrame = 0;
  let lastStroke = -Infinity;
  let comfort = .15;
  let contact = { x: .56, y: .4, dx: 0, dy: 0, pull: 0, turn: 0, tail: false };

  function resetRenderer() {
    try {
      mesh = createMesh(canvas);
    } catch {
      mesh = null;
    }
    if (mesh && rig) {
      mesh.setPet(texture, rig);
      if (area) mesh.resize(area.width, area.height);
    }
    canvas.hidden = !mesh || !rig;
    sprite.hidden = Boolean(mesh && rig);
  }

  function resize() {
    location = surface.getBoundingClientRect();
    const { width, height } = location;
    if (!width || !height) return;
    const changed = !area || width !== area.width || height !== area.height;
    area = { width, height };
    if (!rig) return;
    const aspect = texture.naturalWidth / texture.naturalHeight;
    const fitWidth = Math.min(width * .87, height * .84 * aspect);
    const fitHeight = fitWidth / aspect;
    bounds = { x: width * .52 - fitWidth / 2, y: height * .53 - fitHeight / 2, width: fitWidth, height: fitHeight };
    if (changed) mesh?.resize(width, height);
    wake();
  }

  function petImage(image, pet) {
    texture = image;
    sprite.src = image.src;
    rig = pet.rig;
    // The decoded texture also provides an inexpensive per-pixel hit mask.
    hitContext.clearRect(0, 0, hitGrid.width, hitGrid.height);
    hitContext.drawImage(image, 0, 0, hitGrid.width, hitGrid.height);
    alpha = hitContext.getImageData(0, 0, hitGrid.width, hitGrid.height).data;
    mesh?.setPet(image, rig);
    canvas.hidden = !mesh;
    sprite.hidden = Boolean(mesh);
    playback = null;
    clearPointer();
    contact = { x: .56, y: .4, dx: 0, dy: 0, pull: 0, turn: 0, tail: false };
    lastStroke = -Infinity;
    comfort = .15;
    onMood(comfort, false, false);
    area = null;
    resize();
  }

  function hit(x, y) {
    if (!alpha || x < 0 || y < 0 || x >= 1 || y >= 1) return false;
    const col = Math.floor(x * hitGrid.width);
    const row = Math.floor(y * hitGrid.height);
    return alpha[(row * hitGrid.width + col) * 4 + 3] > 95;
  }

  function onTail(x, y) {
    const [start, steepness, exponent] = rig.tailCurve;
    return x > .57 && y > Math.max(.56, start - steepness * x ** exponent + .012);
  }

  function stroke(x, y, dx, dy, strength, tail) {
    const origin = pointer?.tailOrigin || rig.tail;
    const pull = tail ? clamp((x - origin[0]) * 3 + Math.abs(y - origin[1]) * 1.25, -.16, 1) : 0;
    contact = {
      x, y,
      dx: clamp(dx * .30, -.052, .052),
      dy: clamp(dy * .34, -.043, .043),
      pull,
      turn: tail ? clamp((x - origin[0]) * -2.1 + (y - origin[1]) * 1.2, -.76, .34) : 0,
      tail,
    };
    comfort = clamp(comfort + strength, .15);
    lastStroke = performance.now();
    wake();
  }

  function interact(event, tap = false) {
    if (!bounds || (pointer && event.pointerId !== pointer.id)) return;
    const x = (event.clientX - location.left - bounds.x) / bounds.width;
    const y = (event.clientY - location.top - bounds.y) / bounds.height;
    if (!pointer) pointer = { id: event.pointerId, x, y, warm: false, tailOrigin: null };
    const dx = x - pointer.x;
    const dy = y - pointer.y;
    const distance = Math.hypot(dx, dy);
    const touching = hit(x, y);

    if (touching && onTail(x, y)) pointer.tailOrigin ??= [x, y];
    if (x < .54 || (touching && y < .53) || (!touching && y < .42)) pointer.tailOrigin = null;
    const tail = Boolean(pointer.tailOrigin);
    if ((touching || tail) && (tap || (pointer.warm && distance > .002))) {
      playback = null;
      stroke(x, y, dx, dy, tap ? .10 : Math.min(distance, .09) * (tail ? .27 : .42), tail);
    }
    halo.style.transform = `translate3d(${event.clientX - location.left}px, ${event.clientY - location.top}px, 0)`;
    scene.toggleAttribute("data-tracking", touching || tail);
    Object.assign(pointer, { x, y, warm: true });
  }

  function clearPointer() {
    pointer = null;
    scene.removeAttribute("data-tracking");
  }

  function keyboardStroke(target) {
    if (!rig || !bounds) return;
    clearPointer();
    playback = { target, start: performance.now() };
    wake();
  }

  function play(now) {
    const progress = clamp((now - playback.start) / 690);
    const tail = playback.target === "tail";
    const [x, y] = tail ? rig.tail : rig.back;
    const sweep = Math.sin(progress * Math.PI);
    const along = tail ? .25 * sweep : (progress - .5) * .31;
    stroke(x + along, y + sweep * .028, tail ? .04 : -.065, .015, .15 * (1 - progress) * .12, tail);
    if (progress === 1) playback = null;
  }

  function wake() {
    if (frameId || !visible || document.hidden || !bounds) return;
    frameId = requestAnimationFrame(render);
  }

  function render(now) {
    frameId = 0;
    // Hold a 30 fps idle pose and draw every frame while a stroke is settling.
    const active = Boolean(playback) || now - lastStroke < 1800;
    if (!active && now - lastFrame < 30) {
      wake();
      return;
    }
    const delta = clamp((now - lastFrame) / 1000, .001, .035);
    lastFrame = now;
    if (playback) play(now);
    const age = now - lastStroke;
    const held = age < 130;
    if (age > 1800) comfort = clamp(comfort - delta * .035, .15);
    const motionScale = reduceMotion.matches ? .24 : 1;
    const motion = {
      x: contact.x, y: contact.y,
      dx: contact.dx * motionScale, dy: contact.dy * motionScale,
      pressure: pressure(held ? 1 : 0, delta),
      breath: reduceMotion.matches ? 0 : Math.sin(now / (comfort > .59 ? 420 : 620)) * .012,
      head: drift(held && !contact.tail ? clamp(contact.dx, -.02, .02) : 0, delta) * motionScale,
      tail: sway(held && contact.tail ? contact.turn : 0, delta) * motionScale,
      extend: stretch(held && contact.tail ? contact.pull : 0, delta) * motionScale,
    };
    if (mesh) {
      mesh.draw(bounds, area, motion);
    } else {
      sprite.style.transform = `translate(-50%, -50%) translateX(${(motion.head + motion.tail * .016) * 100}%) scale(${1 + motion.breath * .5 + motion.extend * .014}, ${1 + motion.breath})`;
    }
    onMood(comfort, active && age < 730, comfort > .59);
    if (active || comfort > .15 || !reduceMotion.matches) wake();
  }

  resetRenderer();
  canvas.addEventListener("webglcontextlost", event => {
    event.preventDefault();
    mesh = null;
    canvas.hidden = true;
    sprite.hidden = false;
    wake();
  });
  canvas.addEventListener("webglcontextrestored", () => {
    resetRenderer();
    wake();
  });
  new ResizeObserver(resize).observe(surface);
  new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    if (visible) wake();
  }).observe(scene);
  window.addEventListener("scroll", () => { location = surface.getBoundingClientRect(); }, { passive: true, capture: true });
  document.addEventListener("visibilitychange", wake);
  reduceMotion.addEventListener("change", wake);

  surface.addEventListener("pointerenter", () => { location = surface.getBoundingClientRect(); });
  surface.addEventListener("pointerdown", event => {
    if (!event.isPrimary || event.button !== 0) return;
    location = surface.getBoundingClientRect();
    surface.setPointerCapture(event.pointerId);
    interact(event, true);
  });
  surface.addEventListener("pointermove", event => {
    if (event.isPrimary && (event.pointerType === "mouse" || event.buttons === 1)) interact(event);
  });
  surface.addEventListener("pointerleave", clearPointer);
  surface.addEventListener("lostpointercapture", clearPointer);
  surface.addEventListener("pointercancel", clearPointer);
  surface.addEventListener("click", event => {
    if (event.detail === 0) keyboardStroke("back");
  });

  return { petImage, keyboardStroke };
}
