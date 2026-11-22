const vertexSource = `
  attribute vec2 a_uv;
  attribute float a_joint;
  uniform vec4 u_frame;
  uniform mediump float u_aspect;
  uniform mediump float u_layer;
  uniform mediump vec4 u_press;
  uniform mediump vec3 u_stroke;
  uniform mediump vec2 u_motion;
  uniform vec2 u_rest[5];
  uniform vec3 u_joints[5];
  #ifdef GL_FRAGMENT_PRECISION_HIGH
  varying highp vec2 v_uv;
  #else
  varying mediump vec2 v_uv;
  #endif

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
    } else if (u_press.z > .003) {
      vec2 scale = vec2(1.0, u_aspect);
      vec2 fromPress = (position - u_press.xy) / scale;
      float radius = u_press.w * 1.42;
      float contact = exp(-dot(fromPress, fromPress) / (radius * radius));
      // Compliance is limited to the torso interior. The face, outline, and
      // tail joint stay registered to the underlying artwork.
      float softTissue = smoothstep(.27, .43, a_uv.x) * (1.0 - smoothstep(.62, .76, a_uv.x))
        * smoothstep(.24, .36, a_uv.y) * (1.0 - smoothstep(.52, .63, a_uv.y));
      vec2 shear = u_stroke.xy * (.014 * u_stroke.z) - fromPress * .105;
      position += shear * scale * (contact * softTissue * u_press.z * u_motion.y);
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
  uniform mediump vec2 u_motion;
  uniform mediump vec4 u_press;
  uniform mediump vec3 u_stroke;
  uniform vec4 u_pads[6];
  uniform mediump float u_aspect;
  uniform mediump float u_layer;
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
        photo.rgb += clamp(newGrain - stillGrain, -.105, .105) * pressure * (.55 + flow.b * .70);
        float alongLight = dot(lean, vec2(.60, -.80));
        float acrossGrain = abs(dot(lean, normal));
        float pale = smoothstep(.48, .90, max(photo.r, max(photo.g, photo.b)));
        photo.rgb += pressure * (1.0 - .56 * pale) * ((alongLight * .23 - acrossGrain * .095) * photo.rgb
           + vec3(.014, .012, .010) * acrossGrain);
      }
      if (u_press.z > .003) {
        vec2 aspect = vec2(1.0, u_aspect);
        vec2 delta = (v_uv - u_press.xy) / aspect;
        float radius = u_press.w;
        if (dot(delta, delta) < .042) {
          float compression = 0.0;
          for (int i = 0; i < 6; i++) {
            vec4 pad = u_pads[i];
            vec2 offset = (v_uv - pad.xy) / (aspect * max(.001, pad.z));
            compression = max(compression, pad.w * exp(-dot(offset, offset)));
          }
          vec2 normal = vec2(-u_stroke.y, u_stroke.x);
          float along = dot(delta, u_stroke.xy) / radius;
          float across = dot(delta, normal) / radius;
          float gather = (along - 1.18) * 2.5;
          float ridge = exp(-gather * gather - .73 * across * across) * u_stroke.z;
          float crease = exp(-1.60 * (along + .45) * (along + .45) - .68 * across * across);
          float cover = smoothstep(.81, .99, photo.a);
          float luminance = dot(photo.rgb, vec3(.24, .64, .12));
          vec2 grainStep = vec2(.69, -.72) * u_texel * 1.7;
          float fibre = luminance - .5 * dot(texture2D(u_sprite, v_uv - grainStep).rgb
            + texture2D(u_sprite, v_uv + grainStep).rgb, vec3(.24, .64, .12));
          float shade = ridge * .34 - compression * .16 - crease * .12;
          float softHighlight = ridge * .028 + clamp(fibre, -.064, .064) * (ridge + .30 * compression);
          float range = shade > 0.0 ? 1.0 - .72 * smoothstep(.43, .91, luminance) : 1.0;
          photo.rgb += (photo.rgb * (shade * range) + vec3(1.0, .93, .84) * softHighlight)
            * (cover * u_press.z);
        }
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
    ["frame", "aspect", "layer", "rest[0]", "joints[0]", "texel", "motion", "cut", "press", "stroke", "pads[0]"].map(name =>
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
      gl.uniform4fv(uniforms.press, motion.press.center);
      gl.uniform3fv(uniforms.stroke, motion.press.stroke);
      gl.uniform4fv(uniforms["pads[0]"], motion.press.pads);
      gl.uniform3fv(uniforms["joints[0]"], motion.joints);
      gl.clear(gl.COLOR_BUFFER_BIT);
      for (const layer of [1, 0]) {
        gl.uniform1f(uniforms.layer, layer);
        gl.drawElements(gl.TRIANGLES, grid.triangles.length, gl.UNSIGNED_SHORT, 0);
      }
    },
  };
}
