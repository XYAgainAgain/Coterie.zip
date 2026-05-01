/**
 * Coterie Terminology Toggle
 * Dynamically switches between VTM and Generic terminology site-wide
 */

(function() {
  'use strict';

  const DEBUG = false;

  const STORAGE_KEY = 'coterieTerminologyMode';
  const DEFAULT_MODE = 'vtm';

  let initialMode;
  try { initialMode = localStorage.getItem(STORAGE_KEY) || DEFAULT_MODE; }
  catch (e) { initialMode = DEFAULT_MODE; }
  document.body.setAttribute('data-terminology-mode', initialMode);

  // Always inject toggle button (even on early return)
  function createSimpleToggle() {
    const header = document.querySelector('.md-header__inner');
    if (!header) return;

    // Remove existing toggle if present
    const existingToggle = document.getElementById('coterie-terminology-toggle');
    if (existingToggle) existingToggle.remove();

    const container = document.createElement('div');
    container.id = 'coterie-terminology-toggle';
    container.className = 'term-toggle';

    const vtmLabel = document.createElement('span');
    vtmLabel.textContent = 'VTM';
    vtmLabel.className = 'term-toggle__label term-toggle__label--vtm';

    const button = document.createElement('button');
    button.className = 'term-toggle__btn';
    button.setAttribute('aria-label', 'Toggle terminology mode');

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');

    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', 'M21,9L17,5V8H10V10H17V13M7,11L3,15L7,19V16H14V14H7V11Z');

    svg.appendChild(path);
    button.appendChild(svg);

    const genericLabel = document.createElement('span');
    genericLabel.textContent = 'Generic';
    genericLabel.className = 'term-toggle__label term-toggle__label--generic';

    container.appendChild(vtmLabel);
    container.appendChild(button);
    container.appendChild(genericLabel);

    let currentMode;
    try { currentMode = localStorage.getItem(STORAGE_KEY) || DEFAULT_MODE; }
    catch (e) { currentMode = DEFAULT_MODE; }
    container.setAttribute('data-mode', currentMode);

    function doToggle() {
      let mode;
      try { mode = localStorage.getItem(STORAGE_KEY) || DEFAULT_MODE; }
      catch (e) { mode = DEFAULT_MODE; }
      const newMode = mode === 'vtm' ? 'generic' : 'vtm';
      try { localStorage.setItem(STORAGE_KEY, newMode); }
      catch (e) { return; }
      location.reload();
    }

    button.addEventListener('click', doToggle);
    vtmLabel.addEventListener('click', doToggle);
    genericLabel.addEventListener('click', doToggle);

    const themeToggle = header.querySelector('[data-md-component="palette"]');
    if (themeToggle) {
      header.insertBefore(container, themeToggle);
    } else {
      header.appendChild(container);
    }
  }

  // Inject toggle on initial load and Material navigation
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', createSimpleToggle);
  } else {
    createSimpleToggle();
  }

  if (typeof document$ !== 'undefined') {
    document$.subscribe(createSimpleToggle);
  }

  let mappings = null;
  let termMap = null;
  let sortedTerms = [];
  let processedPages = {};
  let blacklistPatterns = [];
  let lastPagePath = null; // Start fresh on each page load

  /**
   * Load terminology mappings from JSON
   */
  async function loadMappings() {
    try {
      const response = await fetch('/javascripts/terminology-mappings.json');
      if (!response.ok) throw new Error('Failed to load terminology mappings');
      return await response.json();
    } catch (error) {
      console.error('Terminology toggle error:', error);
      return null;
    }
  }

  /**
   * Load blacklist patterns from mappings
   */
  function loadBlacklist(mappings) {
    if (mappings._blacklist && Array.isArray(mappings._blacklist)) {
      blacklistPatterns = mappings._blacklist;
    }
  }

  /**
   * Expand affixes to generate term variant maps
   * Returns map of source terms to their possible target variants
   */
  function expandAffixes(mappings) {
    const termMap = new Map();

    for (const [sourceBase, config] of Object.entries(mappings)) {
      if (sourceBase.startsWith('_') || !config.to) continue;

      const targetBase = config.to;
      let sourceForms, targetForms;

      if (config.source_forms && config.target_forms) {
        sourceForms = ['', ...config.source_forms];
        targetForms = ['', ...config.target_forms];
      } else if (config.forms) {
        sourceForms = targetForms = ['', ...config.forms];
      } else {
        sourceForms = targetForms = [''];
      }

      const sourceVariants = sourceForms.map(affix => sourceBase + affix);
      const targetVariants = targetForms.map(affix => targetBase + affix);

      for (const sourceVariant of sourceVariants) {
        termMap.set(sourceVariant, {
          base: sourceBase,
          targetBase: targetBase,
          targetVariants: targetVariants,
          isAsymmetric: !!(config.source_forms && config.target_forms),
          regex: new RegExp('\\b(' + sourceVariant.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')\\b', 'gi')
        });
      }
    }

    const sortedTerms = Array.from(termMap.keys()).sort((a, b) => b.length - a.length);
    return { termMap, sortedTerms };
  }

  /**
   * Get current mode from localStorage
   */
  function getMode() {
    try { return localStorage.getItem(STORAGE_KEY) || DEFAULT_MODE; }
    catch (e) { return DEFAULT_MODE; }
  }

  /**
   * Get current page key for caching
   */
  function getPageKey() {
    return window.location.pathname;
  }

  /**
   * Check if current page has been processed in given mode
   */
  function isPageProcessed(mode) {
    const pageKey = getPageKey();
    const cacheKey = `${pageKey}:${mode}`;
    return processedPages[cacheKey] === true;
  }

  /**
   * Mark current page as processed in given mode
   */
  function markPageProcessed(mode) {
    const pageKey = getPageKey();
    const cacheKey = `${pageKey}:${mode}`;
    processedPages[cacheKey] = true;
  }

  /**
   * Preserve case from original word to replacement
   */
  function preserveCase(original, replacement) {
    if (original === original.toUpperCase()) {
      return replacement.toUpperCase();
    }
    if (original[0] === original[0].toUpperCase()) {
      return replacement.charAt(0).toUpperCase() + replacement.slice(1);
    }
    return replacement.toLowerCase();
  }

  /**
   * Get context before a match for grammatical analysis
   */
  function getContextBefore(text, matchIndex, maxLength = 100) {
    const start = Math.max(0, matchIndex - maxLength);
    const context = text.substring(start, matchIndex);
    const lastSentence = context.split(/[.!?\n]/).pop() || context;
    return lastSentence.toLowerCase();
  }

  /**
   * Check if context indicates plural form should be used
   */
  function hasPluralIndicator(context) {
    const pluralPatterns = [
      /\bare\b/,
      /\bwere\b/,
      /\bhave\b/,
      /\bthese\b/,
      /\bthose\b/,
      /\bmany\b/,
      /\bseveral\b/,
      /\ball\b/,
      /\bfew\b/,
      /\b[2-9]\d*\b/
    ];

    return pluralPatterns.some(pattern => pattern.test(context));
  }

  /**
   * Check if context indicates singular form should be used
   */
  function hasSingularIndicator(context) {
    const singularPatterns = [
      /\bis\b/,
      /\bwas\b/,
      /\bhas\b/,
      /\ba\b/,
      /\ban\b/,
      /\bthis\b/,
      /\bthat\b/,
      /\bone\b/,
      /\beach\b/,
      /\bevery\b/
    ];

    return singularPatterns.some(pattern => pattern.test(context));
  }

  /**
   * Select appropriate target form based on context
   */
  function selectTargetForm(context, targetVariants) {
    if (!targetVariants || targetVariants.length === 0) {
      return null;
    }

    if (targetVariants.length === 1) {
      return targetVariants[0];
    }

    if (hasPluralIndicator(context)) {
      return targetVariants[1] || targetVariants[0];
    }

    return targetVariants[0];
  }

  /**
   * Replace terminology in a single text node with context awareness
   */
  function replaceTextNode(textNode, mode) {
    if (!textNode.nodeValue || !textNode.nodeValue.trim()) return;

    const parent = textNode.parentNode;
    if (!parent) return;

    const skipTags = ['CODE', 'PRE', 'SCRIPT', 'STYLE'];
    let node = parent;
    while (node) {
      if (skipTags.includes(node.nodeName)) return;
      node = node.parentNode;
    }

    let text = textNode.nodeValue;

    for (const phrase of blacklistPatterns) {
      if (!text.includes(phrase)) continue;
      if (DEBUG) console.log('[Blacklist] Skipping node containing:', phrase);
      return;
    }

    let modified = false;

    for (const sourceTerm of sortedTerms) {
      const termInfo = termMap.get(sourceTerm);
      if (!termInfo) continue;

      termInfo.regex.lastIndex = 0;

      text = text.replace(termInfo.regex, (match, p1, offset) => {
        let targetForm;
        if (termInfo.isAsymmetric) {
          const context = getContextBefore(text, offset);
          targetForm = selectTargetForm(context, termInfo.targetVariants);
          if (DEBUG) console.log(`[Context] "${match}" → "${targetForm}" (context: "${context.slice(-30)}")`);
        } else {
          targetForm = termInfo.targetVariants[0];
        }

        modified = true;
        return preserveCase(match, targetForm);
      });
    }

    if (modified) {
      textNode.nodeValue = text;
    }
  }

  /**
   * Walk DOM tree and replace text in all text nodes
   */
  function walkAndReplace(node, mode) {
    if (node.nodeType === Node.TEXT_NODE) {
      replaceTextNode(node, mode);
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      if (['CODE', 'PRE', 'SCRIPT', 'STYLE'].includes(node.nodeName)) {
        return;
      }

      for (let child of node.childNodes) {
        walkAndReplace(child, mode);
      }
    }
  }

  /**
   * Replace terminology across entire page
   */
  function replacePage(mode) {
    document.body.setAttribute('data-terminology-mode', mode);

    if (mode === 'vtm') {
      markPageProcessed(mode);
      return;
    }

    if (isPageProcessed(mode)) return;

    requestAnimationFrame(() => {
      const content = document.querySelector('.md-content');
      if (content) walkAndReplace(content, mode);

      const nav = document.querySelector('.md-nav');
      if (nav) walkAndReplace(nav, mode);

      markPageProcessed(mode);
    });
  }

  /**
   * Initialize terminology toggle system
   */
  async function initialize() {
    mappings = await loadMappings();
    if (!mappings) return;

    loadBlacklist(mappings);

    const result = expandAffixes(mappings);
    termMap = result.termMap;
    sortedTerms = result.sortedTerms;

    if (typeof document$ !== 'undefined') {
      document$.subscribe(() => {
        const currentPath = window.location.pathname;
        if (currentPath !== lastPagePath) {
          lastPagePath = currentPath;
          replacePage(getMode());
        }
      });
    } else if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        lastPagePath = window.location.pathname;
        replacePage(getMode());
      });
    } else {
      lastPagePath = window.location.pathname;
      replacePage(getMode());
    }
  }

  initialize();
})();
