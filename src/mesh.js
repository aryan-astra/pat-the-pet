const vertexSource = `
  attribute vec2 a_uv;
  attribute float a_joint;
  uniform vec4 u_frame;
  uniform float u_aspect;
  uniform float u_layer;
  uniform vec2 u_rest[5];
  uniform vec3 u_joints[5];
  varying vec2 v_uv;

  void main() {
    vec2 position = a_uv;
    if (u_layer > 0.5) {
      vec2 scale = vec2(1.0, u_aspect);
      vec2 point = position / scale;
      vec2 skinned = vec2(0.0);
      for (int i = 0; i < 5; i++) {
        vec2 arm = point - u_rest[i];
        float angle = u_joints[i].z;
        float c = cos(angle);
        float s = sin(angle);
        vec2 pivoted = vec2(c * arm.x - s * arm.y, s * arm.x + c * arm.y);
        float weight = max(0.0, 1.0 - abs(a_joint - float(i)));
        skinned += (u_joints[i].xy + pivoted) * weight;
      }
      position = skinned * scale;
    }
    v_uv = a_uv;
    gl_Position = vec4(u_frame.xy + position * u_frame.zw, 0.0, 1.0);
  }
`;

const fragmentSource = `
  #ifdef GL_FRAGMENT_PRECISION_HIGH
  precision highp float;
  #else
  precision mediump float;
  #endif
  uniform sampler2D u_sprite;
  uniform sampler2D u_fur;
  uniform sampler2D u_flow;
  uniform vec2 u_texel;
  uniform vec2 u_motion;
  uniform float u_layer;
  uniform float u_cut;
  varying vec2 v_uv;

  void main() {
    // Draw the two connected layers with a one-texel overlap at their fixed joint.
    if (u_layer > 0.5 ? v_uv.x < u_cut : v_uv.x > u_cut + u_texel.x) discard;
    vec4 photo = texture2D(u_sprite, v_uv);
    if (photo.a < 0.004) discard;
    if (u_layer < 0.5) {
      vec2 chest = (v_uv - vec2(.49, .34)) * vec2(5.0, 3.7);
      photo.rgb *= 1.0 + u_motion.x * exp(-dot(chest, chest));
      vec3 fur = texture2D(u_fur, v_uv).rgb;
      float pressure = fur.b * smoothstep(.80, .99, photo.a) * u_motion.y;
      if (pressure > .008) {
        vec3 flow = texture2D(u_flow, v_uv).rgb;
        vec2 axial = flow.rg * 2.0 - 1.0;
        float axisAngle = .5 * atan(axial.y, axial.x + .0001);
        vec2 tangent = vec2(cos(axisAngle), sin(axisAngle));
        vec2 normal = vec2(-tangent.y, tangent.x);
        vec2 lean = (fur.rg - vec2(128.0 / 255.0)) * 2.0;
        vec2 shift = (tangent * dot(lean, tangent) * .80 + normal * dot(lean, normal) * 2.6) * u_texel;
        vec2 grainWidth = normal * u_texel * 2.35;
        vec3 stillGrain = photo.rgb - .5 * (texture2D(u_sprite, v_uv + grainWidth).rgb
           + texture2D(u_sprite, v_uv - grainWidth).rgb);
        vec2 moved = v_uv - shift;
        vec3 newGrain = texture2D(u_sprite, moved).rgb - .5 * (texture2D(u_sprite, moved + grainWidth).rgb
           + texture2D(u_sprite, moved - grainWidth).rgb);
        // Keep the coat colors and markings fixed. Resample the fine grain only.
        photo.rgb += clamp(newGrain - stillGrain, -.105, .105) * pressure * (.44 + flow.b * .48);
        float alongLight = dot(lean, vec2(.60, -.80));
        float acrossGrain = abs(dot(lean, normal));
        photo.rgb += pressure * ((alongLight * .12 - acrossGrain * .065 + .032) * photo.rgb
           + vec3(.012, .010, .008) * (.55 + acrossGrain));
      }
    }
    gl_FragColor = vec4(clamp(photo.rgb, 0.0, photo.a), photo.a);
  }
`;

