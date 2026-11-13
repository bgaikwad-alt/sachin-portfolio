/*
 * Interactive fluid background (WebGL2).
 *
 * A port of the "Interactive Fluid" example from vgpu by Vercel
 * (https://github.com/vercel-labs/vgpu, apps/docs/examples/fluid), MIT License,
 * Copyright (c) 2025 Vercel, Inc. The original runs WGSL compute passes on
 * WebGPU; this version runs the same pressure-projected solver as WebGL2
 * fragment passes so it works in every current browser.
 *
 * Pipeline per step: advect velocity (+ idle emitters, pointer stir) -> curl ->
 * vorticity confinement -> divergence -> 3 pressure iterations -> projection ->
 * advect dye. Then a display pass tone-maps the dye.
 */
(function () {
  "use strict";

  const VERT = `#version 300 es
in vec2 a_pos;
void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }`;

  const COMMON = `#version 300 es
precision highp float;
precision highp int;
uniform vec2 u_size;      // grid size of the pass being written
out vec4 o;
ivec2 cl(ivec2 p, vec2 size) { return clamp(p, ivec2(0), ivec2(size) - 1); }
vec2 cellUv() { return gl_FragCoord.xy / u_size; }
float segmentWeight(vec2 p, vec2 a, vec2 b, float r2, float aspect) {
  vec2 s = vec2(aspect, 1.0);
  vec2 pt = p * s, org = a * s, d = (b - a) * s;
  float t = clamp(dot(pt - org, d) / max(dot(d, d), 1e-7), 0.0, 1.0);
  vec2 q = pt - (org + t * d);
  return exp(-dot(q, q) / r2);
}
float emitterWeight(vec2 p, vec4 e, float aspect) {
  vec2 d = (p - e.xy) * vec2(aspect, 1.0);
  return exp(-dot(d, d) / e.w) * e.z;
}
uniform float u_step;
uniform float u_pointerActive;
uniform vec2 u_from, u_to, u_pointerVelocity;
uniform vec4 u_pointerColor, u_idleA, u_idleB;
uniform vec2 u_grid;      // velocity grid size
`;

  const ADVECT_VELOCITY = COMMON + `
uniform sampler2D u_src;
void main() {
  vec2 p = cellUv();
  float aspect = u_grid.x / u_grid.y;
  float dt = 1.0 / 60.0;
  vec2 v0 = texelFetch(u_src, ivec2(gl_FragCoord.xy), 0).xy;
  vec2 back = clamp(p - dt * v0, 0.5 / u_grid, 1.0 - 0.5 / u_grid);
  vec2 v = 0.98 * texture(u_src, back).xy;
  float wa = emitterWeight(p, u_idleA, aspect);
  float wb = emitterWeight(p, u_idleB, aspect);
  float time = u_step / 60.0;
  vec2 ta = vec2(0.28 * 0.73 * cos(0.73 * time), 0.22 * 1.09 * cos(1.09 * time + 0.4));
  vec2 tb = vec2(0.26 * 0.61 * cos(0.61 * time + 3.14159265), 0.24 * 0.97 * cos(0.97 * time + 2.1));
  v += dt * (wa * (2.6 * ta + 2.0 * vec2(-ta.y, ta.x)) + wb * (2.6 * tb - 2.0 * vec2(-tb.y, tb.x)));
  if (u_pointerActive > 0.0) {
    v += segmentWeight(p, u_from, u_to, 0.002, aspect) * u_pointerVelocity * 0.8;
  }
  float s = length(v);
  if (s > 2.5) v *= 2.5 / s;
  o = vec4(v, 0.0, 1.0);
}`;

  const CURL = COMMON + `
uniform sampler2D u_vel;
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  float l = texelFetch(u_vel, cl(p - ivec2(1, 0), u_grid), 0).y;
  float r = texelFetch(u_vel, cl(p + ivec2(1, 0), u_grid), 0).y;
  float t = texelFetch(u_vel, cl(p + ivec2(0, 1), u_grid), 0).x;
  float b = texelFetch(u_vel, cl(p - ivec2(0, 1), u_grid), 0).x;
  o = vec4(0.5 * (r - l - t + b), 0.0, 0.0, 1.0);
}`;

  const VORTICITY = COMMON + `
uniform sampler2D u_src;
uniform sampler2D u_curl;
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  float l = abs(texelFetch(u_curl, cl(p - ivec2(1, 0), u_grid), 0).x);
  float r = abs(texelFetch(u_curl, cl(p + ivec2(1, 0), u_grid), 0).x);
  float t = abs(texelFetch(u_curl, cl(p + ivec2(0, 1), u_grid), 0).x);
  float b = abs(texelFetch(u_curl, cl(p - ivec2(0, 1), u_grid), 0).x);
  float c = texelFetch(u_curl, p, 0).x;
  vec2 f = 0.5 * vec2(t - b, r - l);
  f /= length(f) + 0.0001;
  f *= 20.0 * c;
  f.y *= -1.0;
  vec2 v = texelFetch(u_src, p, 0).xy + f / 60.0;
  float s = length(v);
  if (s > 2.5) v *= 2.5 / s;
  o = vec4(v, 0.0, 1.0);
}`;

  const DIVERGENCE = COMMON + `
uniform sampler2D u_vel;
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  ivec2 last = ivec2(u_grid) - 1;
  float l = p.x == 0 ? 0.0 : texelFetch(u_vel, p - ivec2(1, 0), 0).x;
  float r = p.x == last.x ? 0.0 : texelFetch(u_vel, p + ivec2(1, 0), 0).x;
  float b = p.y == 0 ? 0.0 : texelFetch(u_vel, p - ivec2(0, 1), 0).y;
  float t = p.y == last.y ? 0.0 : texelFetch(u_vel, p + ivec2(0, 1), 0).y;
  o = vec4((r - l) * 0.5 * u_grid.x + (t - b) * 0.5 * u_grid.y, 0.0, 0.0, 1.0);
}`;

  const PRESSURE = COMMON + `
uniform sampler2D u_src;
uniform sampler2D u_div;
uniform float u_decay;
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  ivec2 last = ivec2(u_grid) - 1;
  float c = texelFetch(u_src, p, 0).x;
  float l = (p.x == 0 ? c : texelFetch(u_src, p - ivec2(1, 0), 0).x) * u_decay;
  float r = (p.x == last.x ? c : texelFetch(u_src, p + ivec2(1, 0), 0).x) * u_decay;
  float b = (p.y == 0 ? c : texelFetch(u_src, p - ivec2(0, 1), 0).x) * u_decay;
  float t = (p.y == last.y ? c : texelFetch(u_src, p + ivec2(0, 1), 0).x) * u_decay;
  float wx = u_grid.x * u_grid.x;
  float wy = u_grid.y * u_grid.y;
  float d = texelFetch(u_div, p, 0).x;
  o = vec4(((l + r) * wx + (b + t) * wy - d) / (2.0 * wx + 2.0 * wy), 0.0, 0.0, 1.0);
}`;

  const PROJECT = COMMON + `
uniform sampler2D u_src;
uniform sampler2D u_pressure;
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  ivec2 last = ivec2(u_grid) - 1;
  float c = texelFetch(u_pressure, p, 0).x;
  float l = p.x == 0 ? c : texelFetch(u_pressure, p - ivec2(1, 0), 0).x;
  float r = p.x == last.x ? c : texelFetch(u_pressure, p + ivec2(1, 0), 0).x;
  float b = p.y == 0 ? c : texelFetch(u_pressure, p - ivec2(0, 1), 0).x;
  float t = p.y == last.y ? c : texelFetch(u_pressure, p + ivec2(0, 1), 0).x;
  vec2 u = texelFetch(u_src, p, 0).xy - vec2((r - l) * 0.5 * u_grid.x, (t - b) * 0.5 * u_grid.y);
  if (p.x == 0 && u.x < 0.0) u.x = 0.0;
  if (p.x == last.x && u.x > 0.0) u.x = 0.0;
  if (p.y == 0 && u.y < 0.0) u.y = 0.0;
  if (p.y == last.y && u.y > 0.0) u.y = 0.0;
  float s = length(u);
  if (s > 2.5) u *= 2.5 / s;
  o = vec4(u, 0.0, 1.0);
}`;

  const ADVECT_DYE = COMMON + `
uniform sampler2D u_src;
uniform sampler2D u_vel;
uniform vec4 u_colorA, u_colorB;
void main() {
  vec2 p = cellUv();
  float aspect = u_grid.x / u_grid.y;
  vec2 back = clamp(p - texture(u_vel, p).xy / 60.0, 0.5 / u_size, 1.0 - 0.5 / u_size);
  vec4 col = 0.97 * texture(u_src, back);
  col += u_colorA * emitterWeight(p, u_idleA, aspect) * 0.12;
  col += u_colorB * emitterWeight(p, u_idleB, aspect) * 0.115;
  if (u_pointerActive > 0.0) {
    col += u_pointerColor * segmentWeight(p, u_from, u_to, 0.002, aspect) * 0.35;
  }
  o = clamp(col, vec4(0.0), vec4(4.0));
}`;

  const DISPLAY = COMMON + `
uniform sampler2D u_dye;
uniform vec3 u_base;
void main() {
  vec2 uv = cellUv();
  vec3 density = texture(u_dye, uv).rgb;
  vec3 color = 1.0 - exp(-density * 1.35);
  float vig = 0.68 + 0.32 * pow(max(0.0, 1.0 - dot(uv - 0.5, uv - 0.5) * 1.9), 1.5);
  o = vec4((u_base + color) * vig, 1.0);
}`;

  function createFluid(canvas, opts) {
    opts = opts || {};
    const gl = canvas.getContext("webgl2", { alpha: false, antialias: false, depth: false, stencil: false, premultipliedAlpha: false, powerPreference: "low-power" });
    if (!gl) return null;
    if (!gl.getExtension("EXT_color_buffer_float") && !gl.getExtension("EXT_color_buffer_half_float")) return null;

    const colorA = opts.colorA || [0.05, 0.48, 1.0, 1.0];
    const colorB = opts.colorB || [1.0, 0.08, 0.55, 1.0];
    const base = opts.base || [0.003, 0.005, 0.014];
    const interactive = opts.interactive || canvas;

    // --- GL helpers -------------------------------------------------------
    function compile(type, src) {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      return s;
    }
    const vs = compile(gl.VERTEX_SHADER, VERT);
    function program(fragSrc) {
      const p = gl.createProgram();
      gl.attachShader(p, vs);
      gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fragSrc));
      gl.bindAttribLocation(p, 0, "a_pos");
      gl.linkProgram(p);
      if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
      const uniforms = {};
      const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
      for (let i = 0; i < n; i++) {
        const info = gl.getActiveUniform(p, i);
        uniforms[info.name] = gl.getUniformLocation(p, info.name);
      }
      return { p, u: uniforms };
    }

    let progs;
    try {
      progs = {
        advectVelocity: program(ADVECT_VELOCITY),
        curl: program(CURL),
        vorticity: program(VORTICITY),
        divergence: program(DIVERGENCE),
        pressure: program(PRESSURE),
        project: program(PROJECT),
        advectDye: program(ADVECT_DYE),
        display: program(DISPLAY),
      };
    } catch (e) {
      console.warn("Fluid shader failed, using static background.", e);
      return null;
    }

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    function target(w, h, linear) {
      const tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
      const f = linear ? gl.LINEAR : gl.NEAREST;
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, f);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, f);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      const fb = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      return { tex, fb, w, h };
    }
    function pingPong(w, h, linear) {
      const pp = { read: target(w, h, linear), write: target(w, h, linear) };
      pp.swap = function () { const t = pp.read; pp.read = pp.write; pp.write = t; };
      return pp;
    }
    function freeTarget(t) { gl.deleteTexture(t.tex); gl.deleteFramebuffer(t.fb); }

    // --- Simulation state -------------------------------------------------
    let grid, dyeSize, velocity, dye, pressure, divergence, curl;
    let step = 0, lastInputStep = -1000;

    function allocate() {
      const aspect = Math.max(0.35, Math.min(3, canvas.width / Math.max(1, canvas.height)));
      // Same resolution as the original (128 x 72 at 16:9), long side 128.
      grid = aspect >= 1 ? [128, Math.max(32, Math.round(128 / aspect))] : [Math.max(32, Math.round(128 * aspect)), 128];
      dyeSize = [grid[0] * 4, grid[1] * 4];
      if (velocity) [velocity.read, velocity.write, dye.read, dye.write, pressure.read, pressure.write, divergence, curl].forEach(freeTarget);
      velocity = pingPong(grid[0], grid[1], true);
      dye = pingPong(dyeSize[0], dyeSize[1], true);
      pressure = pingPong(grid[0], grid[1], false);
      divergence = target(grid[0], grid[1], false);
      curl = target(grid[0], grid[1], false);
    }

    // --- Pointer input (port of pointer-input.ts, hover-to-stir) ----------
    const input = { active: false, from: [0.5, 0.5], to: [0.5, 0.5], velocity: [0, 0], lastTime: 0, decay: 0 };
    function point(e) {
      const r = canvas.getBoundingClientRect();
      return [
        Math.max(0, Math.min(1, (e.clientX - r.left) / Math.max(1, r.width))),
        Math.max(0, Math.min(1, 1 - (e.clientY - r.top) / Math.max(1, r.height))),
      ];
    }
    function onMove(e) {
      if (!e.isPrimary) return;
      const next = point(e);
      if (input.lastTime === 0) { input.from = input.to = next; input.lastTime = e.timeStamp; return; }
      const dt = Math.max(0.004, Math.min(0.05, (e.timeStamp - input.lastTime) / 1000));
      input.from = input.to;
      input.to = next;
      input.velocity = [
        Math.max(-2.5, Math.min(2.5, (input.to[0] - input.from[0]) / dt)),
        Math.max(-2.5, Math.min(2.5, (input.to[1] - input.from[1]) / dt)),
      ];
      input.lastTime = e.timeStamp;
      input.decay = 2;
    }
    function onLeave() { input.lastTime = 0; }
    interactive.addEventListener("pointermove", onMove, { passive: true });
    interactive.addEventListener("pointerleave", onLeave, { passive: true });
    interactive.addEventListener("pointercancel", onLeave, { passive: true });

    function idleEmitters(s) {
      const t = s / 60;
      return [
        [0.5 + 0.28 * Math.sin(0.73 * t), 0.5 + 0.22 * Math.sin(1.09 * t + 0.4)],
        [0.5 + 0.26 * Math.sin(0.61 * t + Math.PI), 0.5 + 0.24 * Math.sin(0.97 * t + 2.1)],
      ];
    }

    function setInputUniforms(prog) {
      const u = prog.u;
      const active = input.decay > 0;
      if (active) lastInputStep = step;
      const time = step / 60;
      const [a, b] = idleEmitters(step);
      const since = step - lastInputStep;
      const idle = since < 90 ? 0.15 : 0.15 + 0.85 * Math.min(1, (since - 90) / 60);
      const ramp = Math.min(1, (step + 1) / 24);
      let pv = input.velocity;
      if (active && Math.hypot(pv[0], pv[1]) < 0.02) pv = [0.16 * Math.cos(time * 5), 0.16 * Math.sin(time * 5)];
      const sp = Math.hypot(pv[0], pv[1]);
      const dir = sp > 1e-4 ? [pv[0] / sp, pv[1] / sp] : [0, 0];
      gl.uniform1f(u.u_step, step);
      gl.uniform1f(u.u_pointerActive, active ? 1 : 0);
      gl.uniform2fv(u.u_from, input.from);
      gl.uniform2fv(u.u_to, input.to);
      gl.uniform2fv(u.u_pointerVelocity, pv);
      gl.uniform4f(u.u_pointerColor, 0.5 + 0.5 * dir[0], 0.5 + 0.5 * dir[1], 1, 1);
      gl.uniform4f(u.u_idleA, a[0], a[1], ramp * idle, 0.006);
      gl.uniform4f(u.u_idleB, b[0], b[1], ramp * idle, 0.0055);
    }

    function run(prog, out, size, textures, extra) {
      gl.useProgram(prog.p);
      gl.bindFramebuffer(gl.FRAMEBUFFER, out ? out.fb : null);
      gl.viewport(0, 0, size[0], size[1]);
      gl.uniform2f(prog.u.u_size, size[0], size[1]);
      if (prog.u.u_grid) gl.uniform2f(prog.u.u_grid, grid[0], grid[1]);
      let unit = 0;
      for (const name in textures) {
        gl.activeTexture(gl.TEXTURE0 + unit);
        gl.bindTexture(gl.TEXTURE_2D, textures[name].tex);
        gl.uniform1i(prog.u[name], unit++);
      }
      if (extra) extra(prog);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }

    function simulate() {
      const P = progs;
      run(P.advectVelocity, velocity.write, grid, { u_src: velocity.read }, setInputUniforms);
      velocity.swap();
      run(P.curl, curl, grid, { u_vel: velocity.read });
      run(P.vorticity, velocity.write, grid, { u_src: velocity.read, u_curl: curl });
      velocity.swap();
      run(P.divergence, divergence, grid, { u_vel: velocity.read });
      for (let i = 0; i < 3; i++) {
        run(P.pressure, pressure.write, grid, { u_src: pressure.read, u_div: divergence }, (p) => gl.uniform1f(p.u.u_decay, i === 0 ? 0.8 : 1));
        pressure.swap();
      }
      run(P.project, velocity.write, grid, { u_src: velocity.read, u_pressure: pressure.read });
      velocity.swap();
      run(P.advectDye, dye.write, dyeSize, { u_src: dye.read, u_vel: velocity.read }, (p) => {
        setInputUniforms(p);
        gl.uniform4fv(p.u.u_colorA, colorA);
        gl.uniform4fv(p.u.u_colorB, colorB);
      });
      dye.swap();
      step++;
      // consumeStep()
      input.from = input.to;
      if (input.decay > 0) {
        input.velocity = [input.velocity[0] * 0.45, input.velocity[1] * 0.45];
        input.decay--;
      }
    }

    function render() {
      run(progs.display, null, [canvas.width, canvas.height], { u_dye: dye.read }, (p) => gl.uniform3fv(p.u.u_base, base));
    }

    // --- Sizing, visibility, loop ----------------------------------------
    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      const w = Math.max(1, Math.round(canvas.clientWidth * dpr));
      const h = Math.max(1, Math.round(canvas.clientHeight * dpr));
      if (w === canvas.width && h === canvas.height && velocity) return;
      const oldAspect = canvas.width / Math.max(1, canvas.height);
      canvas.width = w;
      canvas.height = h;
      const newAspect = w / h;
      if (!velocity || Math.abs(newAspect - oldAspect) > 0.15) allocate();
    }
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    let visible = true, raf = 0, last = 0, acc = 0;
    const io = new IntersectionObserver((entries) => {
      visible = entries[0].isIntersecting;
      if (visible) start();
    });
    io.observe(canvas);
    document.addEventListener("visibilitychange", () => { if (!document.hidden) start(); });

    function frame(now) {
      raf = 0;
      if (!visible || document.hidden) return;
      if (reduce.matches) {
        // Settle into a still frame instead of animating.
        while (step < 180) simulate();
        render();
        return;
      }
      if (!last) last = now;
      acc += Math.min(0.1, (now - last) / 1000);
      last = now;
      let n = 0;
      while (acc >= 1 / 60 && n < 3) { simulate(); acc -= 1 / 60; n++; }
      if (n === 3) acc = 0;
      render();
      raf = requestAnimationFrame(frame);
    }
    function start() { if (!raf) { last = 0; raf = requestAnimationFrame(frame); } }
    reduce.addEventListener && reduce.addEventListener("change", start);
    start();
    canvas.classList.add("is-live");
    return { gl, get step() { return step; }, get grid() { return grid; }, get visible() { return visible; } };
  }

  window.createFluid = createFluid;
})();
