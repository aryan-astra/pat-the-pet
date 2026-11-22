const vertexSource = `
  attribute vec2 a_uv;
  uniform vec4 u_frame;
  uniform vec4 u_touch;
  uniform vec2 u_drag;
  uniform vec4 u_pose;
  uniform vec2 u_tailRoot;
  uniform vec3 u_tailCurve;
  varying vec2 v_uv;

  void main() {
    vec2 uv = a_uv;
    vec2 position = uv;
    vec2 fromTouch = (uv - u_touch.xy) * vec2(1.25, 1.0);
    float contact = exp(-dot(fromTouch, fromTouch) * 39.0) * u_touch.z;
    position += vec2(u_drag.x, u_drag.y + .010) * contact;

    float body = exp(-dot(uv - vec2(.58, .34), uv - vec2(.58, .34)) * 6.0);
    position.y -= u_pose.x * body;
    position.x += (uv.x - .48) * u_pose.x * body * .8;
    position.x += u_pose.y * (1.0 - smoothstep(.28, .84, uv.x));

    float edge = u_tailCurve.x - u_tailCurve.y * pow(clamp(uv.x, 0.0, 1.0), u_tailCurve.z);
    float tail = smoothstep(edge - .045, edge + .085, uv.y)
      * smoothstep(.48, .68, uv.x) * smoothstep(.43, .85, uv.y);
    vec2 arm = uv - u_tailRoot;
    float sway = u_pose.z * tail;
    float s = sin(sway);
    float c = cos(sway);
    vec2 rotated = vec2(c * arm.x - s * arm.y, s * arm.x + c * arm.y);
    position += rotated - arm + tail * vec2(.09, .03) * u_pose.w;

    v_uv = uv;
    gl_Position = vec4(u_frame.xy + position * u_frame.zw, 0.0, 1.0);
  }
`;

const fragmentSource = `
  precision mediump float;
  uniform sampler2D u_sprite;
  varying vec2 v_uv;
  void main() {
    gl_FragColor = texture2D(u_sprite, v_uv);
  }
`;

function compile(gl, kind, source) {
  const shader = gl.createShader(kind);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (gl.getShaderParameter(shader, gl.COMPILE_STATUS)) return shader;
  gl.deleteShader(shader);
  throw new Error("The cat mesh shader could not be compiled.");
}

function createGrid(columns, rows) {
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

export function createMesh(canvas) {
  const gl = canvas.getContext("webgl", {
    alpha: true,
    antialias: true,
    depth: false,
    stencil: false,
    powerPreference: "low-power",
  });
  if (!gl) return null;

  const program = gl.createProgram();
  const vertex = compile(gl, gl.VERTEX_SHADER, vertexSource);
  const fragment = compile(gl, gl.FRAGMENT_SHADER, fragmentSource);
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error("The cat mesh shader could not be linked.");
  }
  gl.useProgram(program);

  const grid = createGrid(40, 28);
  const coords = gl.createBuffer();
  const indices = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, coords);
  gl.bufferData(gl.ARRAY_BUFFER, grid.points, gl.STATIC_DRAW);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indices);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, grid.triangles, gl.STATIC_DRAW);
  const uv = gl.getAttribLocation(program, "a_uv");
  gl.enableVertexAttribArray(uv);
  gl.vertexAttribPointer(uv, 2, gl.FLOAT, false, 0, 0);

  const frame = gl.getUniformLocation(program, "u_frame");
  const touch = gl.getUniformLocation(program, "u_touch");
  const drag = gl.getUniformLocation(program, "u_drag");
  const pose = gl.getUniformLocation(program, "u_pose");
  const root = gl.getUniformLocation(program, "u_tailRoot");
  const curve = gl.getUniformLocation(program, "u_tailCurve");
  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

  return {
    setPet(image, rig) {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
      gl.uniform2fv(root, rig.tailRoot);
      gl.uniform3fv(curve, rig.tailCurve);
    },
    resize(width, height) {
      const scale = Math.min(window.devicePixelRatio || 1, 2, Math.sqrt(2200000 / (width * height)));
      canvas.width = Math.round(width * scale);
      canvas.height = Math.round(height * scale);
      gl.viewport(0, 0, canvas.width, canvas.height);
    },
    draw(bounds, area, motion) {
      gl.uniform4f(frame, 2 * bounds.x / area.width - 1, 1 - 2 * bounds.y / area.height,
        2 * bounds.width / area.width, -2 * bounds.height / area.height);
      gl.uniform4f(touch, motion.x, motion.y, motion.pressure, 0);
      gl.uniform2f(drag, motion.dx, motion.dy);
      gl.uniform4f(pose, motion.breath, motion.head, motion.tail, motion.extend);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawElements(gl.TRIANGLES, grid.triangles.length, gl.UNSIGNED_SHORT, 0);
    },
  };
}
