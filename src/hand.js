const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export function createHand(element) {
  const outline = element.querySelector("#hand-shape");
  const knuckles = element.querySelector("#hand-knuckles");
  let angle = -12;
  let curl = -1;
  let target;

  function drawPose(flex) {
    const i = 20 * flex;
    const m = 32 * flex;
    const r = 28 * flex;
    const p = 20 * flex;
    const thumb = 13 * flex;
    outline.setAttribute("d", `
      M 48 200 C 51 181 50 166 45 153 C 41 142 37 134 30 125
      C 23 116 ${14 + thumb} 108 ${8 + thumb} ${98 + thumb * .34}
      C ${5 + thumb} ${91 + thumb * .34} ${10 + thumb} ${84 + thumb * .34} ${17 + thumb} ${86 + thumb * .34}
      C ${24 + thumb} 88 34 101 42 106 C 47 108 48 102 47 94
      C 45 82 ${37 + i * .35} ${63 + i} ${32 + i * .35} ${47 + i}
      C ${28 + i * .35} ${37 + i} ${31 + i * .35} ${32 + i} ${36 + i * .35} ${31 + i}
      C ${42 + i * .35} ${30 + i} ${46 + i * .35} ${36 + i} ${50 + i * .35} ${45 + i}
      C 54 ${57 + i * .6} 60 69 62 73
      C 64 64 62 ${48 + m * .62} 61 ${36 + m}
      C 59 ${22 + m} 61 ${14 + m} 68 ${13 + m}
      C 76 ${12 + m} 79 ${20 + m} 80 ${31 + m} C 82 ${47 + m * .55} 82 62 84 69
      C 87 61 ${89 - r * .1} ${49 + r * .55} ${91 - r * .1} ${36 + r}
      C ${93 - r * .1} ${24 + r} ${97 - r * .1} ${19 + r} ${103 - r * .1} ${21 + r}
      C ${110 - r * .1} ${23 + r} ${111 - r * .1} ${29 + r} ${109 - r * .1} ${42 + r * .87}
      C 107 ${53 + r * .68} 104 68 104 80
      C 109 72 ${114 - p * .28} ${60 + p * .55} ${121 - p * .28} ${50 + p}
      C ${127 - p * .28} ${42 + p} ${133 - p * .28} ${41 + p} ${137 - p * .28} ${47 + p}
      C ${141 - p * .28} ${53 + p} ${136 - p * .28} ${59 + p} ${132 - p * .28} ${67 + p * .8}
      C 125 80 121 91 118 107 C 115 127 107 147 102 157
      C 97 171 98 184 102 200 Z
    `);
    knuckles.setAttribute("d", `
      M ${40 + i * .35} ${50 + i}q4-3 8-1
      M 64 ${42 + m}q6-3 12 0
      M ${92 - r * .1} ${46 + r * .82}q5-1 10 2
      M ${119 - p * .28} ${67 + p * .82}q5 0 8 4
      M 50 112q10-8 17-2 M 79 98q6-6 14-2 M 61 145q7-8 13-9
    `);
  }

  return {
    move(x, y, dx, dy, pose, pressure) {
      const turn = clamp(dx * 2.6 - dy * .55, -39, 39);
      const bend = pose === "tail" ? .86 : pose === "head" ? .38 + pressure * .23 : .09 + pressure * .16;
      target = { x, y, angle: -13 + turn + (pose === "tail" ? 15 : 0), curl: bend };
    },
    relax() {
      if (target) target.curl = Math.min(.24, target.curl);
    },
    draw(delta, reduced) {
      if (!target) return;
      const blend = reduced ? 1 : 1 - Math.exp(-delta * 19);
      angle += (target.angle - angle) * blend;
      const nextCurl = curl < 0 ? target.curl : curl + (target.curl - curl) * blend;
      if (Math.abs(nextCurl - curl) > .002) {
        curl = nextCurl;
        drawPose(curl);
      }
      element.style.transform = `translate3d(${target.x}px, ${target.y}px, 0) translate(-50%, -40%) rotate(${angle.toFixed(2)}deg)`;
    },
  };
}
