/* ==================================================================
   depth.js — parallax and pointer-reactive tilt for the landing page.

   The brief pointed at bruno-simon.com for depth, porsche.com for restraint and
   aramco.com for scroll-driven storytelling. This takes the FEELING of the first
   without the engine: a real WebGL scene is ~600KB of JavaScript, a loading
   screen and steady GPU work on a phone, which would undo the load-time work and
   is the opposite of "keep it simple". Everything here is transform and opacity
   only — no library, no extra request, nothing to download.

   Three rules it holds to:
   - Only transform/opacity are animated, so the browser never re-lays-out.
   - All work is throttled to one animation frame; scroll listeners are passive.
   - It does nothing at all for a visitor who prefers reduced motion, and the
     pointer tilt is skipped on touch devices where there is no cursor to follow.
================================================================== */

(function depth() {
  const reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const fine = window.matchMedia && window.matchMedia('(pointer: fine)').matches;
  if (reduced) return;

  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  /* ---------- scroll parallax ----------
     Elements marked data-depth drift against the scroll at their own rate. The
     rate is small on purpose: enough to read as depth, not enough to make the
     page feel like it is sliding around under you. */
  let ticking = false;
  let layers = [];

  function collect() {
    layers = [...document.querySelectorAll('#view-home [data-depth]')].map(el => ({
      el, rate: parseFloat(el.getAttribute('data-depth')) || 0,
    }));
  }

  function apply() {
    ticking = false;
    const vh = window.innerHeight;
    for (const l of layers) {
      const b = l.el.getBoundingClientRect();
      if (b.bottom < -200 || b.top > vh + 200) continue;   // far off screen: skip
      // How far this element is from the middle of the viewport, as -1..1.
      const centre = (b.top + b.height / 2 - vh / 2) / vh;
      const shift = clamp(centre, -1.4, 1.4) * l.rate;
      l.el.style.setProperty('--pY', shift.toFixed(2) + 'px');
    }
  }

  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(apply);
  }

  /* ---------- pointer tilt ----------
     The hero scene and each step card lean very slightly towards the cursor.
     Bounded to a couple of degrees: past that it stops reading as depth and
     starts reading as a gimmick. */
  function tiltable(el, maxDeg) {
    let raf = 0;
    const onMove = (e) => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const b = el.getBoundingClientRect();
        const x = (e.clientX - b.left) / b.width - 0.5;
        const y = (e.clientY - b.top) / b.height - 0.5;
        el.style.setProperty('--rx', (clamp(-y, -0.5, 0.5) * maxDeg).toFixed(2) + 'deg');
        el.style.setProperty('--ry', (clamp(x, -0.5, 0.5) * maxDeg).toFixed(2) + 'deg');
      });
    };
    const reset = () => {
      el.style.setProperty('--rx', '0deg');
      el.style.setProperty('--ry', '0deg');
    };
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerleave', reset);
  }

  function armTilt() {
    if (!fine) return;
    document.querySelectorAll('#view-home .hero-art, #view-home .hiw-step').forEach(el => {
      if (el.dataset.tilted) return;
      el.dataset.tilted = '1';
      tiltable(el, el.classList.contains('hero-art') ? 7 : 5);
    });
  }

  function arm() {
    collect();
    armTilt();
    apply();
  }

  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll);

  // The category tiles are painted after /api/categories lands, and the home view
  // can be re-entered, so expose a re-arm rather than only running once.
  window.__armDepth = arm;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', arm);
  else arm();
})();
