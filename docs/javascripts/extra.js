// Custom JavaScript for Coterie - Zensical

/* Auto-activate Abyss for prefers-contrast users who haven't chosen a theme */
(function() {
  'use strict';
  try {
    var scope = new URL('.', location).pathname;
    var key = scope + '.__palette';
    var stored = localStorage.getItem(key);
    if (!stored && window.matchMedia('(prefers-contrast: more)').matches) {
      document.body.setAttribute('data-md-color-scheme', 'abyss');
      localStorage.setItem(key, JSON.stringify({ index: 2 }));
    }
  } catch(e) {}
})();

// HTML Entity Decoding (precautionary; Zensical and Material both escape cleanly)

(function() {
  'use strict';

  // Decode HTML entities using textarea trick
  function decodeHTMLEntities(text) {
    var textarea = document.createElement('textarea');
    textarea.innerHTML = text;
    return textarea.value;
  }

  // Fix entities in navigation links
  function fixNavEntities() {
    // Material uses different selectors - adjust as needed
    var navLinks = document.querySelectorAll('.md-nav__link, .md-tabs__link');
    navLinks.forEach(function(link) {
      var decoded = decodeHTMLEntities(link.textContent);
      if (decoded !== link.textContent) {
        link.textContent = decoded;
      }
    });
  }

  // Fix entities in page headings
  function fixPageHeadings() {
    var headings = document.querySelectorAll('.md-content h1, .md-content h2, .md-content h3, .md-content h4, .md-content h5, .md-content h6');
    headings.forEach(function(heading) {
      var decoded = decodeHTMLEntities(heading.textContent);
      if (decoded !== heading.textContent) {
        heading.textContent = decoded;
      }
    });
  }

  // Fix entities in table of contents
  function fixTocEntities() {
    var tocLinks = document.querySelectorAll('.md-nav--secondary .md-nav__link');
    tocLinks.forEach(function(link) {
      var decoded = decodeHTMLEntities(link.textContent);
      if (decoded !== link.textContent) {
        link.textContent = decoded;
      }
    });
  }

  // Run entity fixing on page load
  function initEntityFixes() {
    fixNavEntities();
    fixPageHeadings();
    fixTocEntities();
  }

  // Zensical (like Material for MkDocs) uses instant loading (SPA-like behavior).
  // Subscribe to the document$ observable if available.
  if (typeof document$ !== 'undefined') {
    document$.subscribe(function() {
      // Run fixes after each page load
      setTimeout(initEntityFixes, 100);
    });
  } else {
    // Fallback for non-instant loading
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', initEntityFixes);
    } else {
      initEntityFixes();
    }
  }

})();

// Dialogue speaker colors in blockquotes
(function() {
  'use strict';

  var SPEAKERS = {
    'Johnny Fangs': 'speaker-johnny',
    'Johnny': 'speaker-johnny',
    'Storyteller': 'speaker-st',
  };

  function colorSpeakers() {
    document.querySelectorAll('blockquote strong').forEach(function(el) {
      var name = el.textContent.replace(/:$/, '').trim();
      var cls = SPEAKERS[name];
      if (cls && !el.classList.contains(cls)) el.classList.add(cls);
    });
  }

  if (typeof document$ !== 'undefined') {
    document$.subscribe(function() { setTimeout(colorSpeakers, 100); });
  } else if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', colorSpeakers);
  } else {
    colorSpeakers();
  }
})();

