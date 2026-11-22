import { createCoatContact } from "./contact.js";
import { createFurField } from "./fur.js";
import { createHand } from "./hand.js";
import { createMesh } from "./mesh.js";
import { createTail } from "./tail.js";

const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(value, max));
const reachDirections = [[1, 0], [-1, 0], [0, 1], [0, -1], [.71, .71], [-.71, .71], [.71, -.71], [-.71, -.71]];

function spring(speed, damping) {
  let velocity = 0;
  let value = 0;
  return {
    tick(target, delta) {
      velocity += ((target - value) * speed - damping * velocity) * delta;
      value += velocity * delta;
      return value;
    },
    reset() {
      velocity = 0;
      value = 0;
    },
  };
}

export function createScene(scene, onMood) {
  const surface = scene.querySelector(".pet-surface");
  const sprite = scene.querySelector(".cat-sprite");
  const canvas = scene.querySelector("canvas");
  const hand = createHand(scene.querySelector(".petting-hand"));
  const field = createFurField();
  const coatContact = createCoatContact();
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)");
  const hitGrid = document.createElement("canvas");
  hitGrid.width = 144;
  hitGrid.height = 96;
  const hitContext = hitGrid.getContext("2d", { willReadFrequently: true });
  const sway = spring(84, 13);
  const curl = spring(94, 16);
  let mesh;
  let alpha;
  let rig;
  let tail;
  let texture;
  let flow;
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
  let tailTurn = 0;
  let tailCurl = 0;

  function resetRenderer() {
    try {
      mesh = createMesh(canvas, field);
    } catch {
      mesh = null;
    }
    if (mesh && texture) {
      mesh.setPet(texture, rig, tail);
      if (flow?.complete && flow.naturalWidth) mesh.setFlow(flow);
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
    const fitWidth = Math.min(width * .91, height * .94 * aspect);
    const fitHeight = fitWidth / aspect;
    bounds = { x: width * .49 - fitWidth / 2, y: height * .52 - fitHeight / 2, width: fitWidth, height: fitHeight };
    if (changed) mesh?.resize(width, height);
    wake();
  }

  function petImage(image, pet) {
    texture = image;
    sprite.src = image.src;
    rig = pet.rig;
    tail = createTail(rig, image.naturalWidth / image.naturalHeight);
    hitContext.clearRect(0, 0, hitGrid.width, hitGrid.height);
    hitContext.drawImage(image, 0, 0, hitGrid.width, hitGrid.height);
    alpha = hitContext.getImageData(0, 0, hitGrid.width, hitGrid.height).data;
    mesh?.setPet(image, rig, tail);
    if (flow?.src !== rig.flow) {
      const directions = new Image();
      flow = directions;
      directions.addEventListener("load", () => {
        if (flow === directions) mesh?.setFlow(directions);
        wake();
      });
      directions.src = rig.flow;
    }
    canvas.hidden = !mesh;
    sprite.hidden = Boolean(mesh);
    playback = null;
    scene.removeAttribute("data-keyboard-pet");
    clearPointer();
    field.clear();
    coatContact.reset();
    sway.reset();
    curl.reset();
    tailTurn = 0;
    tailCurl = 0;
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
    return alpha[(row * hitGrid.width + col) * 4 + 3] > 93;
  }

  function onCoat(x, y) {
    return x <= rig.tailCut && hit(x, y);
  }

  function reachCoat(x, y) {
    const aspect = bounds.width / bounds.height;
    for (const radius of [.018, .034]) {
      for (const [dx, dy] of reachDirections) {
        const coatX = x + dx * radius;
        const coatY = y + dy * radius * aspect;
        if (onCoat(coatX, coatY)) return [coatX, coatY, 1 - radius * 17];
      }
    }
    return null;
  }

  function moveHand(x, y, pose, pressure) {
    hand.move(bounds.x + x * bounds.width, bounds.y + y * bounds.height, pose, pressure);
  }

  function stroke(x, y, dx, dy, strength, pressure, tailOrigin) {
    const now = performance.now();
    if (tailOrigin) {
      coatContact.release();
      const ox = x - tailOrigin[0];
      const oy = y - tailOrigin[1];
      tailTurn = clamp(oy * 1.4 - ox * .80 - .045, -.37, .34);
      tailCurl = clamp(ox * 2.0 + oy * .36, -.23, .52);
    } else {
      tailTurn = 0;
      tailCurl = 0;
      coatContact.press(x, y, dx, dy, pressure, now, bounds.width / bounds.height);
    }
    comfort = clamp(comfort + strength, .15);
    lastStroke = now;
    wake();
  }

  function interact(event, tap = false) {
    if (!bounds || (pointer && event.pointerId !== pointer.id)) return;
    const x = (event.clientX - location.left - bounds.x) / bounds.width;
    const y = (event.clientY - location.top - bounds.y) / bounds.height;
    if (!pointer) pointer = { id: event.pointerId, x, y, warm: false, tailOrigin: null, pressed: false };
    const dx = x - pointer.x;
    const dy = y - pointer.y;
    const distance = Math.hypot(dx, dy);
    const photoHit = hit(x, y);
    const bodyHit = x <= rig.tailCut && photoHit;
    const tailHit = mesh ? tail.hit(x, y) : x > rig.tailCut && photoHit;
    if (tailHit && !bodyHit) pointer.tailOrigin ??= [x, y];
    if (bodyHit || x < rig.tailCut - .09 || y < .22 || y > 1.24) pointer.tailOrigin = null;

    const reach = bodyHit ? [x, y, 1] : pointer.tailOrigin ? null : reachCoat(x, y);
    const hover = Boolean(reach || pointer.tailOrigin);
    if (hover) {
      const sensed = event.pointerType === "pen" || (event.pointerType === "touch" && Math.abs(event.pressure - .5) > .035);
      const pressure = sensed && event.pressure > 0 ? clamp(event.pressure, .16) : tap ? .92 : clamp(.53 + distance * 13);
      const pose = pointer.tailOrigin ? "tail" : x < .31 ? "head" : "back";
      const [aimX, aimY, touch] = reach ?? [x, y, 1];
      moveHand(x + (aimX - x) * .58, y + (aimY - y) * .58, pose, pressure * touch);
      if (tap || (pointer.warm && distance > .00018)) {
        playback = null;
        scene.removeAttribute("data-keyboard-pet");
        const comfortGain = tap ? .10 : Math.min(distance, .10) * (pointer.tailOrigin ? .27 : .42);
        stroke(aimX, aimY, dx, dy, comfortGain * touch, pressure * touch, pointer.tailOrigin);
      } else if (reach && !pointer.onCoat) {
        coatContact.press(aimX, aimY, 0, 0, .24 * touch, performance.now(), bounds.width / bounds.height);
      }
      wake();
    }
    scene.toggleAttribute("data-tracking", hover);
    Object.assign(pointer, { x, y, warm: true, onCoat: reach?.[2] ?? 0, pressed: pointer.pressed || tap });
  }

  function clearPointer() {
    pointer = null;
    coatContact.release();
    scene.removeAttribute("data-tracking");
    wake();
  }

  function keyboardStroke(target) {
    if (!rig || !bounds) return;
    clearPointer();
    playback = { target, start: performance.now() };
    scene.setAttribute("data-keyboard-pet", "");
    wake();
  }

  function play(now, delta) {
    const progress = clamp((now - playback.start) / 720);
    const tailPet = playback.target === "tail";
    const [x, y] = tailPet ? rig.tail[3] : rig.back;
    const curve = Math.sin(progress * Math.PI);
    const xx = x + (tailPet ? .10 * curve : (progress - .5) * .38);
    const yy = y + (tailPet ? -.09 * curve : .036 * curve);
    moveHand(xx, yy, playback.target, .85);
    stroke(xx, yy, tailPet ? .016 : .024, tailPet ? -.02 : .006, delta * .62, .86, tailPet ? [x, y] : null);
    if (progress === 1) {
      playback = null;
      scene.removeAttribute("data-keyboard-pet");
    }
  }

  function wake() {
    if (frameId || !visible || document.hidden || !bounds) return;
    frameId = requestAnimationFrame(render);
  }

  function render(now) {
    frameId = 0;
    if (!visible || document.hidden) return;
    const active = Boolean(playback) || now - lastStroke < 1350;
    if (!active && now - lastFrame < 30) {
      wake();
      return;
    }
    const delta = clamp((now - lastFrame) / 1000, .001, .04);
    lastFrame = now;
    if (playback) play(now, delta);
    const age = now - lastStroke;
    const held = age < 140;
    if (age > 1800) comfort = clamp(comfort - delta * .035, .15);
    const reduced = reduceMotion.matches;
    const scale = reduced ? .24 : 1;
    const turn = sway.tick(held ? tailTurn * scale : 0, delta);
    const turnCurl = curl.tick(held ? tailCurl * scale : 0, delta);
    const coatReach = pointer?.onCoat ?? 0;
    const grounding = playback ? .99 : pointer?.tailOrigin ? .86
      : coatReach * (pointer?.pressed ? .99 : held ? .91 : .64);
    if (pointer || playback || active) hand.draw(delta, reduced, grounding);
    if (mesh) {
      const rest = coatReach * (pointer?.pressed ? .62 : .25);
      const press = coatContact.frame(now, delta, bounds, hand, onCoat, rest, reduced ? .49 : 1);
      field.advance(delta, press);
      mesh.draw(bounds, area, {
        joints: tail.pose(turn, turnCurl),
        breath: reduced ? 0 : Math.sin(now / 580) * .017,
        furAmount: reduced ? .55 : 1,
        press,
      });
    }
    onMood(comfort, active && age < 730, comfort > .59);
    if (active || field.active || comfort > .15 || Boolean(mesh && !reduced)) wake();
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
  surface.addEventListener("lostpointercapture", event => {
    if (event.pointerType === "mouse" && pointer?.onCoat) {
      pointer.pressed = false;
      coatContact.release();
      wake();
    } else {
      clearPointer();
    }
  });
  surface.addEventListener("pointercancel", clearPointer);
  surface.addEventListener("click", event => {
    if (event.detail === 0) keyboardStroke("back");
  });

  return { petImage, keyboardStroke };
}
