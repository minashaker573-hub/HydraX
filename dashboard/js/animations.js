/**
 * HYDRAX dashboard — Anime.js animation layer.
 *
 * Pure presentation. Nothing in this file fetches data, mutates app state, or
 * changes what the dashboard shows — it only animates DOM nodes that
 * app.js/views.js/ui.js already built from real telemetry. Deleting this file
 * and its two call sites in app.js leaves the dashboard fully functional; see
 * vendor/animejs/README.md.
 *
 * THE RULE THAT GOVERNS THIS FILE: every render triggered by the 3s/15s
 * polling loop redraws the current view from scratch (see app.js's
 * `render()` — `container.replaceChildren()` then a fresh `view.render()`).
 * Naively animating "on render" would replay every entrance animation once a
 * poll cycle, forever — exactly what was ruled out. So this file distinguishes
 * two kinds of render:
 *
 *   - a "fresh" render (first load, navigating to a view, a language switch):
 *     the view's whole content is genuinely new to look at, so it gets the
 *     staggered entrance choreography.
 *   - a "poll" render (the periodic background refresh): nothing about the
 *     content changing is inherently new to the person looking at it, so
 *     nothing is replayed. Instead, this file diffs the freshly-rendered DOM
 *     against what it remembers from the previous render (alert/event ids
 *     already shown, each zone's valve/irrigating/moisture-status signature,
 *     which control-loop stage was active) and animates only the specific
 *     nodes whose real, underlying state actually changed.
 *
 * The "memory" an app.js-owned object threads through every call, so this
 * module stays a set of pure-ish functions rather than owning its own
 * hidden, hard-to-reset state.
 */

import { animate, stagger } from './vendor/animejs/anime.esm.min.js';
import { isRtl } from './i18n.js';

const EASE = 'outQuad';
const COUNT_EASE = 'outExpo';

function reducedMotion() {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    // matchMedia unavailable: animate normally rather than guess.
    return false;
  }
}

function isNarrowViewport() {
  try {
    return window.matchMedia('(max-width: 860px)').matches;
  } catch {
    return false;
  }
}

function asList(targets) {
  if (!targets) return [];
  if (targets instanceof Element) return [targets];
  return Array.from(targets);
}

/**
 * animate() with two safety nets applied uniformly:
 *   - `will-change` is set only for the animation's duration, then cleared —
 *     dozens of permanently GPU-promoted layers is exactly the kind of cost
 *     "keep animations lightweight" rules out.
 *   - the inline `transform`/`opacity` this leaves behind is cleared on
 *     completion, handing the property back to CSS. Several elements this
 *     file touches (the sidebar, in particular) have their own CSS-driven
 *     `transform` for unrelated reasons (the mobile drawer) — leaving an
 *     inline value behind would silently outrank that CSS forever after.
 */
function run(targets, params) {
  const list = asList(targets);
  if (list.length === 0 || reducedMotion()) return;

  for (const el of list) {
    if (el instanceof HTMLElement || el instanceof SVGElement) el.style.willChange = 'opacity, transform';
  }

  animate(list, {
    ease: EASE,
    ...params,
    onComplete: (anim) => {
      for (const target of anim.targets) {
        if (target instanceof HTMLElement || target instanceof SVGElement) {
          target.style.willChange = '';
          target.style.transform = '';
        }
      }
      if (typeof params.onComplete === 'function') params.onComplete(anim);
    },
  });
}

/** Fade + translateY(+scale), optionally staggered — the one entrance shape
 *  used everywhere per the "controlled, subtle, consistent" brief. Direction-
 *  agnostic (translateY only), so it needs no RTL handling. */
function reveal(targets, { translateY = 10, scale = null, delay = 0, staggerMs = 0, duration = 420 } = {}) {
  const props = { opacity: [0, 1], translateY: [translateY, 0] };
  if (scale !== null) props.scale = [scale, 1];
  run(targets, { ...props, duration, delay: staggerMs > 0 ? stagger(staggerMs, { start: delay }) : delay });
}

/* ========================================================================= */
/* app shell — sidebar / topbar / nav. Boot only; never replayed on          */
/* navigation, since re-animating chrome that never left the screen would be */
/* exactly the "chaotic, everything animates independently" case ruled out.  */
/* ========================================================================= */