// Replace footer + BtT arrows with custom circled SVGs
(function() {
  'use strict';

  var ARROW_PATH = {
    left:  'M11 9L8 12M8 12L11 15M8 12H16M21 12C21 7.02944 16.9706 3 12 3C7.02944 3 3 7.02944 3 12C3 16.9706 7.02944 21 12 21C16.9706 21 21 16.9706 21 12Z',
    right: 'M13 15L16 12M16 12L13 9M16 12H8M21 12C21 7.02944 16.9706 3 12 3C7.02944 3 3 7.02944 3 12C3 16.9706 7.02944 21 12 21C16.9706 21 21 16.9706 21 12Z',
    up:    'M15 11L12 8M12 8L9 11M12 8V16M21 12C21 7.02944 16.9706 3 12 3C7.02944 3 3 7.02944 3 12C3 16.9706 7.02944 21 12 21C16.9706 21 21 16.9706 21 12Z'
  };

  function makeArrow(direction) {
    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '2');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    svg.setAttribute('aria-hidden', 'true');
    svg.classList.add('lucide');
    var path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', ARROW_PATH[direction]);
    svg.appendChild(path);
    return svg;
  }

  function replaceArrows() {
    var prev = document.querySelector('.md-footer__link--prev .md-footer__button svg');
    if (prev) prev.replaceWith(makeArrow('left'));

    var next = document.querySelector('.md-footer__link--next .md-footer__button svg');
    if (next) next.replaceWith(makeArrow('right'));

    var top = document.querySelector('.md-top svg');
    if (top) top.replaceWith(makeArrow('up'));

    var prevLink = document.querySelector('.md-footer__link--prev');
    var prevTitle = document.querySelector('.md-footer__link--prev .md-ellipsis');
    if (prevLink && prevTitle) prevLink.setAttribute('aria-label', 'Previous: ' + prevTitle.textContent.trim());

    var nextLink = document.querySelector('.md-footer__link--next');
    var nextTitle = document.querySelector('.md-footer__link--next .md-ellipsis');
    if (nextLink && nextTitle) nextLink.setAttribute('aria-label', 'Next: ' + nextTitle.textContent.trim());
  }

  if (typeof document$ !== 'undefined') {
    document$.subscribe(function() { setTimeout(replaceArrows, 50); });
  } else if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', replaceArrows);
  } else {
    replaceArrows();
  }
})();

// Download tooltip on source link
(function() {
  'use strict';
  function setSourceTooltip() {
    var link = document.querySelector('.md-source');
    if (link) {
      link.title = 'Download Coterie for free!';
      link.setAttribute('aria-label', 'Download Coterie for free!');
    }
  }
  if (typeof document$ !== 'undefined') {
    document$.subscribe(setSourceTooltip);
  } else if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setSourceTooltip);
  } else {
    setSourceTooltip();
  }
})();

// Auto-expand Core Systems section on page load
(function() {
  'use strict';

  function expandCoreSystemsSection() {
    // Find the Core Systems navigation item
    var coreSystemsNav = document.querySelector('.md-nav__item--section .md-nav__link[title="Core Systems"]');

    if (coreSystemsNav) {
      // Find the parent section container
      var parentSection = coreSystemsNav.closest('.md-nav__item--section');

      if (parentSection) {
        // Find the input checkbox that controls expansion
        var checkbox = parentSection.querySelector('input.md-nav__toggle');

        if (checkbox && !checkbox.checked) {
          // Check the checkbox to expand the section
          checkbox.checked = true;
        }
      }
    }
  }

  // Run on initial page load
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', expandCoreSystemsSection);
  } else {
    expandCoreSystemsSection();
  }

  // Re-run on Material instant loading navigation
  if (typeof document$ !== 'undefined') {
    document$.subscribe(function() {
      setTimeout(expandCoreSystemsSection, 50);
    });
  }
})();

// Ambient background blobs — injected once, CSS handles everything else
(function() {
  'use strict';
  if (document.querySelector('.ambient-blob')) return;
  var top = document.createElement('div');
  top.className = 'ambient-blob ambient-blob--top';
  top.setAttribute('aria-hidden', 'true');
  var bottom = document.createElement('div');
  bottom.className = 'ambient-blob ambient-blob--bottom';
  bottom.setAttribute('aria-hidden', 'true');
  var smoke = document.createElement('div');
  smoke.className = 'ambient-smoke';
  smoke.setAttribute('aria-hidden', 'true');
  document.body.appendChild(top);
  document.body.appendChild(bottom);
  document.body.appendChild(smoke);
})();

