import { createGrid, createProgram } from "./gl.js";

export const handAspect = 3 / 4;
export const handAnchor = [.55, .47];

// Each finger has a tip, a base, and a contact radius in the original artwork.
const fingers = [
  { tip: [.105, .372], base: [.357, .573], radius: .061, load: .59 },
  { tip: [.306, .116], base: [.442, .438], radius: .053, load: .88 },
  { tip: [.490, .059], base: [.553, .418], radius: .058, load: 1 },
  { tip: [.644, .139], base: [.647, .450], radius: .055, load: .92 },
  { tip: [.859, .280], base: [.749, .487], radius: .047, load: .67 },
];

const fit = (value, min, max) => Math.max(min, Math.min(max, value));

function flexOffset(x, y) {
  let closest = 0;
  let offsetX = 0;
  let offsetY = 0;
  for (const { tip, base, radius } of fingers) {
    const ax = tip[0] - base[0];
    const ay = (tip[1] - base[1]) / handAspect;
    const dx = x - base[0];
    const dy = (y - base[1]) / handAspect;
    const t = fit((ax * dx + ay * dy) / (ax * ax + ay * ay), 0, 1);
    const distance = Math.hypot(dx - t * ax, dy - t * ay);
    const rim = fit((distance / radius - 1.05) / 1.32, 0, 1);
    const coverage = 1 - rim * rim * (3 - 2 * rim);
    const weight = t * coverage;
    if (weight <= closest) continue;
    closest = weight;
    const bend = (.63 + .37 * t) * weight;
    offsetX = (-ax * .28 + (.55 - tip[0]) * .048) * bend;
    offsetY = (-ay * .32 * handAspect + .011) * bend;
  }
  return [offsetX, offsetY];
}

export const handPads = fingers.map(({ tip, base, radius, load }, index) => {
  const mix = index ? .19 : .22;
  const x = tip[0] + (base[0] - tip[0]) * mix;
  const y = tip[1] + (base[1] - tip[1]) * mix;
  return { x, y, radius, load, bend: flexOffset(x, y) };
}).concat({ x: .555, y: .60, radius: .156, load: .97, bend: [0, 0] });

const vertex = `
  attribute vec2 a_uv;
  attribute vec2 a_flex;
  uniform float u_curl;
  varying mediump vec2 v_uv;

  void main() {
    vec2 position = a_uv + u_curl * a_flex;
    v_uv = a_uv;
    gl_Position = vec4(position * vec2(2.0, -2.0) + vec2(-1.0, 1.0), 0.0, 1.0);
  }
`;

const fragment = `
  precision mediump float;
  uniform sampler2D u_hand;
  varying mediump vec2 v_uv;

  void main() {
    gl_FragColor = texture2D(u_hand, v_uv);
  }
`;

export function createHandArt(canvas, image) {
  const gl = canvas.getContext("webgl", { alpha: true, depth: false, stencil: false, antialias: true });
  if (!gl) return null;
  const program = createProgram(gl, vertex, fragment);
  const grid = createGrid(36, 48);
  const offsets = new Float32Array(grid.points.length);
  for (let i = 0; i < grid.points.length; i += 2) {
    offsets.set(flexOffset(grid.points[i], grid.points[i + 1]), i);
  }
  function buffer(name, data) {
    const location = gl.getAttribLocation(program, name);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(location);
    gl.vertexAttribPointer(location, 2, gl.FLOAT, false, 0, 0);
  }
  buffer("a_uv", grid.points);
  buffer("a_flex", offsets);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, grid.triangles, gl.STATIC_DRAW);
  gl.bindTexture(gl.TEXTURE_2D, gl.createTexture());
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
  gl.viewport(0, 0, canvas.width, canvas.height);
  const curl = gl.getUniformLocation(program, "u_curl");
  let previous = Infinity;
  return {
    draw(amount) {
      if (Math.abs(amount - previous) < .003) return;
      previous = amount;
      gl.uniform1f(curl, amount);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawElements(gl.TRIANGLES, grid.triangles.length, gl.UNSIGNED_SHORT, 0);
    },
  };
}
