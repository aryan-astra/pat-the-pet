import { createGrid, createProgram } from "./gl.js";
import { coatColumns, coatRows } from "./fur.js";

const vertexSource = `
  attribute vec2 a_uv;
  attribute vec2 a_pos;
  attribute vec3 a_light;
  attribute float a_joint;
  uniform vec4 u_frame;
  uniform mediump float u_aspect;
  uniform mediump float u_layer;
  uniform mediump float u_cut;
  uniform vec2 u_rest[5];
  uniform vec3 u_joints[5];
  #ifdef GL_FRAGMENT_PRECISION_HIGH
  varying highp vec2 v_uv;
  varying highp vec3 v_light;
  #else
  varying mediump vec2 v_uv;
  varying mediump vec3 v_light;
  #endif

  void main() {
    vec2 position;
    if (u_layer > 0.5) {
      vec2 scale = vec2(1.0, u_aspect);
      vec2 point = a_uv / scale;
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
      position = mix(a_uv, skinned * scale, smoothstep(u_cut, u_cut + .050, a_uv.x));
    } else {
      position = a_pos;
    }
    v_uv = a_uv;
    v_light = a_light;
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
  uniform sampler2D u_flow;
  uniform vec2 u_texel;
  uniform mediump float u_layer;
  uniform mediump float u_cut;
  varying vec2 v_uv;
  varying vec3 v_light;

  void main() {
    if (u_layer > .5 ? v_uv.x < u_cut : v_uv.x > u_cut + u_texel.x) discard;
    vec4 photo = texture2D(u_sprite, v_uv);
    if (photo.a < .003) discard;
    vec3 color = photo.rgb;
    if (u_layer < .5) {
      color *= 1.0 + v_light.x * .83;
      vec2 brushed = v_light.yz;
      if (dot(brushed, brushed) > .000025) {
        vec3 data = texture2D(u_flow, v_uv).rgb;
        vec2 axial = data.rg * 2.0 - 1.0;
        float angle = .5 * atan(axial.y, axial.x + .0001);
        vec2 tangent = vec2(cos(angle), sin(angle));
        vec2 fall = normalize(vec2(.24 + .22 * v_uv.x, .92));
        tangent *= dot(tangent, fall) < 0.0 ? -1.0 : 1.0;
        vec2 grain = normalize(mix(fall, tangent, data.b * .38));
        vec2 across = vec2(-tangent.y, tangent.x);
        float lay = dot(brushed, grain);
        float raised = max(0.0, -lay);
        float laidDown = max(0.0, lay);
        float fibre = dot(photo.rgb - .5 * (
          texture2D(u_sprite, v_uv + across * u_texel * 2.1).rgb +
          texture2D(u_sprite, v_uv - across * u_texel * 2.1).rgb), vec3(.23, .64, .13));
        float luma = dot(photo.rgb, vec3(.23, .64, .13));
        float cover = smoothstep(.70, .99, photo.a);
        float pale = 1.0 - .76 * smoothstep(.31, .84, luma);
        float sheen = raised * (.144 + clamp(fibre * 3.3, -.058, .106)) * pale;
        color += (vec3(1.0, .97, .92) * sheen - photo.rgb * laidDown * .125) * cover;
      }
    }
    gl_FragColor = vec4(clamp(color, 0.0, photo.a), photo.a);
  }
`;

