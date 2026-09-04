/**
 * HYDRAX website — progressive enhancement only.
 *
 * The page is fully readable and navigable with this file blocked: every link
 * is a real anchor and every section is in the document. This adds the mobile
 * menu, scroll state on the nav, and active-section highlighting.
 *
 * Loaded as an external module because the server's Content-Security-Policy
 * sets `script-src 'self'` — there are no inline scripts anywhere on the site.
 */

const nav = document.getElementById('nav');
const toggle = document.getElementById('nav-toggle');
const links = document.getElementById('nav-links');

/* ------------------------------------------------------------ mobile menu -- */

if (toggle instanceof HTMLElement && links instanceof HTMLElement) {
  const setOpen = (open) => {
    links.classList.toggle('is-open', open);
    toggle.setAttribute('aria-expanded', String(open));
  };

  toggle.addEventListener('click', () => {
    setOpen(toggle.getAttribute('aria-expanded') !== 'true');
  });

  // Following a link should close the menu behind you.
  links.addEventListener('click', (event) => {
    if (event.target instanceof HTMLAnchorElement) setOpen(false);
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') setOpen(false);
  });

  // Reset when the layout returns to desktop, so the menu cannot be left in a
  // half-open state that only shows up again on the next resize.
  const wide = window.matchMedia('(min-width: 901px)');
  wide.addEventListener('change', (event) => {
    if (event.matches) setOpen(false);
  });
}

/* ------------------------------------------------------- nav scroll state -- */

if (nav instanceof HTMLElement) {
  const applyScrolled = () => nav.classList.toggle('is-scrolled', window.scrollY > 8);
  applyScrolled();
  window.addEventListener('scroll', applyScrolled, { passive: true });
}

/* ------------------------------------------------------- hero flow anim -- */

// The schematic's flow animation runs only while the hero is actually visible.
// Left running, it would keep the compositor busy for the entire session.
const schematic = document.querySelector('.schematic');
if (schematic instanceof SVGElement && 'IntersectionObserver' in window) {
  const heroObserver = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        schematic.classList.toggle('is-animated', entry.isIntersecting);
      }
    },
    { threshold: 0.15 },
  );
  heroObserver.observe(schematic);
} else if (schematic instanceof SVGElement) {
  schematic.classList.add('is-animated');
}

/* --------------------------------------------------- active section state -- */

const navAnchors = Array.from(document.querySelectorAll('.nav-links a[href^="#"]'));
const sections = navAnchors
  .map((anchor) => document.querySelector(anchor.getAttribute('href')))
  .filter((node) => node instanceof HTMLElement);

if (sections.length > 0 && 'IntersectionObserver' in window) {
  const visible = new Set();

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) visible.add(entry.target.id);
        else visible.delete(entry.target.id);
      }

      // Highlight the topmost section currently on screen, so scrolling
      // upward does not leave a lower section marked active.
      const current = sections.find((section) => visible.has(section.id));
      for (const anchor of navAnchors) {
        const isActive = current !== undefined && anchor.getAttribute('href') === `#${current.id}`;
        anchor.classList.toggle('is-active', isActive);
      }
    },
    { rootMargin: '-72px 0px -55% 0px', threshold: 0 },
  );

  for (const section of sections) observer.observe(section);
}

/* --------------------------------------------------------- sticky mobile CTA -- */

// Small screens only (the CSS hides the bar entirely above 640px, so this is
// just avoiding pointless observer work on desktop). Appears once the hero has
// scrolled past, disappears again once the real contact form is reachable —
// it exists to stand in for a CTA that has scrolled out of view, not to
// duplicate one that's already on screen. Dismissible, and the dismissal is
// remembered only for this tab: a UI preference, not tracking.
const stickyCta = document.getElementById('sticky-cta');
const stickyDismiss = document.getElementById('sticky-cta-dismiss');
const hero = document.getElementById('top');
const contactSection = document.getElementById('contact');

if (stickyCta instanceof HTMLElement && hero instanceof HTMLElement && 'IntersectionObserver' in window) {
  const DISMISS_KEY = 'hydrax-sticky-cta-dismissed';
  let dismissed = false;
  try {
    dismissed = sessionStorage.getItem(DISMISS_KEY) === '1';
  } catch {
    // Storage can throw in a private tab or with site data blocked; treat
    // that as "not dismissed" rather than breaking the page over it.
    dismissed = false;
  }

  let pastHero = false;
  let overContact = false;

  const sync = () => {
    stickyCta.hidden = dismissed || !pastHero || overContact;
    stickyCta.classList.toggle('is-visible', !stickyCta.hidden);
  };

  const heroObserver = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) pastHero = !entry.isIntersecting;
      sync();
    },
    { threshold: 0 },
  );
  heroObserver.observe(hero);

  if (contactSection instanceof HTMLElement) {
    const contactObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) overContact = entry.isIntersecting;
        sync();
      },
      { threshold: 0, rootMargin: '0px 0px -20% 0px' },
    );
    contactObserver.observe(contactSection);
  }

  if (stickyDismiss instanceof HTMLElement) {
    stickyDismiss.addEventListener('click', () => {
      dismissed = true;
      sync();
      try {
        sessionStorage.setItem(DISMISS_KEY, '1');
      } catch {
        // Nothing to remember across renders; the bar just stays dismissed
        // for the rest of this page view instead of this whole tab.
      }
    });
  }
}
