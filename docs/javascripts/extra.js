/* Auto-activate Abyss for prefers-contrast users who haven't chosen a theme */
(function() {
  'use strict';
  try {
    const scope = new URL('.', location).pathname;
    const key = `${scope}.__palette`;
    const stored = localStorage.getItem(key);
    if (!stored && window.matchMedia('(prefers-contrast: more)').matches) {
      document.body.setAttribute('data-md-color-scheme', 'abyss');
      localStorage.setItem(key, JSON.stringify({ index: 2 }));
    }
  } catch(e) { console.warn('[Coterie] contrast preference check failed:', e); }
})();

function onDocReady(cb) {
  if (typeof document$ !== 'undefined') {
    document$.subscribe(function() { cb(); });
  } else if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', cb);
  } else {
    cb();
  }
}

window.Coterie = window.Coterie || {};
window.Coterie.theme = window.Coterie.theme || {};
window.Coterie.batthew = window.Coterie.batthew || {};

/* Guarded localStorage access for browsers that block storage (e.g. Safari private mode) */
window.Coterie.storage = {
  get: function(key, fallback) {
    try {
      const v = localStorage.getItem(key);
      return v !== null ? v : (fallback !== undefined ? fallback : null);
    }
    catch (e) { console.warn('[Coterie] localStorage read failed:', e); return fallback !== undefined ? fallback : null; }
  },
  set: function(key, value) {
    try { localStorage.setItem(key, value); }
    catch (e) { console.warn('[Coterie] localStorage write failed:', e); }
  }
};

/* Entity decoding, just in case (Zensical escapes cleanly but better safe) */
(function() {
  'use strict';

  function decodeHTMLEntities(text) {
    const textarea = document.createElement('textarea');
    textarea.innerHTML = text; // safe: textarea decodes entities without executing scripts
    return textarea.value;
  }

  function fixEntities(selector) {
    document.querySelectorAll(selector).forEach(function(el) {
      const decoded = decodeHTMLEntities(el.textContent);
      if (decoded !== el.textContent) el.textContent = decoded;
    });
  }

  function initEntityFixes() {
    fixEntities('.md-nav__link, .md-tabs__link');
    fixEntities('.md-content h1, .md-content h2, .md-content h3, .md-content h4, .md-content h5, .md-content h6');
    fixEntities('.md-nav--secondary .md-nav__link');
  }

  onDocReady(function() { setTimeout(initEntityFixes, 100); });

})();

/* Dialogue speaker colors in blockquotes */
(function() {
  'use strict';

  const SPEAKERS = {
    'Johnny Fangs': 'speaker-johnny',
    'Johnny': 'speaker-johnny',
    'Storyteller': 'speaker-st',
  };

  function colorSpeakers() {
    document.querySelectorAll('blockquote strong').forEach(function(el) {
      const name = el.textContent.replace(/:$/, '').trim();
      const cls = SPEAKERS[name];
      if (cls && !el.classList.contains(cls)) el.classList.add(cls);
    });
  }

  onDocReady(function() { setTimeout(colorSpeakers, 100); });
})();

/* Replace footer + BtT arrows with circled SVGs */
(function() {
  'use strict';

  const ARROW_PATH = {
    left:  'M11 9L8 12M8 12L11 15M8 12H16M21 12C21 7.02944 16.9706 3 12 3C7.02944 3 3 7.02944 3 12C3 16.9706 7.02944 21 12 21C16.9706 21 21 16.9706 21 12Z',
    right: 'M13 15L16 12M16 12L13 9M16 12H8M21 12C21 7.02944 16.9706 3 12 3C7.02944 3 3 7.02944 3 12C3 16.9706 7.02944 21 12 21C16.9706 21 21 16.9706 21 12Z',
    up:    'M15 11L12 8M12 8L9 11M12 8V16M21 12C21 7.02944 16.9706 3 12 3C7.02944 3 3 7.02944 3 12C3 16.9706 7.02944 21 12 21C16.9706 21 21 16.9706 21 12Z'
  };

  function makeArrow(direction) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '2');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    svg.setAttribute('aria-hidden', 'true');
    svg.classList.add('lucide');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', ARROW_PATH[direction]);
    svg.appendChild(path);
    return svg;
  }

  function replaceArrows() {
    const prev = document.querySelector('.md-footer__link--prev .md-footer__button svg');
    if (prev) prev.replaceWith(makeArrow('left'));

    const next = document.querySelector('.md-footer__link--next .md-footer__button svg');
    if (next) next.replaceWith(makeArrow('right'));

    const top = document.querySelector('.md-top svg');
    if (top) top.replaceWith(makeArrow('up'));

    const prevLink = document.querySelector('.md-footer__link--prev');
    const prevTitle = document.querySelector('.md-footer__link--prev .md-ellipsis');
    if (prevLink && prevTitle) prevLink.setAttribute('aria-label', `Previous: ${prevTitle.textContent.trim()}`);

    const nextLink = document.querySelector('.md-footer__link--next');
    const nextTitle = document.querySelector('.md-footer__link--next .md-ellipsis');
    if (nextLink && nextTitle) nextLink.setAttribute('aria-label', `Next: ${nextTitle.textContent.trim()}`);
  }

  onDocReady(function() { setTimeout(replaceArrows, 50); });
})();