function compile(gl, kind, source) {
  const shader = gl.createShader(kind);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (gl.getShaderParameter(shader, gl.COMPILE_STATUS)) return shader;
  const log = gl.getShaderInfoLog(shader);
  gl.deleteShader(shader);
  throw new Error(log || "The cat shader could not be compiled.");
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

export function createMesh(canvas, field) {
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
    throw new Error(gl.getProgramInfoLog(program) || "The cat shaders could not be linked.");
  }
  gl.useProgram(program);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

  const grid = createGrid(64, 44);
  const coords = gl.createBuffer();
  const weights = gl.createBuffer();
  const indices = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, coords);
  gl.bufferData(gl.ARRAY_BUFFER, grid.points, gl.STATIC_DRAW);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indices);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, grid.triangles, gl.STATIC_DRAW);
  const uv = gl.getAttribLocation(program, "a_uv");
  const joint = gl.getAttribLocation(program, "a_joint");
  gl.enableVertexAttribArray(uv);
  gl.vertexAttribPointer(uv, 2, gl.FLOAT, false, 0, 0);
  gl.enableVertexAttribArray(joint);

  const uniforms = Object.fromEntries(
    ["frame", "aspect", "layer", "rest[0]", "joints[0]", "texel", "motion", "cut"].map(name =>
      [name, gl.getUniformLocation(program, "u_" + name)])
  );
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);

  function bindTexture(unit, name) {
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, gl.createTexture());
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.uniform1i(gl.getUniformLocation(program, name), unit);
  }

  bindTexture(0, "u_sprite");
  bindTexture(1, "u_fur");
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, field.width, field.height, 0, gl.RGB, gl.UNSIGNED_BYTE, field.pixels);
  bindTexture(2, "u_flow");
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, 1, 1, 0, gl.RGB, gl.UNSIGNED_BYTE, new Uint8Array([255, 128, 0]));
  let fieldVersion = field.version;

  return {
    setPet(image, rig, tail) {
      gl.activeTexture(gl.TEXTURE0);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
      gl.uniform2f(uniforms.texel, 1 / image.naturalWidth, 1 / image.naturalHeight);
      gl.uniform1f(uniforms.aspect, image.naturalWidth / image.naturalHeight);
      gl.uniform1f(uniforms.cut, rig.tailCut);
      gl.uniform2fv(uniforms["rest[0]"], tail.rest);
      const jointWeights = new Float32Array(grid.points.length / 2);
      for (let n = 0; n < jointWeights.length; n++) {
        jointWeights[n] = tail.weight(grid.points[n * 2], grid.points[n * 2 + 1]);
      }
      gl.bindBuffer(gl.ARRAY_BUFFER, weights);
      gl.bufferData(gl.ARRAY_BUFFER, jointWeights, gl.STATIC_DRAW);
      gl.vertexAttribPointer(joint, 1, gl.FLOAT, false, 0, 0);
    },
    setFlow(image) {
      gl.activeTexture(gl.TEXTURE2);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, image);
    },
    resize(width, height) {
      const scale = Math.min(window.devicePixelRatio || 1, 2, Math.sqrt(2200000 / (width * height)));
      canvas.width = Math.round(width * scale);
      canvas.height = Math.round(height * scale);
      gl.viewport(0, 0, canvas.width, canvas.height);
    },
    draw(bounds, area, motion) {
      if (fieldVersion !== field.version) {
        gl.activeTexture(gl.TEXTURE1);
        gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, field.width, field.height, gl.RGB, gl.UNSIGNED_BYTE, field.pixels);
        fieldVersion = field.version;
      }
      gl.uniform4f(uniforms.frame, 2 * bounds.x / area.width - 1, 1 - 2 * bounds.y / area.height,
        2 * bounds.width / area.width, -2 * bounds.height / area.height);
      gl.uniform2f(uniforms.motion, motion.breath, motion.furAmount);
      gl.uniform3fv(uniforms["joints[0]"], motion.joints);
      gl.clear(gl.COLOR_BUFFER_BIT);
      for (const layer of [1, 0]) {
        gl.uniform1f(uniforms.layer, layer);
        gl.drawElements(gl.TRIANGLES, grid.triangles.length, gl.UNSIGNED_SHORT, 0);
      }
    },
  };
}
