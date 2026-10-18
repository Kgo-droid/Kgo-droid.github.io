/* Kei's little Miyajima — day/night, deer, koto music */
(() => {
  "use strict";

  const $ = (s, el = document) => el.querySelector(s);
  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const root = document.documentElement;
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const darkMQ = matchMedia("(prefers-color-scheme: dark)");

  const store = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch { /* storage unavailable */ } },
  };

  /* ---------------- day / night ---------------- */
  const themeBtn = $("#themeBtn");
  const isDark = () => (root.dataset.theme ? root.dataset.theme === "dark" : darkMQ.matches);

  const saved = store.get("kei-theme");
  if (saved === "dark" || saved === "light") root.dataset.theme = saved;

  function syncTheme() {
    const dark = isDark();
    themeBtn.setAttribute("aria-label", dark ? "Switch to day mode" : "Switch to night mode");
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = dark ? "#08112b" : "#cfe6f2";
    music.setMood(dark);
  }
  themeBtn.addEventListener("click", () => {
    const next = isDark() ? "light" : "dark";
    root.dataset.theme = next;
    store.set("kei-theme", next);
    syncTheme();
  });
  darkMQ.addEventListener?.("change", () => { if (!root.dataset.theme) syncTheme(); });

  /* ---------------- music (Web Audio, generated live) ---------------- */
  const music = {
    ctx: null, playing: false, dark: false, timer: null,
    nextTime: 0, stepN: 0, deg: 7, phraseLeft: 0, restLeft: 4,

    build() {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      const ctx = (this.ctx = new AC());
      this.master = ctx.createGain(); this.master.gain.value = 0;
      const comp = ctx.createDynamicsCompressor();
      this.master.connect(comp).connect(ctx.destination);

      this.dry = ctx.createGain(); this.dry.gain.value = 0.8; this.dry.connect(this.master);
      this.verbIn = ctx.createGain(); this.verbIn.gain.value = 0.4;
      const verb = ctx.createConvolver();
      const len = ctx.sampleRate * 3.2, ir = ctx.createBuffer(2, len, ctx.sampleRate);
      for (let c = 0; c < 2; c++) {
        const d = ir.getChannelData(c);
        for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6);
      }
      verb.buffer = ir;
      this.verbIn.connect(verb).connect(this.master);

      // short noise buffer for the pick attack
      this.noise = ctx.createBuffer(1, ctx.sampleRate * 0.05, ctx.sampleRate);
      const nd = this.noise.getChannelData(0);
      for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;

      // the sea: looping filtered noise with a slow swell
      const sea = ctx.createBuffer(1, ctx.sampleRate * 4, ctx.sampleRate);
      const sd = sea.getChannelData(0);
      let last = 0;
      for (let i = 0; i < sd.length; i++) { last = (last + 0.04 * (Math.random() * 2 - 1)) / 1.04; sd[i] = last * 3.5; }
      const src = ctx.createBufferSource(); src.buffer = sea; src.loop = true;
      const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 520;
      this.waveGain = ctx.createGain(); this.waveGain.gain.value = 0.06;
      const lfo = ctx.createOscillator(); lfo.frequency.value = 0.075;
      const lfoAmt = ctx.createGain(); lfoAmt.gain.value = 0.045;
      lfo.connect(lfoAmt).connect(this.waveGain.gain);
      src.connect(lp).connect(this.waveGain).connect(this.master);
      src.start(); lfo.start();
      return true;
    },

    scale() {
      const base = this.dark ? 220 : 293.66; // A3 at night, D4 by day
      const steps = [0, 1, 5, 7, 8];          // in-scale (miyako-bushi)
      const out = [];
      for (const oct of [-1, 0, 1]) for (const s of steps) out.push(base * Math.pow(2, oct + s / 12));
      return out;
    },

    pluck(freq, t, vel, decay = 2.4, bend = false, dest) {
      const ctx = this.ctx;
      const env = ctx.createGain();
      env.gain.setValueAtTime(0.0001, t);
      env.gain.linearRampToValueAtTime(vel, t + 0.004);
      env.gain.exponentialRampToValueAtTime(vel * 0.32, t + 0.14);
      env.gain.exponentialRampToValueAtTime(0.0001, t + decay);

      const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.Q.value = 1.2;
      lp.frequency.setValueAtTime(Math.min(freq * 9, 8000), t);
      lp.frequency.exponentialRampToValueAtTime(Math.max(freq * 1.5, 300), t + 0.4);

      const oscs = [["triangle", 1, 1], ["sine", 2, 0.35], ["square", 3, 0.035]].map(([type, mul, g]) => {
        const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq * mul, t);
        if (bend) { o.frequency.setValueAtTime(freq * mul, t + 0.22); o.frequency.linearRampToValueAtTime(freq * mul * 1.0595, t + 0.38); }
        const gg = ctx.createGain(); gg.gain.value = g;
        o.connect(gg).connect(lp); o.start(t); o.stop(t + decay + 0.05);
        return o;
      });
      void oscs;

      const n = ctx.createBufferSource(); n.buffer = this.noise;
      const bp = ctx.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = freq * 4; bp.Q.value = 2;
      const ng = ctx.createGain(); ng.gain.setValueAtTime(vel * 0.3, t); ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.045);
      n.connect(bp).connect(ng).connect(env); n.start(t);

      lp.connect(env);
      env.connect(dest || this.dry);
      env.connect(this.verbIn);
    },

    step(t) {
      const notes = this.scale();
      const n = this.stepN++;
      // low string every bar, alternating root and fifth
      if (n % 8 === 0) this.pluck(notes[(n / 8) % 2 ? 3 : 0], t, 0.26, 3.6);

      if (this.restLeft > 0) { this.restLeft--; return; }
      if (this.phraseLeft <= 0) {
        this.phraseLeft = 5 + Math.floor(Math.random() * 6);
        this.restLeft = (this.dark ? 4 : 2) + Math.floor(Math.random() * 4);
        return;
      }
      const chance = (n % 2 === 0 ? 0.82 : 0.38) * (this.dark ? 0.75 : 1);
      if (Math.random() > chance) return;

      const moves = [-2, -1, -1, 1, 1, 2, -3, 3];
      let d = this.deg + pick(moves);
      if (d < 4) d = 4 + (4 - d);
      if (d > 13) d = 13 - (d - 13);
      this.deg = d;
      const vel = rand(0.16, 0.3) * (this.dark ? 0.85 : 1);
      this.pluck(notes[d], t, vel, this.dark ? 3 : 2.3, Math.random() < 0.12);
      if (Math.random() < 0.14) this.pluck(notes[Math.max(0, d - 2)], t + 0.02, vel * 0.6, 2);
      this.phraseLeft--;
    },

    tick() {
      if (!this.playing) return;
      const ctx = this.ctx;
      const eighth = 60 / (this.dark ? 56 : 74) / 2;
      if (this.nextTime < ctx.currentTime) this.nextTime = ctx.currentTime + 0.05;
      while (this.nextTime < ctx.currentTime + 0.3) {
        this.step(this.nextTime);
        this.nextTime += eighth * (this.stepN % 2 ? 1.12 : 0.88); // a little lilt
      }
    },

    async start() {
      if (!this.ctx && !this.build()) return false;
      await this.ctx.resume();
      this.playing = true;
      this.setMood(isDark());
      const g = this.master.gain, now = this.ctx.currentTime;
      g.cancelScheduledValues(now); g.setValueAtTime(g.value, now); g.linearRampToValueAtTime(0.9, now + 1.2);
      this.nextTime = now + 0.1;
      clearInterval(this.timer);
      this.timer = setInterval(() => this.tick(), 80);
      return true;
    },

    stop() {
      this.playing = false;
      clearInterval(this.timer);
      if (!this.ctx) return;
      const g = this.master.gain, now = this.ctx.currentTime;
      g.cancelScheduledValues(now); g.setValueAtTime(g.value, now); g.linearRampToValueAtTime(0, now + 0.5);
      setTimeout(() => { if (!this.playing) this.ctx.suspend(); }, 650);
    },

    setMood(dark) {
      this.dark = dark;
      if (!this.ctx) return;
      const now = this.ctx.currentTime;
      this.waveGain.gain.setTargetAtTime(dark ? 0.04 : 0.06, now, 0.8);
      this.verbIn.gain.setTargetAtTime(dark ? 0.55 : 0.38, now, 0.8);
    },

    chirp() {
      if (!this.playing) return;
      const ctx = this.ctx, t = ctx.currentTime;
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.setValueAtTime(1300, t); o.frequency.exponentialRampToValueAtTime(2100, t + 0.12);
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.07, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
      o.connect(g).connect(this.dry); g.connect(this.verbIn); o.start(t); o.stop(t + 0.25);
    },

    blip() {
      if (!this.playing) return;
      const notes = this.scale(), t = this.ctx.currentTime;
      this.pluck(notes[10], t, 0.22, 1.4);
      this.pluck(notes[12], t + 0.11, 0.2, 1.6);
    },
  };

  const soundBtn = $("#soundBtn"), hint = $("#musicHint");
  soundBtn.addEventListener("click", async () => {
    hint.classList.add("gone");
    if (music.playing) {
      music.stop();
      soundBtn.setAttribute("aria-pressed", "false");
      soundBtn.setAttribute("aria-label", "Play music");
    } else {
      const ok = await music.start();
      if (!ok) { hint.textContent = "audio isn’t supported here"; hint.classList.remove("gone"); return; }
      soundBtn.setAttribute("aria-pressed", "true");
      soundBtn.setAttribute("aria-label", "Pause music");
    }
  });
  document.addEventListener("visibilitychange", () => {
    if (!music.ctx || !music.playing) return;
    document.hidden ? music.ctx.suspend() : music.ctx.resume();
  });

  syncTheme();

  /* ---------------- sky: stars, birds, shooting stars ---------------- */
  const stars = $("#stars");
  for (let i = 0; i < 70; i++) {
    const s = document.createElement("i");
    s.className = "star";
    const size = Math.random() < 0.15 ? 3 : 2;
    s.style.cssText = `left:${rand(0, 100)}%;top:${rand(0, 100)}%;width:${size}px;height:${size}px;animation-delay:${rand(0, 3)}s;animation-duration:${rand(2, 4.5)}s`;
    stars.appendChild(s);
  }

  const birds = $("#birds");
  function spawnBirds() {
    if (!document.hidden && !isDark() && !reduced) {
      const count = 1 + Math.floor(Math.random() * 3), top = rand(8, 30), t = rand(24, 34);
      for (let i = 0; i < count; i++) {
        const b = document.createElement("div");
        b.className = "bird";
        b.style.cssText = `top:${top + i * 2.2}%;--t:${t}s;--rise:${rand(-60, 20)}px;animation-delay:${i * 0.5}s;width:${rand(24, 36)}px`;
        b.innerHTML = '<svg viewBox="0 0 40 16"><path d="M2 12 Q11 2 20 11 Q29 2 38 12"/></svg>';
        b.addEventListener("animationend", () => b.remove());
        birds.appendChild(b);
      }
    }
    setTimeout(spawnBirds, rand(10000, 20000));
  }
  setTimeout(spawnBirds, 2500);

  const shooting = $("#shooting");
  function shootStar() {
    if (!document.hidden && isDark() && !reduced) {
      const s = document.createElement("div");
      s.className = "shoot";
      s.style.cssText = `left:${rand(5, 60)}%;top:${rand(4, 28)}%`;
      s.addEventListener("animationend", () => s.remove());
      shooting.appendChild(s);
    }
    setTimeout(shootStar, rand(6000, 14000));
  }
  setTimeout(shootStar, 4000);

  /* ---------------- falling momiji ---------------- */
  if (!reduced) {
    const leaves = $("#leaves");
    const count = innerWidth < 640 ? 8 : 15;
    const colors = ["var(--leaf-1)", "var(--leaf-2)", "var(--leaf-3)"];
    for (let i = 0; i < count; i++) {
      const l = document.createElement("div");
      l.className = "leaf";
      const t = rand(12, 22);
      l.style.cssText = `left:${rand(-5, 100)}%;--s:${rand(16, 30)}px;--t:${t}s;--d:${-rand(0, t)}s;--drift:${rand(-120, 160)}px;--spin:${rand(-540, 540)}deg;--sw:${rand(2.2, 4)}s;--c:${pick(colors)}`;
      l.innerHTML = '<svg viewBox="10 6 80 70"><use href="#leaf-shape"/></svg>';
      leaves.appendChild(l);
    }
  }

  /* ---------------- sea: glints + jumping fish ---------------- */
  const sea = $("#sea"), glints = $("#glints"), fishLayer = $("#fishLayer");
  for (let i = 0; i < 16; i++) {
    const g = document.createElement("i");
    g.className = "glint";
    g.style.cssText = `left:${rand(2, 95)}%;top:${rand(0, 85)}%;width:${rand(10, 28)}px;animation-delay:${rand(0, 5)}s;animation-duration:${rand(4, 7)}s`;
    glints.appendChild(g);
  }

  const FISH = '<svg viewBox="0 0 40 20"><path d="M38 10 Q28 1 14 6 L4 1 L7 10 L4 19 L14 14 Q28 19 38 10Z" fill="#d6dfe7" stroke="var(--line)" stroke-width="2" stroke-linejoin="round"/><circle cx="31" cy="8.5" r="1.7" fill="var(--line)"/></svg>';
  function ripple(x, y) {
    const r = document.createElement("i");
    r.className = "ripple";
    r.style.left = x + "px"; r.style.top = y + "px";
    r.addEventListener("animationend", () => r.remove());
    fishLayer.appendChild(r);
  }
  function jumpFish(x, y) {
    const rect = sea.getBoundingClientRect();
    if (x == null) { x = rand(0.12, 0.85) * rect.width; y = rand(0.25, 0.7) * rect.height; }
    const dir = x > rect.width * 0.6 ? -1 : (x < rect.width * 0.3 ? 1 : pick([1, -1]));
    const f = document.createElement("div");
    f.className = "fish";
    f.style.cssText = `left:${x}px;top:${y - 10}px;--dir:${dir}`;
    f.innerHTML = FISH;
    f.addEventListener("animationend", () => f.remove());
    fishLayer.appendChild(f);
    ripple(x, y);
    setTimeout(() => ripple(x + dir * 68, y), reduced ? 0 : 1150);
  }
  sea.addEventListener("click", (e) => {
    const rect = sea.getBoundingClientRect();
    jumpFish(e.clientX - rect.left, e.clientY - rect.top);
  });
  function autoFish() {
    if (!document.hidden && !reduced) jumpFish();
    setTimeout(autoFish, rand(6000, 11000));
  }
  setTimeout(autoFish, 3000);

  /* ---------------- deer ---------------- */
  const beach = $("#beach"), herd = $("#herd");
  const deerTemplate = document.getElementById("deer-shape");
  const SAYINGS = ["ぺこり", "hi!", "せんべい?", "shika!", "ぴぃ"];
  const deer = [];
  const senbei = [];

  function makeDeer(opts) {
    const el = document.createElement("div");
    el.className = "deer " + (opts.buck ? "buck" : "doe");
    el.setAttribute("aria-hidden", "true");
    const flip = document.createElement("div");
    flip.className = "flip";
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "-4 -8 124 108");
    const g = deerTemplate.cloneNode(true);
    g.removeAttribute("id");
    svg.appendChild(g);
    flip.appendChild(svg);
    el.appendChild(flip);
    herd.appendChild(el);

    const d = {
      el, x: 0, y: opts.y, dir: Math.random() < 0.5 ? 1 : -1, speed: rand(26, 38) * opts.scale,
      scale: opts.scale, state: "idle", timer: rand(0.5, 3), target: null, w: 0,
    };
    el.addEventListener("click", (e) => {
      e.stopPropagation();
      if (d.state === "eat" || d.state === "bow") return;
      setState(d, "bow", 1.3);
      say(d, pick(SAYINGS));
      music.chirp();
    });
    deer.push(d);
    return d;
  }

  function setState(d, state, timer) {
    d.state = state; d.timer = timer;
    d.el.classList.toggle("walking", state === "walk" || state === "seek");
    d.el.classList.toggle("grazing", state === "idle" && !reduced);
    d.el.classList.toggle("bowing", state === "bow");
    d.el.classList.toggle("eating", state === "eat");
  }

  function say(d, text) {
    d.el.querySelector(".say")?.remove();
    const b = document.createElement("span");
    b.className = "say";
    b.textContent = text;
    d.el.appendChild(b);
    setTimeout(() => b.remove(), 1600);
  }

  function heart(d) {
    const h = document.createElement("span");
    h.className = "heart";
    h.textContent = "♥";
    h.addEventListener("animationend", () => h.remove());
    d.el.appendChild(h);
  }

  function layout() {
    const bh = beach.clientHeight, W = beach.clientWidth;
    for (const d of deer) {
      d.w = Math.round(bh * 0.86 * d.scale);
      d.el.style.setProperty("--w", d.w + "px");
      d.x = Math.min(Math.max(d.x, 0), Math.max(0, W - d.w));
    }
  }

  const narrow = innerWidth < 640;
  const herdSpec = narrow
    ? [{ y: 10, scale: 1, buck: true }, { y: 30, scale: 0.82 }]
    : [{ y: 8, scale: 1, buck: true }, { y: 24, scale: 0.88 }, { y: 36, scale: 0.78 }];
  herdSpec.forEach((s) => makeDeer(s));
  layout();
  deer.forEach((d, i) => {
    const W = beach.clientWidth;
    d.x = rand(0.2, 0.85) * Math.max(0, W - d.w);
    if (i === 0) d.x = W * 0.55;
    setState(d, "idle", rand(0.5, 3));
  });
  addEventListener("resize", layout);

  // feed the deer
  beach.addEventListener("click", (e) => {
    if (e.target.closest(".deer")) return;
    if (senbei.length >= 4) return;
    const rect = beach.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = Math.min(42, Math.max(5, ((rect.bottom - e.clientY) / rect.height) * 100 - 6));
    const el = document.createElement("i");
    el.className = "senbei";
    el.style.left = x + "px";
    el.style.setProperty("--y", y + "%");
    herd.appendChild(el);
    const s = { el, x, y, taken: null };
    senbei.push(s);
    // nearest free deer goes for it
    let best = null, bestDist = Infinity;
    for (const d of deer) {
      if (d.target || d.state === "eat") continue;
      const dist = Math.abs(d.x + d.w / 2 - x) + Math.abs(d.y - y) * 4;
      if (dist < bestDist) { best = d; bestDist = dist; }
    }
    if (best) { best.target = s; s.taken = best; setState(best, "seek", 0); }
  });

  function assignWaiting() {
    for (const s of senbei) {
      if (s.taken) continue;
      const d = deer.find((dd) => !dd.target && dd.state !== "eat");
      if (d) { d.target = s; s.taken = d; setState(d, "seek", 0); }
    }
  }

  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const W = beach.clientWidth;
    for (const d of deer) {
      const maxX = Math.max(0, W - d.w);
      switch (d.state) {
        case "walk":
          d.x += d.dir * d.speed * dt;
          if (d.x <= 0) { d.x = 0; d.dir = 1; }
          if (d.x >= maxX) { d.x = maxX; d.dir = -1; }
          if ((d.timer -= dt) <= 0) setState(d, "idle", rand(2.5, 6));
          break;
        case "idle":
          if ((d.timer -= dt) <= 0 && !reduced) {
            if (Math.random() < 0.45) d.dir *= -1;
            setState(d, "walk", rand(3, 8));
          }
          break;
        case "bow":
          if ((d.timer -= dt) <= 0) setState(d, d.target ? "seek" : "idle", rand(1.5, 4));
          break;
        case "seek": {
          const s = d.target;
          if (!s) { setState(d, "idle", 1); break; }
          const mouth = d.dir === 1 ? d.x + d.w * 0.93 : d.x + d.w * 0.07;
          const dx = s.x - mouth;
          if (Math.abs(dx) > 4) d.dir = dx > 0 ? 1 : -1;
          const step = d.speed * 2.2 * dt;
          d.x += Math.sign(dx) * Math.min(Math.abs(dx), step);
          d.x = Math.min(Math.max(d.x, -d.w * 0.1), maxX + d.w * 0.1);
          d.y += Math.sign(s.y - d.y) * Math.min(Math.abs(s.y - d.y), 12 * dt);
          if (Math.abs(dx) < 5 && Math.abs(s.y - d.y) < 1.5) setState(d, "eat", 1.6);
          break;
        }
        case "eat":
          if ((d.timer -= dt) <= 0) {
            const s = d.target;
            if (s) { s.el.remove(); senbei.splice(senbei.indexOf(s), 1); }
            d.target = null;
            heart(d);
            setState(d, "idle", rand(2, 4));
            assignWaiting();
          }
          break;
      }
      d.el.style.transform = `translateX(${d.x.toFixed(1)}px)`;
      d.el.style.setProperty("--y", d.y.toFixed(2) + "%");
      d.el.style.setProperty("--dir", d.dir);
      d.el.style.zIndex = String(100 - Math.round(d.y));
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  /* ---------------- momiji manju mascot ---------------- */
  const mascot = $("#mascot"), mBubble = $("#mascotBubble");
  const LINES = ["もみじ饅頭!", "hi hi!", "feed the deer ↓", "tap the sea too", "try night mode ☾"];
  let lineN = 0, bubbleTimer;
  mascot.addEventListener("click", () => {
    mascot.classList.remove("hop");
    void mascot.offsetWidth;
    mascot.classList.add("hop");
    mBubble.textContent = isDark() && lineN === 0 ? "zzz… oh, hi!" : LINES[lineN % LINES.length];
    lineN++;
    mBubble.hidden = false;
    clearTimeout(bubbleTimer);
    bubbleTimer = setTimeout(() => (mBubble.hidden = true), 1900);
    music.blip();
  });
  mascot.addEventListener("animationend", (e) => { if (e.animationName === "hop") mascot.classList.remove("hop"); });

  /* ---------------- windows ---------------- */
  const pop = $("#pop"), popTitle = $("#popTitle"), popBody = $("#popBody"), popClose = $("#popClose");
  const PANELS = ["about", "links", "work", "faq", "contact"];
  let opener = null;

  function openPanel(name, from) {
    if (!PANELS.includes(name)) return;
    opener = from || null;
    popTitle.textContent = name;
    pop.querySelectorAll(".panel").forEach((p) => p.classList.toggle("active", p.dataset.panel === name));
    pop.hidden = false;
    pop.style.animation = "none"; void pop.offsetWidth; pop.style.animation = "";
    popBody.scrollTop = 0;
    popBody.focus({ preventScroll: true });
    try { history.replaceState(null, "", "#" + name); } catch { /* ignore */ }
    if (name === "work") loadRepos();
  }
  function closePanel() {
    if (pop.hidden) return;
    pop.hidden = true;
    try { history.replaceState(null, "", location.pathname + location.search); } catch { /* ignore */ }
    opener?.focus({ preventScroll: true });
  }
  document.querySelectorAll("[data-open]").forEach((b) => b.addEventListener("click", () => openPanel(b.dataset.open, b)));
  popClose.addEventListener("click", closePanel);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closePanel(); });
  const start = location.hash.slice(1);
  if (PANELS.includes(start)) openPanel(start);

  /* ---------------- GitHub projects ---------------- */
  let reposLoaded = false;
  async function loadRepos() {
    if (reposLoaded) return;
    reposLoaded = true;
    const list = $("#repos");
    try {
      const res = await fetch("https://api.github.com/users/Kgo-droid/repos?per_page=50&sort=pushed");
      if (!res.ok) throw new Error(res.status);
      const repos = (await res.json())
        .filter((r) => !r.fork)
        .sort((a, b) => new Date(b.pushed_at) - new Date(a.pushed_at));
      list.textContent = "";
      if (!repos.length) throw new Error("empty");
      for (const r of repos) {
        const li = document.createElement("li");
        const a = document.createElement("a");
        a.href = r.homepage || r.html_url;
        a.target = "_blank"; a.rel = "noopener";
        const left = document.createElement("span");
        const name = document.createElement("span"); name.className = "repo-name"; name.textContent = r.name;
        const desc = document.createElement("span"); desc.className = "repo-desc"; desc.textContent = r.description || "no description yet";
        left.append(name, desc);
        const meta = document.createElement("span"); meta.className = "repo-meta";
        const when = new Date(r.pushed_at).toLocaleDateString("en", { month: "short", year: "numeric" });
        if (r.language) { const dot = document.createElement("i"); meta.append(dot, r.language, document.createElement("br")); }
        meta.append(when);
        a.append(left, meta);
        li.appendChild(a);
        list.appendChild(li);
      }
    } catch {
      reposLoaded = false;
      list.innerHTML = '<li class="repo-error">Couldn’t reach GitHub just now. Open the link below to see every project.</li>';
    }
  }

  /* ---------------- copy email ---------------- */
  const copyBtn = $("#copyMail"), mailAddr = $("#mailAddr");
  copyBtn.addEventListener("click", () => {
    const text = mailAddr.textContent.trim();
    const done = (msg) => { copyBtn.textContent = msg; setTimeout(() => (copyBtn.textContent = "Copy email"), 2200); };
    const fallback = () => {
      const range = document.createRange(); range.selectNodeContents(mailAddr);
      const sel = getSelection(); sel.removeAllRanges(); sel.addRange(range);
      done("Selected: press Ctrl/⌘ + C");
    };
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(text).then(() => done("Copied"), fallback);
    else fallback();
  });
})();