/* Download tooltip on source link */
(function() {
  'use strict';
  function setSourceTooltip() {
    const link = document.querySelector('.md-source');
    if (link) {
      link.title = 'Download Coterie for free!';
      link.setAttribute('aria-label', 'Download Coterie for free!');
    }
  }
  onDocReady(setSourceTooltip);
})();

/* Auto-expand Core Systems nav section on page load */
(function() {
  'use strict';

  function expandCoreSystemsSection() {
    const coreSystemsNav = document.querySelector('.md-nav__item--section .md-nav__link[title="Core Systems"]');

    if (coreSystemsNav) {
      const parentSection = coreSystemsNav.closest('.md-nav__item--section');

      if (parentSection) {
        const checkbox = parentSection.querySelector('input.md-nav__toggle');

        if (checkbox && !checkbox.checked) {
          checkbox.checked = true;
        }
      }
    }
  }

  onDocReady(function() { setTimeout(expandCoreSystemsSection, 50); });
})();

/* Ambient background blobs, injected once (CSS handles the rest) */
(function() {
  'use strict';
  if (document.querySelector('.ambient-blob')) return;
  const top = document.createElement('div');
  top.className = 'ambient-blob ambient-blob--top';
  top.setAttribute('aria-hidden', 'true');
  const bottom = document.createElement('div');
  bottom.className = 'ambient-blob ambient-blob--bottom';
  bottom.setAttribute('aria-hidden', 'true');
  const smoke = document.createElement('div');
  smoke.className = 'ambient-smoke';
  smoke.setAttribute('aria-hidden', 'true');
  document.body.appendChild(top);
  document.body.appendChild(bottom);
  document.body.appendChild(smoke);
})();

/* Eye toggle: 3-way theme switcher that clicks Zensical's hidden radio inputs */
(function() {
  'use strict';

  const SCHEMES = ['default', 'slate', 'abyss'];
  const LABELS = ['Switch to Night', 'Switch to Abyss', 'Switch to Sunset'];
  let blinkTid = null;
  let rotateTid = null;
  let btn = null;
  let _eyeObserverCreated = false;

  function getScheme() {
    return document.body.getAttribute('data-md-color-scheme') || 'slate';
  }

  function getIndex() {
    const i = SCHEMES.indexOf(getScheme());
    return i < 0 ? 1 : i;
  }

  function cycle() {
    const next = (getIndex() + 1) % SCHEMES.length;
    const input = document.querySelector(
      `.md-option[data-md-color-scheme="${SCHEMES[next]}"]`
    );
    if (input) input.click();
  }

  /* Night: random blink, sometimes a double */
  function doBlink() {
    if (!btn) return;
    const eyes = btn.querySelectorAll('.eye-toggle__eye--1, .eye-toggle__eye--2');
    const double = Math.random() < 0.35;

    eyes.forEach(function(eye) {
      eye.classList.add('eye-toggle__eye--blink');
    });
    setTimeout(function() {
      eyes.forEach(function(eye) {
        eye.classList.remove('eye-toggle__eye--blink');
      });
      if (double) {
        setTimeout(function() {
          eyes.forEach(function(eye) {
            eye.classList.add('eye-toggle__eye--blink');
          });
          setTimeout(function() {
            eyes.forEach(function(eye) {
              eye.classList.remove('eye-toggle__eye--blink');
            });
          }, 150);
        }, 200);
      }
    }, 150);
  }

  function scheduleBlink() {
    blinkTid = setTimeout(function() {
      doBlink();
      scheduleBlink();
    }, 3000 + Math.random() * 5000);
  }

  /* Abyss: three-cup shuffle on the eye positions */
  function scheduleRotation() {
    if (!btn) return;
    btn.setAttribute('data-rotation', '0');
    rotateTid = setTimeout(function advanceRotation() {
      const cur = parseInt(btn.getAttribute('data-rotation') || '0', 10);
      btn.setAttribute('data-rotation', String((cur + 1) % 3));
      rotateTid = setTimeout(advanceRotation, 4000 + Math.random() * 4000);
    }, 4000 + Math.random() * 4000);
  }

  function stopTimers() {
    clearTimeout(blinkTid);
    clearTimeout(rotateTid);
    blinkTid = null;
    rotateTid = null;
  }

  function startBehavior() {
    stopTimers();
    const scheme = getScheme();
    if (scheme === 'slate') scheduleBlink();
    if (scheme === 'abyss') scheduleRotation();
  }

  function create() {
    const nav = document.querySelector('.md-header__inner');
    if (!nav || document.querySelector('.eye-toggle')) return;

    btn = document.createElement('button');
    btn.className = 'eye-toggle';
    btn.type = 'button';
    btn.setAttribute('aria-label', LABELS[getIndex()]);
    btn.setAttribute('data-rotation', '0');

    for (let i = 1; i <= 3; i++) {
      const img = document.createElement('img');
      img.src = '/assets/images/eye.svg';
      img.alt = '';
      img.className = `eye-toggle__eye eye-toggle__eye--${i}`;
      img.setAttribute('aria-hidden', 'true');
      btn.appendChild(img);
    }

    btn.addEventListener('click', function() {
      cycle();
      setTimeout(function() {
        btn.setAttribute('aria-label', LABELS[getIndex()]);
      }, 0);
    });

    nav.appendChild(btn);

    if (!_eyeObserverCreated) {
      _eyeObserverCreated = true;
      new MutationObserver(function() {
        startBehavior();
      }).observe(document.body, {
        attributes: true,
        attributeFilter: ['data-md-color-scheme']
      });
    }

    startBehavior();
  }

  window.Coterie.theme.cycle = function() {
    cycle();
    setTimeout(function() {
      if (btn) btn.setAttribute('aria-label', LABELS[getIndex()]);
    }, 0);
  };

  onDocReady(create);
})();