/* Eye toggle — custom 3-way theme switcher; clicks Zensical's hidden radio
   inputs so its internal JS handles storage and scheme application for us */
(function() {
  'use strict';

  var SCHEMES = ['default', 'slate', 'abyss'];
  var LABELS = ['Switch to Night', 'Switch to Abyss', 'Switch to Sunset'];
  var blinkTid = null;
  var rotateTid = null;
  var btn = null;

  function getScheme() {
    return document.body.getAttribute('data-md-color-scheme') || 'slate';
  }

  function getIndex() {
    var i = SCHEMES.indexOf(getScheme());
    return i < 0 ? 1 : i;
  }

  function cycle() {
    var next = (getIndex() + 1) % SCHEMES.length;
    var input = document.querySelector(
      '.md-option[data-md-color-scheme="' + SCHEMES[next] + '"]'
    );
    if (input) input.click();
  }

  /* Night — random blink: dims glow briefly, 1 or 2 blinks in succession */
  function doBlink() {
    if (!btn) return;
    var eyes = btn.querySelectorAll('.eye-toggle__eye--1, .eye-toggle__eye--2');
    var double = Math.random() < 0.35;

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

  /* Abyss — rotate eye positions (three-cup shuffle) */
  function scheduleRotation() {
    if (!btn) return;
    btn.setAttribute('data-rotation', '0');
    rotateTid = setTimeout(function advanceRotation() {
      var cur = parseInt(btn.getAttribute('data-rotation') || '0', 10);
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
    var scheme = getScheme();
    if (scheme === 'slate') scheduleBlink();
    if (scheme === 'abyss') scheduleRotation();
  }

  function create() {
    var nav = document.querySelector('.md-header__inner');
    if (!nav || document.querySelector('.eye-toggle')) return;

    btn = document.createElement('button');
    btn.className = 'eye-toggle';
    btn.type = 'button';
    btn.setAttribute('aria-label', LABELS[getIndex()]);
    btn.setAttribute('data-rotation', '0');

    for (var i = 1; i <= 3; i++) {
      var img = document.createElement('img');
      img.src = '/assets/images/eye.svg';
      img.alt = '';
      img.className = 'eye-toggle__eye eye-toggle__eye--' + i;
      img.setAttribute('aria-hidden', 'true');
      btn.appendChild(img);
    }

    btn.addEventListener('click', function() {
      cycle();
      btn.setAttribute('aria-label', LABELS[getIndex()]);
    });

    nav.appendChild(btn);

    /* Watch for scheme changes to start/stop idle behaviors */
    new MutationObserver(function() {
      startBehavior();
    }).observe(document.body, {
      attributes: true,
      attributeFilter: ['data-md-color-scheme']
    });

    startBehavior();
  }

  if (typeof document$ !== 'undefined') {
    document$.subscribe(create);
  } else if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', create);
  } else {
    create();
  }
})();

// Bat toggle — swaps between bat-on/bat-off SVGs, persists in localStorage
(function() {
  'use strict';

  var BAT_KEY = 'coterie-bat-mode';
  var BAT_ON_SRC = '/assets/images/bat-on.svg';
  var BAT_OFF_SRC = '/assets/images/bat-off.svg';

  function getBatState() {
    try { return localStorage.getItem(BAT_KEY) !== 'off'; }
    catch (e) { return true; }
  }

  function injectBatToggle() {
    if (document.getElementById('coterie-bat-toggle')) return;
    var header = document.querySelector('.md-header__inner');
    if (!header) return;

    var isOn = getBatState();
    var btn = document.createElement('button');
    btn.id = 'coterie-bat-toggle';
    btn.className = 'md-header__button bat-toggle';
    btn.type = 'button';
    btn.title = isOn ? 'Batthew: on' : 'Batthew: off';
    btn.setAttribute('aria-label', btn.title);
    btn.setAttribute('aria-pressed', String(isOn));

    var img = document.createElement('img');
    img.src = isOn ? BAT_ON_SRC : BAT_OFF_SRC;
    img.alt = '';
    img.setAttribute('aria-hidden', 'true');
    btn.appendChild(img);

    btn.addEventListener('click', function() {
      if (window.__batthewInCooldown && window.__batthewInCooldown()) {
        if (window.__batthewJitter) window.__batthewJitter();
        return;
      }
      var nowOn = !getBatState();
      try { localStorage.setItem(BAT_KEY, nowOn ? 'on' : 'off'); }
      catch (e) { /* localStorage unavailable */ }
      img.src = nowOn ? BAT_ON_SRC : BAT_OFF_SRC;
      btn.title = nowOn ? 'Batthew: on' : 'Batthew: off';
      btn.setAttribute('aria-label', btn.title);
      btn.setAttribute('aria-pressed', String(nowOn));
    });

    var source = header.querySelector('.md-header__source');
    if (source) {
      header.insertBefore(btn, source);
    } else {
      header.appendChild(btn);
    }
  }

  if (typeof document$ !== 'undefined') {
    document$.subscribe(function() { injectBatToggle(); });
  } else if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectBatToggle);
  } else {
    injectBatToggle();
  }
})();

