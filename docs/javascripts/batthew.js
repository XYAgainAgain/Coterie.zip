(function () {
  'use strict';

  /* On SPA re-execution: re-attach bat if Zensical removed it during content swap.
     MutationObserver catches ALL removal methods (some nav types skip document$). */
  if (window.__batthewInit) {
    if (!window.__batthewReattach) {
      window.__batthewReattach = true;
      new MutationObserver(function () {
        var bat = window.__batthewEl;
        if (bat && !bat.parentNode) document.body.appendChild(bat);
      }).observe(document.body, { childList: true });
    }
    return;
  }
  window.__batthewInit = true;

  var W = 40, H = 42, SCALE = 2;
  var DW = W * SCALE, DH = H * SCALE;
  var FRAME_MS = 83;
  var BASE = '/assets/images/batthew/';
  var REF_DT = 16.67;

  var ANIM_NAMES = [
    'idle1', 'idle2', 'appearance', 'move1', 'move2',
    'turnaround', 'dash', 'grab1', 'grab2', 'grab3',
    'hit', 'death1', 'death2'
  ];

  var CFG = {
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

  var FLIP_HYSTERESIS = 8;
  var SPEED_SMOOTH = 0.3;
  var GRAB_BREAK = 6;
  var GRAB_DIST_BREAK = 80;
  var GRAB_LERP = 0.3;
  var GRAB3_LERP = 0.5;
  var GRAB3_SETTLE_MS = 1000;

  /* Per-tier: [shy, curious, hunting] */
  var NEAR_ROOST = [150, 200, 250];
  var LERP_FLY = [0.008, 0.015, 0.04];
  var JITTER_AMP = [30, 20, 10];
  var JITTER_HOVER_MULT = 5;
  var GRAB_IDLE_MS = [Infinity, 3000, 1500];
  var BORED_MS = [Infinity, 12000, Infinity];

  var GRAB_RADIUS = 12;
  var WANDER_COOLDOWN = 2000;
  var AUTO_ROOST_MIN = 20000;
  var AUTO_ROOST_MAX = 40000;
  var DASH_COOLDOWN = 5000;
  var DASH_DIST = 350;
  var TIER_DECAY_MS = 300000;
  var FEED_TIME = 10000;
  var DEATH_FADE_MS = 1000;
  var RESPAWN_QUICK = 5000;
  var RESPAWN_LONG = [15000, 30000];
  var CURIOUS_RANGE = [8000, 10000];
  var MAX_LIVES = 3;
  var DISMISS_COOLDOWN = 3000;
  var LEAVE_GRACE_MS = 200;

  var el, cvs, ctx;
  var sheets = {};
  var theme, anim, frame;
  var animAccum = 0;
  var animDone = false;
  var animReverse = false;
  var lastTime = 0;
  var facingLeft = false;
  var pendingFlip = false;

  var px, py;
  var jx = 0, jy = 0;
  var prevPx = 0, prevPy = 0;
  var tx = -1, ty = -1;
  var mx = -1, my = -1;
  var pmx = -1, pmy = -1;
  var cSpeed = 0;
  var lastMove = 0;
  var hasCursor = false;

  var lives, deaths, tier, timesDisturbed;
  var state;
  var enabled = true;
  var dismissing = false;
  var fading = false;
  var lastDismiss = 0;
  var feedStart = 0;
  var boredStart = 0;
  var lastWander = 0;
  var lastDashEnd = 0;
  var leaveTid = null;
  var tierDecayTid = null;
  var respawnTid = null;
  var curiousTid = null;
  var autoRoostTid = null;
  var roosts = [];
  var roostIdx = 0;
  var firstRoost = true;
  var reduced = false;

  function getTheme() {
    var s = document.body.getAttribute('data-md-color-scheme');
    if (s === 'slate') return 'night';
    if (s === 'abyss') return 'abyss';
    return 'sunset';
  }

  function preload(t, cb) {
    if (!sheets[t]) sheets[t] = {};
    var n = ANIM_NAMES.length;
    ANIM_NAMES.forEach(function (name) {
      if (sheets[t][name]) { if (--n === 0) cb(); return; }
      var img = new Image();
      img.onload = function () { sheets[t][name] = img; if (--n === 0) cb(); };
      img.onerror = function () { if (--n === 0) cb(); };
      img.src = BASE + t + '/' + name + '.webp';
    });
  }

  function frameCount(name) {
    var img = sheets[theme] && sheets[theme][name];
    return img ? Math.floor(img.naturalWidth / W) : 1;
  }

  function createDOM() {
    el = document.createElement('div');
    el.id = 'batthew';
    el.setAttribute('aria-hidden', 'true');

    cvs = document.createElement('canvas');
    var dpr = window.devicePixelRatio || 1;
    cvs.width = DW * dpr;
    cvs.height = DH * dpr;
    cvs.style.width = DW + 'px';
    cvs.style.height = DH + 'px';

    ctx = cvs.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.scale(dpr * SCALE, dpr * SCALE);

    el.appendChild(cvs);
    document.body.appendChild(el);
    window.__batthewEl = el;
  }

  function render() {
    if (fading) return;
    var img = sheets[theme] && sheets[theme][anim];
    if (!img) return;
    ctx.clearRect(0, 0, W, H);
    if (facingLeft) {
      ctx.save();
      ctx.scale(-1, 1);
      ctx.drawImage(img, frame * W, 0, W, H, -W, 0, W, H);
      ctx.restore();
    } else {
      ctx.drawImage(img, frame * W, 0, W, H, 0, 0, W, H);
    }
  }

  function setAnim(name, reverse) {
    if (anim === name && !reverse) { animReverse = false; return; }
    /* Shared first frames — swap seamlessly without resetting */
    var pair = (anim === 'move1' || anim === 'move2') && (name === 'move1' || name === 'move2');
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
    while (animAccum >= FRAME_MS) {
      animAccum -= FRAME_MS;
      var total = frameCount(anim);
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
        el.style.transition = 'opacity ' + DEATH_FADE_MS + 'ms ease-out';
        el.style.opacity = '0';
        setTimeout(function () {
          el.style.transition = '';
          ctx.clearRect(0, 0, W, H);
          enter('DEAD');
        }, DEATH_FADE_MS);
        break;
    }
  }

  function enter(s) {
    state = s;
    clearTimeout(curiousTid);
    clearTimeout(autoRoostTid);
    clearTimeout(tierDecayTid);

    switch (s) {
      case 'SPAWNING':
        cvs.style.pointerEvents = '';
        fading = false;
        el.style.opacity = '1';
        /* Spawn along bottom edge — death1 reversed looks like ground-based materialization */
        px = DW + Math.random() * (window.innerWidth - DW * 3);
        py = window.innerHeight - DH;
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
          }, TIER_DECAY_MS);
        }
        break;
      case 'CURIOUS':
        setAnim('idle2');
        break;
      case 'FLYING':
        setAnim('move1');
        boredStart = performance.now();
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
      case 'DEAD':
        cvs.style.pointerEvents = 'none';
        clearTimeout(respawnTid);
        var delay = deaths >= 3
          ? RESPAWN_LONG[0] + Math.random() * (RESPAWN_LONG[1] - RESPAWN_LONG[0])
          : RESPAWN_QUICK;
        respawnTid = setTimeout(function () { enter('RESPAWNING'); }, delay);
        break;
      case 'RESPAWNING':
        if (deaths >= 3) { deaths = 0; tier = 0; timesDisturbed = 0; }
        lives = MAX_LIVES;
        pickRoost();
        enter('SPAWNING');
        break;
    }
  }

  function scheduleCurious() {
    clearTimeout(curiousTid);
    var d = CURIOUS_RANGE[0] + Math.random() * (CURIOUS_RANGE[1] - CURIOUS_RANGE[0]);
    curiousTid = setTimeout(function () {
      if (state === 'ROOSTING') enter('CURIOUS');
    }, d);
  }

  function pickWanderTarget() {
    lastWander = performance.now();
    for (var i = 0; i < 10; i++) {
      var x = DW + Math.random() * (window.innerWidth - DW * 3);
      var y = DH + Math.random() * (window.innerHeight - DH * 3);
      var d = Math.sqrt((x - mx) * (x - mx) + (y - my) * (y - my));
      if (d > 200 || i === 9) { tx = x; ty = y; return; }
    }
  }

  /* Sine jitter for natural flight wobble — two overlapping waves per axis.
     Amplifies when cursor is still (bats can't hover, they flutter harder). */
  function jitter(now, amp) {
    var t = now * 0.001;
    var mult = (cSpeed < 2) ? JITTER_HOVER_MULT : 1;
    /* Shy bat flutters harder when cursor is nearby */
    if (tier === 0 && state === 'FLYING') {
      var cd = Math.sqrt((mx - px) * (mx - px) + (my - py) * (my - py));
      if (cd < 200) mult *= 1 + (200 - cd) / 100;
    }
    var a = amp * mult;
    return {
      x: (Math.sin(t * 2.3) + Math.sin(t * 3.7) * 0.6) * a,
      y: (Math.cos(t * 1.9) + Math.cos(t * 4.1) * 0.5) * a
    };
  }

  /* Exact framerate-independent lerp — identical result at any Hz */
  function moveLerp(targetX, targetY, lerp, dt) {
    var f = 1 - Math.pow(1 - lerp, dt / REF_DT);
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
      if (px < -DW || px > window.innerWidth + DW ||
          py < -DH || py > window.innerHeight + DH) hideBat();
      return;
    }

    if (state === 'FLYIN') {
      var dx = tx - px, dy = ty - py;
      var dist = Math.sqrt(dx * dx + dy * dy);
      moveLerp(tx, ty, 0.008, dt);
      clampAndTransform();
      if (dist < 40) {
        var r = roosts[roostIdx];
        var headingToRoost = Math.abs(tx - r.x) < 10 && Math.abs(ty - r.y) < 10;
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

    var frozen = state === 'ROOSTING' || state === 'CURIOUS' || state === 'DEAD' ||
                 state === 'DYING' || state === 'SPAWNING' || state === 'HIT' ||
                 state === 'LANDING';
    if (frozen) return;

    /* Jitter is VISUAL ONLY — smoothed via its own lerp so it drifts
       instead of teleporting, then applied in clampAndTransform.
       px/py stay clean for grab detection. */
    var j = jitter(now, JITTER_AMP[tier]);
    if (state === 'GRABBING') { jx = jy = 0; }
    else {
      var jf = 1 - Math.pow(1 - 0.03, dt / REF_DT);
      jx += (j.x - jx) * jf;
      jy += (j.y - jy) * jf;
    }

    if (tier === 0 && state === 'FLYING') {
      var dx = tx - px, dy = ty - py;
      var dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < 40) {
        var r = roosts[roostIdx];
        var atRoost = Math.abs(tx - r.x) < 10 && Math.abs(ty - r.y) < 10;
        if (atRoost) {
          px = r.x; py = r.y; jx = jy = 0; clampAndTransform();
          state = 'LANDING';
          setAnim('appearance', true);
          return;
        }
        pickWanderTarget();
      }

      var curDist = Math.sqrt((mx - px) * (mx - px) + (my - py) * (my - py));
      if (curDist < 80) {
        pickWanderTarget();
        clearTimeout(autoRoostTid);
        autoRoostTid = setTimeout(function () {
          if (state !== 'FLYING' || tier !== 0) return;
          flyToRoost();
        }, 3000 + Math.random() * 4000);
      } else if (curDist < 150 && now - lastWander > WANDER_COOLDOWN) {
        pickWanderTarget();
      }

      moveLerp(tx, ty, LERP_FLY[0], dt);
      clampAndTransform();
      return;
    }

    /* Tiers 1 & 2 */
    if (state === 'FLYING') {
      /* No cursor: wander instead of chasing */
      if (!hasCursor) {
        var distToTarget = Math.sqrt((tx - px) * (tx - px) + (ty - py) * (ty - py));
        if (distToTarget < 40 && now - lastWander > WANDER_COOLDOWN) pickWanderTarget();
        moveLerp(tx, ty, LERP_FLY[tier], dt);
        clampAndTransform();
        return;
      }

      distToTarget = Math.sqrt((tx - px) * (tx - px) + (ty - py) * (ty - py));
      if (distToTarget < GRAB_RADIUS && now - lastMove > GRAB_IDLE_MS[tier]) {
        jx = jy = 0;
        enter('GRABBING');
        return;
      }

      if (cSpeed < 2 && now - boredStart > BORED_MS[tier]) {
        flyToRoost();
        return;
      }
      if (cSpeed >= 2) boredStart = now;
    }

    var spd = LERP_FLY[tier];
    if (state === 'GRABBING') spd = (anim === 'grab3') ? GRAB3_LERP : GRAB_LERP;
    moveLerp(tx, ty, spd, dt);
    clampAndTransform();
  }

  function clampAndTransform() {
    if (state !== 'FLYOFF' && state !== 'FLYOFF_WARMUP') {
      px = Math.max(0, Math.min(window.innerWidth - DW, px));
      py = Math.max(0, Math.min(window.innerHeight - DH, py));
    }
    el.style.transform = 'translate3d(' + Math.round(px + jx) + 'px,' + Math.round(py + jy) + 'px,0)';
  }

  function updateFacing() {
    if (state === 'FLYOFF' || state === 'FLYIN' || state === 'FLYOFF_WARMUP') {
      var dx = tx - px;
      if (Math.abs(dx) > FLIP_HYSTERESIS) facingLeft = dx < 0;
      return;
    }
    if (state !== 'FLYING') return;
    if (anim === 'turnaround') return;
    var target = (tier === 0) ? tx : mx;
    var dx = target - px;
    if (Math.abs(dx) < FLIP_HYSTERESIS) return;
    var wantLeft = dx < 0;
    if (wantLeft === facingLeft) return;
    pendingFlip = wantLeft;
    setAnim('turnaround');
  }

  function updateFlightAnim() {
    if (state !== 'FLYING') return;
    if (!CFG[anim].interrupt) return;
    if (tier === 0) return;

    var curDist = Math.sqrt((mx - px) * (mx - px) + (my - py) * (my - py));
    var dx = px - prevPx, dy = py - prevPy;
    var vel = Math.sqrt(dx * dx + dy * dy);
    prevPx = px; prevPy = py;

    var now = Date.now();
    if (curDist > DASH_DIST && anim !== 'dash' && now - lastDashEnd > DASH_COOLDOWN) {
      setAnim('dash'); return;
    }
    if (curDist <= DASH_DIST && anim === 'dash') {
      lastDashEnd = now; setAnim('move2'); return;
    }
    if (anim === 'move1' && vel > 3) setAnim('move2');
    else if (anim === 'move2' && vel < 1.5) setAnim('move1');
  }

  function updateGrab() {
    if (state !== 'GRABBING') return;
    if (anim === 'grab1') return;

    if (anim === 'grab2' && Date.now() - feedStart > FEED_TIME) {
      if (window.__kdrIncrement) window.__kdrIncrement('meals');
      stopFeedingDrip();
      startHealingDrip();
      tier = 0;
      timesDisturbed = 0;
      flyToRoost();
      return;
    }

    /* tx/ty already offset to bat's top-left — match the GRAB_RADIUS entry check */
    var distToCursor = Math.sqrt((tx - px) * (tx - px) + (ty - py) * (ty - py));
    if (cSpeed > GRAB_BREAK || distToCursor > GRAB_DIST_BREAK) { stopAllDrips(); enter('FLYING'); return; }

    var cursorMoving = performance.now() - lastMove < GRAB3_SETTLE_MS;
    if (cursorMoving && anim === 'grab2') setAnim('grab3');
    else if (!cursorMoving && anim === 'grab3') { setAnim('grab2'); feedStart = Date.now(); }
  }

  function measureSpeed() {
    if (pmx < 0) { pmx = mx; pmy = my; return; }
    var dx = mx - pmx, dy = my - pmy;
    var raw = Math.sqrt(dx * dx + dy * dy);
    cSpeed = cSpeed * (1 - SPEED_SMOOTH) + raw * SPEED_SMOOTH;
    pmx = mx;
    pmy = my;
  }

  function onMouse(e) {
    var nx = e.clientX, ny = e.clientY;
    var moved = Math.abs(nx - mx) > 3 || Math.abs(ny - my) > 3;
    if (moved) lastMove = performance.now();
    mx = nx;
    my = ny;
    hasCursor = true;
    clearTimeout(leaveTid);

    if (state === 'ROOSTING' || state === 'CURIOUS') {
      var dx = mx - px - DW / 2, dy = my - py - DH / 2;
      if (Math.sqrt(dx * dx + dy * dy) < NEAR_ROOST[tier]) {
        tier = Math.min(2, timesDisturbed);
        timesDisturbed++;
        if (tier > 0) { tx = mx - DW / 2; ty = my - DH / 2; }
        enter('FLYING');
      }
    } else if ((state === 'FLYING' || state === 'GRABBING') && tier > 0) {
      /* FLYING: threshold prevents hand tremor from resetting convergence.
         GRABBING: always track — tight follow matters more than stability. */
      if (moved || state === 'GRABBING') { tx = mx - DW / 2; ty = my - DH / 2; }
    }
  }

  function onLeave() {
    hasCursor = false;
    clearTimeout(leaveTid);
    leaveTid = setTimeout(function () {
      if (hasCursor) return;
      if (state === 'GRABBING') enter('FLYING');
      /* Wander aggressively while cursor is absent */
      if (state === 'FLYING') pickWanderTarget();
    }, LEAVE_GRACE_MS);
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
    var t = e.touches[0];
    if (!t) return;
    mx = t.clientX;
    my = t.clientY;
    tx = mx - DW / 2;
    ty = my - DH / 2;
    lastMove = performance.now();
    hasCursor = true;
    if (state === 'ROOSTING' || state === 'CURIOUS') {
      tier = Math.min(2, timesDisturbed);
      timesDisturbed++;
      enter('FLYING');
    }
  }

  function onTouchEnd() {
    hasCursor = false;
    if (state === 'GRABBING') enter('FLYING');
    if (state === 'FLYING') pickWanderTarget();
  }

  function addRoost(selector, anchor) {
    var el = document.querySelector(selector);
    if (!el) return;
    var r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return;
    switch (anchor) {
      case 'hang-left':   roosts.push({ x: r.left, y: r.bottom - 6 }); break;
      case 'hang-right':  roosts.push({ x: r.right - DW, y: r.bottom - 6 }); break;
      case 'hang-center': roosts.push({ x: r.left + r.width / 2 - DW / 2, y: r.bottom - 6 }); break;
      case 'top-left':    roosts.push({ x: r.left, y: r.top }); break;
      case 'top-right':   roosts.push({ x: r.right - DW, y: r.top }); break;
    }
  }

  function computeRoosts() {
    roosts = [];
    var hdr = document.querySelector('.md-header');
    var hdrBottom = hdr ? hdr.getBoundingClientRect().bottom - 6 : 80;
    var w = window.innerWidth;

    /* Favorite: left-side divider on source link (~25% weight) */
    addRoost('.md-header__source', 'hang-left');

    /* Random points along header bottom edge and top of screen */
    roosts.push({ x: DW + Math.random() * (w - DW * 3), y: hdrBottom });
    roosts.push({ x: DW + Math.random() * (w - DW * 3), y: hdrBottom });
    roosts.push({ x: DW + Math.random() * (w - DW * 3), y: 0 });
  }

  function pickRoost() {
    computeRoosts();
    /* First roost after spawn always goes to the favorite spot */
    if (firstRoost) { roostIdx = 0; firstRoost = false; return; }
    if (roosts.length <= 1) { roostIdx = 0; return; }
    var old = roostIdx;
    do { roostIdx = Math.floor(Math.random() * roosts.length); } while (roostIdx === old);
  }

  function flyToRoost() {
    clearTimeout(autoRoostTid);
    clearTimeout(curiousTid);
    pickRoost();
    var r = roosts[roostIdx];
    tx = r.x;
    ty = r.y;
    jx = jy = 0;
    state = 'FLYIN';
    setAnim('move1');
  }

  function dismiss() {
    if (dismissing || state === 'HIDDEN') return;
    if (Date.now() - lastDismiss < DISMISS_COOLDOWN) {
      jitterButton();
      return;
    }
    dismissing = true;
    lastDismiss = Date.now();
    clearTimeout(respawnTid);
    clearTimeout(curiousTid);
    clearTimeout(autoRoostTid);
    clearTimeout(tierDecayTid);
    fading = false;
    ctx.clearRect(0, 0, W, H);
    el.style.transition = '';
    el.style.opacity = '1';

    var edge = Math.floor(Math.random() * 4);
    if (edge === 0) { tx = px; ty = -DH * 2; }
    else if (edge === 1) { tx = window.innerWidth + DW * 2; ty = py; }
    else if (edge === 2) { tx = px; ty = window.innerHeight + DH * 2; }
    else { tx = -DW * 2; ty = py; }
    facingLeft = tx < px;

    var wasPerched = state === 'ROOSTING' || state === 'CURIOUS';
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

  window.__batthewInCooldown = function () {
    return Date.now() - lastDismiss < DISMISS_COOLDOWN;
  };

  window.__batthewJitter = jitterButton;

  function jitterButton() {
    var btn = document.getElementById('coterie-bat-toggle');
    if (!btn) return;
    var offsets = [[2,-1],[-2,2],[1,-2],[-1,1],[0,0]];
    offsets.forEach(function (o, i) {
      setTimeout(function () {
        btn.style.transform = 'translate(' + o[0] + 'px,' + o[1] + 'px)';
      }, i * 50);
    });
  }

  function summon() {
    if (Date.now() - lastDismiss < DISMISS_COOLDOWN) { jitterButton(); return; }
    clearTimeout(autoRoostTid);
    clearTimeout(curiousTid);
    clearTimeout(tierDecayTid);
    clearTimeout(respawnTid);
    cvs.style.pointerEvents = '';
    dismissing = false;
    enabled = true;
    el.style.display = '';

    var edge = Math.floor(Math.random() * 4);
    if (edge === 0) { px = Math.random() * window.innerWidth; py = -DH * 2; }
    else if (edge === 1) { px = window.innerWidth + DW * 2; py = Math.random() * window.innerHeight; }
    else if (edge === 2) { px = Math.random() * window.innerWidth; py = window.innerHeight + DH * 2; }
    else { px = -DW * 2; py = Math.random() * window.innerHeight; }
    el.style.transform = 'translate3d(' + Math.round(px) + 'px,' + Math.round(py) + 'px,0)';

    tx = DW + Math.random() * (window.innerWidth - DW * 2);
    ty = DH + Math.random() * (window.innerHeight * 0.5);
    facingLeft = tx < px;
    state = 'FLYIN';
    setAnim(Math.random() < 0.5 ? 'move1' : 'move2');
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
    var wantOn;
    try { wantOn = localStorage.getItem('coterie-bat-mode') !== 'off'; }
    catch (e) { wantOn = true; }

    if (wantOn && !enabled) summon();
    else if (!wantOn && enabled && !dismissing) dismiss();
  }

  function checkReduced() {
    reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!el) return;
    el.style.display = enabled && !reduced ? '' : 'none';
    if (reduced && enabled) {
      setAnim('idle1');
      frame = 0;
      render();
    }
  }

  function loop(now) {
    requestAnimationFrame(loop);
    if (!enabled || document.hidden || reduced) return;
    var dt = lastTime ? now - lastTime : 0;
    lastTime = now;
    if (dt > 200) dt = 0;
    measureSpeed();
    updatePos(dt, now);
    updateFacing();
    updateFlightAnim();
    updateGrab();
    stepAnim(dt);
    render();
  }

  function watchTheme() {
    new MutationObserver(function () {
      var t = getTheme();
      if (t === theme) return;
      preload(t, function () { theme = t; });
    }).observe(document.body, { attributes: true, attributeFilter: ['data-md-color-scheme'] });
  }

  function bindEvents() {
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
        if (state === 'FLYING' || state === 'GRABBING') flyToRoost();
      }
    });

    var resizeTid = null;
    window.addEventListener('resize', function () {
      /* Debounce — SPA page swaps often fire resize as content height changes,
         and we don't want to reset the bat's position on every navigation */
      clearTimeout(resizeTid);
      resizeTid = setTimeout(function () {
        if (state === 'ROOSTING' || state === 'CURIOUS') flyToRoost();
      }, 500);
    });

    window.matchMedia('(prefers-reduced-motion: reduce)')
      .addEventListener('change', checkReduced);

    var toggle = document.getElementById('coterie-bat-toggle');
    if (toggle) toggle.addEventListener('click', function () {
      setTimeout(syncEnabled, 50);
    });

    /* Hide bat behind search overlay */
    var searchInput = document.querySelector('.md-search__input');
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

      lives = MAX_LIVES;
      deaths = 0;
      tier = 0;
      timesDisturbed = 0;
      computeRoosts();

      if (reduced) {
        var r = roosts[roostIdx];
        px = r.x; py = r.y;
        clampAndTransform();
        anim = 'idle1';
        frame = 0;
        render();
        watchTheme();
        return;
      }

      /* Resume from prior session: fly in from edge instead of full spawn */
      var returning = false;
      try { returning = localStorage.getItem('coterie-bat-active') === '1'; } catch (e) {}
      if (returning) {
        var edge = Math.floor(Math.random() * 4);
        if (edge === 0) { px = Math.random() * window.innerWidth; py = -DH * 2; }
        else if (edge === 1) { px = window.innerWidth + DW * 2; py = Math.random() * window.innerHeight; }
        else if (edge === 2) { px = Math.random() * window.innerWidth; py = window.innerHeight + DH * 2; }
        else { px = -DW * 2; py = Math.random() * window.innerHeight; }
        clampAndTransform();
        tx = DW + Math.random() * (window.innerWidth - DW * 2);
        ty = DH + Math.random() * (window.innerHeight * 0.5);
        facingLeft = tx < px;
        state = 'FLYIN';
        setAnim(Math.random() < 0.5 ? 'move1' : 'move2');
      } else {
        enter('SPAWNING');
      }
      try { localStorage.setItem('coterie-bat-active', '1'); } catch (e) {}

      bindEvents();
      watchTheme();
      loop(performance.now());
    });
  }

  /* Blood drip particle system — pixel blood drops from cursor during grab cycle */
  var BLOOD_FRESH = '#E40707';
  var BLOOD_DARK = '#6B0606';
  var DRIP_CAP = 30;
  var DRIP_GRAVITY = 0.08;
  var DRIP_BASE_MS = 750;

  var dripBox = null;
  var drips = [];
  var dripRaf = null;
  var dripRunning = false;
  var heartbeatTid = null;
  var healTid = null;
  var healCount = 0;
  var healTarget = 0;

  function ensureDripBox() {
    if (dripBox) return;
    dripBox = document.createElement('div');
    dripBox.className = 'blood-drips';
    document.body.appendChild(dripBox);
  }

  function spawnDrip(x, y, color, sizeMin, sizeMax, vyMin, vyMax, vxSpread) {
    if (reduced || !enabled || !dripBox) return;
    if (drips.length >= DRIP_CAP) {
      var old = drips.shift();
      if (old.el.parentNode) old.el.parentNode.removeChild(old.el);
    }
    var sz = sizeMin + Math.random() * (sizeMax - sizeMin);
    var d = document.createElement('div');
    d.className = 'blood-drip';
    d.style.width = sz + 'px';
    d.style.height = sz + 'px';
    d.style.backgroundColor = color;
    dripBox.appendChild(d);

    var particle = {
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
    var i = drips.length;
    while (i--) {
      var d = drips[i];
      d.vy += DRIP_GRAVITY;
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
    var count = 3 + Math.floor(Math.random() * 4);
    for (var i = 0; i < count; i++) {
      spawnDrip(mx, my, BLOOD_FRESH, 4, 8, 1.0, 3.0, 3.0);
    }
  }

  function startFeedingDrip() {
    stopFeedingDrip();
    ensureDripBox();
    scheduleFeedDrip();
  }

  function scheduleFeedDrip() {
    var elapsed = Date.now() - feedStart;
    var progress = Math.min(elapsed / FEED_TIME, 1);
    /* Widen interval as feeding progresses — starts brisk, tapers off */
    var interval = DRIP_BASE_MS * (1 + progress * 0.8);
    /* Wide random variance per Sam's request */
    var jitter = interval * 0.5;
    var delay = interval + (Math.random() - 0.5) * jitter;

    heartbeatTid = setTimeout(function () {
      if (state !== 'GRABBING') return;
      var progress2 = Math.min((Date.now() - feedStart) / FEED_TIME, 1);
      var color = progress2 < 0.6 ? BLOOD_FRESH : BLOOD_DARK;
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
    var delay = 800 + Math.random() * 700;
    healTid = setTimeout(function () {
      var t = healCount / healTarget;
      var lo = 2 + (1 - t) * 3;
      var hi = 3 + (1 - t) * 5;
      spawnDrip(mx, my, BLOOD_DARK, lo, hi, 0.1, 0.5, 0.3);
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

  var inited = false;
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
