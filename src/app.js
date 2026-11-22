import { pets } from "./pets.js";
import { createScene } from "./scene.js";
import { createStickers } from "./sticker.js";
import { createPurr } from "./sound.js";

const $ = selector => document.querySelector(selector);
const settingsKey = "pat-the-pet.preferences";
const settings = { pet: pets[0].id, moon: false, hand: true, sound: true };

try {
  const saved = JSON.parse(localStorage.getItem(settingsKey));
  if (pets.some(pet => pet.id === saved?.pet)) settings.pet = saved.pet;
  for (const name of ["moon", "hand", "sound"]) {
    if (typeof saved?.[name] === "boolean") settings[name] = saved[name];
  }
} catch {
  // The experience also works when the browser blocks local storage.
}

function save() {
  try {
    localStorage.setItem(settingsKey, JSON.stringify(settings));
  } catch {
    // Preferences are kept for this visit when they cannot be stored.
  }
}

const scene = $(".scene");
const surface = $(".pet-surface");
const lightButton = $("#light-button");
const fullscreen = $("#fullscreen-button");
const guide = $("#show-hand");
const options = $("#pet-options");
const notice = $("#notice");
const badge = $("#mood-badge");
const comfortMeter = $("#comfort-meter");
const comfortLabel = $("#comfort-label");
const meterFill = $(".meter-track span");
const purr = createPurr();
let activePet;
let pendingPet;
let displayedComfort = .15;
let soundLevel = 0;

function setIcon(element, icon) {
  element.querySelector("use").setAttribute("href", `#icon-${icon}`);
}

function onMood(value, touching, purring) {
  const mood = purring ? "Purring" : touching ? "Being petted" : "Resting";
  if (badge.textContent !== mood) {
    badge.textContent = mood;
    scene.dataset.mood = purring ? "purring" : "resting";
  }
  const feeling = purring ? "Content" : value >= .30 ? "Settling in" : "Relaxed";
  if (comfortLabel.textContent !== feeling) comfortLabel.textContent = feeling;
  if (Math.abs(displayedComfort - value) >= .005 || (value === .15 && value !== displayedComfort)) {
    comfortMeter.value = value;
    meterFill.style.transform = `scaleX(${value.toFixed(3)})`;
    displayedComfort = value;
  }
  const nextLevel = purring ? Math.min(.98, .42 + value * .55) : touching ? value * .5 : 0;
  if (Math.abs(soundLevel - nextLevel) >= .018 || (nextLevel === 0 && soundLevel !== 0)) {
    purr.update(nextLevel);
    soundLevel = nextLevel;
  }
}

const petScene = createScene(scene, onMood);
let tape;
createStickers(scene, () => {
  if (!settings.sound) return Promise.resolve(true);
  tape ??= new Audio(new URL("../Music/sticker-peel.mp3", import.meta.url));
  tape.volume = .55;
  tape.currentTime = 0;
  return tape.play().then(() => true, () => false);
}, petScene.canPlaceStamp);

for (const pet of pets) {
  const label = document.createElement("label");
  label.className = "coat-option";
  label.title = `${pet.name} · ${pet.coat}`;
  label.style.setProperty("--coat-position", pet.portrait);
  label.innerHTML = `
    <input type="radio" name="pet">
    <span class="coat-thumbnail" aria-hidden="true"><span class="coat-check">
      <svg class="icon"><use href="#icon-check"/></svg>
    </span></span>
  `;
  const input = label.querySelector("input");
  input.value = pet.id;
  input.checked = settings.pet === pet.id;
  input.setAttribute("aria-label", `${pet.name}, ${pet.coat}`);
  options.append(label);
}

const images = new Map();

function loadPet(pet) {
  if (!images.has(pet.id)) {
    const image = new Image();
    image.decoding = "async";
    image.src = pet.url;
    images.set(pet.id, image.decode().then(() => image).catch(error => {
      images.delete(pet.id);
      throw error;
    }));
  }
  return images.get(pet.id);
}

