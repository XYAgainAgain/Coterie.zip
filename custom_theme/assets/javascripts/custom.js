// Custom JavaScript for Coterie theme

/**
 * Comprehensive HTML entity decoder
 * Handles all common HTML entities to ensure proper character display
 */
function decodeHTMLEntities(text) {
  const textArea = document.createElement('textarea');
  textArea.innerHTML = text;
  return textArea.value;
}

/**
 * Fix HTML entity encoding across the entire site
 * Runs on navigation links, page titles, headings, and content
 */
function fixHTMLEntities() {
  // Fix navigation links
  const navLinks = document.querySelectorAll('.wm-toc-pane a, nav a, .wm-toc a');
  navLinks.forEach(function(link) {
    const originalHTML = link.innerHTML;
    const decodedHTML = decodeHTMLEntities(originalHTML);
    if (originalHTML !== decodedHTML) {
      link.innerHTML = decodedHTML;
    }
  });

  // Fix page titles
  const titles = document.querySelectorAll('.wm-top-title, h1, h2, h3, h4, h5, h6');
  titles.forEach(function(title) {
    const originalHTML = title.innerHTML;
    const decodedHTML = decodeHTMLEntities(originalHTML);
    if (originalHTML !== decodedHTML) {
      title.innerHTML = decodedHTML;
    }
  });

  // Fix article links and content
  const contentElements = document.querySelectorAll('.wm-article a, .wm-article p, .wm-article li');
  contentElements.forEach(function(element) {
    const originalHTML = element.innerHTML;
    const decodedHTML = decodeHTMLEntities(originalHTML);
    if (originalHTML !== decodedHTML) {
      element.innerHTML = decodedHTML;
    }
  });
}

/**
 * Inject custom font styles into sidebar navigation
 * Handles both regular nav and iframe-based nav
 */
function injectSidebarFonts() {
  // Try to inject into iframes (if same-origin)
  const iframes = document.querySelectorAll('iframe');
  iframes.forEach(function(iframe) {
    try {
      const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
      if (iframeDoc) {
        let styleElement = iframeDoc.getElementById('custom-nav-fonts');
        if (!styleElement) {
          styleElement = iframeDoc.createElement('style');
          styleElement.id = 'custom-nav-fonts';
          styleElement.textContent = `
            @import url('https://fonts.googleapis.com/css2?family=Metamorphous&family=IM+Fell+English+SC&display=swap');

            .wm-toc > li > a,
            ul.wm-toc > li > a {
              font-family: 'Metamorphous', serif !important;
              font-size: 1.1em !important;
            }

            .wm-toc li ul li a,
            ul.wm-toc li ul li a {
              font-family: 'IM Fell English SC', serif !important;
              font-size: 1.15em !important;
              font-weight: 600 !important;
            }
          `;
          iframeDoc.head.appendChild(styleElement);
        }
      }
    } catch (e) {
      // Cross-origin iframe, cannot access
      console.log('Cannot access iframe (cross-origin):', e);
    }
  });

  // Also apply directly to any navigation in main document
  const mainSections = document.querySelectorAll('.wm-toc > li > a, ul.wm-toc > li > a');
  mainSections.forEach(function(link) {
    link.style.fontFamily = "'Metamorphous', serif";
    link.style.fontSize = '1.1em';
  });

  const subItems = document.querySelectorAll('.wm-toc li ul li a, ul.wm-toc li ul li a');
  subItems.forEach(function(link) {
    link.style.fontFamily = "'IM Fell English SC', serif";
    link.style.fontSize = '1.15em';
    link.style.fontWeight = '600';
  });
}

// Run on page load
document.addEventListener('DOMContentLoaded', function() {
  fixHTMLEntities();
  injectSidebarFonts();

  // Re-run after a delay to catch late-loading iframes
  setTimeout(injectSidebarFonts, 500);
  setTimeout(injectSidebarFonts, 1500);
});

// Also run after any dynamic content loads (for navigation iframe if present)
if (window.MutationObserver) {
  const observer = new MutationObserver(function(mutations) {
    fixHTMLEntities();
    injectSidebarFonts();
  });

  // Observe the document for changes
  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
}

console.log('Coterie custom theme loaded');
