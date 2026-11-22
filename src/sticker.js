const layouts = [
  ["Sleepy tabby", .117, .132, -15],
  ["Black cat and star", .245, .110, 13],
  ["Paw print", .405, .098, -7],
  ["Smiling ginger cat", .866, .255, 10],
  ["Fish toy", .122, .805, -14],
  ["Cat and crescent moon", .257, .878, 12],
  ["Matchbox cat", .539, .863, -9],
  ["Tabby with an envelope", .708, .844, 15],
];

const keepsake = 3;
const storageKey = "pat-the-pet.stamps";
const clamp = (value, min, max) => Math.max(min, Math.min(value, max));

function clipPaper(points, nx, ny, edge, sign) {
  const clipped = [];
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    const start = (a[0] * nx + a[1] * ny - edge) * sign;
    const end = (b[0] * nx + b[1] * ny - edge) * sign;
    if (start >= 0) clipped.push(a);
    if ((start >= 0) !== (end >= 0)) {
      const along = start / (start - end);
      clipped.push([a[0] + (b[0] - a[0]) * along, a[1] + (b[1] - a[1]) * along]);
    }
  }
  return clipped;
}

function polygon(points) {
  const path = points.map(([x, y]) => `${x.toFixed(2)}px ${y.toFixed(2)}px`).join(", ");
  return points.length >= 3 ? `polygon(${path})` : "polygon(0 0,0 0,0 0)";
}

