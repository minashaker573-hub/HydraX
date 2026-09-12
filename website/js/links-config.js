/**
 * HYDRAX website — the link hub's STATIC FALLBACK content (/links).
 *
 * THIS IS NOT AN AUTHORING SURFACE. The link hub is edited in the admin CMS:
 * /admin -> Website content -> Link Hub. Published CMS content is what /links
 * renders at runtime; editing this file does not change what visitors see.
 *
 *     CMS published content  ->  runtime /links
 *     this file              ->  offline fallback + first-boot seed only
 *
 * `LINK_HUB_FALLBACK` is deliberately in EXACTLY the shape of a published
 * `linkHub` CMS section, so the renderer has one pipeline (js/links-model.js)
 * no matter where content came from, and so "does the fallback still match
 * the seed?" is a single deep-equality check rather than a field-by-field
 * transcription that could miss something.
 *
 * Kept in agreement by checks, not by anyone remembering:
 *   - this file  <->  backend seed (website-content-seed.ts)  : backend/test/link-hub-content.test.ts (deep equal)
 *   - this file  <->  links.html's no-JS markup               : website/check.mjs
 *   - js/links.js render targets  <->  links.html ids          : website/check.mjs
 *
 * ---------------------------------------------------------------------------
 * NOTHING HERE IS INVENTED.
 *
 * `team` is empty: no team member's name, role or LinkedIn profile exists
 * anywhere in this repository. Every social `url` is '': HYDRAX has no
 * LinkedIn page, Instagram, Facebook, YouTube, TikTok or X account. An empty
 * value renders nothing — no row, no heading — so the fallback can never show
 * a person or an account that does not exist. Real ones are added in the CMS,
 * where each URL is validated against its platform's own domain.
 * ---------------------------------------------------------------------------
 */

const en = (value) => ({ en: value, ar: '' });

export const LINK_HUB_FALLBACK = {
  eyebrow: en('HYDRAX / SmartFarm Guardian'),
  tagline: en('Water that lets every field thrive.'),
  intro: en('The official link hub for the HYDRAX project and the team building it.'),

  primaryLabel: en('Visit the HYDRAX website'),
  primaryNote: en('What the system is, how it works, and what it deliberately does not do'),
  primaryHref: '/',

  exploreHeading: en('HYDRAX links'),
  exploreItems: [
    {
      id: 'request',
      label: en('Request a HYDRAX System'),
      note: en('Tell us about your farm — no account, no payment, no obligation'),
      href: '/request',
      visible: true,
    },
    {
      id: 'dashboard',
      label: en('Live monitoring dashboard'),
      note: en('Soil moisture, irrigation state, pump health, alerts'),
      href: '/dashboard',
      visible: true,
    },
  ],

  teamHeading: en('Meet the team'),
  teamIntro: en('The people designing and building HYDRAX.'),
  team: [],

  socialHeading: en('Follow'),
  social: [
    { platform: 'linkedin', label: en('Team LinkedIn'), url: '', visible: true },
    { platform: 'instagram', label: en('Instagram'), url: '', visible: true },
    { platform: 'facebook', label: en('Facebook'), url: '', visible: true },
    { platform: 'youtube', label: en('YouTube'), url: '', visible: true },
    { platform: 'tiktok', label: en('TikTok'), url: '', visible: true },
    { platform: 'x', label: en('X'), url: '', visible: true },
  ],

  contactHeading: en('Contact'),
  contactItems: [
    {
      id: 'email',
      label: en('Email us'),
      note: en(''),
      href: 'mailto:ingeniummteam@email.com',
      display: 'ingeniummteam@email.com',
      visible: true,
    },
    {
      id: 'phone',
      label: en('Call us'),
      note: en(''),
      href: 'tel:+201279159200',
      display: '0127 915 9200',
      visible: true,
    },
  ],
  location: en('Mansoura, Egypt'),

  footerLinks: [
    { label: en('Home'), href: '/', visible: true },
    { label: en('Request a System'), href: '/request', visible: true },
    { label: en('Privacy'), href: '/privacy', visible: true },
    { label: en('Terms'), href: '/terms', visible: true },
  ],
};

/** The one host each social platform's URL may be on. Mirrors
 *  SOCIAL_PLATFORMS in backend/src/domain/website-content.ts; check.mjs uses
 *  it to prove no link to an account that does not exist is in the markup. */
export const SOCIAL_DOMAINS = {
  linkedin: 'linkedin.com',
  instagram: 'instagram.com',
  facebook: 'facebook.com',
  youtube: 'youtube.com',
  tiktok: 'tiktok.com',
  x: 'x.com',
};