export function initPageAnimations({ sidebar, topbar, navItems } = {}) {
  if (reducedMotion()) return;

  if (sidebar) {
    if (isNarrowViewport()) {
      // The sidebar's `transform` is owned entirely by the CSS drawer
      // mechanism on narrow viewports (styles.css' --drawer-offset), which
      // keeps it off-screen until the hamburger opens it. Animating
      // translateX here would leave an inline transform fighting that the
      // moment this animation completes — see run()'s doc comment. A fade is
      // enough of a "coming online" cue without touching transform at all.
      reveal(sidebar, { translateY: 0, duration: 380 });
    } else {
      // Desktop: the sidebar has no other claim on `transform`, so a slide
      // from its own docked edge reads naturally — mirrored under RTL since
      // the sidebar docks to the opposite edge there.
      const dx = isRtl() ? 18 : -18;
      run(sidebar, { opacity: [0, 1], translateX: [dx, 0], duration: 520 });
    }
  }

  if (topbar) reveal(topbar, { translateY: -8, delay: 90, duration: 420 });
  animateSidebarNav(navItems);
}

export function animateSidebarNav(navItems) {
  const items = asList(navItems);
  if (items.length === 0) return;
  reveal(items, { translateY: 6, delay: 170, staggerMs: 35, duration: 320 });
}

/* ========================================================================= */
/* per-view entrance — fresh renders only (boot / navigation / language)     */
/* ========================================================================= */

/**
 * Reveals a freshly-rendered view's content top to bottom, in whatever order
 * views.js actually built it (welcome header, then each `<section>` in
 * sequence) — so this needs no per-view special-casing to match "Sidebar →
 * Topbar → Welcome → KPIs → Control loop → Control panel/alerts → Farm →
 * Zones → Events": that ordering already IS the document order every view.js
 * renderer builds.
 *
 * Within each section, the most specific real content is staggered
 * individually (KPI cards, control-loop stages, zone cards); a section with
 * no such grid (guarantees list, farm schematic, device detail rows...) is
 * revealed as one unit instead. A section is never animated at both
 * granularities at once — that would visibly compound two opacity fades.
 */
export function animateViewEnter(container) {
  if (!container || reducedMotion()) return;

  const groups = container.querySelectorAll('.welcome-header, .section');
  const STEP = 70;
  let delay = 0;

  for (const group of groups) {
    const pipeline = group.querySelector('.pipeline');
    const kpiGrid = group.querySelector('.grid-kpi');
    const zoneCards = group.querySelectorAll('.zone-card, .zone-summary-card');

    if (pipeline) {
      reveal(pipeline.querySelectorAll('.stage'), { translateY: 10, delay, staggerMs: 90, duration: 380 });
    } else if (kpiGrid) {
      reveal(kpiGrid.children, { translateY: 12, scale: 0.98, delay, staggerMs: 55 });
    } else if (zoneCards.length > 0) {
      reveal(zoneCards, { translateY: 12, scale: 0.98, delay, staggerMs: 60 });
    } else {
      reveal(group, { translateY: 12, delay });
    }
    delay += STEP;
  }
}

/**
 * Short count-up toward the real backend value already sitting in the DOM
 * (see `kpi({ countUp })` in ui.js) — never toward a random or guessed
 * number. `enabled` is the caller's decision, not this function's: it is
 * meant to be true only the first time a given view's KPIs ever appear in
 * this session (see `onViewRendered` below), never on a poll-triggered
 * refresh, so a real value settling into place never looks like telemetry is
 * "counting" every few seconds.
 */
export function animateKpiCountUps(kpiGrid, { enabled = false } = {}) {
  if (!enabled || !kpiGrid || reducedMotion()) return;

  for (const valueEl of kpiGrid.querySelectorAll('[data-count-up]')) {
    const target = Number(valueEl.dataset.countUp);
    if (!Number.isFinite(target)) continue;
    const decimals = Number(valueEl.dataset.countUpDecimals || '0');
    const unitNode = valueEl.querySelector('.kpi-unit');

    const setText = (value) => {
      valueEl.textContent = value.toFixed(decimals);
      if (unitNode) valueEl.appendChild(unitNode);
    };

    const counter = { v: 0 };
    animate(counter, {
      v: target,
      duration: 900,
      delay: 200,
      ease: COUNT_EASE,
      onUpdate: () => setText(counter.v),
      onComplete: () => setText(target),
    });
  }
}

/* ========================================================================= */
/* diff-driven updates — poll renders only                                   */
/* ========================================================================= */

function seedIds(container, selector, dataKey, set) {
  for (const node of container.querySelectorAll(selector)) {
    const id = node.dataset[dataKey];
    if (id) set.add(id);
  }
}