export function createStickers(scene, playPeel, canPlace) {
  const ink = scene.querySelector(".stamp-ink");
  const tray = scene.querySelector(".stamp-tray");
  const portrait = scene.querySelector(".woven-portrait");
  let saved;
  let drag = null;
  let suppressClick = false;

  try {
    saved = JSON.parse(localStorage.getItem(storageKey));
  } catch {
    // The stamps can still be played with when storage is blocked.
  }

  const stamps = layouts.map(([name, x, y, angle], index) => {
    const point = (Array.isArray(saved) ? saved : saved?.stamps)?.[index];
    const sticker = document.createElement("button");
    sticker.type = "button";
    sticker.className = "stamp";
    sticker.setAttribute("aria-describedby", "stamp-keys");
    const url = new URL(`../assets/stamps/stamp-${index + 1}.webp`, import.meta.url).href;
    const artwork = document.createElement("div");
    artwork.className = "stamp-art";
    if (index === keepsake) {
      sticker.classList.add("stamp-keepsake");
      artwork.classList.add("stamp-keepsake");
    }
    artwork.style.setProperty("--stamp-art", `url("${url}")`);
    artwork.innerHTML = '<span class="stamp-face"></span><span class="stamp-back"></span><span class="stamp-crease"></span>';
    const stamp = {
      index, name, angle, sticker, artwork,
      face: artwork.querySelector(".stamp-face"),
      back: artwork.querySelector(".stamp-back"),
      crease: artwork.querySelector(".stamp-crease"),
      x: Number.isFinite(point?.x) ? clamp(point.x, .025, .975) : x,
      y: Number.isFinite(point?.y) ? clamp(point.y, .025, .975) : y,
      loose: point?.loose === true,
    };
    showPosition(stamp);
    ink.append(artwork);
    tray.append(sticker);
    return stamp;
  });

  let hiddenAt = saved?.origin && Number.isFinite(saved.origin.x) && Number.isFinite(saved.origin.y)
    ? { x: clamp(saved.origin.x, .025, .975), y: clamp(saved.origin.y, .025, .975) }
    : { x: layouts[keepsake][1], y: layouts[keepsake][2] };

  function positionPortrait() {
    portrait.style.left = `${hiddenAt.x * 100}%`;
    portrait.style.top = `${hiddenAt.y * 100}%`;
    portrait.style.setProperty("--stamp-angle", `${layouts[keepsake][3]}deg`);
    portrait.setAttribute("aria-hidden", String(!stamps[keepsake].loose));
  }

  positionPortrait();

  function showPosition(stamp) {
    const { sticker, artwork, x, y, angle, loose, name } = stamp;
    for (const element of [sticker, artwork]) {
      element.style.left = `${x * 100}%`;
      element.style.top = `${y * 100}%`;
      element.style.setProperty("--stamp-angle", `${angle}deg`);
      element.toggleAttribute("data-loose", loose);
    }
    const label = `${loose ? "Move" : "Peel"} ${name} sticker`;
    sticker.setAttribute("aria-label", label);
    sticker.title = label;
  }

  function save() {
    try {
      localStorage.setItem(storageKey, JSON.stringify({
        origin: hiddenAt, stamps: stamps.map(({ x, y, loose }) => ({ x, y, loose })),
      }));
    } catch {
      // Keep the current arrangement for this visit.
    }
  }

  function put(stamp, x, y) {
    const w = tray.clientWidth;
    const h = tray.clientHeight;
    if (!w || !h) return;
    const width = stamp.sticker.offsetWidth;
    const height = stamp.sticker.offsetHeight;
    const angle = stamp.angle * Math.PI / 180;
    const safe = Math.hypot(width, height) * .39;
    const atX = clamp(x, safe / w, 1 - safe / w);
    const atY = clamp(y, safe / h, 1 - safe / h);
    if (tryPosition(atX, atY)) return;
    const stride = Math.max(6, width * .16);
    for (let radius = stride; radius < Math.min(w, h) * .52; radius += stride) {
      for (let direction = 0; direction < 12; direction++) {
        const theta = direction * Math.PI / 6;
        if (tryPosition(atX + radius * Math.cos(theta) / w, atY + radius * Math.sin(theta) / h)) return;
      }
    }

    function tryPosition(px, py) {
      if (!canPlace(px, py, width, height, angle)) return false;
      stamp.x = px;
      stamp.y = py;
      showPosition(stamp);
      return true;
    }
  }

  function clearFold(stamp) {
    stamp.sticker.removeAttribute("data-folding");
    stamp.artwork.removeAttribute("data-folding");
    stamp.face.style.removeProperty("clip-path");
    stamp.back.style.removeProperty("clip-path");
    stamp.back.style.removeProperty("transform");
    stamp.crease.style.removeProperty("transform");
  }

  function peel(stamp) {
    if (stamp.loose) return;
    stamp.loose = true;
    clearFold(stamp);
    showPosition(stamp);
    if (stamp.index === keepsake) positionPortrait();
  }

  function pageFold(state, dx, dy, distance) {
    const { stamp, width, height, c, s, threshold, corner } = state;
    const nx = (c * dx + s * dy) / distance;
    const ny = (-s * dx + c * dy) / distance;
    const dots = corner.map(([x, y]) => x * nx + y * ny);
    const min = Math.min(...dots);
    const max = Math.max(...dots);
    const anchor = state.grabX * nx + state.grabY * ny;
    const progress = clamp(distance / threshold, 0, 1);
    // The crease starts at the touched corner or edge. From the interior it
    // lifts the nearest edge behind the pointer's direction of travel.
    const from = clamp(anchor - (max - min) * .61, min, min + (max - min) * .31);
    const edge = from + (max - from) * progress * .86;
    const turn = 1.48 + progress * .45;
    stamp.sticker.setAttribute("data-folding", "");
    stamp.artwork.setAttribute("data-folding", "");
    stamp.face.style.clipPath = polygon(clipPaper(corner, nx, ny, edge, 1));
    stamp.back.style.clipPath = polygon(clipPaper(corner, nx, ny, edge, -1));
    stamp.back.style.transform = `matrix(${1 - turn * nx * nx},${-turn * nx * ny},${-turn * nx * ny},${1 - turn * ny * ny},${turn * edge * nx},${turn * edge * ny})`;
    const angle = Math.atan2(ny, nx) * 180 / Math.PI;
    const offset = edge - width * nx / 2 - height * ny / 2;
    stamp.crease.style.transform = `translate(-50%, -50%) rotate(${angle}deg) translateX(${offset.toFixed(1)}px)`;
  }

  function moveWithPointer(state, x, y) {
    const rect = tray.getBoundingClientRect();
    put(state.stamp, (x - rect.left - state.offsetX) / rect.width, (y - rect.top - state.offsetY) / rect.height);
  }

  function makeRoomForPortrait(stamp) {
    const cloth = tray.getBoundingClientRect();
    const patch = portrait.getBoundingClientRect();
    const x = (patch.left + patch.width / 2 - cloth.left) / cloth.width;
    const y = (patch.top + patch.height / 2 - cloth.top) / cloth.height;
    const gap = (patch.width + stamp.sticker.offsetWidth) * .44 / cloth.width;
    const height = (patch.height + stamp.sticker.offsetHeight) * .44 / cloth.height;
    if (Math.abs(stamp.x - x) < gap && Math.abs(stamp.y - y) < height) {
      put(stamp, x - gap - .055, Math.max(.13, y - .13));
    }
  }

  for (const stamp of stamps) {
    const { sticker } = stamp;
    sticker.addEventListener("pointerdown", event => {
      if (!event.isPrimary || event.button !== 0 || drag) return;
      const rect = tray.getBoundingClientRect();
      const width = sticker.offsetWidth;
      const height = sticker.offsetHeight;
      const offsetX = event.clientX - rect.left - stamp.x * rect.width;
      const offsetY = event.clientY - rect.top - stamp.y * rect.height;
      const radians = stamp.angle * Math.PI / 180;
      const c = Math.cos(radians);
      const s = Math.sin(radians);
      suppressClick = false;
      drag = {
        stamp, id: event.pointerId, width, height, c, s, offsetX, offsetY,
        startX: event.clientX, startY: event.clientY,
        grabX: clamp(width / 2 + offsetX * c + offsetY * s, 0, width),
        grabY: clamp(height / 2 - offsetX * s + offsetY * c, 0, height),
        threshold: Math.max(24, Math.min(width, height) * .57),
        corner: [[0, 0], [width, 0], [width, height], [0, height]],
        moved: false, peeled: false,
      };
      sticker.setPointerCapture(event.pointerId);
    });

    sticker.addEventListener("pointermove", event => {
      if (drag?.stamp !== stamp || drag.id !== event.pointerId) return;
      const dx = event.clientX - drag.startX;
      const dy = event.clientY - drag.startY;
      const distance = Math.hypot(dx, dy);
      if (!drag.moved && distance < 4) return;
      drag.moved = true;
      if (!stamp.loose && distance >= drag.threshold) {
        peel(stamp);
        drag.peeled = true;
        drag.audio = playPeel();
      }
      if (stamp.loose) {
        sticker.setAttribute("data-carry", "");
        stamp.artwork.setAttribute("data-carry", "");
        moveWithPointer(drag, event.clientX, event.clientY);
      } else {
        pageFold(drag, dx, dy, Math.max(1, distance));
      }
    });

    function drop(event) {
      if (drag?.stamp !== stamp || drag.id !== event.pointerId) return;
      const { moved, peeled, audio } = drag;
      drag = null;
      suppressClick = moved;
      sticker.removeAttribute("data-carry");
      stamp.artwork.removeAttribute("data-carry");
      clearFold(stamp);
      if (peeled) {
        if (stamp.index === keepsake) makeRoomForPortrait(stamp);
        if (event.type === "pointerup") {
          void audio?.then(played => { if (!played) return playPeel(); });
        }
      }
      if (stamp.loose && moved) save();
    }

    sticker.addEventListener("pointerup", drop);
    sticker.addEventListener("pointercancel", drop);
    sticker.addEventListener("lostpointercapture", drop);
    sticker.addEventListener("click", event => {
      if (stamp.loose || (suppressClick && event.detail !== 0)) return;
      peel(stamp);
      if (stamp.index === keepsake) makeRoomForPortrait(stamp);
      else put(stamp, stamp.x + .057, stamp.y + .06);
      void playPeel();
      save();
    });
    sticker.addEventListener("keydown", event => {
      if (!stamp.loose) return;
      const keys = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
      const move = keys[event.key];
      if (!move) return;
      event.preventDefault();
      put(stamp, stamp.x + move[0] * .023, stamp.y + move[1] * .023);
      save();
    });
  }

  function alignStamps() {
    if (drag || !tray.clientWidth || !tray.clientHeight) return;
    for (const stamp of stamps) put(stamp, stamp.x, stamp.y);
    const cover = stamps[keepsake];
    if (!cover.loose) {
      hiddenAt = { x: cover.x, y: cover.y };
      positionPortrait();
    }
  }

  new ResizeObserver(() => requestAnimationFrame(alignStamps)).observe(tray);
}
