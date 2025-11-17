// Custom JavaScript for Coterie - HTML Entity Decoding
// Fixes &amp; display issues in dynamically-generated navigation

(function() {
  'use strict';

  // Decode HTML entities using textarea trick
  function decodeHTMLEntities(text) {
    var textarea = document.createElement('textarea');
    textarea.innerHTML = text;
    return textarea.value;
  }

  // Fix entities in page TOC sub-headers (dynamically injected by base.js)
  function fixPageTocEntities() {
    var pageTocLinks = document.querySelectorAll('.wm-page-toc-text');
    pageTocLinks.forEach(function(link) {
      var decoded = decodeHTMLEntities(link.textContent);
      if (decoded !== link.textContent) {
        link.textContent = decoded;
      }
    });
  }

  // Fix entities in main navigation links
  function fixNavEntities() {
    var navLinks = document.querySelectorAll('.wm-article-link');
    navLinks.forEach(function(link) {
      var decoded = decodeHTMLEntities(link.textContent);
      if (decoded !== link.textContent) {
        link.textContent = decoded;
      }
    });
  }

  // Fix entities in page headings
  function fixPageHeadings() {
    var headings = document.querySelectorAll('h1, h2, h3, h4, h5, h6');
    headings.forEach(function(heading) {
      var decoded = decodeHTMLEntities(heading.textContent);
      if (decoded !== heading.textContent) {
        heading.textContent = decoded;
      }
    });
  }

  // Run entity fixing on page load
  function initEntityFixes() {
    fixNavEntities();
    fixPageTocEntities();
    fixPageHeadings();
  }

  // Watch for dynamically-added content (page TOC is injected after load)
  function setupMutationObserver() {
    var observer = new MutationObserver(function(mutations) {
      mutations.forEach(function(mutation) {
        if (mutation.addedNodes.length) {
          // Check if any added nodes are or contain page TOC elements
          mutation.addedNodes.forEach(function(node) {
            if (node.nodeType === 1) { // Element node
              if (node.classList && (node.classList.contains('wm-page-toc') || node.classList.contains('wm-page-toc-text'))) {
                fixPageTocEntities();
              } else if (node.querySelector) {
                var hasToc = node.querySelector('.wm-page-toc, .wm-page-toc-text');
                if (hasToc) {
                  fixPageTocEntities();
                }
              }
            }
          });
        }
      });
    });

    // Observe the navigation pane for changes
    var navPane = document.querySelector('.wm-toc-pane');
    if (navPane) {
      observer.observe(navPane, {
        childList: true,
        subtree: true
      });
    }
  }

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
      initEntityFixes();
      setupMutationObserver();
    });
  } else {
    // DOM already loaded
    initEntityFixes();
    setupMutationObserver();
  }

  // Also run on page navigation (for single-page app behavior)
  window.addEventListener('hashchange', function() {
    setTimeout(fixPageTocEntities, 100);
  });

})();