/** Animates only the elements whose id was not already in `set`, then adds
 *  every id currently on screen to it. Used for both alerts and events: a
 *  genuinely new one gets a brief, restrained entrance; one already shown
 *  (on this view or another) never animates again. */
function syncIds(container, selector, dataKey, set, revealOpts) {
  const fresh = [];
  for (const node of container.querySelectorAll(selector)) {
    const id = node.dataset[dataKey];
    if (!id) continue;
    if (!set.has(id)) fresh.push(node);
    set.add(id);
  }
  if (fresh.length > 0) reveal(fresh, revealOpts);
}

function seedZones(container, memory) {
  for (const node of container.querySelectorAll('[data-zone]')) {
    memory.zoneSignatures.set(node.dataset.zone, node.dataset.zoneSignature || '');
  }
}

/** A zone card only animates when its own real state changed since the last
 *  poll (valve open/closed, irrigating, moisture status — encoded by views.js
 *  into `data-zone-signature` so this file never re-implements that
 *  business logic). An unaffected zone is left completely alone, including
 *  on a poll where a *different* zone changed. */
function syncZones(container, memory) {
  const changed = [];
  for (const node of container.querySelectorAll('[data-zone]')) {
    const key = node.dataset.zone;
    const signature = node.dataset.zoneSignature || '';
    const previous = memory.zoneSignatures.get(key);
    if (previous !== undefined && previous !== signature) changed.push(node);
    memory.zoneSignatures.set(key, signature);
  }
  if (changed.length > 0) {
    run(changed, { opacity: [0.45, 1], translateY: [3, 0], duration: 380 });
  }
}

function seedControlLoop(container, memory) {
  for (const node of container.querySelectorAll('.pipeline .stage[data-stage]')) {
    memory.stageActive.set(node.dataset.stage, node.classList.contains('is-active'));
  }
}

/** Highlights a control-loop stage only at the moment it *becomes* active —
 *  e.g. ACT lighting up because irrigation genuinely started. A stage
 *  becoming inactive, or one that was already active last poll, is left
 *  alone: the goal is to mark a real transition, not to keep drawing
 *  attention to steady state. */
function syncControlLoop(container, memory) {
  const activated = [];
  for (const node of container.querySelectorAll('.pipeline .stage[data-stage]')) {
    const key = node.dataset.stage;
    const active = node.classList.contains('is-active');
    const previous = memory.stageActive.get(key);
    if (previous !== undefined && previous !== active && active) activated.push(node);
    memory.stageActive.set(key, active);
  }
  if (activated.length > 0) {
    run(activated, { opacity: [0.5, 1], translateY: [3, 0], duration: 420 });
  }
}

/* ========================================================================= */
/* orchestration — the only two entry points app.js calls on every render    */
/* ========================================================================= */

/** A fresh "diff memory": one of these lives for the whole app session (see
 *  app.js). Kept as data, not module state, so this file has no hidden
 *  globals a test or a future refactor could be surprised by. */
export function createDiffMemory() {
  return {
    seenAlertIds: new Set(),
    seenEventIds: new Set(),
    zoneSignatures: new Map(),
    stageActive: new Map(),
    countUpViews: new Set(),
  };
}

/**
 * Call once after every `view.render()` is inserted into the page.
 * `fresh` — true for boot / navigation / language switch, false for a
 * poll-triggered refresh — decides entrance-choreography vs. diff-only.
 */
export function onViewRendered(container, { fresh, viewName, memory }) {
  if (!container || !memory) return;

  if (fresh) {
    animateViewEnter(container);

    const kpiGrid = container.querySelector('.grid-kpi');
    if (kpiGrid) {
      const firstTimeForThisView = !memory.countUpViews.has(viewName);
      memory.countUpViews.add(viewName);
      animateKpiCountUps(kpiGrid, { enabled: firstTimeForThisView });
    }

    seedIds(container, '[data-alert-id]', 'alertId', memory.seenAlertIds);
    seedIds(container, '[data-event-id]', 'eventId', memory.seenEventIds);
    seedZones(container, memory);
    seedControlLoop(container, memory);
    return;
  }

  syncIds(container, '[data-alert-id]', 'alertId', memory.seenAlertIds, { translateY: 8, duration: 360 });
  syncIds(container, '[data-event-id]', 'eventId', memory.seenEventIds, { translateY: 8, duration: 360 });
  syncZones(container, memory);
  syncControlLoop(container, memory);
}
