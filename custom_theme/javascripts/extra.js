// Custom JavaScript for Coterie - Material for MkDocs
// HTML Entity Decoding (may not be needed in Material, but included for compatibility)

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

  // Material for MkDocs uses instant loading (SPA-like behavior)
  // Subscribe to the document$ observable if available
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

  // Also watch for dynamic content changes (Material's instant loading)
  var observer = new MutationObserver(function(mutations) {
    mutations.forEach(function(mutation) {
      if (mutation.addedNodes.length) {
        // Check if TOC or navigation was added
        mutation.addedNodes.forEach(function(node) {
          if (node.nodeType === 1) { // Element node
            if (node.classList && (node.classList.contains('md-nav') || node.classList.contains('md-content'))) {
              setTimeout(initEntityFixes, 50);
            } else if (node.querySelector) {
              var hasNav = node.querySelector('.md-nav, .md-content');
              if (hasNav) {
                setTimeout(initEntityFixes, 50);
              }
            }
          }
        });
      }
    });
  });

  // Observe the main content area
  var mainContent = document.querySelector('.md-main');
  if (mainContent) {
    observer.observe(mainContent, {
      childList: true,
      subtree: true
    });
  }

})();

// Additional custom functionality can be added below
// For example: custom analytics, interactive elements, etc.
