/* ==================================================================
   cat-icons.js — one flat vector icon per problem category.

   The category grid used the emoji from the server payload, which meant the
   most visual block on the landing page rendered in whatever emoji font the
   device happened to ship: different weights, different colour, different
   metrics on every OS, and no relationship to the brand palette.

   These are drawn on a 48x48 grid, two-tone: a soft tinted plate plus a solid
   mark, so each category reads by shape AND by colour at a glance. They are
   plain strings rather than files so there is no extra request, and the emoji
   stays as the fallback for anything the server adds later that is not listed
   here (nothing breaks, it just uses the old glyph).
================================================================== */

const CAT_ICON_TINT = {
  hardware: '#6E6EF5', os: '#F0913A', network: '#2FA8E0', security: '#2FB37E',
  web: '#7C5CE0', backend: '#E0603A', mobile: '#D4569B', data: '#3F7BD8', other: '#C79A24',
};

/* Each entry returns the inner markup for a 48x48 viewBox. `t` is the tint. */
const CAT_ICON_ART = {
  // Desktop tower + screen, with a crack to say "crashes".
  hardware: (t) => `
    <rect x="6" y="9" width="28" height="21" rx="3.5" fill="${t}" opacity=".22"/>
    <rect x="6" y="9" width="28" height="21" rx="3.5" fill="none" stroke="${t}" stroke-width="2.6"/>
    <path d="M17 30l-1.5 7h9L23 30" fill="${t}" opacity=".55"/>
    <path d="M13 37h14" stroke="${t}" stroke-width="2.6" stroke-linecap="round"/>
    <path d="M19 13l-3.5 7h5l-2.5 6" stroke="${t}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
    <rect x="34" y="18" width="9" height="20" rx="2.5" fill="${t}"/>
    <circle cx="38.5" cy="23" r="1.6" fill="#fff"/>`,

  // Snail shell: the app already used one for "slow".
  os: (t) => `
    <path d="M9 33h20" stroke="${t}" stroke-width="2.8" stroke-linecap="round"/>
    <circle cx="24" cy="22" r="12" fill="${t}" opacity=".22"/>
    <path d="M24 22a5 5 0 1 1 5 5 8 8 0 1 1-8-8" stroke="${t}" stroke-width="2.8" fill="none" stroke-linecap="round"/>
    <path d="M12 33c-1-5 1-8 4-9" stroke="${t}" stroke-width="2.8" fill="none" stroke-linecap="round"/>
    <path d="M12 24l-2-5M16 23l1-5" stroke="${t}" stroke-width="2.4" stroke-linecap="round"/>`,

  // Signal arcs over a router.
  network: (t) => `
    <rect x="10" y="28" width="28" height="12" rx="3.5" fill="${t}" opacity=".22"/>
    <rect x="10" y="28" width="28" height="12" rx="3.5" fill="none" stroke="${t}" stroke-width="2.6"/>
    <circle cx="17" cy="34" r="2" fill="${t}"/>
    <path d="M28 34h6" stroke="${t}" stroke-width="2.4" stroke-linecap="round"/>
    <path d="M17 21a15 15 0 0 1 21 0" stroke="${t}" stroke-width="2.8" fill="none" stroke-linecap="round"/>
    <path d="M22 15a23 23 0 0 1 11 0" stroke="${t}" stroke-width="2.8" fill="none" stroke-linecap="round" opacity=".55"/>`,

  // Shield with a tick.
  security: (t) => `
    <path d="M24 7l14 5v11c0 9-6 15-14 18-8-3-14-9-14-18V12z" fill="${t}" opacity=".22"/>
    <path d="M24 7l14 5v11c0 9-6 15-14 18-8-3-14-9-14-18V12z" fill="none" stroke="${t}" stroke-width="2.8" stroke-linejoin="round"/>
    <path d="M17 23l5 5 10-10" stroke="${t}" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>`,

  // Browser window with a cursor.
  web: (t) => `
    <rect x="6" y="9" width="36" height="28" rx="4" fill="${t}" opacity=".22"/>
    <rect x="6" y="9" width="36" height="28" rx="4" fill="none" stroke="${t}" stroke-width="2.6"/>
    <path d="M6 17h36" stroke="${t}" stroke-width="2.6"/>
    <circle cx="11.5" cy="13" r="1.5" fill="${t}"/><circle cx="16.5" cy="13" r="1.5" fill="${t}"/>
    <path d="M21 22l10 10-4 1.5 3 5-2.5 1.5-3-5-3.5 2.5z" fill="${t}"/>`,

  // Stacked server discs with angle brackets.
  backend: (t) => `
    <ellipse cx="24" cy="13" rx="15" ry="5.5" fill="${t}" opacity=".28"/>
    <path d="M9 13v9c0 3 6.7 5.5 15 5.5s15-2.5 15-5.5v-9" fill="${t}" opacity=".18"/>
    <path d="M9 13c0 3 6.7 5.5 15 5.5s15-2.5 15-5.5M9 13v9c0 3 6.7 5.5 15 5.5s15-2.5 15-5.5v-9"
      stroke="${t}" stroke-width="2.6" fill="none" stroke-linecap="round"/>
    <path d="M17 40l-5-5 5-5M31 30l5 5-5 5" stroke="${t}" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round" fill="none"/>`,

  // Phone with an app grid.
  mobile: (t) => `
    <rect x="14" y="5" width="20" height="38" rx="4.5" fill="${t}" opacity=".22"/>
    <rect x="14" y="5" width="20" height="38" rx="4.5" fill="none" stroke="${t}" stroke-width="2.6"/>
    <circle cx="20" cy="18" r="2.2" fill="${t}"/><circle cx="28" cy="18" r="2.2" fill="${t}"/>
    <circle cx="20" cy="26" r="2.2" fill="${t}"/><circle cx="28" cy="26" r="2.2" fill="${t}"/>
    <path d="M21 38h6" stroke="${t}" stroke-width="2.4" stroke-linecap="round"/>`,

  // Drive with a recovery arrow.
  data: (t) => `
    <rect x="7" y="12" width="34" height="24" rx="4" fill="${t}" opacity=".22"/>
    <rect x="7" y="12" width="34" height="24" rx="4" fill="none" stroke="${t}" stroke-width="2.6"/>
    <circle cx="24" cy="24" r="6.5" fill="none" stroke="${t}" stroke-width="2.6"/>
    <circle cx="24" cy="24" r="1.8" fill="${t}"/>
    <path d="M33 20a10 10 0 1 1-3-4" stroke="${t}" stroke-width="2.6" fill="none" stroke-linecap="round" opacity=".0"/>
    <path d="M13 31l3.5-3.5M35 17l-3.5 3.5" stroke="${t}" stroke-width="2.4" stroke-linecap="round"/>`,

  // Sparkle for "something else".
  other: (t) => `
    <path d="M24 8l3.6 9.4L37 21l-9.4 3.6L24 34l-3.6-9.4L11 21l9.4-3.6z" fill="${t}" opacity=".28"/>
    <path d="M24 8l3.6 9.4L37 21l-9.4 3.6L24 34l-3.6-9.4L11 21l9.4-3.6z" fill="none" stroke="${t}" stroke-width="2.6" stroke-linejoin="round"/>
    <path d="M36 32l1.6 4.2L42 38l-4.4 1.6L36 44l-1.6-4.4L30 38l4.4-1.8z" fill="${t}" opacity=".7"/>`,
};

/* Returns an <svg> string for a category, or null when we have no art for it —
   callers fall back to the emoji the server sent. */
function catIcon(key) {
  const art = CAT_ICON_ART[key];
  if (!art) return null;
  const tint = CAT_ICON_TINT[key] || '#6E6EF5';
  return `<svg class="cat-svg" viewBox="0 0 48 48" role="img" aria-hidden="true" focusable="false">${art(tint)}</svg>`;
}