/* Bat toggle, persists in localStorage */
(function() {
  'use strict';

  const BAT_KEY = 'coterie-bat-mode';
  const BAT_ON_SRC = '/assets/images/bat-on.svg';
  const BAT_OFF_SRC = '/assets/images/bat-off.svg';

  function getBatState() {
    return window.Coterie.storage.get(BAT_KEY, 'on') !== 'off';
  }

  function injectBatToggle() {
    if (document.getElementById('coterie-bat-toggle')) return;
    const header = document.querySelector('.md-header__inner');
    if (!header) return;

    const isOn = getBatState();
    const btn = document.createElement('button');
    btn.id = 'coterie-bat-toggle';
    btn.className = 'md-header__button bat-toggle';
    btn.type = 'button';
    btn.title = isOn ? 'Batthew: on' : 'Batthew: off';
    btn.setAttribute('aria-label', btn.title);
    btn.setAttribute('aria-pressed', String(isOn));

    const img = document.createElement('img');
    img.src = isOn ? BAT_ON_SRC : BAT_OFF_SRC;
    img.alt = '';
    img.setAttribute('aria-hidden', 'true');
    btn.appendChild(img);

    btn.addEventListener('click', function() {
      if (window.Coterie.batthew.inCooldown && window.Coterie.batthew.inCooldown()) {
        if (window.Coterie.batthew.jitter) window.Coterie.batthew.jitter();
        return;
      }
      const nowOn = !getBatState();
      window.Coterie.storage.set(BAT_KEY, nowOn ? 'on' : 'off');
      img.src = nowOn ? BAT_ON_SRC : BAT_OFF_SRC;
      btn.title = nowOn ? 'Batthew: on' : 'Batthew: off';
      btn.setAttribute('aria-label', btn.title);
      btn.setAttribute('aria-pressed', String(nowOn));
      if (window.Coterie.batthew.sync) window.Coterie.batthew.sync();
    });

    const source = header.querySelector('.md-header__source');
    if (source) {
      header.insertBefore(btn, source);
    } else {
      header.appendChild(btn);
    }
  }

  onDocReady(injectBatToggle);
})();

