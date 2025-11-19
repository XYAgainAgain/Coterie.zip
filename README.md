# Coterie.zip

A **Powered by the Apocalypse** (PbtA) tabletop RPG that adapts **Vampire: The Masquerade** into a street-level, narrative-focused game emphasizing personal horror over high-level vampire politics.

**(Eventually) Live Site:** [coterie.zip](https://coterie.zip)

## About

Coterie is a non-commercial fan project combining mechanics from Urban Shadows 2e, VTM V5, Monster of the Week, and Blades in the Dark. It uses PbtA's fiction-first approach while maintaining VTM's evocative Hunger, Humanity, and Discipline systems.

### Core Systems

- **5 Character Stats**: Blood, Shadow, Resolve, Wits, Demeanor
- **5 Coterie Stats**: Clout, Cohesion, Charm, Claim, Currency
- **Bounded Accuracy**: Maximum -/+5 stat bonus
- **Modular Moves**: Lots of crazy vampire magic!

### VTM/Generic Toggle

The site features a unique **terminology toggle** that allows readers to switch between VTM-specific terms (Kindred, Auspex, Celerity) and generic equivalents (vampire, Scrying, Swiftness) for accessibility. This includes:

- 70 term mappings with context-aware singular/plural detection
- Blacklist protection for phrases like "Vampire: The Masquerade"
- Clean page-reload architecture with no flickering

## Tech Stack

- **Framework**: [MkDocs](https://www.mkdocs.org/) with [Material for MkDocs](https://squidfunk.github.io/mkdocs-material/)
- **Hosting**: GitHub Pages
- **Fonts**: Self-hosted WOFF2 files (GDPR compliant)
  - Metamorphous (gothic, ornamental headers)
  - IM Fell English SC & Great Primer (classic serif)
  - Merriweather Sans Variable (body text)
  - OpenDyslexic (accessibility)
- **Color Schemes**:
  - **Night Mode** (default): Deep Crimson, Carbon Black, Gold
  - **Sunset Mode**: Dried Blood, Twilight Blue, Blood Orange

## Development

### Local Setup

```bash
# Install dependencies
pip install -r requirements.txt

# Serve locally (hot reload at http://127.0.0.1:8000)
python -m mkdocs serve

# Build static site
python -m mkdocs build

# Build with strict mode (fails on warnings)
python -m mkdocs build --strict
```

### Project Structure

```
Coterie.zip/
├── docs/                          # Markdown content
│   ├── assets/
│   │   ├── fonts/                 # Self-hosted WOFF2 fonts
│   │   └── downloads/             # Coterie.zip download
│   ├── javascripts/
│   │   ├── extra.js               # HTML entity decoder
│   │   ├── terminology-toggle.js  # VTM/Generic toggle logic
│   │   └── terminology-mappings.json
│   ├── stylesheets/
│   │   └── extra.css              # Vampiric themes
│   ├── core-systems/
│   ├── vampiric-condition/
│   ├── moves-advancement/
│   ├── character/
│   ├── coterie/
│   ├── disciplines/
│   ├── storyteller/
│   ├── appendices/
│   └── index.md
├── .github/workflows/             # CI/CD automation
├── mkdocs.yml                     # Material configuration
└── requirements.txt
```

## Feature Roadmap

### High Priority

- [ ] **Material Theme Refinement** — Maximum vampirism aesthetic
  - Better text alignment and indentation
  - Enhanced dividers and separators
  - Improved table styling
  - Custom logos
  - Background image (subtle, Gothic)
  - Smooth CSS transitions and animations

- [ ] **Enhanced Terminology Toggle** — More elaborate & context-aware logic
  - Improve grammatical pattern detection
  - Handle more edge cases (contractions, possessives in complex sentences)
  - Add more sophisticated plural/singular rules
  - Consider sentence structure for better accuracy

- [ ] **Tooltip Hover Framework** — Automatic term linking
  - Detect defined terms in content
  - Link tooltips to Index page entries
  - Smooth hover animations
  - Mobile-friendly tap interactions
  - Configurable via JSON (similar to terminology mappings)

- [ ] **Accessibility Enhancements**
  - Built-in text resizing controls (already have OpenDyslexic WOFF2 font)
  - Font-swapper toggle (OpenDyslexic ↔ default fonts)
  - Ensure compatibility with screen readers
  - Keyboard navigation improvements
  - High contrast mode probably not necessary with dark mode default

### Medium Priority

- [ ] **Site Diagnostic Review** — Run new diagnostic and address findings
  - Security audit
  - Performance optimization
  - Accessibility compliance check
  - Mobile responsiveness testing
  - Cross-browser compatibility

- [ ] **SEO Optimization** — Search engine visibility
  - Meta descriptions for all pages
  - Structured data markup
  - Sitemap generation
  - robots.txt configuration
  - Social media preview cards (Open Graph, Twitter Cards)

### Completed ✅

- [x] **VTM/Generic Terminology Toggle** (2025-11-18)
  - 70 term mappings with context-aware singular/plural detection
  - Clean page-reload architecture
  - No flickering
  - Full documentation and troubleshooting guide

- [x] **Material for MkDocs Migration** (2025-11-17)
  - Eliminated jQuery/Bootstrap security vulnerabilities
  - Self-hosted fonts (GDPR compliant)
  - Gothic Vampire color scheme (Night + Sunset modes)

## Legalese

- **Theme**: Material for MkDocs by Martin Donath (MIT License)
- **Fonts**: Google Fonts (self-hosted WOFF2, SIL Open Font License)
- **Game Content**: Vampire: The Masquerade by Paradox Interactive ([Dark Pack Agreement](https://www.worldofdarkness.com/dark-pack))
- **PbtA Framework**: Powered by the Apocalypse (Creative Commons)

This is a **non-commercial fan project** created under Paradox Interactive's Dark Pack Agreement. Vampire: The Masquerade is a trademark of Paradox Interactive AB.

## Contributing

This is a personal project, but suggestions and bug reports are welcome via [Issues](https://github.com/XYAgainAgain/Coterie.zip/issues)!

---

🦇 **Made with darkness & dice & dedication** 🎲
