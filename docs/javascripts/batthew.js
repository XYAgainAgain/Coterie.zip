(function () {
  'use strict';

  window.Coterie = window.Coterie || {};
  window.Coterie.batthew = window.Coterie.batthew || {};

  /* On SPA re-execution: re-attach bat if Zensical removed it during content swap.
     MutationObserver catches ALL removal methods (some nav types skip document$). */
  if (window.Coterie.batthew._init) {
    if (!window.Coterie.batthew._reattach) {
      window.Coterie.batthew._reattach = true;
      new MutationObserver(function () {
        const bat = window.Coterie.batthew.el;
        if (bat && !bat.parentNode) document.body.appendChild(bat);
      }).observe(document.body, { childList: true });
    }
    return;
  }
  window.Coterie.batthew._init = true;

  // Sprite dimensions and rendering
  const SPRITE = { W: 40, H: 42, SCALE: 2 };
  const DISPLAY = { DW: SPRITE.W * SPRITE.SCALE, DH: SPRITE.H * SPRITE.SCALE };

  // Animation timing and playback
  const TIMING = {
    FRAME_MS: 83,
    REF_DT: 16.67,
    DEATH_FADE_MS: 1000,
    DISMISS_COOLDOWN: 3000,
    LEAVE_GRACE_MS: 200,
    GRAB3_SETTLE_MS: 1000,
    WANDER_COOLDOWN: 2000,
    AUTO_ROOST_MIN: 20000,
    AUTO_ROOST_MAX: 40000,
    DASH_COOLDOWN: 5000,
    TIER_DECAY_MS: 300000,
    FEED_TIME_MIN: 7000,
    FEED_TIME_MAX: 13000,
    RESPAWN_QUICK: 5000,
    RESPAWN_LONG: [15000, 30000],
    CURIOUS_RANGE: [8000, 10000]
  };

  // Spatial thresholds
  const DISTANCE = {
    FLIP_HYSTERESIS: 8,
    NEAR_ROOST: [150, 200, 250],
    GRAB_RADIUS: 12,
    GRAB_DIST_BREAK: 80,
    DASH_DIST: 350
  };

  // Movement interpolation and speed
  const MOVEMENT = {
    LERP_FLY: [0.008, 0.015, 0.04],
    GRAB_LERP: 0.3,
    GRAB3_LERP: 0.5,
    SPEED_SMOOTH: 0.3,
    GRAB_BREAK: 6
  };

  // Jitter (flight wobble)
  const JITTER = {
    AMP: [30, 20, 10],
    HOVER_MULT: 5
  };

  // Behavioral timers (per-tier arrays indexed by tier 0/1/2)
  const BEHAVIOR = {
    GRAB_IDLE_MS: [Infinity, 3000, 1500],
    BORED_MS: [Infinity, 12000, Infinity],
    MAX_LIVES: 3
  };

  const BASE = '/assets/images/batthew/';

  const ANIM_NAMES = [
    'idle1', 'idle2', 'appearance', 'move1', 'move2',
    'turnaround', 'dash', 'grab1', 'grab2', 'grab3',
    'hit', 'death1', 'death2'
  ];

  const CFG = {
    idle1:      { loop: true,  interrupt: true  },
    idle2:      { loop: false, interrupt: true  },
    appearance: { loop: false, interrupt: false },
    move1:      { loop: true,  interrupt: true  },
    move2:      { loop: true,  interrupt: true  },
    turnaround: { loop: false, interrupt: false },
    dash:       { loop: true,  interrupt: true  },
    grab1:      { loop: false, interrupt: false },
    grab2:      { loop: true,  interrupt: true  },
    grab3:      { loop: true,  interrupt: true  },
    hit:        { loop: false, interrupt: false },
    death1:     { loop: false, interrupt: false },
    death2:     { loop: false, interrupt: false }
  };

  let el, cvs, ctx;
  const sheets = {};
  let theme, anim, frame;
  let animAccum = 0;
  let animDone = false;
  let animReverse = false;
  let lastTime = 0;
  let facingLeft = false;
  let pendingFlip = false;

  let px, py;
  let jx = 0, jy = 0;
  let prevPx = 0, prevPy = 0;
  let tx = -1, ty = -1;
  let mx = -1, my = -1;
  let pmx = -1, pmy = -1;
  let cSpeed = 0;
  let lastMove = 0;
  let hasCursor = false;

  let lives, deaths, tier, timesDisturbed;
  let state;
  let enabled = true;
  let dismissing = false;
  let wantCurious = false;
  let echoChance = false;
  let echoFlyTid = null;
  let digestUntil = 0;
  let fading = false;
  let lastDismiss = 0;
  let feedStart = 0;
  let feedTime = 10000;
  let boredStart = 0;
  let lastWander = 0;
  let lastDashEnd = 0;
  let leaveTid = null;
  let tierDecayTid = null;
  let respawnTid = null;
  let curiousTid = null;
  let autoRoostTid = null;
  let roosts = [];
  let roostIdx = 0;
  let firstRoost = true;
  let reduced = false;

  // RAF loop state
  let rafId = null;

  // Re-execution guard
  let _eventsBound = false;
  let _themeWatching = false;

  function getTheme() {
    const s = document.body.getAttribute('data-md-color-scheme');
    if (s === 'slate') return 'night';
    if (s === 'abyss') return 'abyss';
    return 'sunset';
  }

  function preload(t, cb) {
    if (!sheets[t]) sheets[t] = {};
    let n = ANIM_NAMES.length;
    ANIM_NAMES.forEach(function (name) {
      if (sheets[t][name]) { if (--n === 0) cb(); return; }
      const img = new Image();
      img.onload = function () { sheets[t][name] = img; if (--n === 0) cb(); };
      img.onerror = function () { if (--n === 0) cb(); };
      img.src = BASE + t + '/' + name + '.webp';
    });
  }

  function frameCount(name) {
    const img = sheets[theme] && sheets[theme][name];
    return img ? Math.floor(img.naturalWidth / SPRITE.W) : 1;
  }

  function createDOM() {
    el = document.createElement('div');
    el.id = 'batthew';
    el.setAttribute('aria-hidden', 'true');

    cvs = document.createElement('canvas');
    const dpr = window.devicePixelRatio || 1;
    cvs.width = DISPLAY.DW * dpr;
    cvs.height = DISPLAY.DH * dpr;
    cvs.style.width = DISPLAY.DW + 'px';
    cvs.style.height = DISPLAY.DH + 'px';

    ctx = cvs.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.scale(dpr * SPRITE.SCALE, dpr * SPRITE.SCALE);

    el.appendChild(cvs);
    document.body.appendChild(el);
    window.Coterie.batthew.el = el;
  }

  function render() {
    if (fading) return;
    const img = sheets[theme] && sheets[theme][anim];
    if (!img) return;
    ctx.clearRect(0, 0, SPRITE.W, SPRITE.H);
    if (facingLeft) {
      ctx.save();
      ctx.scale(-1, 1);
      ctx.drawImage(img, frame * SPRITE.W, 0, SPRITE.W, SPRITE.H, -SPRITE.W, 0, SPRITE.W, SPRITE.H);
      ctx.restore();
    } else {
      ctx.drawImage(img, frame * SPRITE.W, 0, SPRITE.W, SPRITE.H, 0, 0, SPRITE.W, SPRITE.H);
    }
  }

  function setAnim(name, reverse) {
    if (anim === name && !reverse) { animReverse = false; return; }
    /* Shared first frames, swap seamlessly without resetting */
    let pair = (anim === 'move1' || anim === 'move2') && (name === 'move1' || name === 'move2');
    if (!pair) pair = (anim === 'idle1' || anim === 'idle2') && (name === 'idle1' || name === 'idle2');
    if (pair && frame <= 1 && !reverse) {
      anim = name;
      return;
    }
    anim = name;
    animReverse = !!reverse;
    frame = animReverse ? frameCount(name) - 1 : 0;
    animAccum = 0;
    animDone = false;
  }

  function stepAnim(dt) {
    if (animDone) return;
    animAccum += dt;
    while (animAccum >= TIMING.FRAME_MS) {
      animAccum -= TIMING.FRAME_MS;
      const total = frameCount(anim);
      if (animReverse) {
        frame--;
        if (frame <= 0) {
          frame = 0;
          animDone = true;
          onAnimEnd();
          return;
        }
        continue;
      }
      frame++;
      if (frame >= total) {
        if (CFG[anim].loop) {
          frame = 0;
        } else {
          frame = total - 1;
          animDone = true;
          onAnimEnd();
          return;
        }
      }
    }
  }

  function onAnimEnd() {
    switch (anim) {
      case 'appearance':
        if (state === 'FLYOFF_WARMUP') {
          setAnim('move2');
          setTimeout(function() {
            if (state === 'FLYOFF_WARMUP') {
              state = 'FLYOFF';
              setAnim('dash');
            }
          }, 400);
          break;
        }
        if (state === 'LANDING') {
          enter('ROOSTING');
          break;
        }
        enter('ROOSTING');
        break;
      case 'idle2':
        setAnim('idle1');
        state = 'ROOSTING';
        scheduleCurious();
        break;
      case 'turnaround':
        facingLeft = pendingFlip;
        setAnim('move1');
        break;
      case 'grab1':
        setAnim('grab2');
        feedStart = Date.now();
        feedTime = TIMING.FEED_TIME_MIN + Math.random() * (TIMING.FEED_TIME_MAX - TIMING.FEED_TIME_MIN);
        startFeedingDrip();
        break;
      case 'hit':
        lives--;
        enter(lives > 0 ? 'FLYING' : 'DYING');
        break;
      case 'death1':
      case 'death2':
        /* Reversed death1 = spawn-in, then fly to roost */
        if (animReverse) { flyToRoost(); break; }
        if (dismissing) { hideBat(); break; }
        fading = true;
        el.style.transition = 'opacity ' + TIMING.DEATH_FADE_MS + 'ms ease-out';
        el.style.opacity = '0';
        setTimeout(function () {
          el.style.transition = '';
          ctx.clearRect(0, 0, SPRITE.W, SPRITE.H);
          enter('DEAD');
        }, TIMING.DEATH_FADE_MS);
        break;
    }
  }

  function enter(s) {
    state = s;
    wantCurious = false;
    clearTimeout(curiousTid);
    clearTimeout(autoRoostTid);
    clearTimeout(tierDecayTid);
    clearTimeout(echoFlyTid);

    switch (s) {
      case 'SPAWNING':
        cvs.style.pointerEvents = '';
        fading = false;
        el.style.opacity = '1';
        /* Spawn along bottom edge; reversed death1 looks like ground-based materialization */
        px = DISPLAY.DW + Math.random() * (window.innerWidth - DISPLAY.DW * 3);
        py = window.innerHeight - DISPLAY.DH;
        clampAndTransform();
        setAnim('death1', true);
        break;
      case 'ROOSTING':
        setAnim('idle1');
        scheduleCurious();
        if (tier > 0) {
          tierDecayTid = setTimeout(function () {
            if (state === 'ROOSTING' || state === 'CURIOUS') {
              tier = Math.max(0, tier - 1);
              timesDisturbed = Math.max(0, timesDisturbed - 1);
            }
          }, TIMING.TIER_DECAY_MS);
        }
        break;
      case 'CURIOUS':
        setAnim('idle2');
        echoChance = Date.now() >= digestUntil && Math.random() < 0.75;
        break;
      case 'FLYING':
        setAnim('move1');
        boredStart = performance.now();
        scheduleEchoFly();
        if (Date.now() < digestUntil) {
          pickWanderTarget();
          clearTimeout(autoRoostTid);
          autoRoostTid = setTimeout(function () {
            if (state !== 'FLYING') return;
            flyToRoost();
          }, 2000 + Math.random() * 1000);
          break;
        }
        if (tier === 0) {
          pickWanderTarget();
          clearTimeout(autoRoostTid);
          autoRoostTid = setTimeout(function () {
            if (state !== 'FLYING' || tier !== 0) return;
            flyToRoost();
          }, 3000 + Math.random() * 4000);
        }
        break;
      case 'GRABBING':
        stopAllDrips();
        setAnim('grab1');
        if (window.__kdrIncrement) window.__kdrIncrement('bites');
        biteSplash();
        break;
      case 'HIT':
        stopAllDrips();
        setAnim('hit');
        tier = Math.min(2, tier + 1);
        timesDisturbed = Math.max(timesDisturbed, tier);
        break;
      case 'DYING':
        stopAllDrips();
        deaths++;
        if (window.__kdrIncrement) window.__kdrIncrement('deaths');
        setAnim(deaths >= 3 ? 'death1' : 'death2');
        break;
      case 'DEAD': {
        cvs.style.pointerEvents = 'none';
        clearTimeout(respawnTid);
        const delay = deaths >= 3
          ? TIMING.RESPAWN_LONG[0] + Math.random() * (TIMING.RESPAWN_LONG[1] - TIMING.RESPAWN_LONG[0])
          : TIMING.RESPAWN_QUICK;
        respawnTid = setTimeout(function () { enter('RESPAWNING'); }, delay);
        break;
      }
      case 'RESPAWNING':
        if (deaths >= 3) { deaths = 0; tier = 0; timesDisturbed = 0; }
        lives = BEHAVIOR.MAX_LIVES;
        pickRoost();
        enter('SPAWNING');
        break;
    }
  }

  function scheduleCurious() {
    clearTimeout(curiousTid);
    const d = TIMING.CURIOUS_RANGE[0] + Math.random() * (TIMING.CURIOUS_RANGE[1] - TIMING.CURIOUS_RANGE[0]);
    curiousTid = setTimeout(function () {
      if (state === 'ROOSTING') wantCurious = true;
    }, d);
  }

  function pickWanderTarget() {
    lastWander = performance.now();
    for (let i = 0; i < 10; i++) {
      const x = DISPLAY.DW + Math.random() * (window.innerWidth - DISPLAY.DW * 3);
      const y = DISPLAY.DH + Math.random() * (window.innerHeight - DISPLAY.DH * 3);
      const d = Math.sqrt((x - mx) * (x - mx) + (y - my) * (y - my));
      if (d > 200 || i === 9) { tx = x; ty = y; return; }
    }
  }

  /* Sine jitter for natural flight wobble: two overlapping waves per axis.
     Amplifies when cursor is still (bats can't hover, they flutter harder). */
  function jitter(now, amp) {
    const t = now * 0.001;
    let mult = (cSpeed < 2) ? JITTER.HOVER_MULT : 1;
    if (tier === 0 && state === 'FLYING') {
      const cd = Math.sqrt((mx - px) * (mx - px) + (my - py) * (my - py));
      if (cd < 200) mult *= 1 + (200 - cd) / 100;
    }
    const a = amp * mult;
    return {
      x: (Math.sin(t * 2.3) + Math.sin(t * 3.7) * 0.6) * a,
      y: (Math.cos(t * 1.9) + Math.cos(t * 4.1) * 0.5) * a
    };
  }

  function moveLerp(targetX, targetY, lerp, dt) {
    const f = 1 - Math.pow(1 - lerp, dt / TIMING.REF_DT);
    px += (targetX - px) * f;
    py += (targetY - py) * f;
  }

  function updatePos(dt, now) {
    if (state === 'FLYOFF' || state === 'FLYIN' || state === 'FLYOFF_WARMUP') jx = jy = 0;

    if (state === 'FLYOFF_WARMUP') {
      moveLerp(tx, ty, 0.008, dt);
      clampAndTransform();
      return;
    }

    if (state === 'FLYOFF') {
      moveLerp(tx, ty, 0.03, dt);
      clampAndTransform();
      if (px < -DISPLAY.DW || px > window.innerWidth + DISPLAY.DW ||
          py < -DISPLAY.DH || py > window.innerHeight + DISPLAY.DH) hideBat();
      return;
    }

    if (state === 'FLYIN') {
      const dx = tx - px, dy = ty - py;
      const dist = Math.sqrt(dx * dx + dy * dy);
      moveLerp(tx, ty, 0.008, dt);
      clampAndTransform();
      if (dist < 40) {
        const r = roosts[roostIdx];
        const headingToRoost = Math.abs(tx - r.x) < 10 && Math.abs(ty - r.y) < 10;
        if (headingToRoost) {
          px = r.x; py = r.y; jx = jy = 0; clampAndTransform();
          state = 'LANDING';
          setAnim('appearance', true);
        } else {
          enter('FLYING');
          pickWanderTarget();
          clearTimeout(autoRoostTid);
          autoRoostTid = setTimeout(function() {
            if (state !== 'FLYING' || tier !== 0) return;
            flyToRoost();
          }, 3000 + Math.random() * 4000);
        }
      }
      return;
    }

    const frozen = state === 'ROOSTING' || state === 'CURIOUS' || state === 'DEAD' ||
                 state === 'DYING' || state === 'SPAWNING' || state === 'HIT' ||
                 state === 'LANDING';
    if (frozen) return;

    /* Jitter is visual only, smoothed via lerp so it drifts not teleports.
       px/py stay clean for grab detection. */
    const j = jitter(now, JITTER.AMP[tier]);
    if (state === 'GRABBING') { jx = jy = 0; }
    else {
      const jf = 1 - Math.pow(1 - 0.03, dt / TIMING.REF_DT);
      jx += (j.x - jx) * jf;
      jy += (j.y - jy) * jf;
    }

    if (tier === 0 && state === 'FLYING') {
      const dx = tx - px, dy = ty - py;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < 40) {
        const r = roosts[roostIdx];
        const atRoost = Math.abs(tx - r.x) < 10 && Math.abs(ty - r.y) < 10;
        if (atRoost) {
          px = r.x; py = r.y; jx = jy = 0; clampAndTransform();
          state = 'LANDING';
          setAnim('appearance', true);
          return;
        }
        pickWanderTarget();
      }

      const curDist = Math.sqrt((mx - px) * (mx - px) + (my - py) * (my - py));
      if (curDist < 80) {
        pickWanderTarget();
        clearTimeout(autoRoostTid);
        autoRoostTid = setTimeout(function () {
          if (state !== 'FLYING' || tier !== 0) return;
          flyToRoost();
        }, 3000 + Math.random() * 4000);
      } else if (curDist < 150 && now - lastWander > TIMING.WANDER_COOLDOWN) {
        pickWanderTarget();
      }

      moveLerp(tx, ty, MOVEMENT.LERP_FLY[0], dt);
      clampAndTransform();
      return;
    }

    if (state === 'FLYING') {
      if (!hasCursor) {
        const distToTarget = Math.sqrt((tx - px) * (tx - px) + (ty - py) * (ty - py));
        if (distToTarget < 40 && now - lastWander > TIMING.WANDER_COOLDOWN) pickWanderTarget();
        moveLerp(tx, ty, MOVEMENT.LERP_FLY[tier], dt);
        clampAndTransform();
        return;
      }

      const distToTarget = Math.sqrt((tx - px) * (tx - px) + (ty - py) * (ty - py));
      if (distToTarget < DISTANCE.GRAB_RADIUS && now - lastMove > BEHAVIOR.GRAB_IDLE_MS[tier]) {
        jx = jy = 0;
        enter('GRABBING');
        return;
      }

      if (cSpeed < 2 && now - boredStart > BEHAVIOR.BORED_MS[tier]) {
        flyToRoost();
        return;
      }
      if (cSpeed >= 2) boredStart = now;
    }

    let spd = MOVEMENT.LERP_FLY[tier];
    if (state === 'GRABBING') spd = (anim === 'grab3') ? MOVEMENT.GRAB3_LERP : MOVEMENT.GRAB_LERP;
    moveLerp(tx, ty, spd, dt);
    clampAndTransform();
  }

  function clampAndTransform() {
    if (state !== 'FLYOFF' && state !== 'FLYOFF_WARMUP') {
      px = Math.max(0, Math.min(window.innerWidth - DISPLAY.DW, px));
      py = Math.max(0, Math.min(window.innerHeight - DISPLAY.DH, py));
    }
    el.style.transform = 'translate3d(' + Math.round(px + jx) + 'px,' + Math.round(py + jy) + 'px,0)';
  }

  function updateFacing() {
    if (state === 'FLYOFF' || state === 'FLYIN' || state === 'FLYOFF_WARMUP') {
      const dx = tx - px;
      if (Math.abs(dx) > DISTANCE.FLIP_HYSTERESIS) facingLeft = dx < 0;
      return;
    }
    if (state !== 'FLYING') return;
    if (anim === 'turnaround') return;
    const target = (tier === 0) ? tx : mx;
    const dx = target - px;
    if (Math.abs(dx) < DISTANCE.FLIP_HYSTERESIS) return;
    const wantLeft = dx < 0;
    if (wantLeft === facingLeft) return;
    pendingFlip = wantLeft;
    setAnim('turnaround');
  }

  function updateFlightAnim() {
    if (state !== 'FLYING') return;
    if (!CFG[anim].interrupt) return;
    if (tier === 0) return;

    const curDist = Math.sqrt((mx - px) * (mx - px) + (my - py) * (my - py));
    const dx = px - prevPx, dy = py - prevPy;
    const vel = Math.sqrt(dx * dx + dy * dy);
    prevPx = px; prevPy = py;

    const now = Date.now();
    if (curDist > DISTANCE.DASH_DIST && anim !== 'dash' && now - lastDashEnd > TIMING.DASH_COOLDOWN) {
      setAnim('dash'); return;
    }
    if (curDist <= DISTANCE.DASH_DIST && anim === 'dash') {
      lastDashEnd = now; setAnim('move2'); return;
    }
    if (anim === 'move1' && vel > 3) setAnim('move2');
    else if (anim === 'move2' && vel < 1.5) setAnim('move1');
  }

  function updateGrab() {
    if (state !== 'GRABBING') return;
    if (anim === 'grab1') return;

    if (anim === 'grab2' && Date.now() - feedStart > feedTime) {
      if (window.__kdrIncrement) window.__kdrIncrement('meals');
      stopFeedingDrip();
      startHealingDrip();
      tier = 0;
      timesDisturbed = 0;
      digestUntil = Date.now() + 120000;
      flyToRoost();
      return;
    }

    const distToCursor = Math.sqrt((tx - px) * (tx - px) + (ty - py) * (ty - py));
    if (cSpeed > MOVEMENT.GRAB_BREAK || distToCursor > DISTANCE.GRAB_DIST_BREAK) { stopAllDrips(); enter('FLYING'); return; }

    const cursorMoving = performance.now() - lastMove < TIMING.GRAB3_SETTLE_MS;
    if (cursorMoving && anim === 'grab2') setAnim('grab3');
    else if (!cursorMoving && anim === 'grab3') setAnim('grab2');
  }

  function measureSpeed() {
    if (pmx < 0) { pmx = mx; pmy = my; return; }
    const dx = mx - pmx, dy = my - pmy;
    const raw = Math.sqrt(dx * dx + dy * dy);
    cSpeed = cSpeed * (1 - MOVEMENT.SPEED_SMOOTH) + raw * MOVEMENT.SPEED_SMOOTH;
    pmx = mx;
    pmy = my;
  }

  // Shared pointer logic for mouse and touch
  function handlePointer(clientX, clientY) {
    const nx = clientX, ny = clientY;
    const moved = Math.abs(nx - mx) > 3 || Math.abs(ny - my) > 3;
    if (moved) lastMove = performance.now();
    mx = nx;
    my = ny;
    hasCursor = true;

    if (state === 'ROOSTING' || state === 'CURIOUS') {
      const dx = mx - px - DISPLAY.DW / 2, dy = my - py - DISPLAY.DH / 2;
      if (Math.sqrt(dx * dx + dy * dy) < DISTANCE.NEAR_ROOST[tier]) {
        if (Date.now() < digestUntil) {
          /* Post-feed: flutter briefly, don't escalate, re-roost fast */
          enter('FLYING');
        } else {
          tier = Math.min(2, timesDisturbed);
          timesDisturbed++;
          if (tier > 0) { tx = mx - DISPLAY.DW / 2; ty = my - DISPLAY.DH / 2; }
          enter('FLYING');
        }
        return true;
      }
    } else if ((state === 'FLYING' || state === 'GRABBING') && tier > 0) {
      /* FLYING: threshold prevents hand tremor from resetting convergence.
         GRABBING: always track; tight follow matters more than stability. */
      if (moved || state === 'GRABBING') { tx = mx - DISPLAY.DW / 2; ty = my - DISPLAY.DH / 2; }
    }
    return false;
  }

  function onMouse(e) {
    handlePointer(e.clientX, e.clientY);
    clearTimeout(leaveTid);
  }

  function onLeave() {
    hasCursor = false;
    clearTimeout(leaveTid);
    leaveTid = setTimeout(function () {
      if (hasCursor) return;
      if (state === 'GRABBING') enter('FLYING');
      if (state === 'FLYING') pickWanderTarget();
    }, TIMING.LEAVE_GRACE_MS);
  }

  function hitBat() {
    if (state === 'ROOSTING' || state === 'CURIOUS' ||
        state === 'FLYING' || state === 'GRABBING') {
      enter('HIT');
    }
  }

  function onCanvasClick(e) { e.stopPropagation(); hitBat(); }
  function onCanvasTouch(e) { e.stopPropagation(); hitBat(); }

  function onTouch(e) {
    const t = e.touches[0];
    if (!t) return;
    const didDisturb = handlePointer(t.clientX, t.clientY);
    if (didDisturb) return;
  }

  function onTouchEnd() {
    hasCursor = false;
    if (state === 'GRABBING') enter('FLYING');
    if (state === 'FLYING') pickWanderTarget();
  }

  function addRoost(selector, anchor) {
    const target = document.querySelector(selector);
    if (!target) return;
    const r = target.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return;
    switch (anchor) {
      case 'hang-left':   roosts.push({ x: r.left, y: r.bottom - 6 }); break;
      case 'hang-right':  roosts.push({ x: r.right - DISPLAY.DW, y: r.bottom - 6 }); break;
      case 'hang-center': roosts.push({ x: r.left + r.width / 2 - DISPLAY.DW / 2, y: r.bottom - 6 }); break;
      case 'top-left':    roosts.push({ x: r.left, y: r.top }); break;
      case 'top-right':   roosts.push({ x: r.right - DISPLAY.DW, y: r.top }); break;
    }
  }

  function computeRoosts() {
    roosts = [];
    const hdr = document.querySelector('.md-header');
    const hdrBottom = hdr ? hdr.getBoundingClientRect().bottom - 6 : 80;
    const w = window.innerWidth;

    addRoost('.md-header__source', 'hang-left');
    roosts.push({ x: DISPLAY.DW + Math.random() * (w - DISPLAY.DW * 3), y: hdrBottom });
    roosts.push({ x: DISPLAY.DW + Math.random() * (w - DISPLAY.DW * 3), y: hdrBottom });
    roosts.push({ x: DISPLAY.DW + Math.random() * (w - DISPLAY.DW * 3), y: 0 });
  }

  function pickRoost() {
    computeRoosts();
    if (firstRoost) { roostIdx = 0; firstRoost = false; return; }
    if (roosts.length <= 1) { roostIdx = 0; return; }
    const old = roostIdx;
    do { roostIdx = Math.floor(Math.random() * roosts.length); } while (roostIdx === old);
  }

  function flyToRoost() {
    clearTimeout(autoRoostTid);
    clearTimeout(curiousTid);
    pickRoost();
    const r = roosts[roostIdx];
    tx = r.x;
    ty = r.y;
    jx = jy = 0;
    state = 'FLYIN';
    setAnim('move1');
  }

  // Random off-screen edge position for fly-in/fly-off
  function randomEdgePosition() {
    const edge = Math.floor(Math.random() * 4);
    const vw = window.innerWidth, vh = window.innerHeight;
    if (edge === 0) return { x: Math.random() * vw, y: -DISPLAY.DH * 2 };
    if (edge === 1) return { x: vw + DISPLAY.DW * 2, y: Math.random() * vh };
    if (edge === 2) return { x: Math.random() * vw, y: vh + DISPLAY.DH * 2 };
    return { x: -DISPLAY.DW * 2, y: Math.random() * vh };
  }

  function dismiss() {
    if (dismissing || state === 'HIDDEN') return;
    if (Date.now() - lastDismiss < TIMING.DISMISS_COOLDOWN) {
      jitterButton();
      return;
    }
    dismissing = true;
    lastDismiss = Date.now();
    cleanupEchoPulse();
    clearTimeout(respawnTid);
    clearTimeout(curiousTid);
    clearTimeout(autoRoostTid);
    clearTimeout(tierDecayTid);
    fading = false;
    ctx.clearRect(0, 0, SPRITE.W, SPRITE.H);
    el.style.transition = '';
    el.style.opacity = '1';

    const edge = Math.floor(Math.random() * 4);
    if (edge === 0) { tx = px; ty = -DISPLAY.DH * 2; }
    else if (edge === 1) { tx = window.innerWidth + DISPLAY.DW * 2; ty = py; }
    else if (edge === 2) { tx = px; ty = window.innerHeight + DISPLAY.DH * 2; }
    else { tx = -DISPLAY.DW * 2; ty = py; }
    facingLeft = tx < px;

    const wasPerched = state === 'ROOSTING' || state === 'CURIOUS';
    state = 'FLYOFF_WARMUP';

    if (wasPerched) {
      setAnim('appearance');
    } else {
      setAnim('move2');
      setTimeout(function() {
        if (state === 'FLYOFF_WARMUP') {
          state = 'FLYOFF';
          setAnim('dash');
        }
      }, 400);
    }
  }

  window.Coterie.batthew.inCooldown = function () {
    return Date.now() - lastDismiss < TIMING.DISMISS_COOLDOWN;
  };

  window.Coterie.batthew.jitter = jitterButton;

  function jitterButton() {
    const btn = document.getElementById('coterie-bat-toggle');
    if (!btn) return;
    const offsets = [[2,-1],[-2,2],[1,-2],[-1,1],[0,0]];
    offsets.forEach(function (o, i) {
      setTimeout(function () {
        btn.style.transform = 'translate(' + o[0] + 'px,' + o[1] + 'px)';
      }, i * 50);
    });
  }

  function summon() {
    if (Date.now() - lastDismiss < TIMING.DISMISS_COOLDOWN) { jitterButton(); return; }
    clearTimeout(autoRoostTid);
    clearTimeout(curiousTid);
    clearTimeout(tierDecayTid);
    clearTimeout(respawnTid);
    cvs.style.pointerEvents = '';
    dismissing = false;
    enabled = true;
    el.style.display = '';

    const pos = randomEdgePosition();
    px = pos.x;
    py = pos.y;
    el.style.transform = 'translate3d(' + Math.round(px) + 'px,' + Math.round(py) + 'px,0)';

    tx = DISPLAY.DW + Math.random() * (window.innerWidth - DISPLAY.DW * 2);
    ty = DISPLAY.DH + Math.random() * (window.innerHeight * 0.5);
    facingLeft = tx < px;
    state = 'FLYIN';
    setAnim(Math.random() < 0.5 ? 'move1' : 'move2');
    startLoop();
  }

  function hideBat() {
    stopAllDrips();
    enabled = false;
    dismissing = false;
    fading = false;
    el.style.transition = '';
    el.style.opacity = '1';
    el.style.display = 'none';
    state = 'HIDDEN';
    try { localStorage.setItem('coterie-bat-active', '0'); } catch (e) {}
    setTimeout(syncEnabled, 100);
  }

  function syncEnabled() {
    let wantOn;
    try { wantOn = localStorage.getItem('coterie-bat-mode') !== 'off'; }
    catch (e) { wantOn = true; }

    if (wantOn && !enabled) summon();
    else if (!wantOn && enabled && !dismissing) dismiss();
  }
  window.Coterie.batthew.sync = syncEnabled;
  window.Coterie.batthew.echo = function() { if (enabled && !reduced) emitEchoPulse(); };

  function checkReduced() {
    reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!el) return;
    el.style.display = enabled && !reduced ? '' : 'none';
    if (reduced && enabled) {
      setAnim('idle1');
      frame = 0;
      render();
    }
    if (!reduced && enabled) startLoop();
  }

  // RAF loop: only schedules frames when the bat is active and visible
  function startLoop() {
    if (!rafId) rafId = requestAnimationFrame(loop);
  }

  function loop(now) {
    if (!enabled || document.hidden || reduced) {
      rafId = null;
      return;
    }
    rafId = requestAnimationFrame(loop);
    let dt = lastTime ? now - lastTime : 0;
    lastTime = now;
    if (dt > 200) dt = 0;
    measureSpeed();
    updatePos(dt, now);
    updateFacing();
    updateFlightAnim();
    updateGrab();
    stepAnim(dt);
    if (wantCurious && anim === 'idle1' && frame <= 1) {
      wantCurious = false;
      enter('CURIOUS');
    }
    /* frame === 24 reserved for hunting double-chirp (Phase 2) */
    if (state === 'CURIOUS' && anim === 'idle2' && frame >= 19 && echoChance) {
      echoChance = false;
      emitEchoPulse();
    }
    render();
  }

  function watchTheme() {
    if (_themeWatching) return;
    _themeWatching = true;
    new MutationObserver(function () {
      const t = getTheme();
      if (t === theme) return;
      preload(t, function () { theme = t; });
    }).observe(document.body, { attributes: true, attributeFilter: ['data-md-color-scheme'] });
  }

  function bindEvents() {
    if (_eventsBound) return;
    _eventsBound = true;

    document.addEventListener('mousemove', onMouse);
    document.addEventListener('mouseleave', onLeave);
    cvs.addEventListener('click', onCanvasClick);
    cvs.addEventListener('touchstart', onCanvasTouch);
    document.addEventListener('touchstart', onTouch, { passive: true });
    document.addEventListener('touchmove', onTouch, { passive: true });
    document.addEventListener('touchend', onTouchEnd);

    document.addEventListener('visibilitychange', function () {
      if (document.hidden) {
        stopAllDrips();
        cleanupEchoPulse();
        if (state === 'FLYING' || state === 'GRABBING') flyToRoost();
      } else {
        // Resume loop when page becomes visible again
        if (enabled && !reduced) startLoop();
      }
    });

    let resizeTid = null;
    window.addEventListener('resize', function () {
      /* Debounce: SPA nav fires resize as content height changes */
      clearTimeout(resizeTid);
      resizeTid = setTimeout(function () {
        cleanupEchoPulse();
        if (state === 'ROOSTING' || state === 'CURIOUS') flyToRoost();
      }, 500);
    });

    window.matchMedia('(prefers-reduced-motion: reduce)')
      .addEventListener('change', checkReduced);

    const searchInput = document.querySelector('.md-search__input');
    if (searchInput) {
      searchInput.addEventListener('focus', function () { el.style.visibility = 'hidden'; });
      searchInput.addEventListener('blur', function () {
        setTimeout(function () { el.style.visibility = ''; }, 200);
      });
    }
  }

  function init() {
    theme = getTheme();
    createDOM();
    createEchoSvg();
    syncEnabled();
    checkReduced();

    if (!enabled) return;

    preload(theme, function () {
      ['night', 'sunset', 'abyss'].forEach(function(t) {
        if (t !== theme) preload(t, function() {});
      });

      if (!sheets[theme].idle1 || !sheets[theme].move1) {
        el.style.display = 'none';
        return;
      }

      lives = BEHAVIOR.MAX_LIVES;
      deaths = 0;
      tier = 0;
      timesDisturbed = 0;
      computeRoosts();

      if (reduced) {
        const r = roosts[roostIdx];
        px = r.x; py = r.y;
        clampAndTransform();
        anim = 'idle1';
        frame = 0;
        render();
        watchTheme();
        return;
      }

      /* Resume from prior session: fly in from edge instead of full spawn */
      let returning = false;
      try { returning = localStorage.getItem('coterie-bat-active') === '1'; } catch (e) {}
      if (returning) {
        const pos = randomEdgePosition();
        px = pos.x;
        py = pos.y;
        clampAndTransform();
        tx = DISPLAY.DW + Math.random() * (window.innerWidth - DISPLAY.DW * 2);
        ty = DISPLAY.DH + Math.random() * (window.innerHeight * 0.5);
        facingLeft = tx < px;
        state = 'FLYIN';
        setAnim(Math.random() < 0.5 ? 'move1' : 'move2');
      } else {
        enter('SPAWNING');
      }
      try { localStorage.setItem('coterie-bat-active', '1'); } catch (e) {}

      bindEvents();
      watchTheme();
      startLoop();
    });
  }

  // Blood drip system
  const BLOOD = {
    FRESH: '#E40707',
    DARK: '#6B0606',
    DRIP_CAP: 30,
    GRAVITY: 0.08,
    BASE_MS: 750
  };

  let dripBox = null;
  let drips = [];
  let dripRaf = null;
  let dripRunning = false;
  let heartbeatTid = null;
  let healTid = null;
  let healCount = 0;
  let healTarget = 0;

  function ensureDripBox() {
    if (dripBox) return;
    dripBox = document.createElement('div');
    dripBox.className = 'blood-drips';
    document.body.appendChild(dripBox);
  }

  function spawnDrip(x, y, color, sizeMin, sizeMax, vyMin, vyMax, vxSpread) {
    if (reduced || !enabled || !dripBox) return;
    if (drips.length >= BLOOD.DRIP_CAP) {
      const old = drips.shift();
      if (old.el.parentNode) old.el.parentNode.removeChild(old.el);
    }
    const sz = sizeMin + Math.random() * (sizeMax - sizeMin);
    const d = document.createElement('div');
    d.className = 'blood-drip';
    d.style.width = sz + 'px';
    d.style.height = sz + 'px';
    d.style.backgroundColor = color;
    dripBox.appendChild(d);

    const particle = {
      el: d,
      x: x - sz / 2,
      y: y,
      vx: (Math.random() - 0.5) * (vxSpread || 0.6),
      vy: vyMin + Math.random() * (vyMax - vyMin),
      op: 0.85 + Math.random() * 0.15,
      fade: 0.003 + Math.random() * 0.004
    };
    d.style.opacity = particle.op;
    d.style.transform = 'translate(' + particle.x + 'px,' + particle.y + 'px)';
    drips.push(particle);

    if (!dripRunning) {
      dripRunning = true;
      dripRaf = requestAnimationFrame(tickDrips);
    }
  }

  function tickDrips() {
    let i = drips.length;
    while (i--) {
      const d = drips[i];
      d.vy += BLOOD.GRAVITY;
      d.x += d.vx;
      d.y += d.vy;
      d.op -= d.fade;
      if (d.op <= 0 || d.y > window.innerHeight + 20) {
        if (d.el.parentNode) d.el.parentNode.removeChild(d.el);
        drips.splice(i, 1);
        continue;
      }
      d.el.style.transform = 'translate(' + d.x + 'px,' + d.y + 'px)';
      d.el.style.opacity = d.op;
    }
    if (drips.length > 0) {
      dripRaf = requestAnimationFrame(tickDrips);
    } else {
      dripRunning = false;
    }
  }

  function biteSplash() {
    ensureDripBox();
    const count = 3 + Math.floor(Math.random() * 4);
    for (let i = 0; i < count; i++) {
      spawnDrip(mx, my, BLOOD.FRESH, 4, 8, 1.0, 3.0, 3.0);
    }
  }

  function startFeedingDrip() {
    stopFeedingDrip();
    ensureDripBox();
    scheduleFeedDrip();
  }

  function scheduleFeedDrip() {
    const elapsed = Date.now() - feedStart;
    const progress = Math.min(elapsed / feedTime, 1);
    const interval = BLOOD.BASE_MS * (1 + progress * 0.8);
    const jit = interval * 0.5;
    const delay = interval + (Math.random() - 0.5) * jit;

    heartbeatTid = setTimeout(function () {
      if (state !== 'GRABBING') return;
      const progress2 = Math.min((Date.now() - feedStart) / feedTime, 1);
      const color = progress2 < 0.6 ? BLOOD.FRESH : BLOOD.DARK;
      spawnDrip(mx, my, color, 3, 7, 0.2, 1.2, 0.8);
      if (Math.random() < 0.3) {
        spawnDrip(mx + (Math.random() - 0.5) * 6, my, color, 2, 5, 0.3, 0.8, 0.4);
      }
      scheduleFeedDrip();
    }, delay);
  }

  function stopFeedingDrip() {
    clearTimeout(heartbeatTid);
    heartbeatTid = null;
  }

  function startHealingDrip() {
    stopHealingDrip();
    ensureDripBox();
    healCount = 0;
    healTarget = 2 + Math.floor(Math.random() * 7);
    scheduleHealDrip();
  }

  function scheduleHealDrip() {
    const delay = 800 + Math.random() * 700;
    healTid = setTimeout(function () {
      const t = healCount / healTarget;
      const lo = 2 + (1 - t) * 3;
      const hi = 3 + (1 - t) * 5;
      spawnDrip(mx, my, BLOOD.DARK, lo, hi, 0.1, 0.5, 0.3);
      healCount++;
      if (healCount < healTarget) {
        scheduleHealDrip();
      }
    }, delay);
  }

  function stopHealingDrip() {
    clearTimeout(healTid);
    healTid = null;
  }

  function stopAllDrips() {
    stopFeedingDrip();
    stopHealingDrip();
  }

  // Echolocation system
  const ECHO = {
    RAYS: 18,
    ARC_DEG: 270,
    MAX_RADIUS: DISPLAY.DW * 30,
    EMIT_MS: 1000,
    CONTACT_MS: 150,
    RETURN_MS: 1000,
    OPACITY: 0.2,
    FLY_ARCS: [270, 180, 90],
    FLY_INTERVALS: [[5000, 8000], [2500, 4000], [1000, 2000]],
    FLY_OPACITY: [0.2, 0.2, 0.12],
    FREQ: 7,
    AMP: 4
  };

  const ECHO_SELECTORS = [
    '.md-sidebar',
    '.md-search',
    '.md-content h1',
    '.md-content img',
    '.highlight', 'pre',
    '.admonition',
    '.md-typeset table',
    '.md-top',
    '.md-footer__link'
  ];

  let echoSvg = null;
  let echoPulses = [];
  let echoTicking = false;

  function createEchoSvg() {
    if (echoSvg && echoSvg.parentNode) return;
    if (!echoSvg) {
      echoSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      echoSvg.setAttribute('class', 'echo-overlay');
      echoSvg.setAttribute('aria-hidden', 'true');
    }
    echoSvg.setAttribute('width', window.innerWidth);
    echoSvg.setAttribute('height', window.innerHeight);
    document.body.appendChild(echoSvg);
  }

  function echoIsVisible(target) {
    if (!target) return false;
    if (target.offsetParent === null && getComputedStyle(target).position !== 'fixed') return false;
    const r = target.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return false;
    return r.bottom > 0 && r.top < window.innerHeight &&
           r.right > 0 && r.left < window.innerWidth;
  }

  function gatherReflectors() {
    const rects = [];
    for (let i = 0; i < ECHO_SELECTORS.length; i++) {
      const els = document.querySelectorAll(ECHO_SELECTORS[i]);
      for (let j = 0; j < els.length; j++) {
        if (echoIsVisible(els[j])) {
          const r = els[j].getBoundingClientRect();
          rects.push({ x: r.left, y: r.top, w: r.width, h: r.height });
        }
      }
    }
    if (hasCursor) rects.push({ x: mx - 20, y: my - 20, w: 40, h: 40 });
    return rects;
  }

  function rayHitRect(ox, oy, cos, sin, rect) {
    let tmin = 0, tmax = ECHO.MAX_RADIUS;
    const invX = cos !== 0 ? 1 / cos : 1e12;
    let t1 = (rect.x - ox) * invX;
    let t2 = (rect.x + rect.w - ox) * invX;
    if (invX < 0) { const tmp = t1; t1 = t2; t2 = tmp; }
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) return -1;

    const invY = sin !== 0 ? 1 / sin : 1e12;
    t1 = (rect.y - oy) * invY;
    t2 = (rect.y + rect.h - oy) * invY;
    if (invY < 0) { const tmp = t1; t1 = t2; t2 = tmp; }
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) return -1;

    return tmin > 0 ? tmin : -1;
  }

  function castEchoRays(cx, cy, facingAngle, arcDeg) {
    const rects = gatherReflectors();
    const startAngle = facingAngle - (arcDeg / 2) * (Math.PI / 180);
    const step = arcDeg / (ECHO.RAYS - 1) * (Math.PI / 180);
    const hits = [];

    for (let i = 0; i < ECHO.RAYS; i++) {
      const angle = startAngle + step * i;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      let closest = ECHO.MAX_RADIUS;
      let hitSomething = false;

      for (let j = 0; j < rects.length; j++) {
        const t = rayHitRect(cx, cy, cos, sin, rects[j]);
        if (t > 0 && t < closest) {
          closest = t;
          hitSomething = true;
        }
      }

      hits.push({
        angle: angle,
        dist: closest,
        hit: hitSomething,
        px: cx + cos * closest,
        py: cy + sin * closest
      });
    }
    return hits;
  }

  function buildSineArcPath(cx, cy, radius, startAngle, arcRad, freq, amp, phase, perRayDist) {
    const steps = 72;
    let d = '';
    let penDown = false;

    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const angle = startAngle + arcRad * t;

      const rayIdx = Math.round(t * (ECHO.RAYS - 1));
      const maxR = perRayDist ? perRayDist[rayIdx] : ECHO.MAX_RADIUS;

      /* Skip sections where the wave already hit a surface */
      if (radius > maxR) { penDown = false; continue; }

      const scaledAmp = amp * (radius / 100);
      const sineOffset = Math.sin(freq * t * Math.PI * 2 + phase) * scaledAmp;
      const r = radius + sineOffset;

      const x = cx + Math.cos(angle) * r;
      const y = cy + Math.sin(angle) * r;
      d += (penDown ? 'L' : 'M') + x.toFixed(1) + ',' + y.toFixed(1);
      penDown = true;
    }
    return d;
  }

  function buildReturnWavePath(cx, cy, hitX, hitY, progress, freq, amp, phase) {
    const dx = hitX - cx, dy = hitY - cy;
    const hitDist = Math.sqrt(dx * dx + dy * dy);
    const hitAngle = Math.atan2(dy, dx);

    const currentDist = hitDist * (1 - progress);
    const arcSpan = 0.4;
    const steps = 12;
    let d = '';

    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const angle = hitAngle - arcSpan / 2 + arcSpan * t;
      const scaledAmp = amp * (currentDist / 100) * (1 - progress);
      const sineOffset = Math.sin(freq * t * Math.PI * 2 + phase) * scaledAmp;
      const r = currentDist + sineOffset;
      const x = cx + Math.cos(angle) * r;
      const y = cy + Math.sin(angle) * r;
      d += (i === 0 ? 'M' : 'L') + x.toFixed(1) + ',' + y.toFixed(1);
    }
    return d;
  }

  function emitEchoPulse(opOverride) {
    if (echoPulses.length >= 2 || reduced || !enabled) return;
    if (state === 'HIDDEN' || state === 'DEAD' || state === 'DYING' ||
        state === 'HIT' || state === 'GRABBING') return;
    createEchoSvg();

    const cx = px + DISPLAY.DW / 2;
    const cy = py + DISPLAY.DH / 2;

    let facingAngle;
    if (state === 'CURIOUS' || state === 'ROOSTING') {
      facingAngle = Math.PI / 2;
    } else {
      facingAngle = facingLeft ? Math.PI : 0;
    }

    let arcDeg = ECHO.ARC_DEG;
    if (state === 'FLYING') arcDeg = ECHO.FLY_ARCS[tier];
    const op = opOverride != null ? opOverride : ECHO.OPACITY;

    const hits = castEchoRays(cx, cy, facingAngle, arcDeg);
    const perRayDist = hits.map(function(h) { return h.dist; });

    const returnWaves = [];
    for (let i = 0; i < hits.length; i++) {
      if (hits[i].hit) {
        returnWaves.push({
          px: hits[i].px,
          py: hits[i].py,
          freq: ECHO.FREQ * (0.5 + Math.random() * 1.5),
          amp: ECHO.AMP * (0.3 + Math.random() * 1.2),
          phase: Math.random() * Math.PI * 2,
          started: false,
          startTime: 0
        });
      }
    }

    const arcPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    arcPath.setAttribute('opacity', op);
    echoSvg.appendChild(arcPath);

    const startAngle = facingAngle - (arcDeg / 2) * (Math.PI / 180);
    const arcRad = arcDeg * (Math.PI / 180);

    echoPulses.push({
      cx: cx,
      cy: cy,
      startAngle: startAngle,
      arcRad: arcRad,
      arcDeg: arcDeg,
      perRayDist: perRayDist,
      hits: hits,
      returnWaves: returnWaves,
      arcPath: arcPath,
      returnPaths: [],
      startTime: performance.now(),
      phase: 'emit',
      op: op
    });

    if (!echoTicking) {
      echoTicking = true;
      requestAnimationFrame(tickEchoPulse);
    }
  }

  function scheduleEchoFly() {
    clearTimeout(echoFlyTid);
    if (state !== 'FLYING' || Date.now() < digestUntil) return;
    const interval = ECHO.FLY_INTERVALS[tier];
    const delay = interval[0] + Math.random() * (interval[1] - interval[0]);
    echoFlyTid = setTimeout(function() {
      if (state !== 'FLYING') return;
      const op = ECHO.FLY_OPACITY[tier];
      emitEchoPulse(op);
      if (tier === 2) {
        /* Double-chirp: second pulse 100ms after first concludes */
        echoFlyTid = setTimeout(function() {
          if (state === 'FLYING') emitEchoPulse(op);
          scheduleEchoFly();
        }, ECHO.EMIT_MS + ECHO.RETURN_MS + 100);
      } else {
        scheduleEchoFly();
      }
    }, delay);
  }

  function tickEchoPulse(now) {
    if (echoPulses.length === 0) { echoTicking = false; return; }
    if (!enabled) { cleanupEchoPulse(); return; }

    for (let p = echoPulses.length - 1; p >= 0; p--) {
      const d = echoPulses[p];
      const elapsed = now - d.startTime;

      if (d.phase === 'emit') {
        const progress = Math.min(elapsed / ECHO.EMIT_MS, 1);
        const currentRadius = progress * ECHO.MAX_RADIUS;
        const dStr = buildSineArcPath(
          d.cx, d.cy, currentRadius, d.startAngle, d.arcRad,
          ECHO.FREQ, ECHO.AMP, 0, d.perRayDist
        );
        d.arcPath.setAttribute('d', dStr);
        d.arcPath.setAttribute('opacity', d.op * (1 - progress * 0.3));

        for (let i = 0; i < d.returnWaves.length; i++) {
          const rw = d.returnWaves[i];
          if (rw.started) continue;
          const rwDist = Math.sqrt(
            (rw.px - d.cx) * (rw.px - d.cx) + (rw.py - d.cy) * (rw.py - d.cy)
          );
          if (currentRadius >= rwDist) {
            rw.started = true;
            rw.startTime = now;
            const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            path.setAttribute('opacity', d.op);
            echoSvg.appendChild(path);
            d.returnPaths.push({ path: path, wave: rw });

            const ripple = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            ripple.setAttribute('cx', rw.px);
            ripple.setAttribute('cy', rw.py);
            ripple.setAttribute('r', '3');
            ripple.setAttribute('fill', 'none');
            ripple.setAttribute('stroke', '#E1E1E1');
            ripple.setAttribute('stroke-width', '1');
            ripple.setAttribute('opacity', d.op * 1.5);
            echoSvg.appendChild(ripple);
            setTimeout(function(r) {
              return function() {
                r.setAttribute('r', '12');
                r.setAttribute('opacity', '0');
                r.style.transition = 'all ' + ECHO.CONTACT_MS + 'ms ease-out';
                setTimeout(function() { if (r.parentNode) r.parentNode.removeChild(r); }, ECHO.CONTACT_MS);
              };
            }(ripple), 16);
          }
        }

        if (progress >= 1) {
          d.phase = 'return';
          d.startTime = now;
          if (d.arcPath.parentNode) d.arcPath.parentNode.removeChild(d.arcPath);
        }
      }

      let allReturnsDone = true;
      for (let i = 0; i < d.returnPaths.length; i++) {
        const rp = d.returnPaths[i];
        const rElapsed = now - rp.wave.startTime;
        const rProgress = Math.min(rElapsed / ECHO.RETURN_MS, 1);

        if (rProgress < 1) {
          allReturnsDone = false;
          const dStr = buildReturnWavePath(
            d.cx, d.cy, rp.wave.px, rp.wave.py,
            rProgress, rp.wave.freq, rp.wave.amp, rp.wave.phase
          );
          rp.path.setAttribute('d', dStr);
          rp.path.setAttribute('opacity', d.op * (1 - rProgress));
        } else {
          rp.path.setAttribute('opacity', '0');
        }
      }

      if (d.phase === 'return' && (allReturnsDone || elapsed > ECHO.RETURN_MS + 200)) {
        removePulse(p);
      }
    }

    if (echoPulses.length > 0) {
      requestAnimationFrame(tickEchoPulse);
    } else {
      echoTicking = false;
    }
  }

  function removePulse(idx) {
    const d = echoPulses[idx];
    if (d.arcPath.parentNode) d.arcPath.parentNode.removeChild(d.arcPath);
    for (let i = 0; i < d.returnPaths.length; i++) {
      if (d.returnPaths[i].path.parentNode) d.returnPaths[i].path.parentNode.removeChild(d.returnPaths[i].path);
    }
    echoPulses.splice(idx, 1);
  }

  function cleanupEchoPulse() {
    if (!echoSvg) return;
    while (echoSvg.firstChild) echoSvg.removeChild(echoSvg.firstChild);
    echoPulses = [];
    echoTicking = false;
  }

  let inited = false;
  function initOnce() {
    if (inited) return;
    inited = true;
    init();
  }

  if (typeof document$ !== 'undefined') {
    document$.subscribe(initOnce);
  } else if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initOnce);
  } else {
    initOnce();
  }
})();
