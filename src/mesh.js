import { createGrid, createProgram } from "./gl.js";

const vertexSource = `
  attribute vec2 a_uv;
  attribute float a_joint;
  uniform vec4 u_frame;
  uniform mediump float u_aspect;
  uniform mediump float u_layer;
  uniform mediump vec4 u_press;
  uniform mediump vec3 u_stroke;
  uniform mediump vec3 u_motion;
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
    } else {
      vec2 ribs = (position - vec2(.53, .42)) * vec2(4.7, 2.1);
      position += ribs * vec2(.10, .40) * u_motion.x * exp(-dot(ribs, ribs));
      vec2 scale = vec2(1.0, u_aspect);
      vec2 fromPress = (position - u_press.xy) / scale;
      float radius = max(.035, u_press.w * 1.68);
      float contact = exp(-dot(fromPress, fromPress) / (radius * radius));
      // Compliance is limited to the torso interior. The face, outline, and
      // tail joint stay registered to the underlying artwork.
      float softTissue = smoothstep(.27, .43, a_uv.x) * (1.0 - smoothstep(.62, .76, a_uv.x))
        * smoothstep(.24, .36, a_uv.y) * (1.0 - smoothstep(.52, .63, a_uv.y));
      vec2 shear = u_stroke.xy * (.021 * u_stroke.z) - fromPress * .142;
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
  uniform mediump vec3 u_motion;
  uniform vec2 u_fieldStep;
  uniform mediump float u_aspect;
  uniform mediump float u_layer;
  uniform float u_cut;
  varying vec2 v_uv;

  float heightAt(vec2 uv) {
    return (texture2D(u_fur, uv).a - 128.0 / 255.0) * .038;
  }

  void main() {
    // Draw the two connected layers with a one-texel overlap at their fixed joint.
    if (u_layer > 0.5 ? v_uv.x < u_cut : v_uv.x > u_cut + u_texel.x) discard;
    vec4 photo = texture2D(u_sprite, v_uv);
    if (photo.a < 0.004) discard;
    if (u_layer < 0.5) {
      vec2 chest = (v_uv - vec2(.49, .34)) * vec2(5.0, 3.7);
      photo.rgb *= 1.0 + u_motion.x * exp(-dot(chest, chest));
    }
    if (u_layer < 0.5 && u_motion.z > .5) {
      vec4 fur = texture2D(u_fur, v_uv);
      float cover = smoothstep(.72, .98, photo.a) * u_motion.y;
      float pressure = fur.b * cover;
      float height = (fur.a - 128.0 / 255.0) * .038;
      vec2 nearby = vec2(u_fieldStep.x, 0.0);
      vec2 up = vec2(0.0, u_fieldStep.y);
      vec2 slope = vec2(heightAt(v_uv + nearby) - heightAt(v_uv - nearby),
        (heightAt(v_uv + up) - heightAt(v_uv - up)) * u_aspect) / (2.0 * u_fieldStep);
      if (pressure > .006 || abs(height) > .00018 || dot(slope, slope) > .0002) {
        vec3 flow = texture2D(u_flow, v_uv).rgb;
        vec2 axial = flow.rg * 2.0 - 1.0;
        float axisAngle = .5 * atan(axial.y, axial.x + .0001);
        vec2 tangent = vec2(cos(axisAngle), sin(axisAngle));
        vec2 cross = vec2(-tangent.y, tangent.x);
        vec2 lean = (fur.rg - vec2(128.0 / 255.0)) * 2.0;
        vec2 shift = (tangent * dot(lean, tangent) * 3.3 + cross * dot(lean, cross) * 6.6) * u_texel;
        vec2 grainWidth = cross * u_texel * 2.25;
        vec3 stillGrain = photo.rgb - .5 * (texture2D(u_sprite, v_uv + grainWidth).rgb
           + texture2D(u_sprite, v_uv - grainWidth).rgb);
        vec2 moved = v_uv - shift;
        vec3 newGrain = texture2D(u_sprite, moved).rgb - .5 * (texture2D(u_sprite, moved + grainWidth).rgb
           + texture2D(u_sprite, moved - grainWidth).rgb);
        photo.rgb += clamp(newGrain - stillGrain, -.12, .12) * pressure * (.96 + flow.b * .87);

        // Relight the slopes of the simulated coat under the same window
        // direction as the photograph. The base pigmentation stays in place.
        vec3 normal = normalize(vec3(-slope * 1.62, 1.0));
        const vec3 light = vec3(-.60, -.43, .675);
        float relief = dot(normal, light) - light.z;
        float pale = smoothstep(.46, .91, max(photo.r, max(photo.g, photo.b)));
        float nap = dot(lean, vec2(.78, -.63));
        float occlusion = min(height * 12.0, 0.0);
        float softSpecular = max(relief, 0.0) * (.18 + .28 * flow.b);
        float strand = dot(stillGrain, vec3(.22, .62, .16));
        float lustre = pressure * (nap * .34 + strand * 2.5) * (1.0 - .63 * pale);
        float shade = (relief * (1.29 - .47 * pale) + occlusion) * cover;
        photo.rgb += photo.rgb * (shade + lustre)
          + vec3(1.0, .93, .86) * softSpecular * cover * (1.0 - .72 * pale);
      }
    }
    gl_FragColor = vec4(clamp(photo.rgb, 0.0, photo.a), photo.a);
  }
`;

export function createMesh(canvas, field) {
  const gl = canvas.getContext("webgl", {
    alpha: true,
    antialias: true,
    depth: false,
    stencil: false,
    powerPreference: "low-power",
  });
  if (!gl) return null;

  const program = createProgram(gl, vertexSource, fragmentSource);
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
    ["frame", "aspect", "layer", "rest[0]", "joints[0]", "texel", "motion", "cut", "press", "stroke", "fieldStep"].map(name =>
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
  bindTexture(1, "u_fur");
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, field.width, field.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, field.pixels);
  gl.uniform2f(uniforms.fieldStep, 1 / field.width, 1 / field.height);
  bindTexture(2, "u_flow");
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, 1, 1, 0, gl.RGB, gl.UNSIGNED_BYTE, new Uint8Array([255, 128, 0]));
  let fieldVersion = field.version;

  return {
    setPet(image, rig, tail) {
      gl.activeTexture(gl.TEXTURE0);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
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
        gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, field.width, field.height, gl.RGBA, gl.UNSIGNED_BYTE, field.pixels);
        fieldVersion = field.version;
      }
      gl.uniform4f(uniforms.frame, 2 * bounds.x / area.width - 1, 1 - 2 * bounds.y / area.height,
        2 * bounds.width / area.width, -2 * bounds.height / area.height);
      gl.uniform3f(uniforms.motion, motion.breath, motion.furAmount, Number(field.active));
      gl.uniform4fv(uniforms.press, motion.press.center);
      gl.uniform3fv(uniforms.stroke, motion.press.stroke);
      gl.uniform3fv(uniforms["joints[0]"], motion.joints);
      gl.clear(gl.COLOR_BUFFER_BIT);
      for (const layer of [1, 0]) {
        gl.uniform1f(uniforms.layer, layer);
        gl.drawElements(gl.TRIANGLES, grid.triangles.length, gl.UNSIGNED_SHORT, 0);
      }
    },
  };
}
