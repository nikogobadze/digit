/* ==================================================================
   fx.js — the landing terminal, and section entrances.

   The terminal is the point of the redesign: a visitor sees a real problem get
   typed, routed to a manager, priced and fixed before reading a single line of
   marketing. It is also the most honest way to say "this is for tech problems".

   Written in plain DOM with timers rather than an animation library, so it costs
   nothing to download. It reads its script from data attributes on the markup so
   the Georgian copy comes from i18n like everything else, rather than being
   hard-coded here.
================================================================== */

(function fx() {
  const reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- typing terminal ---------- */
  function runTerminal() {
    const host = document.getElementById('term-type');
    if (!host) return;
    const root = host.closest('.term');
    const outs = [...root.querySelectorAll('.term-out')];
    // The phrase is read from the DOM so the translator can rewrite it first.
    const phrase = (host.getAttribute('data-phrase') || '').trim();
    if (!phrase) return;

    if (reduced) {                       // no typing: just show the finished state
      host.textContent = phrase;
      outs.forEach(o => o.classList.add('show'));
      return;
    }

    let i = 0;
    host.textContent = '';
    outs.forEach(o => o.classList.remove('show'));
    clearTimeout(runTerminal._t);
    clearTimeout(runTerminal._r);

    const typeNext = () => {
      host.textContent = phrase.slice(0, ++i);
      if (i < phrase.length) {
        // Slight jitter so it reads as typing rather than a machine ticking.
        runTerminal._t = setTimeout(typeNext, 34 + Math.random() * 46);
      } else {
        outs.forEach((o, n) => setTimeout(() => o.classList.add('show'), 420 + n * 620));
        // Loop, so a visitor who arrives mid-cycle still sees the whole story.
        runTerminal._r = setTimeout(runTerminal, 420 + outs.length * 620 + 3800);
      }
    };
    runTerminal._t = setTimeout(typeNext, 380);
  }

  /* ---------- generic entrance for anything marked .fx-in ----------
     A scroll sweep, not an IntersectionObserver: an observer only fires on a
     ratio CHANGE, so jumping past an element leaves it invisible for good. */
  let queued = false;
  function sweep() {
    const left = document.querySelectorAll('.fx-in:not(.in)');
    if (!left.length) return;
    const fold = window.innerHeight * 0.92;
    left.forEach(el => { if (el.getBoundingClientRect().top < fold) el.classList.add('in'); });
  }
  function onScroll() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; sweep(); });
  }

  function arm() {
    if (reduced) document.querySelectorAll('.fx-in').forEach(el => el.classList.add('in'));
    else sweep();
    runTerminal();
  }

  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll);

  // Re-armed by app.js after a render, and after a language switch (the phrase
  // itself is translated, so the typing has to start again from the new text).
  window.__armFx = arm;

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', arm);
  else arm();
})();