/* Bat Stats: worldwide Batthew KDR popover (Firebase RTDB) */
(function() {
  'use strict';

  const STATS = [
    { key: 'bites',  label: 'Total Bites' },
    { key: 'meals',  label: 'Times Fed' },
    { key: 'deaths', label: 'Resurrections' }
  ];

  const THEME_FOLDERS = { slate: 'night', default: 'sunset', abyss: 'abyss' };
  let epithets = [];
  const recentEpithets = [];
  let _statsObserverCreated = false;

  fetch('/javascripts/batthew-epithets.json')
    .then(function(r) { return r.json(); })
    .then(function(data) { if (Array.isArray(data)) epithets = data; })
    .catch(function(e) { console.warn('[Coterie] epithet fetch failed:', e); });

  function pickEpithet() {
    if (epithets.length === 0) return '';
    let pool = epithets.filter(function(e) { return recentEpithets.indexOf(e) === -1; });
    if (pool.length === 0) pool = epithets;
    const pick = pool[Math.floor(Math.random() * pool.length)];
    recentEpithets.push(pick);
    if (recentEpithets.length > 3) recentEpithets.shift();
    return pick;
  }

  function getMugshotSrc() {
    const scheme = document.body.getAttribute('data-md-color-scheme') || 'slate';
    const folder = THEME_FOLDERS[scheme] || 'sunset';
    return `/assets/images/batthew/${folder}/mugshot.webp`;
  }

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text) e.textContent = text;
    return e;
  }

  function formatEST() {
    try {
      const now = new Date();
      const opts = {
        timeZone: 'America/New_York',
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', hour12: false
      };
      const parts = new Intl.DateTimeFormat('en-US', opts).formatToParts(now);
      const p = {};
      parts.forEach(function(x) { p[x.type] = x.value; });
      return `${p.month}/${p.day}/${p.year} | ${p.hour}:${p.minute} EST`;
    } catch (e) {
      return new Date().toLocaleString();
    }
  }

  function buildPopover() {
    const pop = document.createElement('div');
    pop.id = 'bat-stats-popover';
    pop.className = 'bat-stats__popover';
    const hdr = el('div', 'bat-stats__header');
    const nameCol = el('div', 'bat-stats__name-col');
    nameCol.appendChild(el('span', 'bat-stats__name', 'BATTHEW'));
    nameCol.appendChild(el('span', 'bat-stats__epithet'));
    hdr.appendChild(nameCol);
    const mug = document.createElement('img');
    mug.className = 'bat-stats__mugshot';
    mug.src = getMugshotSrc();
    mug.alt = 'Batthew';
    hdr.appendChild(mug);
    pop.appendChild(hdr);

    const loading = el('div', 'bat-stats__loading', 'Loading...');
    pop.appendChild(loading);

    const body = el('div', 'bat-stats__body');
    body.style.display = 'none';
    STATS.forEach(function(s) {
      const row = el('div', 'bat-stats__row');
      row.appendChild(el('span', '', s.label));
      const val = el('span', 'bat-stats__value', '0');
      val.setAttribute('data-stat', s.key);
      row.appendChild(val);
      body.appendChild(row);
    });
    body.appendChild(el('div', 'bat-stats__kd'));
    body.appendChild(el('div', 'bat-stats__timestamp'));
    pop.appendChild(body);

    return pop;
  }

  function injectBatStats() {
    if (document.getElementById('bat-stats')) return;
    const header = document.querySelector('.md-header__inner');
    if (!header) return;

    const wrap = el('div', 'bat-stats');
    wrap.id = 'bat-stats';

    const btn = document.createElement('button');
    btn.className = 'bat-stats__btn';
    btn.type = 'button';
    btn.setAttribute('aria-expanded', 'false');
    btn.title = 'Bat Stats';
    btn.setAttribute('aria-label', 'Bat Stats');
    const icon = el('span', 'bat-stats__icon');
    icon.setAttribute('aria-hidden', 'true');
    btn.appendChild(icon);
    wrap.appendChild(btn);

    const pop = buildPopover();
    wrap.appendChild(pop);

    const batToggle = header.querySelector('#coterie-bat-toggle');
    if (batToggle) {
      header.insertBefore(wrap, batToggle);
    } else {
      const source = header.querySelector('.md-header__source');
      if (source) header.insertBefore(wrap, source);
      else header.appendChild(wrap);
    }

    const mugImg = pop.querySelector('.bat-stats__mugshot');
    if (!_statsObserverCreated) {
      _statsObserverCreated = true;
      new MutationObserver(function() {
        mugImg.src = getMugshotSrc();
      }).observe(document.body, { attributes: true, attributeFilter: ['data-md-color-scheme'] });
    }

    let hideTimer = null;
    let isOpen = false;

    const epithetEl = pop.querySelector('.bat-stats__epithet');

    function openStats() {
      if (isOpen) return;
      clearTimeout(hideTimer);
      isOpen = true;
      pop.classList.add('bat-stats__popover--open');
      btn.setAttribute('aria-expanded', 'true');
      epithetEl.textContent = pickEpithet();
      fetchStats();
    }

    function closeStats() {
      hideTimer = setTimeout(function() {
        isOpen = false;
        pop.classList.remove('bat-stats__popover--open');
        btn.setAttribute('aria-expanded', 'false');
      }, 1500);
    }

    wrap.addEventListener('mouseenter', openStats);
    wrap.addEventListener('mouseleave', closeStats);
    pop.addEventListener('mouseenter', function() { clearTimeout(hideTimer); });
    pop.addEventListener('mouseleave', closeStats);

    function closeImmediate() {
      clearTimeout(hideTimer);
      isOpen = false;
      pop.classList.remove('bat-stats__popover--open');
      btn.setAttribute('aria-expanded', 'false');
    }

    btn.addEventListener('click', function() {
      if (isOpen) closeImmediate();
      else openStats();
    });

    btn.addEventListener('keydown', function(e) {
      if (e.key === 'Escape' && isOpen) closeImmediate();
    });

    let lastFetch = 0;
    let cachedData = null;
    const CACHE_MS = 30000;

    function renderStats(data) {
      const loading = pop.querySelector('.bat-stats__loading');
      const body = pop.querySelector('.bat-stats__body');
      if (loading) loading.style.display = 'none';
      if (body) body.style.display = '';

      STATS.forEach(function(s) {
        pop.querySelector(`[data-stat="${s.key}"]`).textContent = data[s.key].toLocaleString();
      });

      const kd = data.deaths === 0 ? '∞' : (data.meals / data.deaths).toFixed(2);
      const kdEl = pop.querySelector('.bat-stats__kd');
      kdEl.textContent = '';
      const kSpan = document.createElement('span');
      kSpan.textContent = 'K';
      kSpan.style.color = 'var(--color-stat-meals)';
      const dSpan = document.createElement('span');
      dSpan.textContent = 'D';
      dSpan.style.color = 'var(--color-stat-deaths)';
      kdEl.appendChild(kSpan);
      kdEl.appendChild(document.createTextNode('/'));
      kdEl.appendChild(dSpan);
      kdEl.appendChild(document.createTextNode(`: ${kd}`));
      pop.querySelector('.bat-stats__timestamp').textContent = `As of ${formatEST()}`;
    }

    function fetchStats() {
      const loading = pop.querySelector('.bat-stats__loading');

      if (Date.now() - lastFetch < CACHE_MS && cachedData) {
        renderStats(cachedData);
        return;
      }

      if (!window.__kdrRead) {
        if (loading) loading.textContent = 'Firebase unavailable';
        return;
      }

      window.__kdrRead(function(data) {
        if (!data) {
          if (loading) loading.textContent = 'Could not load stats';
          return;
        }
        lastFetch = Date.now();
        cachedData = data;
        renderStats(data);
      });
    }
  }

  onDocReady(injectBatStats);
})();