async function choosePet(pet, persist = false) {
  const request = {};
  pendingPet = request;
  const previousPet = activePet;
  notice.textContent = "";
  notice.classList.add("sr-only");
  scene.setAttribute("aria-busy", "true");

  try {
    const image = await loadPet(pet);
    if (pendingPet !== request) return;
    petScene.petImage(image, pet);
    activePet = pet;
    settings.pet = pet.id;
    $("#pet-name").textContent = pet.name;
    $("#pet-coat").textContent = pet.coat;
    $(".pet-portrait").style.backgroundPosition = pet.portrait;
    surface.setAttribute("aria-label", `Pet ${pet.name}`);
    if (persist) save();
  } catch {
    if (pendingPet !== request) return;
    const oldOption = options.querySelector(`[value="${previousPet?.id || pets[0].id}"]`);
    oldOption.checked = true;
    notice.textContent = `${pet.name} could not load. Choose a cat to try again.`;
    notice.classList.remove("sr-only");
    if (!previousPet && pet !== pets[0]) void choosePet(pets[0]);
  } finally {
    if (pendingPet === request) scene.removeAttribute("aria-busy");
  }
}

options.addEventListener("change", event => {
  void choosePet(pets.find(pet => pet.id === event.target.value), true);
});

function updateLight() {
  document.documentElement.dataset.light = settings.moon ? "moon" : "day";
  lightButton.setAttribute("aria-pressed", String(settings.moon));
  lightButton.title = settings.moon ? "Return to daylight" : "Moonlight";
  setIcon(lightButton, settings.moon ? "sun" : "moon");
  $('meta[name="theme-color"]').content = settings.moon ? "#211f28" : "#faf5ec";
}

function updateSound() {
  purr.enable(settings.sound);
  if (!settings.sound) tape?.pause();
  document.querySelectorAll("[data-sound]").forEach(button => {
    button.setAttribute("aria-pressed", String(settings.sound));
    setIcon(button, settings.sound ? "sound" : "mute");
  });
  $(".sound-state").textContent = settings.sound ? "On" : "Off";
}

async function unlockSound() {
  try {
    await purr.unlock();
  } catch {
    settings.sound = false;
    updateSound();
    save();
    notice.textContent = "Purring sound is unavailable in this browser.";
    notice.classList.remove("sr-only");
  }
}

document.querySelectorAll("[data-sound]").forEach(button => {
  button.addEventListener("click", () => {
    settings.sound = !settings.sound;
    updateSound();
    save();
    if (settings.sound) void unlockSound();
  });
});

lightButton.addEventListener("click", () => {
  settings.moon = !settings.moon;
  updateLight();
  save();
});

guide.addEventListener("change", () => {
  settings.hand = guide.checked;
  scene.toggleAttribute("data-hide-hand", !settings.hand);
  save();
});

function updateFullscreen() {
  const expanded = document.fullscreenElement === scene || scene.hasAttribute("data-expanded");
  fullscreen.setAttribute("aria-pressed", String(expanded));
  fullscreen.title = expanded ? "Exit fullscreen" : "Fullscreen";
  setIcon(fullscreen, expanded ? "collapse" : "expand");
  for (const element of document.querySelectorAll(".site-header, .intro, .companion, .play-instructions")) {
    element.inert = expanded;
  }
}

fullscreen.addEventListener("click", async () => {
  if (document.fullscreenElement === scene) {
    await document.exitFullscreen();
  } else if (scene.hasAttribute("data-expanded")) {
    scene.removeAttribute("data-expanded");
  } else {
    try {
      await scene.requestFullscreen();
    } catch {
      scene.setAttribute("data-expanded", "");
    }
  }
  updateFullscreen();
});
document.addEventListener("fullscreenchange", updateFullscreen);

document.addEventListener("keydown", event => {
  if (event.key === "Escape" && scene.hasAttribute("data-expanded")) {
    scene.removeAttribute("data-expanded");
    updateFullscreen();
    return;
  }
  if (event.repeat || event.altKey || event.ctrlKey || event.metaKey || event.defaultPrevented) return;
  if (event.target !== surface && event.target.closest?.("button, input, select, textarea, a, [contenteditable]")) return;
  const tail = event.key.toLowerCase() === "t";
  if (event.code !== "Space" && !tail) return;
  event.preventDefault();
  void unlockSound();
  petScene.keyboardStroke(tail ? "tail" : "back");
});

surface.addEventListener("pointerdown", () => { void unlockSound(); });
surface.addEventListener("click", () => { void unlockSound(); });
document.addEventListener("visibilitychange", () => purr.update(soundLevel));

guide.checked = settings.hand;
scene.toggleAttribute("data-hide-hand", !settings.hand);
updateLight();
updateSound();
void choosePet(pets.find(pet => pet.id === settings.pet));
