/**
 * HYDRAX website — Anime.js scroll-driven reveals.
 *
 * Presentation only, exactly like js/site.js: every section is fully present
 * in the HTML and readable with this file blocked or absent. Nothing here
 * fetches data or changes copy — it only animates elements already on the
 * page, once, the first time they scroll into view.
 *
 * Three independent, restrained effects, matching the brief this redesign
 * follows ("subtle, deliberate, premium... do not animate every element"):
 *   1. data-reveal / data-reveal-group — a fade + upward reveal, once.
 *   2. #field-line-live — the thin divider under the hero gets a slow,
 *      looping "water moving through it" dash animation, running only while
 *      it is actually on screen.
 *   3. #droplet-ripple — one rare, understated ripple around the water-
 *      droplet accent photo, the first time it comes into view. Never loops.
 *   4. [data-count-up] — the small verification-numbers strip counts up
 *      from zero once, toward the real number already in the markup.
 *
 * The hero's own slow drift/zoom and the confirmation checkmark are plain
 * CSS animations (see styles.css) — no JS needed for those.
 *
 * js/content.js can rebuild the children of a `data-reveal-group` container
 * (the how-steps list, the benefit rows) after this file has already set up
 * its observers. Both `revealGroup()` and the count-up observer below read
 * their target's children lazily, inside the IntersectionObserver callback —
 * not at setup time — so a rebuild that finishes before the container
 * actually scrolls into view is already safe on its own. The one gap that
 * doesn't cover is a container already in the viewport at page load, before
 * the CMS fetch resolves — so setup itself waits for content.js's
 * `hydrax:content-ready` signal (or a short timeout, so a slow/broken CMS
 * fetch never leaves the whole page unanimated).
 */

import { animate, stagger } from './vendor/animejs/anime.esm.min.js';

function reducedMotion() {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

const CONTENT_READY_TIMEOUT_MS = 1200;

function whenContentReady(callback) {
  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    callback();
  };
  document.addEventListener('hydrax:content-ready', finish, { once: true });
  setTimeout(finish, CONTENT_READY_TIMEOUT_MS);
}

if (reducedMotion() || !('IntersectionObserver' in window)) {
  // Nothing to do: every element this file would animate already renders at
  // full opacity in its resting position via plain CSS — there is no
  // "stuck invisible" state to recover from by skipping this.
} else {
  whenContentReady(setupAnimations);
}

function setupAnimations() {
  const OFFSETS = {
    'fade-up': { opacity: [0, 1], translateY: [18, 0] },
    'fade-right': { opacity: [0, 1], translateX: [-22, 0] },
    'fade-left': { opacity: [0, 1], translateX: [22, 0] },
  };

  function revealOne(el) {
    const kind = OFFSETS[el.dataset.reveal] || OFFSETS['fade-up'];
    const delay = Number(el.dataset.revealDelay || 0);
    el.style.willChange = 'opacity, transform';
    animate(el, {
      ...kind,
      duration: 700,
      delay,
      ease: 'outQuad',
      onComplete: () => {
        el.style.willChange = '';
        el.style.transform = '';
      },
    });
  }

  function revealGroup(container) {
    const kind = OFFSETS[container.dataset.revealGroup] || OFFSETS['fade-up'];
    const staggerMs = Number(container.dataset.revealStagger || 70);
    const children = Array.from(container.children);
    if (children.length === 0) return;
    for (const child of children) child.style.willChange = 'opacity, transform';
    animate(children, {
      ...kind,
      duration: 620,
      delay: stagger(staggerMs),
      ease: 'outQuad',
      onComplete: (anim) => {
        for (const target of anim.targets) {
          target.style.willChange = '';
          target.style.transform = '';
        }
      },
    });
  }

  const revealObserver = new IntersectionObserver(
    (entries, obs) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const el = entry.target;
        if (el.dataset.reveal) revealOne(el);
        else if (el.dataset.revealGroup) revealGroup(el);
        obs.unobserve(el);
      }
    },
    { threshold: 0.16, rootMargin: '0px 0px -8% 0px' },
  );
  for (const el of document.querySelectorAll('[data-reveal], [data-reveal-group]')) {
    revealObserver.observe(el);
  }

  /* ------------------------------------------------------- field-line flow -- */
  const fieldLine = document.getElementById('field-line-live');
  if (fieldLine) {
    const lineObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) fieldLine.classList.toggle('is-flowing', entry.isIntersecting);
      },
      { threshold: 0.1 },
    );
    lineObserver.observe(fieldLine);
  }

  /* --------------------------------------------------- one rare water ripple -- */
  const ripple = document.getElementById('droplet-ripple');
  if (ripple) {
    const rippleObserver = new IntersectionObserver(
      (entries, obs) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          ripple.classList.add('is-rippling');
          obs.unobserve(ripple);
        }
      },
      { threshold: 0.5 },
    );
    rippleObserver.observe(ripple);
  }

  /* --------------------------------------------- verification count-up, once -- */
  const verifyStrip = document.getElementById('verify-strip');
  if (verifyStrip) {
    const countObserver = new IntersectionObserver(
      (entries, obs) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          for (const dt of verifyStrip.querySelectorAll('[data-count-up]')) {
            const target = Number(dt.dataset.countUp);
            if (!Number.isFinite(target)) continue;
            const counter = { v: 0 };
            animate(counter, {
              v: target,
              duration: 900,
              delay: 150,
              ease: 'outExpo',
              onUpdate: () => { dt.textContent = String(Math.round(counter.v)); },
              onComplete: () => { dt.textContent = String(target); },
            });
          }
          obs.unobserve(verifyStrip);
        }
      },
      { threshold: 0.4 },
    );
    countObserver.observe(verifyStrip);
  }
}