/* Zensical search lives in shadow DOM; activeElement is the host, not the input */
window.Coterie.isTypingContext = function() {
  const ae = document.activeElement;
  if (!ae) return false;
  if (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA' || ae.tagName === 'SELECT' || ae.isContentEditable) return true;
  if (ae.closest && ae.closest('.md-search')) return true;
  if (document.body.hasAttribute('data-md-search-open')) return true;
  if (ae.shadowRoot) {
    const inner = ae.shadowRoot.activeElement;
    if (inner && (inner.tagName === 'INPUT' || inner.tagName === 'TEXTAREA')) return true;
  }
  return false;
};

/* Text-size rocker + font swapper, persists in localStorage */
(function() {
  'use strict';

  const SCALE_KEY = 'coterie-text-scale';
  const SCALE_DEFAULT = 1.0;
  const SCALE_MIN = 0.7;
  const SCALE_MAX = 1.5;
  const SCALE_STEP = 0.1;

  const FONT_KEY = 'coterie-font-mode';
  const FONTS = [
    { mode: 'sans',     family: '"Merriweather Sans"',  label: 'Sans-serif' },
    { mode: 'serif',    family: '"Merriweather"',       label: 'Serif' },
    { mode: 'dyslexic', family: '"OpenDyslexic"',       label: 'OpenDyslexic' }
  ];

  function getScale() {
    const v = parseFloat(window.Coterie.storage.get(SCALE_KEY));
    if (!isNaN(v) && v >= SCALE_MIN && v <= SCALE_MAX) return v;
    return SCALE_DEFAULT;
  }

  function applyScale(scale) {
    document.documentElement.style.setProperty('--md-text-scale', scale);
  }

  function setScale(scale) {
    const header = document.querySelector('.md-header');
    const headerH = header ? header.offsetHeight : 0;
    const anchor = document.elementFromPoint(window.innerWidth / 2, headerH + 10);
    const oldTop = anchor ? anchor.getBoundingClientRect().top : 0;

    applyScale(scale);
    window.Coterie.storage.set(SCALE_KEY, scale.toString());

    if (anchor) window.scrollBy(0, anchor.getBoundingClientRect().top - oldTop);
  }

  function adjustScale(action) {
    let s = getScale();
    if (action === 'decrease') s = Math.max(SCALE_MIN, Math.round((s - SCALE_STEP) * 10) / 10);
    else if (action === 'increase') s = Math.min(SCALE_MAX, Math.round((s + SCALE_STEP) * 10) / 10);
    else if (action === 'reset') s = SCALE_DEFAULT;
    setScale(s);
  }

  function getFontIndex() {
    const v = parseInt(window.Coterie.storage.get(FONT_KEY), 10);
    if (!isNaN(v) && v >= 0 && v < FONTS.length) return v;
    return 0;
  }

  function applyFont(index) {
    if (document.body) document.body.setAttribute('data-font-mode', FONTS[index].mode);
  }

  function cycleFont() {
    const next = (getFontIndex() + 1) % FONTS.length;
    window.Coterie.storage.set(FONT_KEY, next.toString());
    applyFont(next);
    updateFontButton();
  }

  function updateFontButton() {
    const btn = document.querySelector('[data-text-size="font"]');
    if (!btn) return;
    const current = getFontIndex();
    const nextIdx = (current + 1) % FONTS.length;
    const nextFont = FONTS[nextIdx];
    btn.style.fontFamily = nextFont.family;
    btn.setAttribute('data-font-next', nextFont.mode);
    btn.title = `Switch to ${nextFont.label} font`;
    btn.setAttribute('aria-label', btn.title);
  }

  function injectRocker() {
    if (document.querySelector('.text-size-rocker')) return;
    const header = document.querySelector('.md-header__inner');
    if (!header) return;

    const rocker = document.createElement('div');
    rocker.className = 'text-size-rocker';
    rocker.setAttribute('role', 'group');
    rocker.setAttribute('aria-label', 'Text size and font controls');

    const actions = [
      { action: 'decrease', label: 'Decrease text size', text: '−' },
      { action: 'reset',    label: 'Reset text size',    text: 'Aa' },
      { action: 'font',     label: 'Change font',        text: 'Tt' },
      { action: 'increase', label: 'Increase text size', text: '+' }
    ];

    actions.forEach(function(a) {
      const btn = document.createElement('button');
      btn.className = 'text-size-rocker__btn';
      btn.type = 'button';
      btn.setAttribute('data-text-size', a.action);
      btn.title = a.label;
      btn.setAttribute('aria-label', a.label);
      btn.textContent = a.text;
      rocker.appendChild(btn);
    });

    rocker.addEventListener('click', function(e) {
      const btn = e.target.closest('[data-text-size]');
      if (!btn) return;
      const action = btn.getAttribute('data-text-size');
      if (action === 'font') cycleFont();
      else adjustScale(action);
    });

    const insertAnchor = header.querySelector('#coterie-bat-toggle') || header.querySelector('.md-header__source');
    if (insertAnchor) {
      header.insertBefore(rocker, insertAnchor);
    } else {
      header.appendChild(rocker);
    }

    updateFontButton();
  }

  let kbBound = false;
  let echoCooldownUntil = 0;

  function triggerEcho() {
    const now = Date.now();
    if (now < echoCooldownUntil) return;
    if (!window.Coterie.batthew.echo) return;
    echoCooldownUntil = now + 3000;
    window.Coterie.batthew.echo();
  }

  function bindKeyboard() {
    if (kbBound) return;
    kbBound = true;

    document.addEventListener('keydown', function(e) {
      if (window.Coterie.isTypingContext()) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      switch (e.key) {
        case '-': adjustScale('decrease'); break;
        case '+': case '=': adjustScale('increase'); break;
        case '0': adjustScale('reset'); break;
        case 't': if (window.Coterie.theme.cycle) window.Coterie.theme.cycle(); break;
        case 'f': if (window.Coterie.theme.cycleFont) window.Coterie.theme.cycleFont(); break;
        case 'e': triggerEcho(); break;
      }
    });
  }

  function init() {
    applyScale(getScale());
    applyFont(getFontIndex());
    injectRocker();
    bindKeyboard();
  }

  window.Coterie.theme.cycleFont = cycleFont;

  onDocReady(init);
})();

/* Heading-to-heading keyboard nav */
(function() {
  'use strict';

  const smoothScroll = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let navBound = false;
  let lastKeyTime = 0;
  const KEY_DEBOUNCE = 100;

  function getScrollBehavior() {
    return smoothScroll ? 'smooth' : 'auto';
  }

  function followPageLink(direction) {
    /* Click footer <a> instead of setting location.href so SPA nav works */
    const cls = direction === 1 ? '.md-footer__link--next' : '.md-footer__link--prev';
    const footerLink = document.querySelector(cls);
    if (footerLink) { footerLink.click(); return; }
    /* Fallback to <link rel> if footer buttons aren't present */
    const rel = direction === 1 ? 'next' : 'prev';
    const link = document.querySelector(`link[rel="${rel}"]`);
    if (!link) return;
    let href = link.getAttribute('href');
    if (!href) return;
    if (direction === -1) href += '#__nav-bottom';
    window.location.href = href;
  }

  function navigateSection(direction) {
    const header = document.querySelector('.md-header');
    const headerH = header ? header.offsetHeight : 0;
    const content = document.querySelector('.md-content');
    if (!content) { followPageLink(direction); return; }

    const headings = content.querySelectorAll('h1, h2, h3');
    if (headings.length === 0) { followPageLink(direction); return; }

    const scrollTop = window.scrollY + headerH;

    /* At page boundary, jump to next/prev page */
    if (direction === 1 && window.scrollY >= document.documentElement.scrollHeight - window.innerHeight - 10) {
      followPageLink(direction); return;
    }
    if (direction === -1 && window.scrollY <= 10) {
      followPageLink(direction); return;
    }

    /* Walk headings in the given direction */
    const start = direction === 1 ? 0 : headings.length - 1;
    const end   = direction === 1 ? headings.length : -1;
    const threshold = direction === 1 ? 10 : -30;

    for (let i = start; i !== end; i += direction) {
      const pos = headings[i].getBoundingClientRect().top + window.scrollY;
      const delta = pos - scrollTop;
      if ((direction === 1 && delta > threshold) || (direction === -1 && delta < threshold)) {
        window.scrollTo({ top: pos - headerH, behavior: getScrollBehavior() });
        headings[i].setAttribute('tabindex', '-1');
        headings[i].focus({ preventScroll: true });
        return;
      }
    }
    followPageLink(direction);
  }

  function handleNavBottom() {
    if (window.location.hash !== '#__nav-bottom') return;
    history.replaceState(null, '', window.location.pathname);
    const content = document.querySelector('.md-content');
    if (!content) return;
    const headings = content.querySelectorAll('h1, h2, h3');
    if (headings.length === 0) return;
    const last = headings[headings.length - 1];
    const header = document.querySelector('.md-header');
    const headerH = header ? header.offsetHeight : 0;
    window.scrollTo({ top: last.getBoundingClientRect().top + window.scrollY - headerH, behavior: 'auto' });
  }

  function navigateToHeading(level, direction) {
    if (level === 1) { followPageLink(direction); return; }

    const header = document.querySelector('.md-header');
    const headerH = header ? header.offsetHeight : 0;
    const content = document.querySelector('.md-content');
    if (!content) return;

    const headings = content.querySelectorAll(`h${level}`);
    if (headings.length === 0) return;

    const scrollTop = window.scrollY + headerH;
    const start = direction === 1 ? 0 : headings.length - 1;
    const end   = direction === 1 ? headings.length : -1;
    const threshold = direction === 1 ? 10 : -30;

    for (let i = start; i !== end; i += direction) {
      const pos = headings[i].getBoundingClientRect().top + window.scrollY;
      const delta = pos - scrollTop;
      if ((direction === 1 && delta > threshold) || (direction === -1 && delta < threshold)) {
        window.scrollTo({ top: pos - headerH, behavior: getScrollBehavior() });
        headings[i].setAttribute('tabindex', '-1');
        headings[i].focus({ preventScroll: true });
        return;
      }
    }
  }

  function bindNav() {
    if (navBound) return;
    navBound = true;

    document.addEventListener('keydown', function(e) {
      if (window.Coterie.isTypingContext()) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.target.closest && e.target.closest('pre, code, .md-typeset__scrollwrap')) return;
      const digitMatch = e.code && e.code.match(/^Digit([1-5])$/);
      if (e.shiftKey && !digitMatch) return;
      const now = Date.now();
      if (now - lastKeyTime < KEY_DEBOUNCE) return;
      lastKeyTime = now;
      if (e.key === 'ArrowRight') { e.preventDefault(); navigateSection(1); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); navigateSection(-1); }
      else if (digitMatch) { e.preventDefault(); navigateToHeading(parseInt(digitMatch[1], 10), e.shiftKey ? -1 : 1); }
    });
  }

  onDocReady(function() {
    handleNavBottom();
    bindNav();
  });
})();