// Text-size rocker + font swapper — persists in localStorage
(function() {
  'use strict';

  var SCALE_KEY = 'coterie-text-scale';
  var SCALE_DEFAULT = 1.0;
  var SCALE_MIN = 0.7;
  var SCALE_MAX = 1.5;
  var SCALE_STEP = 0.1;

  var FONT_KEY = 'coterie-font-mode';
  var FONTS = [
    { mode: 'sans',     family: '"Merriweather Sans"',  label: 'Sans-serif' },
    { mode: 'serif',    family: '"Merriweather"',       label: 'Serif' },
    { mode: 'dyslexic', family: '"OpenDyslexic"',       label: 'OpenDyslexic' }
  ];

  function getScale() {
    try {
      var v = parseFloat(localStorage.getItem(SCALE_KEY));
      if (!isNaN(v) && v >= SCALE_MIN && v <= SCALE_MAX) return v;
    } catch (e) { /* noop */ }
    return SCALE_DEFAULT;
  }

  function applyScale(scale) {
    document.documentElement.style.setProperty('--md-text-scale', scale);
  }

  function setScale(scale) {
    var header = document.querySelector('.md-header');
    var headerH = header ? header.offsetHeight : 0;
    var anchor = document.elementFromPoint(window.innerWidth / 2, headerH + 10);
    var oldTop = anchor ? anchor.getBoundingClientRect().top : 0;

    applyScale(scale);
    try { localStorage.setItem(SCALE_KEY, scale.toString()); }
    catch (e) { /* noop */ }

    if (anchor) window.scrollBy(0, anchor.getBoundingClientRect().top - oldTop);
  }

  function adjustScale(action) {
    var s = getScale();
    if (action === 'decrease') s = Math.max(SCALE_MIN, Math.round((s - SCALE_STEP) * 10) / 10);
    else if (action === 'increase') s = Math.min(SCALE_MAX, Math.round((s + SCALE_STEP) * 10) / 10);
    else if (action === 'reset') s = SCALE_DEFAULT;
    setScale(s);
  }

  function getFontIndex() {
    try {
      var v = parseInt(localStorage.getItem(FONT_KEY), 10);
      if (!isNaN(v) && v >= 0 && v < FONTS.length) return v;
    } catch (e) { /* noop */ }
    return 0;
  }

  function applyFont(index) {
    if (document.body) document.body.setAttribute('data-font-mode', FONTS[index].mode);
  }

  function cycleFont() {
    var next = (getFontIndex() + 1) % FONTS.length;
    try { localStorage.setItem(FONT_KEY, next.toString()); }
    catch (e) { /* noop */ }
    applyFont(next);
    updateFontButton();
  }

  function updateFontButton() {
    var btn = document.querySelector('[data-text-size="font"]');
    if (!btn) return;
    var current = getFontIndex();
    var nextIdx = (current + 1) % FONTS.length;
    var nextFont = FONTS[nextIdx];
    btn.style.fontFamily = nextFont.family;
    btn.setAttribute('data-font-next', nextFont.mode);
    btn.title = 'Switch to ' + nextFont.label + ' font';
    btn.setAttribute('aria-label', btn.title);
  }

  function injectRocker() {
    if (document.querySelector('.text-size-rocker')) return;
    var header = document.querySelector('.md-header__inner');
    if (!header) return;

    var rocker = document.createElement('div');
    rocker.className = 'text-size-rocker';
    rocker.setAttribute('role', 'group');
    rocker.setAttribute('aria-label', 'Text size and font controls');

    var actions = [
      { action: 'decrease', label: 'Decrease text size', text: '−' },
      { action: 'reset',    label: 'Reset text size',    text: 'Aa' },
      { action: 'font',     label: 'Change font',        text: 'Tt' },
      { action: 'increase', label: 'Increase text size', text: '+' }
    ];

    actions.forEach(function(a) {
      var btn = document.createElement('button');
      btn.className = 'text-size-rocker__btn';
      btn.type = 'button';
      btn.setAttribute('data-text-size', a.action);
      btn.title = a.label;
      btn.setAttribute('aria-label', a.label);
      btn.textContent = a.text;
      rocker.appendChild(btn);
    });

    rocker.addEventListener('click', function(e) {
      var btn = e.target.closest('[data-text-size]');
      if (!btn) return;
      var action = btn.getAttribute('data-text-size');
      if (action === 'font') cycleFont();
      else adjustScale(action);
    });

    var insertAnchor = header.querySelector('#coterie-bat-toggle') || header.querySelector('.md-header__source');
    if (insertAnchor) {
      header.insertBefore(rocker, insertAnchor);
    } else {
      header.appendChild(rocker);
    }

    updateFontButton();
  }

  var kbBound = false;

  function bindKeyboard() {
    if (kbBound) return;
    kbBound = true;

    document.addEventListener('keydown', function(e) {
      var ae = document.activeElement;
      if (ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA' || ae.isContentEditable)) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      switch (e.key) {
        case '-': adjustScale('decrease'); break;
        case '+': case '=': adjustScale('increase'); break;
        case '0': adjustScale('reset'); break;
      }
    });
  }

  function init() {
    applyScale(getScale());
    applyFont(getFontIndex());
    injectRocker();
    bindKeyboard();
  }

  if (typeof document$ !== 'undefined') {
    document$.subscribe(init);
  } else if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

// Heading-to-heading keyboard navigation (←/→ arrows)
(function() {
  'use strict';

  var smoothScroll = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var navBound = false;

  function getScrollBehavior() {
    return smoothScroll ? 'smooth' : 'auto';
  }

  function followPageLink(direction) {
    /* Click the actual footer <a> so Zensical's instant navigation handles it
       (window.location.href bypasses SPA and triggers a full page reload) */
    var cls = direction === 1 ? '.md-footer__link--next' : '.md-footer__link--prev';
    var footerLink = document.querySelector(cls);
    if (footerLink) { footerLink.click(); return; }
    /* Fallback: use <link rel> if footer buttons aren't present */
    var rel = direction === 1 ? 'next' : 'prev';
    var link = document.querySelector('link[rel="' + rel + '"]');
    if (!link) return;
    var href = link.getAttribute('href');
    if (!href) return;
    if (direction === -1) href += '#__nav-bottom';
    window.location.href = href;
  }

  function navigateSection(direction) {
    var header = document.querySelector('.md-header');
    var headerH = header ? header.offsetHeight : 0;
    var content = document.querySelector('.md-content');
    if (!content) { followPageLink(direction); return; }

    var headings = content.querySelectorAll('h1, h2, h3');
    if (headings.length === 0) { followPageLink(direction); return; }

    var scrollTop = window.scrollY + headerH;
    var maxScroll = document.documentElement.scrollHeight - window.innerHeight;

    if (direction === 1) {
      if (window.scrollY >= maxScroll - 10) { followPageLink(direction); return; }
      for (var i = 0; i < headings.length; i++) {
        var pos = headings[i].getBoundingClientRect().top + window.scrollY;
        if (pos > scrollTop + 10) {
          window.scrollTo({ top: pos - headerH, behavior: getScrollBehavior() });
          headings[i].setAttribute('tabindex', '-1');
          headings[i].focus({ preventScroll: true });
          return;
        }
      }
      followPageLink(direction);
    } else {
      if (window.scrollY <= 10) { followPageLink(direction); return; }
      for (var j = headings.length - 1; j >= 0; j--) {
        var p = headings[j].getBoundingClientRect().top + window.scrollY;
        if (p < scrollTop - 30) {
          window.scrollTo({ top: p - headerH, behavior: getScrollBehavior() });
          headings[j].setAttribute('tabindex', '-1');
          headings[j].focus({ preventScroll: true });
          return;
        }
      }
      followPageLink(direction);
    }
  }

  function handleNavBottom() {
    if (window.location.hash !== '#__nav-bottom') return;
    history.replaceState(null, '', window.location.pathname);
    var content = document.querySelector('.md-content');
    if (!content) return;
    var headings = content.querySelectorAll('h1, h2, h3');
    if (headings.length === 0) return;
    var last = headings[headings.length - 1];
    var header = document.querySelector('.md-header');
    var headerH = header ? header.offsetHeight : 0;
    window.scrollTo({ top: last.getBoundingClientRect().top + window.scrollY - headerH, behavior: 'auto' });
  }

  function bindNav() {
    if (navBound) return;
    navBound = true;

    document.addEventListener('keydown', function(e) {
      if (e.target.matches('input, textarea, select, [contenteditable]')) return;
      if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;
      if (e.target.closest('pre, code, .md-typeset__scrollwrap')) return;
      if (e.key === 'ArrowRight') { e.preventDefault(); navigateSection(1); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); navigateSection(-1); }
    });
  }

  if (typeof document$ !== 'undefined') {
    document$.subscribe(function() {
      handleNavBottom();
      bindNav();
    });
  } else if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
      handleNavBottom();
      bindNav();
    });
  } else {
    handleNavBottom();
    bindNav();
  }
})();

