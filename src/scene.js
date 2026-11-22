import { createCoatContact } from "./contact.js";
import { createCoat } from "./fur.js";
import { createHand } from "./hand.js";
import { createMesh } from "./mesh.js";
import { createOutline } from "./outline.js";
import { createTail } from "./tail.js";

const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(value, max));

export function createScene(scene, onMood) {
  const surface = scene.querySelector(".pet-surface");
  const sprite = scene.querySelector(".cat-sprite");
  const canvas = scene.querySelector(".cat-canvas");
  const hand = createHand(scene.querySelector(".petting-hand"));
  const contact = createCoatContact();
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
  let mesh;
  let texture;
  let rig;
  let coat;
  let outline;
  let tail;
  let flow;
  let area;
  let bounds;
  let location;
  let pointer;
  let playback;
  let lastHand;
  let visible = true;
  let frameId = 0;
  let lastFrame = 0;
  let lastStroke = -Infinity;
  let comfort = .15;

  function resetRenderer() {
    try {
      mesh = createMesh(canvas);
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
    const aspect = tail.aspect;
    const fitWidth = Math.min(width * .91, height * .94 * aspect) * rig.size;
    const fitHeight = fitWidth / aspect;
    bounds = { x: width * .49 - fitWidth / 2, y: height * .52 - fitHeight / 2, width: fitWidth, height: fitHeight };
    Object.assign(sprite.style, {
      left: `${bounds.x}px`,
      top: `${bounds.y}px`,
      width: `${bounds.width}px`,
      height: `${bounds.height}px`,
      transform: "none",
    });
    if (changed) mesh?.resize(width, height);
    wake();
  }

  function petImage(image, pet) {
    texture = image;
    sprite.src = image.src;
    rig = pet.rig;
    const aspect = (image.naturalWidth / image.naturalHeight) * rig.shape;
    coat = createCoat(rig, aspect);
    coat.setImage(image);
    outline = createOutline(image, 1 / aspect, rig.tailCut);
    tail = createTail(rig, aspect);
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
    scene.toggleAttribute("data-stickers", pet.id === "miso");
    playback = null;
    lastHand = null;
    scene.removeAttribute("data-keyboard-pet");
    clearPointer();
    contact.reset();
    lastStroke = -Infinity;
    comfort = .15;
    onMood(comfort, false, false);
    area = null;
    resize();
  }

  function bodyContact(u, v) {
    const material = coat.unmap(u, v);
    const x = material.u;
    const y = material.v;
    const nearEdge = !material.zone || coat.alpha(x - .041, y) < 95 || coat.alpha(x + .041, y) < 95
      || coat.alpha(x, y - .056) < 95 || coat.alpha(x, y + .056) < 95;
    const rim = nearEdge ? outline.near(coat, u, v) : null;
    if (!material.zone && (!rim || rim.distance > .037)) return null;
    const edge = rim && rim.distance < .044 ? {
      u: rim.restU, v: rim.restV, nx: rim.nx, ny: rim.ny, strength: clamp(1 - rim.distance / .044),
    } : null;
    if (material.zone) return { u, v, zone: material.zone, edge, support: 1, onBody: true };
    const gap = rim.distance / .037;
    return {
      u: rim.u + rim.nx * .008,
      v: rim.v + rim.ny * .008 * bounds.width / bounds.height,
      zone: rim.zone, edge, support: .80 - gap * .48, onBody: false,
    };
  }

  function clearPointer() {
    pointer = null;
    contact.release();
    scene.removeAttribute("data-tracking");
    wake();
  }

  function interact(event, tap = false) {
    if (!bounds || (pointer && event.pointerId !== pointer.id)) return;
    const u = (event.clientX - location.left - bounds.x) / bounds.width;
    const v = (event.clientY - location.top - bounds.y) / bounds.height;
    pointer ??= { id: event.pointerId, u, v, pressed: false };
    const dx = u - pointer.u;
    const dy = v - pointer.v;
    const distance = Math.hypot(dx, dy);
    const body = bodyContact(u, v);
    const nearest = !body?.onBody || pointer.grip ? tail.closest(u, v) : null;
    const onTail = nearest && nearest.at > .13 && nearest.distance <= nearest.radius + .014;
    if (pointer.grip && !pointer.pressed && !tap
      && ((body?.onBody && u < rig.tailCut - .02) || v > 1.24 || v < .15)) {
      pointer.grip = null;
    }
    const now = performance.now();
    if ((!pointer.grip && onTail) || (tap && pointer.grip && onTail)) {
      const seat = tail.sample(nearest.at);
      pointer.grip = { at: nearest.at, offsetU: seat.u - u, offsetV: seat.v - v, movedAt: now };
    }
    if (pointer.grip && (tap || distance > .00017)) pointer.grip.movedAt = now;
    pointer.aim = pointer.grip ? null : body;
    pointer.u = u;
    pointer.v = v;
    pointer.pressed ||= tap;
    const tracking = Boolean(pointer.aim || pointer.grip);
    scene.toggleAttribute("data-tracking", tracking);
    if (!tracking) {
      contact.release();
      wake();
      return;
    }
    const sensed = event.pointerType === "pen" || (event.pointerType === "touch" && Math.abs(event.pressure - .5) > .035);
    const pressure = sensed && event.pressure > 0 ? clamp(event.pressure, .16) : tap ? .93 : clamp(.60 + distance * 12);
    pointer.pressure = pressure;
    if (tap || distance > .00017) {
      playback = null;
      scene.removeAttribute("data-keyboard-pet");
      lastStroke = now;
      const gain = tap ? .10 : Math.min(distance, .10) * (pointer.grip ? .27 : .42);
      comfort = clamp(comfort + gain * (body?.support ?? 1), .15);
    }
    if (pointer.grip) {
      contact.release();
    } else if (tap || distance > .00017 || !pointer.contacted) {
      const aim = pointer.aim;
      contact.press(aim.u, aim.v, dx, dy, pressure * aim.support, now, bounds.width / bounds.height);
    }
    pointer.contacted = tracking;
    wake();
  }

  function keyboardStroke(target) {
    if (!rig || !bounds) return;
    clearPointer();
    playback = { target, start: performance.now(), at: .72 };
    scene.setAttribute("data-keyboard-pet", "");
    wake();
  }

  function drawHand(delta, reduced, state, grip) {
    let pose;
    if (grip) {
      const seat = tail.sample(grip.at);
      const bearing = Math.atan2(Math.sin(seat.angle - .77), Math.cos(seat.angle - .77));
      const followPointer = grip.held ? .16 : .89;
      const pocket = grip.held ? .12 : .24;
      const u = seat.u + clamp(grip.u - seat.u, -pocket, pocket) * followPointer;
      const v = seat.v + clamp(grip.v - seat.v, -pocket, pocket) * followPointer;
      pose = { u, v, altitude: grip.held ? .022 : .098,
        pressure: grip.held ? .95 : .62, angle: clamp(bearing, -.61, .73), grip: true };
    } else {
      const aim = playback?.aim ?? pointer?.aim;
      if (aim) {
        const altitude = pointer?.pressed || playback ? (1 - aim.support) * .25
          : .11 + (1 - aim.support) * .39 + Math.max(0, .46 - state.pressure) * .26;
        const turn = clamp(state.vx * .34 - state.vy * .18, -.42, .46);
        pose = { u: aim.u, v: aim.v, altitude, pressure: state.pressure, angle: turn, tuck: aim.zone === "head" ? .30 : 0 };
      }
    }
    if (pose) {
      lastHand = pose;
    } else if (lastHand) {
      pose = { ...lastHand, altitude: .93, pressure: 0, grip: false };
    }
    if (!pose) return;
    hand.configure({
      ...pose,
      x: bounds.x + bounds.width * pose.u,
      y: bounds.y + bounds.height * pose.v,
    });
    hand.draw(delta, reduced);
  }

  function wake() {
    if (frameId || !visible || document.hidden || !bounds) return;
    frameId = requestAnimationFrame(render);
  }

  function render(now) {
    frameId = 0;
    if (!visible || document.hidden) return;
    const age = now - lastStroke;
    const active = Boolean(playback) || age < 1300 || Boolean(pointer?.pressed);
    if (!active && now - lastFrame < 30) {
      wake();
      return;
    }
    const delta = clamp((now - lastFrame) / 1000, .001, .048);
    lastFrame = now;
    const reduced = reducedMotion.matches;
    if (pointer?.grip && !pointer.pressed && now - pointer.grip.movedAt > 780) {
      pointer.grip = null;
      scene.removeAttribute("data-tracking");
    }
    let grip;
    if (playback) {
      const progress = clamp((now - playback.start) / 740);
      const sweep = Math.sin(progress * Math.PI);
      if (playback.target === "tail") {
        const [u, v] = rig.tail[3];
        grip = { at: playback.at, u: u + .115 * sweep, v: v - .092 * sweep, held: progress > .12 && progress < .90 };
      } else {
        const [u, v] = rig.back;
        const x = u - .16 + .31 * progress;
        const y = v - .038 + .08 * sweep;
        playback.aim = { u: x, v: y, support: 1, zone: "back" };
        contact.press(x, y, .43 * delta, .12 * Math.cos(progress * Math.PI) * delta,
          .85, now, bounds.width / bounds.height);
      }
      comfort = clamp(comfort + delta * .64, .15);
      lastStroke = now;
      if (progress >= 1) {
        playback = null;
        grip = null;
        contact.release();
        scene.removeAttribute("data-keyboard-pet");
      }
    } else if (pointer?.grip) {
      const offset = pointer.pressed ? 1 : .68;
      grip = { at: pointer.grip.at, u: pointer.u + pointer.grip.offsetU * offset,
        v: pointer.v + pointer.grip.offsetV * offset, held: pointer.pressed };
    }
    const joints = tail.update(delta, mesh ? grip : null, reduced || !mesh);
    const rest = pointer?.aim ? (pointer.pressed ? .68 : .24) * pointer.aim.support : 0;
    const motion = contact.frame(now, delta, rest);
    drawHand(delta, reduced, motion, grip);
    if (mesh) {
      const edge = pointer?.grip ? null : pointer?.aim?.edge;
      const input = coat.contact(hand.contacts(), motion, bounds, edge);
      const shape = coat.draw(delta, input, reduced);
      mesh.draw(bounds, area, { xy: shape.xy, light: shape.light, joints });
    }
    if (age > 1800) comfort = clamp(comfort - delta * .035, .15);
    onMood(comfort, Boolean(playback || pointer?.pressed || age < 720), comfort > .59);
    if (active || coat.active || tail.active || comfort > .15 || Boolean(mesh && !reduced)) wake();
  }

  resetRenderer();
  canvas.addEventListener("webglcontextlost", event => {
    event.preventDefault();
    mesh = null;
    coat?.reset();
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
  reducedMotion.addEventListener("change", wake);

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
    if (event.pointerType === "mouse" && pointer?.aim) {
      pointer.pressed = false;
      contact.release();
      wake();
    } else {
      clearPointer();
    }
  });
  surface.addEventListener("pointercancel", clearPointer);
  surface.addEventListener("click", event => {
    if (event.detail === 0) keyboardStroke("back");
  });

  function canPlaceStamp(x, y, width, height, angle) {
    if (!bounds || !coat) return true;
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    for (let row = 0; row < 7; row++) {
      for (let col = 0; col < 7; col++) {
        const px = (col / 6 - .5) * width;
        const py = (row / 6 - .5) * height;
        const sx = x * area.width + px * c - py * s;
        const sy = y * area.height + px * s + py * c;
        if (sx < area.width * .031 || sx > area.width * .968
          || sy < area.height * .030 || sy > area.height * .963) return false;
        const u = (sx - bounds.x) / bounds.width;
        const v = (sy - bounds.y) / bounds.height;
        if (coat.alpha(u, v) > 62) return false;
        if (u > .74 && v > .25 && v < 1.04) {
          const nearest = tail.closest(u, v);
          if (nearest.distance <= nearest.radius + .007) return false;
        }
      }
    }
    return true;
  }

  return { petImage, keyboardStroke, canPlaceStamp };
}
