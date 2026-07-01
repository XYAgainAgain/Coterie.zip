(function () {
  'use strict';

  window.Coterie = window.Coterie || {};
  window.Coterie.batthew = window.Coterie.batthew || {};

  /* On SPA re-execution: re-attach bats if Zensical removed them during content swap.
     MutationObserver catches ALL removal methods (some nav types skip document$). */
  if (window.Coterie.batthew._init) {
    if (!window.Coterie.batthew._reattach) {
      window.Coterie.batthew._reattach = true;
      new MutationObserver(function () {
        (window.Coterie.batthew.els || []).forEach(function (el) {
          if (el && !el.parentNode) document.body.appendChild(el);
        });
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
    DASH_DIST: 350,
    ROOST_OCCUPIED: 16
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

  // Swarm (B keybind clones)
  const SWARM = {
    MAX_BATS: 15,
    FEED_SLOTS: 2,
    FEED_OFFSET: 24,
    BURST_MIN: 2,
    BURST_MAX: 5,
    BURST_STAGGER_MS: 150
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

  // Shared state (one copy for the whole swarm)
  const sheets = {};
  let theme;
  let mx = -1, my = -1;
  let pmx = -1, pmy = -1;
  let cSpeed = 0;
  let lastMove = 0;
  let hasCursor = false;
  let reduced = false;
  let lastTime = 0;
  let rafId = null;
  let _eventsBound = false;
  let _themeWatching = false;
  let enabled = true;
  let lastDismiss = 0;
  let roosts = [];

  /* bats[0] is always the primary Batthew; clones follow. feeders holds the (max 2)
     bats currently latched on the cursor, in slot order (0 = left, 1 = right). */
  const bats = [];
  const feeders = [];

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
      img.onerror = function () { console.warn('[Batthew] sprite failed to load: ' + t + '/' + name); if (--n === 0) cb(); };
      img.src = BASE + t + '/' + name + '.webp';
    });
  }

  function frameCount(name) {
    const img = sheets[theme] && sheets[theme][name];
    return img ? Math.floor(img.naturalWidth / SPRITE.W) : 1;
  }

  // Roost geometry (shared; occupancy is checked by proximity, not index claims)

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
    /* Spot count scales with the swarm so 15 bats aren't brawling over 4 perches */
    const spots = Math.max(2, bats.length);
    for (let i = 0; i < spots; i++) {
      roosts.push({ x: DISPLAY.DW + Math.random() * (w - DISPLAY.DW * 3), y: hdrBottom });
    }
    roosts.push({ x: DISPLAY.DW + Math.random() * (w - DISPLAY.DW * 3), y: 0 });
  }

  /* A perched (or landing) bat within snap distance of a spot owns it */
  function roostOccupant(spot, self) {
    for (let i = 0; i < bats.length; i++) {
      const b = bats[i];
      if (b === self) continue;
      const s = b.getState();
      if (s !== 'ROOSTING' && s !== 'CURIOUS' && s !== 'LANDING') continue;
      if (Math.abs(b.getX() - spot.x) < DISTANCE.ROOST_OCCUPIED &&
          Math.abs(b.getY() - spot.y) < DISTANCE.ROOST_OCCUPIED) return b;
    }
    return null;
  }

  /* Spec ruling: bats never share a roost. Arrival at an occupied spot flushes the
     sitter into the air and a coin toss decides who gets to settle there. */
  function contestRoost(spot, arriver, sitter) {
    sitter.flush();
    if (Math.random() < 0.5) {
      arriver.flyToSpot(spot);
    } else {
      sitter.flyToSpot(spot);
      arriver.flush();
    }
  }

  function removeFeeder(b) {
    const i = feeders.indexOf(b);
    if (i >= 0) feeders.splice(i, 1);
  }

  let scrapWinner = null;

  function panicScatter(cx, cy, struck) {
    for (let i = 0; i < bats.length; i++) {
      const b = bats[i];
      if (b === struck || b === scrapWinner) continue;
      b.spook(cx, cy);
    }
  }

  // Bat scraps: rare mid-air squabbles; the initiator bites, the loser takes 1 hit
  let lastScrap = 0;
  let scrapAccum = 0;

  function maybeScrap(now, dt) {
    scrapAccum += dt;
    if (scrapAccum < 500) return;
    scrapAccum = 0;
    if (now - lastScrap < 8000 || bats.length < 2) return;
    for (let i = 0; i < bats.length; i++) {
      if (bats[i].getState() !== 'FLYING') continue;
      for (let j = i + 1; j < bats.length; j++) {
        if (bats[j].getState() !== 'FLYING') continue;
        const dx = bats[i].getX() - bats[j].getX();
        const dy = bats[i].getY() - bats[j].getY();
        if (Math.sqrt(dx * dx + dy * dy) > 60) continue;
        if (Math.random() >= 0.02) continue;
        lastScrap = now;
        const first = Math.random() < 0.5;
        const winner = first ? bats[i] : bats[j];
        const loser = first ? bats[j] : bats[i];
        /* Winner holds its ground while the loser's HIT scatters the bystanders */
        scrapWinner = winner;
        winner.scrapLunge(loser.getX(), loser.getY());
        loser.pokeHit();
        scrapWinner = null;
        return;
      }
    }
  }

  // Bat factory: all per-instance state lives in this closure

  function createBat(isClone) {
    let el, cvs, ctx;
    let anim, frame;
    let animAccum = 0;
    let animDone = false;
    let animReverse = false;
    let facingLeft = false;
    let pendingFlip = false;
    let px, py;
    let jx = 0, jy = 0;
    let prevPx = 0, prevPy = 0;
    let tx = -1, ty = -1;
    let lives = isClone ? 1 : BEHAVIOR.MAX_LIVES;
    let deaths = 0, tier = 0, timesDisturbed = 0;
    let state;
    let dismissing = false;
    let wantCurious = false;
    let echoChance = false;
    let echoFlyTid = null;
    let digestUntil = 0;
    let fading = false;
    let feedStart = 0;
    let feedTime = 10000;
    let boredStart = 0;
    let lastWander = 0;
    let lastDashEnd = 0;
    let tierDecayTid = null;
    let respawnTid = null;
    let curiousTid = null;
    let autoRoostTid = null;
    let heartbeatTid = null;
    let healTid = null;
    let healCount = 0;
    let healTarget = 0;
    let roostTarget = null;
    let firstRoost = !isClone;
    let destroyed = false;
    /* Personal desync: unique wobble phase + a slowly circling wait-your-turn orbit slot,
       so a thirsty crowd never syncs up and stacks on one pixel. */
    const wobblePhase = Math.random() * Math.PI * 2;
    let orbitAngle = Math.random() * Math.PI * 2;
    const orbitDir = Math.random() < 0.5 ? -1 : 1;
    const orbitDist = 40 + Math.random() * 50;
    let followUntil = 0;
    const followOx = (Math.random() - 0.5) * 90;
    const followOy = 20 + Math.random() * 40;

    function createDOM() {
      el = document.createElement('div');
      el.className = 'batthew';
      if (!isClone) el.id = 'batthew';
      el.setAttribute('aria-hidden', 'true');

      cvs = document.createElement('canvas');
      /* DPR capped at 2: pixel art gains nothing at 3×, and canvas fill cost scales with DPR² */
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      cvs.width = DISPLAY.DW * dpr;
      cvs.height = DISPLAY.DH * dpr;
      cvs.style.width = DISPLAY.DW + 'px';
      cvs.style.height = DISPLAY.DH + 'px';

      ctx = cvs.getContext('2d');
      ctx.imageSmoothingEnabled = false;
      ctx.scale(dpr * SPRITE.SCALE, dpr * SPRITE.SCALE);

      cvs.addEventListener('click', function (e) { e.stopPropagation(); hitBat(); });
      cvs.addEventListener('touchstart', function (e) { e.stopPropagation(); hitBat(); });

      el.appendChild(cvs);
      document.body.appendChild(el);
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
            setTimeout(function () {
              if (state === 'FLYOFF_WARMUP') {
                state = 'FLYOFF';
                setAnim('dash');
              }
            }, 400);
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
            if (isClone) { destroy(); return; }
            el.style.transition = '';
            ctx.clearRect(0, 0, SPRITE.W, SPRITE.H);
            enter('DEAD');
          }, TIMING.DEATH_FADE_MS);
          break;
      }
    }

    const STATES = {
      SPAWNING: {
        enter() {
          cvs.style.pointerEvents = '';
          fading = false;
          el.style.opacity = '1';
          px = DISPLAY.DW + Math.random() * (window.innerWidth - DISPLAY.DW * 3);
          py = window.innerHeight - DISPLAY.DH;
          clampAndTransform();
          setAnim('death1', true);
        }
      },
      ROOSTING: {
        enter() {
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
        }
      },
      CURIOUS: {
        enter() {
          setAnim('idle2');
          echoChance = Date.now() >= digestUntil && Math.random() < 0.75;
        }
      },
      FLYING: {
        enter() {
          setAnim('move1');
          boredStart = performance.now();
          scheduleEchoFly();
          /* Clones sometimes fall in behind the primary for a few seconds of formation
             flying. Always reset first so an interrupted follow can't resume unrolled. */
          followUntil = 0;
          if (isClone && Math.random() < 0.25 && primary) {
            const ps = primary.getState();
            if (ps === 'FLYING' || ps === 'FLYIN') followUntil = performance.now() + 3000 + Math.random() * 3000;
          }
          if (Date.now() < digestUntil) {
            pickWanderTarget();
            clearTimeout(autoRoostTid);
            autoRoostTid = setTimeout(function () {
              if (state !== 'FLYING') return;
              flyToRoost();
            }, 2000 + Math.random() * 1000);
            return;
          }
          if (tier === 0) {
            pickWanderTarget();
            armAutoRoost();
          }
        },
        update(dt, now) {
          const j = jitter(now, JITTER.AMP[tier]);
          const jf = 1 - Math.pow(1 - 0.03, dt / TIMING.REF_DT);
          jx += (j.x - jx) * jf;
          jy += (j.y - jy) * jf;

          if (tier === 0) {
            if (followUntil > now) {
              const ps = primary ? primary.getState() : 'HIDDEN';
              if (ps === 'FLYING' || ps === 'FLYIN') {
                tx = primary.getX() + followOx;
                ty = primary.getY() + followOy;
                moveLerp(tx, ty, 0.012, dt);
                clampAndTransform();
                return;
              }
              followUntil = 0;
            }
            const dx = tx - px, dy = ty - py;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist < 40) {
              if (roostTarget && Math.abs(tx - roostTarget.x) < 10 && Math.abs(ty - roostTarget.y) < 10) {
                tryLand();
                return;
              }
              pickWanderTarget();
            }

            const curDist = Math.sqrt((mx - px) * (mx - px) + (my - py) * (my - py));
            if (curDist < 80) {
              pickWanderTarget();
              armAutoRoost();
            } else if (curDist < 150 && now - lastWander > TIMING.WANDER_COOLDOWN) {
              pickWanderTarget();
            }

            moveLerp(tx, ty, MOVEMENT.LERP_FLY[0], dt);
            clampAndTransform();
            return;
          }

          if (!hasCursor) {
            const distToTarget = Math.sqrt((tx - px) * (tx - px) + (ty - py) * (ty - py));
            if (distToTarget < 40 && now - lastWander > TIMING.WANDER_COOLDOWN) pickWanderTarget();
            moveLerp(tx, ty, MOVEMENT.LERP_FLY[tier], dt);
            clampAndTransform();
            return;
          }

          const distToTarget = Math.sqrt((tx - px) * (tx - px) + (ty - py) * (ty - py));
          if (distToTarget < DISTANCE.GRAB_RADIUS && now - lastMove > BEHAVIOR.GRAB_IDLE_MS[tier] &&
              feeders.length < SWARM.FEED_SLOTS) {
            jx = jy = 0;
            enter('GRABBING');
            return;
          }

          if (cSpeed < 2 && now - boredStart > BEHAVIOR.BORED_MS[tier]) {
            flyToRoost();
            return;
          }
          if (cSpeed >= 2) boredStart = now;

          /* Both drinking slots taken: circle the cursor at a personal radius instead of
             piling onto the center point; dive back in the moment a slot frees. */
          let ox = 0, oy = 0;
          if (feeders.length >= SWARM.FEED_SLOTS) {
            orbitAngle += orbitDir * dt * 0.0004;
            ox = Math.cos(orbitAngle) * orbitDist;
            oy = Math.sin(orbitAngle) * orbitDist * 0.6;
          }
          moveLerp(tx + ox, ty + oy, MOVEMENT.LERP_FLY[tier], dt);
          clampAndTransform();
        }
      },
      GRABBING: {
        enter() {
          stopAllDrips();
          feeders.push(bat);
          setAnim('grab1');
          /* Swarm bites and meals feed the worldwide counters (deaths stay the primary's:
             clone deaths are attrition, but their kills juice the K/D — funnier that way) */
          if (window.__kdrIncrement) window.__kdrIncrement('bites');
          biteSplash();
        },
        update(dt) {
          jx = jy = 0;
          /* Two feeders share the wrist: mirrored offsets, always facing each other.
             A lone feeder drifts back to the usual centered spot. */
          const slot = feeders.indexOf(bat);
          let off = 0;
          if (feeders.length > 1) {
            off = slot === 0 ? -SWARM.FEED_OFFSET : SWARM.FEED_OFFSET;
            facingLeft = slot !== 0;
          }
          const spd = (anim === 'grab3') ? MOVEMENT.GRAB3_LERP : MOVEMENT.GRAB_LERP;
          moveLerp(tx + off, ty, spd, dt);
          clampAndTransform();
        }
      },
      HIT: {
        enter() {
          stopAllDrips();
          setAnim('hit');
          tier = Math.min(2, tier + 1);
          timesDisturbed = Math.max(timesDisturbed, tier);
          panicScatter(px + DISPLAY.DW / 2, py + DISPLAY.DH / 2, bat);
        }
      },
      DYING: {
        enter() {
          stopAllDrips();
          deaths++;
          if (!isClone && window.__kdrIncrement) window.__kdrIncrement('deaths');
          setAnim(deaths >= 3 ? 'death1' : 'death2');
        }
      },
      DEAD: {
        enter() {
          cvs.style.pointerEvents = 'none';
          clearTimeout(respawnTid);
          const delay = deaths >= 3
            ? TIMING.RESPAWN_LONG[0] + Math.random() * (TIMING.RESPAWN_LONG[1] - TIMING.RESPAWN_LONG[0])
            : TIMING.RESPAWN_QUICK;
          respawnTid = setTimeout(function () { enter('RESPAWNING'); }, delay);
        }
      },
      RESPAWNING: {
        enter() {
          if (deaths >= 3) { deaths = 0; tier = 0; timesDisturbed = 0; }
          lives = BEHAVIOR.MAX_LIVES;
          enter('SPAWNING');
        }
      },
      FLYOFF_WARMUP: {
        update(dt) {
          jx = jy = 0;
          moveLerp(tx, ty, 0.008, dt);
          clampAndTransform();
        }
      },
      FLYOFF: {
        update(dt) {
          jx = jy = 0;
          moveLerp(tx, ty, 0.03, dt);
          clampAndTransform();
          if (px < -DISPLAY.DW || px > window.innerWidth + DISPLAY.DW ||
              py < -DISPLAY.DH || py > window.innerHeight + DISPLAY.DH) {
            if (isClone) destroy();
            else hideBat();
          }
        }
      },
      FLYIN: {
        update(dt) {
          jx = jy = 0;
          const dx = tx - px, dy = ty - py;
          const dist = Math.sqrt(dx * dx + dy * dy);
          moveLerp(tx, ty, 0.008, dt);
          clampAndTransform();
          if (dist < 40) {
            if (roostTarget && Math.abs(tx - roostTarget.x) < 10 && Math.abs(ty - roostTarget.y) < 10) {
              tryLand();
            } else {
              enter('FLYING');
              pickWanderTarget();
              armAutoRoost();
            }
          }
        }
      }
    };

    function enter(s) {
      if (destroyed) return;
      if (state === 'GRABBING' && s !== 'GRABBING') removeFeeder(bat);
      state = s;
      wantCurious = false;
      clearTimeout(curiousTid);
      clearTimeout(autoRoostTid);
      clearTimeout(tierDecayTid);
      clearTimeout(echoFlyTid);
      if (STATES[s] && STATES[s].enter) STATES[s].enter();
    }

    function armAutoRoost() {
      clearTimeout(autoRoostTid);
      autoRoostTid = setTimeout(function () {
        if (state !== 'FLYING' || tier !== 0) return;
        /* Don't yank a mid-follow clone to a roost; try again after the follow ends */
        if (followUntil > performance.now()) { armAutoRoost(); return; }
        flyToRoost();
      }, 3000 + Math.random() * 4000);
    }

    /* Arrival at the target roost: land if free, otherwise flush the sitter and coin-toss */
    function tryLand() {
      const spot = roostTarget;
      const sitter = roostOccupant(spot, bat);
      if (sitter) {
        contestRoost(spot, bat, sitter);
        return;
      }
      px = spot.x; py = spot.y; jx = jy = 0; clampAndTransform();
      state = 'LANDING';
      setAnim('appearance', true);
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
      roostTarget = null;
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
      const t = now * 0.001 + wobblePhase;
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
        stopFeedingDrip();
        if (window.__kdrIncrement) window.__kdrIncrement('meals');
        /* A sated clone departs for good (attrition); the primary digests and roosts */
        if (isClone) { leave(); return; }
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

    /* Per-bat share of the shared pointer event; globals (mx/my/lastMove) already updated */
    function onCursor(moved) {
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

    function hitBat() {
      if (state === 'ROOSTING' || state === 'CURIOUS' ||
          state === 'FLYING' || state === 'GRABBING') {
        enter('HIT');
      }
    }

    function pickRoost(avoidSpot) {
      computeRoosts();
      if (firstRoost) { firstRoost = false; roostTarget = roosts[0]; return; }
      const free = roosts.filter(function (r) {
        if (avoidSpot && r === avoidSpot) return false;
        return !roostOccupant(r, bat);
      });
      const pool = free.length > 0 ? free : roosts;
      let pick = pool[Math.floor(Math.random() * pool.length)];
      /* Don't re-pick the spot we're sitting on/aiming at when there's a choice */
      if (roostTarget && pool.length > 1) {
        while (pick === roostTarget) pick = pool[Math.floor(Math.random() * pool.length)];
      }
      roostTarget = pick;
    }

    function flyToRoost() {
      removeFeeder(bat); /* direct state write bypasses enter(); free the feed slot here */
      clearTimeout(autoRoostTid);
      clearTimeout(curiousTid);
      pickRoost();
      tx = roostTarget.x;
      ty = roostTarget.y;
      jx = jy = 0;
      state = 'FLYIN';
      setAnim('move1');
    }

    function flyToSpot(spot) {
      removeFeeder(bat); /* see flyToRoost */
      clearTimeout(autoRoostTid);
      clearTimeout(curiousTid);
      roostTarget = spot;
      tx = spot.x;
      ty = spot.y;
      jx = jy = 0;
      state = 'FLYIN';
      setAnim('move1');
    }

    /* Coin-toss loser (or flushed sitter): back into the air, re-roost elsewhere soon */
    function flush() {
      enter('FLYING');
      pickWanderTarget();
      armAutoRoost();
    }

    /* A nearby swat spooks the flock: dash away from the commotion, regroup after.
       Radius scales with the viewport so 1440p+ screens scatter as readily as 1080p. */
    function spook(cx, cy) {
      if (state !== 'FLYING' && state !== 'ROOSTING' && state !== 'CURIOUS' && state !== 'GRABBING') return;
      const dx = px - cx, dy = py - cy;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      const radius = Math.max(250, Math.min(window.innerWidth, window.innerHeight) * 0.3);
      if (dist > radius) return;
      enter('FLYING');
      roostTarget = null;
      followUntil = 0;
      tx = px + (dx / dist) * 300;
      ty = py + (dy / dist) * 300;
      setAnim('dash');
      setTimeout(function () { if (state === 'FLYING' && anim === 'dash' && tier === 0) setAnim('move1'); }, 800);
    }

    /* Scrap winner's bite lunge: face the loser, dash in, settle back to cruising */
    function scrapLunge(x, y) {
      if (state !== 'FLYING') return;
      facingLeft = x < px;
      tx = x; ty = y;
      followUntil = 0;
      setAnim('dash');
      setTimeout(function () { if (state === 'FLYING' && anim === 'dash' && tier === 0) setAnim('move1'); }, 600);
    }

    function nudgeCurious() {
      if (state === 'ROOSTING') wantCurious = true;
    }

    /* Fly off-screen for good; FLYOFF's off-screen check destroys clones, hides the primary */
    function leave() {
      stopAllDrips();
      cleanupForFlight();
      const edge = Math.floor(Math.random() * 4);
      if (edge === 0) { tx = px; ty = -DISPLAY.DH * 2; }
      else if (edge === 1) { tx = window.innerWidth + DISPLAY.DW * 2; ty = py; }
      else if (edge === 2) { tx = px; ty = window.innerHeight + DISPLAY.DH * 2; }
      else { tx = -DISPLAY.DW * 2; ty = py; }
      facingLeft = tx < px;

      const wasPerched = state === 'ROOSTING' || state === 'CURIOUS';
      if (state === 'GRABBING') removeFeeder(bat);
      state = 'FLYOFF_WARMUP';

      if (wasPerched) {
        setAnim('appearance');
      } else {
        setAnim('move2');
        setTimeout(function () {
          if (state === 'FLYOFF_WARMUP') {
            state = 'FLYOFF';
            setAnim('dash');
          }
        }, 400);
      }
    }

    function cleanupForFlight() {
      clearTimeout(respawnTid);
      clearTimeout(curiousTid);
      clearTimeout(autoRoostTid);
      clearTimeout(tierDecayTid);
      clearTimeout(echoFlyTid);
      fading = false;
      ctx.clearRect(0, 0, SPRITE.W, SPRITE.H);
      el.style.transition = '';
      el.style.opacity = '1';
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

    /* Arrive-hidden path (bat mode off at load): no dismissal flight, just absent.
       Events and sprites stay wired so the toggle can summon without a reload. */
    function hideQuiet() {
      el.style.display = 'none';
      state = 'HIDDEN';
    }

    function spawnAtEdge() {
      const pos = randomEdgePosition();
      px = pos.x;
      py = pos.y;
      el.style.transform = 'translate3d(' + Math.round(px) + 'px,' + Math.round(py) + 'px,0)';
      tx = DISPLAY.DW + Math.random() * (window.innerWidth - DISPLAY.DW * 2);
      ty = DISPLAY.DH + Math.random() * (window.innerHeight * 0.5);
      roostTarget = null;
      facingLeft = tx < px;
      state = 'FLYIN';
      setAnim(Math.random() < 0.5 ? 'move1' : 'move2');
    }

    function destroy() {
      if (destroyed) return;
      destroyed = true;
      stopAllDrips();
      clearTimeout(respawnTid);
      clearTimeout(curiousTid);
      clearTimeout(autoRoostTid);
      clearTimeout(tierDecayTid);
      clearTimeout(echoFlyTid);
      removeFeeder(bat);
      const i = bats.indexOf(bat);
      if (i >= 0) bats.splice(i, 1);
      const els = window.Coterie.batthew.els || [];
      const j = els.indexOf(el);
      if (j >= 0) els.splice(j, 1);
      if (el.parentNode) el.parentNode.removeChild(el);
      state = 'HIDDEN';
      saveCloneCount();
    }

    // Per-bat blood drips (shared particle system, per-bat scheduling)

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

    function scheduleEchoFly() {
      clearTimeout(echoFlyTid);
      if (state !== 'FLYING' || Date.now() < digestUntil) return;
      const interval = ECHO.FLY_INTERVALS[tier];
      const delay = interval[0] + Math.random() * (interval[1] - interval[0]);
      echoFlyTid = setTimeout(function () {
        if (state !== 'FLYING') return;
        const op = ECHO.FLY_OPACITY[tier];
        emitEchoPulse(bat, op);
        if (tier === 2) {
          /* Double-chirp: second pulse 100ms after first concludes */
          echoFlyTid = setTimeout(function () {
            if (state === 'FLYING') emitEchoPulse(bat, op);
            scheduleEchoFly();
          }, ECHO.EMIT_MS + ECHO.RETURN_MS + 100);
        } else {
          scheduleEchoFly();
        }
      }, delay);
    }

    function tickFrame(dt, now) {
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
        emitEchoPulse(bat);
      }
      render();
    }

    function updatePos(dt, now) {
      if (STATES[state] && STATES[state].update) STATES[state].update(dt, now);
    }

    createDOM();

    const bat = {
      isClone: isClone,
      getState: function () { return state; },
      setState: function (s) { state = s; },
      getX: function () { return px; },
      getY: function () { return py; },
      getTier: function () { return tier; },
      getFacingLeft: function () { return facingLeft; },
      getEl: function () { return el; },
      getCvs: function () { return cvs; },
      getCtx: function () { return ctx; },
      isFading: function () { return fading; },
      getDigestUntil: function () { return digestUntil; },
      setDismissing: function (v) { dismissing = v; },
      isDismissing: function () { return dismissing; },
      enter: enter,
      tickFrame: tickFrame,
      onCursor: onCursor,
      flyToRoost: flyToRoost,
      flyToSpot: flyToSpot,
      flush: flush,
      hideQuiet: hideQuiet,
      spook: spook,
      scrapLunge: scrapLunge,
      nudgeCurious: nudgeCurious,
      pokeHit: hitBat,
      leave: leave,
      hideBat: hideBat,
      spawnAtEdge: spawnAtEdge,
      destroy: destroy,
      stopAllDrips: stopAllDrips,
      cleanupForFlight: cleanupForFlight,
      setAnimPublic: setAnim,
      renderPublic: render,
      setFacing: function (v) { facingLeft = v; },
      setTarget: function (x, y) { tx = x; ty = y; },
      getTx: function () { return tx; },
      resetVitals: function () { lives = isClone ? 1 : BEHAVIOR.MAX_LIVES; deaths = 0; tier = 0; timesDisturbed = 0; },
      setIdleStatic: function () { anim = 'idle1'; frame = 0; render(); },
      placeAt: function (x, y) { px = x; py = y; clampAndTransform(); }
    };
    return bat;
  }

  // Shared cursor handling

  function measureSpeed() {
    if (pmx < 0) { pmx = mx; pmy = my; return; }
    const dx = mx - pmx, dy = my - pmy;
    const raw = Math.sqrt(dx * dx + dy * dy);
    cSpeed = cSpeed * (1 - MOVEMENT.SPEED_SMOOTH) + raw * MOVEMENT.SPEED_SMOOTH;
    pmx = mx;
    pmy = my;
  }

  function handlePointer(clientX, clientY) {
    const moved = Math.abs(clientX - mx) > 3 || Math.abs(clientY - my) > 3;
    if (moved) lastMove = performance.now();
    mx = clientX;
    my = clientY;
    hasCursor = true;
    let disturbed = false;
    for (let i = 0; i < bats.length; i++) {
      if (bats[i].onCursor(moved)) disturbed = true;
    }
    return disturbed;
  }

  let leaveTid = null;

  function onMouse(e) {
    handlePointer(e.clientX, e.clientY);
    clearTimeout(leaveTid);
  }

  function onLeave() {
    hasCursor = false;
    clearTimeout(leaveTid);
    leaveTid = setTimeout(function () {
      if (hasCursor) return;
      bats.forEach(function (b) {
        if (b.getState() === 'GRABBING') b.enter('FLYING');
        if (b.getState() === 'FLYING') b.flush();
      });
    }, TIMING.LEAVE_GRACE_MS);
  }

  function onTouch(e) {
    const t = e.touches[0];
    if (!t) return;
    handlePointer(t.clientX, t.clientY);
  }

  function onTouchEnd() {
    hasCursor = false;
    bats.forEach(function (b) {
      if (b.getState() === 'GRABBING') b.enter('FLYING');
      if (b.getState() === 'FLYING') b.flush();
    });
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

  // Primary bat lifecycle (toggle, dismiss, summon)

  let primary = null;

  function dismiss() {
    if (!primary) return;
    if (primary.isDismissing() || primary.getState() === 'HIDDEN') return;
    if (Date.now() - lastDismiss < TIMING.DISMISS_COOLDOWN) {
      jitterButton();
      return;
    }
    primary.setDismissing(true);
    lastDismiss = Date.now();
    cleanupEchoPulse();
    primary.cleanupForFlight();
    primary.leave();
    /* Toggle off empties the whole belfry: clones depart alongside the primary */
    bats.slice().forEach(function (b) { if (b.isClone) b.leave(); });
  }

  window.Coterie.batthew.inCooldown = function () {
    return Date.now() - lastDismiss < TIMING.DISMISS_COOLDOWN;
  };

  window.Coterie.batthew.jitter = jitterButton;

  function jitterButton() {
    const btn = document.getElementById('coterie-bat-toggle');
    if (!btn) return;
    const offsets = [[2, -1], [-2, 2], [1, -2], [-1, 1], [0, 0]];
    offsets.forEach(function (o, i) {
      setTimeout(function () {
        btn.style.transform = 'translate(' + o[0] + 'px,' + o[1] + 'px)';
      }, i * 50);
    });
  }

  function summon() {
    if (!primary) return;
    if (Date.now() - lastDismiss < TIMING.DISMISS_COOLDOWN) { jitterButton(); return; }
    primary.cleanupForFlight();
    primary.getCvs().style.pointerEvents = '';
    primary.setDismissing(false);
    enabled = true;
    primary.getEl().style.display = '';
    primary.spawnAtEdge();
    startLoop();
  }

  function syncEnabled() {
    let wantOn;
    try { wantOn = localStorage.getItem('coterie-bat-mode') !== 'off'; }
    catch (e) { wantOn = true; }

    if (wantOn && !enabled) summon();
    else if (!wantOn && enabled && primary && !primary.isDismissing()) dismiss();
  }
  window.Coterie.batthew.sync = syncEnabled;
  window.Coterie.batthew.echo = function () { if (enabled && !reduced && primary) emitEchoPulse(primary); };
  window.Coterie.batthew.swarm = function () { spawnBurst(); };

  // Swarm (B keybind)

  function isTyping() {
    const a = document.activeElement;
    if (!a) return false;
    if (a.isContentEditable) return true;
    const tag = a.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
  }

  function spawnClone() {
    if (!enabled || reduced || !primary) return false;
    /* isDismissing covers the toggle-off flight window: enabled flips false only at
       hideBat, and a clone born mid-dismissal would outlive the "bats off" state. */
    if (primary.getState() === 'HIDDEN' || primary.isDismissing()) return false;
    if (!sheets[theme] || !sheets[theme].move1) return false;
    if (bats.length >= SWARM.MAX_BATS) { jitterButton(); return false; }
    const clone = createBat(true);
    bats.push(clone);
    window.Coterie.batthew.els.push(clone.getEl());
    clone.spawnAtEdge();
    saveCloneCount();
    startLoop();
    return true;
  }

  /* One B press releases a small flock, staggered so they stream in from the edges */
  function spawnBurst() {
    const n = SWARM.BURST_MIN + Math.floor(Math.random() * (SWARM.BURST_MAX - SWARM.BURST_MIN + 1));
    for (let i = 0; i < n; i++) {
      if (i === 0) { if (!spawnClone()) return; }
      else setTimeout(spawnClone, i * SWARM.BURST_STAGGER_MS);
    }
  }

  function cloneCount() {
    let n = 0;
    for (let i = 0; i < bats.length; i++) { if (bats[i].isClone) n++; }
    return n;
  }

  function saveCloneCount() {
    try { sessionStorage.setItem('coterie-bat-clones', String(cloneCount())); } catch (e) {}
  }

  /* Full page loads rebuild the flock from the saved count; SPA swaps keep the live bats.
     Arriving with no flock: 10% chance Batthew brings a posse of 1–2 buddies along. */
  function restoreClones() {
    let n = 0;
    try { n = parseInt(sessionStorage.getItem('coterie-bat-clones'), 10) || 0; } catch (e) {}
    n = Math.min(n, SWARM.MAX_BATS - 1) - cloneCount();
    if (n <= 0 && cloneCount() === 0 && Math.random() < 0.1) n = 1 + Math.round(Math.random());
    for (let i = 0; i < n; i++) {
      setTimeout(spawnClone, i * SWARM.BURST_STAGGER_MS);
    }
  }

  function removeAllClones() {
    bats.slice().forEach(function (b) { if (b.isClone) b.destroy(); });
  }

  function checkReduced() {
    reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!primary) return;
    if (reduced) removeAllClones();
    primary.getEl().style.display = enabled && !reduced ? '' : 'none';
    if (reduced && enabled) primary.setIdleStatic();
    if (!reduced && enabled) startLoop();
  }

  // Shared RAF loop: one frame drives every living bat
  function startLoop() {
    if (!rafId) rafId = requestAnimationFrame(loop);
  }

  function loop(now) {
    /* Keep driving departing clones after the primary hides (enabled flips false first) */
    if ((!enabled && bats.length <= 1) || document.hidden || reduced) {
      rafId = null;
      return;
    }
    rafId = requestAnimationFrame(loop);
    let dt = lastTime ? now - lastTime : 0;
    lastTime = now;
    if (dt > 200) dt = 0;
    measureSpeed();
    maybeScrap(now, dt);
    /* Snapshot: a clone destroying itself mid-frame must not skip its neighbor */
    bats.slice().forEach(function (b) { b.tickFrame(dt, now); });
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
    document.addEventListener('touchstart', onTouch, { passive: true });
    document.addEventListener('touchmove', onTouch, { passive: true });
    document.addEventListener('touchend', onTouchEnd);

    document.addEventListener('keydown', function (e) {
      if (e.key !== 'b' && e.key !== 'B') return;
      if (e.ctrlKey || e.altKey || e.metaKey || e.shiftKey) return;
      if (e.repeat || isTyping()) return;
      spawnBurst();
    });

    document.addEventListener('visibilitychange', function () {
      if (document.hidden) {
        cleanupEchoPulse();
        bats.forEach(function (b) {
          b.stopAllDrips();
          const s = b.getState();
          if (s === 'FLYING' || s === 'GRABBING') b.flyToRoost();
        });
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
        bats.forEach(function (b) {
          const s = b.getState();
          if (s === 'ROOSTING' || s === 'CURIOUS') b.flyToRoost();
        });
      }, 500);
    });

    window.matchMedia('(prefers-reduced-motion: reduce)')
      .addEventListener('change', checkReduced);

    const searchInput = document.querySelector('.md-search__input');
    if (searchInput) {
      searchInput.addEventListener('focus', function () {
        bats.forEach(function (b) { b.getEl().style.visibility = 'hidden'; });
      });
      searchInput.addEventListener('blur', function () {
        setTimeout(function () {
          bats.forEach(function (b) { b.getEl().style.visibility = ''; });
        }, 200);
      });
    }
  }

  function init() {
    theme = getTheme();
    primary = createBat(false);
    bats.push(primary);
    window.Coterie.batthew.el = primary.getEl();
    window.Coterie.batthew.els = [primary.getEl()];
    createEchoSvg();
    /* Bat mode off = arrive hidden, but sprites/events stay wired so the toggle can summon
       in-place. The old dismiss-at-init flight caused the mobile toggle-stuck bug. */
    try { enabled = localStorage.getItem('coterie-bat-mode') !== 'off'; } catch (e) { enabled = true; }
    checkReduced();

    preload(theme, function () {
      ['night', 'sunset', 'abyss'].forEach(function (t) {
        if (t !== theme) preload(t, function () {});
      });

      if (!sheets[theme].idle1 || !sheets[theme].move1) {
        primary.getEl().style.display = 'none';
        return;
      }

      primary.resetVitals();
      computeRoosts();
      bindEvents();
      watchTheme();

      if (!enabled) {
        primary.hideQuiet();
        return;
      }

      if (reduced) {
        primary.placeAt(roosts[0].x, roosts[0].y);
        primary.setIdleStatic();
        return;
      }

      /* Resume from prior session: fly in from edge instead of full spawn */
      let returning = false;
      try { returning = localStorage.getItem('coterie-bat-active') === '1'; } catch (e) {}
      if (returning) {
        primary.spawnAtEdge();
      } else {
        primary.enter('SPAWNING');
      }
      try { localStorage.setItem('coterie-bat-active', '1'); } catch (e) {}

      startLoop();
      restoreClones();
    });
  }

  // Blood drip system (shared particle pool; scheduling lives per bat)
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

  // Echolocation system (shared overlay; any bat can chirp, pulses cap at 2)
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

  function emitEchoPulse(b, opOverride) {
    if (echoPulses.length >= 2 || reduced || !enabled) return;
    const s = b.getState();
    if (s === 'HIDDEN' || s === 'DEAD' || s === 'DYING' ||
        s === 'HIT' || s === 'GRABBING') return;
    createEchoSvg();

    const cx = b.getX() + DISPLAY.DW / 2;
    const cy = b.getY() + DISPLAY.DH / 2;

    let facingAngle;
    if (s === 'CURIOUS' || s === 'ROOSTING') {
      facingAngle = Math.PI / 2;
    } else {
      facingAngle = b.getFacingLeft() ? Math.PI : 0;
    }

    let arcDeg = ECHO.ARC_DEG;
    if (s === 'FLYING') arcDeg = ECHO.FLY_ARCS[b.getTier()];
    const op = opOverride != null ? opOverride : ECHO.OPACITY;

    const hits = castEchoRays(cx, cy, facingAngle, arcDeg);
    const perRayDist = hits.map(function (h) { return h.dist; });

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

    /* Curiosity cascade: the chirp wakes roosted neighbors as the wavefront reaches them */
    for (let i = 0; i < bats.length; i++) {
      const other = bats[i];
      if (other === b || other.getState() !== 'ROOSTING' || Math.random() > 0.7) continue;
      const od = Math.sqrt(
        (other.getX() - cx) * (other.getX() - cx) + (other.getY() - cy) * (other.getY() - cy)
      );
      if (od > ECHO.MAX_RADIUS) continue;
      setTimeout(other.nudgeCurious, (od / ECHO.MAX_RADIUS) * ECHO.EMIT_MS);
    }
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
            setTimeout(function (r) {
              return function () {
                r.setAttribute('r', '12');
                r.setAttribute('opacity', '0');
                r.style.transition = 'all ' + ECHO.CONTACT_MS + 'ms ease-out';
                setTimeout(function () { if (r.parentNode) r.parentNode.removeChild(r); }, ECHO.CONTACT_MS);
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
