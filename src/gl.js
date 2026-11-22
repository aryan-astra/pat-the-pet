function compile(gl, kind, source) {
  const shader = gl.createShader(kind);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (gl.getShaderParameter(shader, gl.COMPILE_STATUS)) return shader;
  const log = gl.getShaderInfoLog(shader);
  gl.deleteShader(shader);
  throw new Error(log || "The shader could not be compiled.");
}

export function createProgram(gl, vertexSource, fragmentSource) {
  const program = gl.createProgram();
  const vertex = compile(gl, gl.VERTEX_SHADER, vertexSource);
  const fragment = compile(gl, gl.FRAGMENT_SHADER, fragmentSource);
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(gl.getProgramInfoLog(program) || "The shaders could not be linked.");
  }
  gl.useProgram(program);
  return program;
}

export function createGrid(columns, rows) {
  const points = [];
  const triangles = [];
  for (let y = 0; y <= rows; y++) {
    for (let x = 0; x <= columns; x++) {
      points.push(x / columns, y / rows);
      if (x === columns || y === rows) continue;
      const a = y * (columns + 1) + x;
      const b = a + columns + 1;
      triangles.push(a, a + 1, b, b, a + 1, b + 1);
    }
  }
  return { points: new Float32Array(points), triangles: new Uint16Array(triangles) };
}
