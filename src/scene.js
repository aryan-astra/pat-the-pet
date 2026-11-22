import { createCoatContact } from "./contact.js";
import { createCoat } from "./fur.js";
import { createHand } from "./hand.js";
import { createMesh } from "./mesh.js";
import { createOutline } from "./outline.js";
import { createTail } from "./tail.js";

const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(value, max));

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
  const canvas = scene.querySelector(".cat-canvas");
  const hand = createHand(scene.querySelector(".petting-hand"));
  const contact = createCoatContact();
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
  const swivel = spring(78, 10.8);
  const uncurl = spring(88, 11.6);
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
  let tailSettling = 0;

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
    const aspect = image.naturalWidth / image.naturalHeight;
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
    playback = null;
    lastHand = null;
    scene.removeAttribute("data-keyboard-pet");
    clearPointer();
    contact.reset();
    swivel.reset();
    uncurl.reset();
    tailSettling = 0;
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
    if (pointer?.grip) tailSettling = 1.4;
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
    const nearest = !body?.onBody ? tail.closest(u, v) : null;
    const onTail = nearest && nearest.at > .13 && nearest.distance <= nearest.radius + .014;
    if (pointer.grip && (body?.onBody || u < rig.tailCut - .11 || v > 1.21 || v < .20)) {
      pointer.grip = null;
      tailSettling = 1.4;
    }
    const now = performance.now();
    if (!pointer.grip && onTail) pointer.grip = { at: nearest.at, u, v, movedAt: now };
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

  function drawHand(delta, reduced, state) {
    let pose;
    if (playback?.target === "tail" || pointer?.grip) {
      const grip = playback?.target === "tail" ? playback : pointer.grip;
      const seat = tail.sample(grip.at);
      const bearing = Math.atan2(Math.sin(seat.angle - .77), Math.cos(seat.angle - .77));
      pose = { u: seat.u, v: seat.v + .014, altitude: .055, pressure: .86, angle: clamp(bearing, -.58, .68), grip: true };
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
    const scale = reduced ? .24 : 1;
    if (pointer?.grip && !pointer.pressed && now - pointer.grip.movedAt > 670) {
      pointer.grip = null;
      tailSettling = 1.4;
      scene.removeAttribute("data-tracking");
    }
    let turn = 0;
    let stretch = 0;
    if (playback) {
      const progress = clamp((now - playback.start) / 740);
      const sweep = Math.sin(progress * Math.PI);
      if (playback.target === "tail") {
        turn = -.27 * sweep;
        stretch = .43 * sweep;
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
        tailSettling = 1.4;
        contact.release();
        scene.removeAttribute("data-keyboard-pet");
      }
    } else if (pointer?.grip) {
      const dx = pointer.u - pointer.grip.u;
      const dy = pointer.v - pointer.grip.v;
      turn = clamp(.10 + dy * 1.26 - dx * .70, -.40, .34);
      stretch = clamp(.16 + dx * 2.30 - dy * .38, -.20, .54);
    }
    tailSettling = Math.max(0, tailSettling - delta);
    const joints = tail.pose(swivel.tick(turn * scale, delta), uncurl.tick(stretch * scale, delta));
    const rest = pointer?.aim ? (pointer.pressed ? .68 : .24) * pointer.aim.support : 0;
    const motion = contact.frame(now, delta, rest);
    drawHand(delta, reduced, motion);
    if (mesh) {
      const edge = pointer?.grip ? null : pointer?.aim?.edge;
      const input = coat.contact(hand.contacts(), motion, bounds, edge);
      const shape = coat.draw(delta, input, reduced);
      mesh.draw(bounds, area, { xy: shape.xy, light: shape.light, joints });
    }
    if (age > 1800) comfort = clamp(comfort - delta * .035, .15);
    onMood(comfort, Boolean(playback || pointer?.pressed || age < 720), comfort > .59);
    if (active || coat.active || tailSettling > 0 || comfort > .15 || Boolean(mesh && !reduced)) wake();
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

  return { petImage, keyboardStroke };
}