export function createMesh(canvas) {
  const gl = canvas.getContext("webgl", {
    alpha: true,
    antialias: true,
    depth: false,
    stencil: false,
    premultipliedAlpha: true,
    powerPreference: "low-power",
  });
  if (!gl) return null;

  const program = createProgram(gl, vertexSource, fragmentSource);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

  const grid = createGrid(coatColumns, coatRows);
  const coords = gl.createBuffer();
  const positions = gl.createBuffer();
  const lighting = gl.createBuffer();
  const weights = gl.createBuffer();
  const indices = gl.createBuffer();
  const lightData = new Float32Array(grid.points.length / 2 * 3);

  gl.bindBuffer(gl.ARRAY_BUFFER, coords);
  gl.bufferData(gl.ARRAY_BUFFER, grid.points, gl.STATIC_DRAW);
  const uv = gl.getAttribLocation(program, "a_uv");
  gl.enableVertexAttribArray(uv);
  gl.vertexAttribPointer(uv, 2, gl.FLOAT, false, 0, 0);

  gl.bindBuffer(gl.ARRAY_BUFFER, positions);
  gl.bufferData(gl.ARRAY_BUFFER, grid.points, gl.DYNAMIC_DRAW);
  const position = gl.getAttribLocation(program, "a_pos");
  gl.enableVertexAttribArray(position);
  gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

  gl.bindBuffer(gl.ARRAY_BUFFER, lighting);
  gl.bufferData(gl.ARRAY_BUFFER, lightData, gl.DYNAMIC_DRAW);
  const light = gl.getAttribLocation(program, "a_light");
  gl.enableVertexAttribArray(light);
  gl.vertexAttribPointer(light, 3, gl.FLOAT, false, 0, 0);

  gl.bindBuffer(gl.ARRAY_BUFFER, weights);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(grid.points.length / 2), gl.DYNAMIC_DRAW);
  const joint = gl.getAttribLocation(program, "a_joint");
  gl.enableVertexAttribArray(joint);
  gl.vertexAttribPointer(joint, 1, gl.FLOAT, false, 0, 0);

  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indices);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, grid.triangles, gl.STATIC_DRAW);

  const uniforms = Object.fromEntries(
    ["frame", "aspect", "layer", "rest[0]", "joints[0]", "texel", "cut"].map(name =>
      [name, gl.getUniformLocation(program, "u_" + name)])
  );
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
  bindTexture(1, "u_flow");
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, 1, 1, 0, gl.RGB, gl.UNSIGNED_BYTE, new Uint8Array([128, 128, 0]));

  return {
    setFlow(image) {
      gl.activeTexture(gl.TEXTURE1);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, image);
    },
    setPet(image, rig, tail) {
      gl.activeTexture(gl.TEXTURE0);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      gl.uniform2f(uniforms.texel, 1 / image.naturalWidth, 1 / image.naturalHeight);
      gl.uniform1f(uniforms.aspect, tail.aspect);
      gl.uniform1f(uniforms.cut, rig.tailCut);
      gl.uniform2fv(uniforms["rest[0]"], tail.rest);

      const jointWeights = new Float32Array(grid.points.length / 2);
      for (let n = 0; n < jointWeights.length; n++) {
        jointWeights[n] = tail.weight(grid.points[n * 2], grid.points[n * 2 + 1]);
      }
      gl.bindBuffer(gl.ARRAY_BUFFER, weights);
      gl.bufferData(gl.ARRAY_BUFFER, jointWeights, gl.DYNAMIC_DRAW);

      gl.bindBuffer(gl.ARRAY_BUFFER, positions);
      gl.bufferData(gl.ARRAY_BUFFER, grid.points, gl.DYNAMIC_DRAW);
      gl.bindBuffer(gl.ARRAY_BUFFER, lighting);
      gl.bufferData(gl.ARRAY_BUFFER, lightData, gl.DYNAMIC_DRAW);
    },
    resize(width, height) {
      const scale = Math.min(window.devicePixelRatio || 1, 2, Math.sqrt(2200000 / (width * height)));
      canvas.width = Math.round(width * scale);
      canvas.height = Math.round(height * scale);
      gl.viewport(0, 0, canvas.width, canvas.height);
    },
    draw(bounds, area, state) {
      gl.bindBuffer(gl.ARRAY_BUFFER, positions);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, state.xy);
      gl.bindBuffer(gl.ARRAY_BUFFER, lighting);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, state.light);
      gl.uniform4f(uniforms.frame, 2 * bounds.x / area.width - 1, 1 - 2 * bounds.y / area.height,
        2 * bounds.width / area.width, -2 * bounds.height / area.height);
      gl.uniform3fv(uniforms["joints[0]"], state.joints);
      gl.clear(gl.COLOR_BUFFER_BIT);
      for (const layer of [1, 0]) {
        gl.uniform1f(uniforms.layer, layer);
        gl.drawElements(gl.TRIANGLES, grid.triangles.length, gl.UNSIGNED_SHORT, 0);
      }
    },
  };
}