// Smooth scroll-to-top (500ms ease-in-out)
(function() {
  'use strict';

  var DURATION = 500;

  function easeInOutCubic(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  function smoothScrollToTop() {
    var start = window.scrollY;
    if (start === 0) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      window.scrollTo(0, 0);
      return;
    }
    var startTime = null;

    function step(timestamp) {
      if (!startTime) startTime = timestamp;
      var elapsed = timestamp - startTime;
      var progress = Math.min(elapsed / DURATION, 1);
      window.scrollTo(0, start * (1 - easeInOutCubic(progress)));
      if (progress < 1) requestAnimationFrame(step);
    }

    requestAnimationFrame(step);
  }

  /* Capture phase on document fires before Zensical's bubble-phase handler on the button */
  document.addEventListener('click', function(e) {
    if (!e.target.closest('.md-top')) return;
    e.preventDefault();
    e.stopPropagation();
    smoothScrollToTop();
  }, true);
})();

// Pronunciation audio player
(function() {
  'use strict';

  var audioEl = null;
  var activeBtn = null;
  var AUDIO_BASE = '/assets/audio/pronunciations/';
  var VOLUME = 0.75;
  var SVG_NS = 'http://www.w3.org/2000/svg';

  var ICON_PATHS = [
    'M391.399,325.833l-43.736-10.636c2.687-2.494,4.14-5.153,4.14-7.904c0-14.578-40.576-26.397-90.635-26.397c-50.058,0-90.635,11.819-90.635,26.397c0,2.751,1.458,5.41,4.144,7.904l-43.736,10.636l130.226,44.002L391.399,325.833z M305.128,301.417c0,7.069-19.68,12.799-43.96,12.799c-24.284,0-43.965-5.73-43.965-12.799c0-7.07,19.681-12.809,43.965-12.809C285.448,288.608,305.128,294.347,305.128,301.417z',
    'M195.189,249.328c33.838-17.714,86.21-41.883,136.97-30.606c43.268,9.61,60.781,17.998,49.952,51.566l-74.585-15.486c-1.728-7.51-8.426-13.12-16.458-13.12c-9.343,0-16.922,7.573-16.922,16.916c0,9.352,7.579,16.917,16.922,16.917c5.418,0,10.191-2.586,13.29-6.556l73.728,15.019l-9.669,26.59l21.754,4.832c0,0,4.772-14.22,12.891-50.759c9.668-43.506-5.639-60.424-56.403-82.182c-49.086-21.033-93.459-81.374-111.187-106.35c4.025,31.422-1.618,62.862-7.147,87.435C222.654,188.758,208.882,232.411,195.189,249.328z',
    'M117.922,291.413c35.364,7.95,78.665-50.668,96.714-130.95c18.044-80.266,4.02-151.801-31.349-159.742c-35.35-7.95-78.655,50.677-96.709,130.951C68.528,211.937,82.562,283.455,117.922,291.413z M197.677,157.116c-7.996,35.557-27.176,61.524-42.842,57.994c-15.656-3.521-21.881-35.191-13.882-70.748c7.996-35.557,27.176-61.523,42.833-58.002C199.457,89.88,205.669,121.568,197.677,157.116z'
  ];
  var ICON_POLYGONS = [
    '391.399,412.187 391.399,337.919 259.407,383.681 259.407,462.68 259.407,483.173 116.437,431.854 116.437,414.974 90.658,421.237 90.658,450.76 261.975,512 433.296,450.76 433.296,421.237',
    '130.941,421.585 247.557,462.68 247.557,383.681 130.941,342.585'
  ];

  function createGramophoneIcon() {
    var svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 512 512');
    svg.setAttribute('aria-hidden', 'true');
    ICON_PATHS.forEach(function(d) {
      var p = document.createElementNS(SVG_NS, 'path');
      p.setAttribute('d', d);
      svg.appendChild(p);
    });
    ICON_POLYGONS.forEach(function(pts) {
      var pg = document.createElementNS(SVG_NS, 'polygon');
      pg.setAttribute('points', pts);
      svg.appendChild(pg);
    });
    return svg;
  }

  function initPronunciations() {
    var spans = document.querySelectorAll('.pron:not([data-pron-init])');
    spans.forEach(function(span) {
      span.setAttribute('data-pron-init', '');
      var filename = span.getAttribute('data-audio');
      if (!filename) return;

      var term = span.getAttribute('data-term') || filename.replace(/-/g, ' ');
      var btn = document.createElement('button');
      btn.className = 'pron-btn';
      btn.type = 'button';
      btn.title = 'Hear pronunciation';
      btn.setAttribute('aria-label', 'Hear pronunciation of ' + term);
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
    audioEl.src = AUDIO_BASE + filename + '.ogg';
    activeBtn = btn;
    btn.classList.add('playing');
    btn.setAttribute('aria-pressed', 'true');
    audioEl.play().catch(function() {
      stopPlayback();
    });
  }

  if (typeof document$ !== 'undefined') {
    document$.subscribe(function() {
      stopPlayback();
      initPronunciations();
    });
  } else {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', initPronunciations);
    } else {
      initPronunciations();
    }
  }
})();