/* Smooth scroll-to-top */
(function() {
  'use strict';

  const DURATION = 500;

  function easeInOutCubic(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  function smoothScrollToTop() {
    const start = window.scrollY;
    if (start === 0) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      window.scrollTo(0, 0);
      return;
    }
    let startTime = null;

    function step(timestamp) {
      if (!startTime) startTime = timestamp;
      const elapsed = timestamp - startTime;
      const progress = Math.min(elapsed / DURATION, 1);
      window.scrollTo(0, start * (1 - easeInOutCubic(progress)));
      if (progress < 1) requestAnimationFrame(step);
    }

    requestAnimationFrame(step);
  }

  let topBound = false;
  function bindTop() {
    if (topBound) return;
    topBound = true;
    /* Capture phase fires before Zensical's own handler */
    document.addEventListener('click', function(e) {
      if (!e.target.closest('.md-top')) return;
      e.preventDefault();
      e.stopPropagation();
      smoothScrollToTop();
    }, true);
  }

  bindTop();
})();

/* Pronunciation audio player */
(function() {
  'use strict';

  let audioEl = null;
  let activeBtn = null;
  const AUDIO_BASE = '/assets/audio/pronunciations/';
  const VOLUME = 0.75;
  const SVG_NS = 'http://www.w3.org/2000/svg';

  const ICON_PATHS = [
    'M391.399,325.833l-43.736-10.636c2.687-2.494,4.14-5.153,4.14-7.904c0-14.578-40.576-26.397-90.635-26.397c-50.058,0-90.635,11.819-90.635,26.397c0,2.751,1.458,5.41,4.144,7.904l-43.736,10.636l130.226,44.002L391.399,325.833z M305.128,301.417c0,7.069-19.68,12.799-43.96,12.799c-24.284,0-43.965-5.73-43.965-12.799c0-7.07,19.681-12.809,43.965-12.809C285.448,288.608,305.128,294.347,305.128,301.417z',
    'M195.189,249.328c33.838-17.714,86.21-41.883,136.97-30.606c43.268,9.61,60.781,17.998,49.952,51.566l-74.585-15.486c-1.728-7.51-8.426-13.12-16.458-13.12c-9.343,0-16.922,7.573-16.922,16.916c0,9.352,7.579,16.917,16.922,16.917c5.418,0,10.191-2.586,13.29-6.556l73.728,15.019l-9.669,26.59l21.754,4.832c0,0,4.772-14.22,12.891-50.759c9.668-43.506-5.639-60.424-56.403-82.182c-49.086-21.033-93.459-81.374-111.187-106.35c4.025,31.422-1.618,62.862-7.147,87.435C222.654,188.758,208.882,232.411,195.189,249.328z',
    'M117.922,291.413c35.364,7.95,78.665-50.668,96.714-130.95c18.044-80.266,4.02-151.801-31.349-159.742c-35.35-7.95-78.655,50.677-96.709,130.951C68.528,211.937,82.562,283.455,117.922,291.413z M197.677,157.116c-7.996,35.557-27.176,61.524-42.842,57.994c-15.656-3.521-21.881-35.191-13.882-70.748c7.996-35.557,27.176-61.523,42.833-58.002C199.457,89.88,205.669,121.568,197.677,157.116z'
  ];
  const ICON_POLYGONS = [
    '391.399,412.187 391.399,337.919 259.407,383.681 259.407,462.68 259.407,483.173 116.437,431.854 116.437,414.974 90.658,421.237 90.658,450.76 261.975,512 433.296,450.76 433.296,421.237',
    '130.941,421.585 247.557,462.68 247.557,383.681 130.941,342.585'
  ];

  function createGramophoneIcon() {
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 512 512');
    svg.setAttribute('aria-hidden', 'true');
    ICON_PATHS.forEach(function(d) {
      const p = document.createElementNS(SVG_NS, 'path');
      p.setAttribute('d', d);
      svg.appendChild(p);
    });
    ICON_POLYGONS.forEach(function(pts) {
      const pg = document.createElementNS(SVG_NS, 'polygon');
      pg.setAttribute('points', pts);
      svg.appendChild(pg);
    });
    return svg;
  }

  function initPronunciations() {
    const spans = document.querySelectorAll('.pron:not([data-pron-init])');
    spans.forEach(function(span) {
      span.setAttribute('data-pron-init', '');
      const filename = span.getAttribute('data-audio');
      if (!filename) return;

      const term = span.getAttribute('data-term') || filename.replace(/-/g, ' ');
      const btn = document.createElement('button');
      btn.className = 'pron-btn';
      btn.type = 'button';
      btn.title = 'Hear pronunciation';
      btn.setAttribute('aria-label', `Hear pronunciation of ${term}`);
      btn.setAttribute('aria-pressed', 'false');
      btn.appendChild(createGramophoneIcon());
      btn.addEventListener('click', function(e) {
        e.preventDefault();
        e.stopPropagation();
        playPronunciation(filename, btn);
      });
      span.appendChild(btn);
    });
  }

  function stopPlayback() {
    if (activeBtn) {
      activeBtn.classList.remove('playing');
      activeBtn.setAttribute('aria-pressed', 'false');
    }
    if (audioEl) {
      audioEl.pause();
      audioEl.currentTime = 0;
    }
    activeBtn = null;
  }

  function playPronunciation(filename, btn) {
    if (!audioEl) {
      audioEl = new Audio();
      audioEl.volume = VOLUME;
      audioEl.addEventListener('ended', stopPlayback);
      audioEl.addEventListener('error', stopPlayback);
    }

    /* Toggle off if same button clicked while playing */
    if (btn === activeBtn && !audioEl.paused) {
      stopPlayback();
      return;
    }

    stopPlayback();
    audioEl.src = `${AUDIO_BASE}${filename}.ogg`;
    activeBtn = btn;
    btn.classList.add('playing');
    btn.setAttribute('aria-pressed', 'true');
    audioEl.play().catch(function() {
      stopPlayback();
    });
  }

  onDocReady(function() {
    stopPlayback();
    initPronunciations();
  });
})();
