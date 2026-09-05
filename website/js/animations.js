/**
 * HYDRAX website — Anime.js scroll-driven reveals.
 *
 * Presentation only, exactly like js/site.js: every section is fully present
 * in the HTML and readable with this file blocked or absent (see the
 * `data-reveal*` fallback rule in styles.css, which keeps every element at
 * full opacity unless JS actually runs). This file only ever adds a brief,
 * one-time entrance to something already on the page — it never renders
 * content, never changes copy, never touches the request flow or the nav.
 *
 * Two attributes drive everything, read off the markup in index.html:
 *   data-reveal="fade-up|fade-right|fade-left"   — one element, one entrance
 *   data-reveal-group="fade-up" data-reveal-stagger="70"
 *                                                  — a container whose direct
 *                                                    children stagger in as a
 *                                                    sequence (the control
 *                                                    loop stages, the soil-to-
 *                                                    valve flow, the field
 *                                                    problem's four nodes,
 *                                                    the feature grid)
 *
 * Every entrance fires once, the first time its element scrolls into view,
 * then stops being observed — scrolling back up never replays it.
 */

import { animate, stagger } from './vendor/animejs/anime.esm.min.js';

function reducedMotion() {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

if (reducedMotion() || !('IntersectionObserver' in window)) {
  // Nothing to do: styles.css already renders every element at full opacity
  // with no transform, so there is no "stuck invisible" state to recover
  // from here — this file simply never runs its animations.
} else {
  const OFFSETS = {
    'fade-up': { opacity: [0, 1], translateY: [16, 0] },
    'fade-right': { opacity: [0, 1], translateX: [-22, 0] },
    'fade-left': { opacity: [0, 1], translateX: [22, 0] },
  };

  function revealOne(el) {
    const kind = OFFSETS[el.dataset.reveal] || OFFSETS['fade-up'];
    const delay = Number(el.dataset.revealDelay || 0);
    el.style.willChange = 'opacity, transform';
    animate(el, {
      ...kind,
      duration: 620,
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
    const staggerMs = Number(container.dataset.revealStagger || 60);
    const children = Array.from(container.children);
    if (children.length === 0) return;
    for (const child of children) child.style.willChange = 'opacity, transform';
    animate(children, {
      ...kind,
      duration: 560,
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

  const observer = new IntersectionObserver(
    (entries, obs) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const el = entry.target;
        if (el.dataset.reveal) revealOne(el);
        else if (el.dataset.revealGroup) revealGroup(el);
        obs.unobserve(el);
      }
    },
    { threshold: 0.18, rootMargin: '0px 0px -8% 0px' },
  );

  for (const el of document.querySelectorAll('[data-reveal], [data-reveal-group]')) {
    observer.observe(el);
  }

  /* ----------------------------------------------------- device illustration
     flow lines. The illustration is defined once as an SVG <symbol> and
     instanced twice (hero, "The System") via <use> — styling and class
     toggles on the symbol's own children apply to every instance, so a
     single observer covering both instancing points is enough. Runs only
     while at least one instance is on screen, matching the same rule
     js/site.js already applies to the old hero schematic. */
  const flowLines = document.querySelectorAll('#hydrax-device .d-line-live');
  const stages = document.querySelectorAll('.device-stage');
  if (flowLines.length > 0 && stages.length > 0) {
    const visible = new Set();
    const flowObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) visible.add(entry.target);
          else visible.delete(entry.target);
        }
        for (const line of flowLines) line.classList.toggle('is-flowing', visible.size > 0);
      },
      { threshold: 0.2 },
    );
    for (const stage of stages) flowObserver.observe(stage);
  }
}
