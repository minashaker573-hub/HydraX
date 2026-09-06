/**
 * HYDRAX - initial website content.
 *
 * This is the REAL text and image references already live in
 * website/index.html at the time the CMS was built — transcribed, not
 * invented, so that turning the CMS on does not change what a visitor sees.
 * See docs/CMS.md for the audit this was built from.
 *
 * Every Arabic field is an empty string. No Arabic translation of this site
 * exists yet — inventing one here would violate the explicit instruction not
 * to machine-translate, and seeding a fake one would be worse than seeding
 * none. An admin fills these in through the CMS; until then, the website's
 * i18n fallback (website/js/i18n.js) shows the English value instead, the
 * same fallback rule the dashboard's i18n already uses.
 *
 * server.ts calls `seedWebsiteContentIfMissing` with this data once at boot,
 * for every section, and that call is a no-op for any section that already
 * has content — so this file only ever matters the first time the database
 * boots with the new tables, never overwrites a later edit.
 */

import type {
  BenefitsContent,
  ContactContent,
  FieldContent,
  FooterContent,
  HeroContent,
  HowContent,
  NavigationContent,
  ProblemContent,
  ProductContent,
  SeoContent,
  SectionId,
  SectionsContent,
  SiteSettingsContent,
} from './website-content.ts';

const en = (value: string) => ({ en: value, ar: '' });

const hero: HeroContent = {
  eyebrow: en('Intelligent irrigation & monitoring'),
  headline: en('Water that lets every field thrive.'),
  description: en(
    'HYDRAX reads soil moisture zone by zone and lets the controller in the field decide ' +
      'when to irrigate — on the spot, without waiting on a server that might not answer.',
  ),
  primaryCtaLabel: en('Request a HYDRAX System'),
  primaryCtaHref: '/request',
  heroImage: '/assets/hero-field-canal.jpg',
  heroImageAlt: en('Aerial view of cultivated fields divided by an irrigation canal'),
  points: [
    en('Keeps irrigating with the internet down'),
    en('Per-zone soil thresholds, not a clock'),
    en('Pump and valve interlocks enforced in firmware'),
  ],
};

const navigation: NavigationContent = {
  items: [
    { label: en('Problem'), href: '#problem', visible: true },
    { label: en('How it works'), href: '#how', visible: true },
    { label: en('Product'), href: '#product', visible: true },
    { label: en('Benefits'), href: '#benefits', visible: true },
    { label: en('Contact'), href: '#contact', visible: true },
  ],
  dashboardCtaLabel: en('Live dashboard'),
  primaryCtaLabel: en('Request a System'),
};

const problem: ProblemContent = {
  eyebrow: en('The field problem'),
  pullQuote: en("Most irrigation systems know when to run. They don't know why."),
  paragraphs: [
    en(
      'A fixed schedule cannot see rainfall, a heatwave, a blocked line or a probe that has ' +
        'failed — it applies the same water on the same day regardless of what the ground ' +
        'actually needs. Walking zones to judge moisture by hand is slow and inconsistent ' +
        'between people. And a valve stuck open, or a pump left running, can waste water for ' +
        'hours before anyone notices — usually by seeing the result, not the cause.',
    ),
    en(
      'Many connected controllers make this worse: they send a reading up and wait for an ' +
        'instruction back. On a farm with intermittent connectivity, that means the thing ' +
        'deciding whether crops get water is somewhere else entirely.',
    ),
  ],
  image: '/assets/field-problem-aerial.jpg',
  imageAlt: en('Aerial view of narrow cultivated plots separated by water channels'),
};

const how: HowContent = {
  eyebrow: en('How HYDRAX works'),
  headline: en("Soil signals, a local decision, water where it's needed."),
  // The live page links "the platform" to #product inline; a CMS text field
  // cannot carry that link without an HTML editor (explicitly out of scope —
  // see docs/CMS.md), so the seeded copy points at it in plain words instead.
  intro: en(
    'Every step below runs on the controller itself. The backend and dashboard only observe ' +
      'it — see the platform below for what that looks like.',
  ),
  steps: [
    {
      title: en('Soil signals'),
      description: en(
        'Two capacitive probes per zone read moisture continuously. Each reading is filtered ' +
          'against spikes and checked for a plausible electrical range before anything trusts it.',
      ),
      detail: en('median-filtered · range-checked · per probe'),
    },
    {
      title: en('A local decision'),
      description: en(
        "The controller compares each zone's reading against its own start and stop thresholds " +
          'and decides — on the device, without waiting on a network round trip to answer.',
      ),
      detail: en('hysteresis band · minimum runtime · cooldown'),
    },
    {
      title: en('Healthier crops'),
      description: en(
        "Water reaches a zone because its own soil called for it — not because a calendar said " +
          "so. That's the aim the whole loop above is built around.",
      ),
      detail: { en: '', ar: '' },
    },
  ],
  accentImage: '/assets/water-droplet-leaf.jpg',
  accentImageAlt: en('Close-up of water droplets on a leaf edge'),
  accentCaption: en('The same decision, made the same way, every time a zone reads dry.'),
};

const product: ProductContent = {
  eyebrow: en('The platform'),
  headline: en('See what the field sees.'),
  lede: en(
    'This is an actual capture of the dashboard shipped with the system, running against the ' +
      'simulation fixture on this server — labelled as such, in the interface itself, not ' +
      'cropped out for this page.',
  ),
  dashboardImage: '/dashboard-preview.png',
  captionTitle: en('Overview page'),
  captionDetail: en('system status, soil moisture, control loop, alerts'),
  capabilityItems: [
    { label: en('System status'), description: en('Device connectivity and last contact') },
    { label: en('Soil moisture'), description: en('Per zone, and the farm average') },
    { label: en('Irrigation state'), description: en('Idle, starting, irrigating, stopped, faulted') },
    { label: en('Zones & valves'), description: en('Per-zone valve state and sensor coverage') },
    { label: en('Alerts & events'), description: en('A filterable timeline, not a static log') },
    {
      label: en('Not shown'),
      description: en(
        'Water flow, pump condition, weather — no sensor exists for them yet, so the interface ' +
          'says NOT AVAILABLE rather than guessing',
      ),
    },
  ],
};

const benefits: BenefitsContent = {
  eyebrow: en('Benefits'),
  headline: en('What the system actually does, stated plainly.'),
  lede: en(
    "Every line below is implemented and covered by the firmware's automated test suite — a " +
      'fact about the code, not a projection about a farm.',
  ),
  items: [
    {
      title: en('Local-first'),
      description: en(
        'The irrigation controller holds no reference to Wi-Fi or HTTP. A host test runs a ' +
          'complete irrigation cycle with no network object present at all, at any point in the ' +
          'process.',
      ),
    },
    {
      title: en('Zone-based'),
      description: en(
        'Each zone holds its own thresholds and its own state. When more than one reads dry, ' +
          'the driest is served first — one at a time, because there is one pump.',
      ),
    },
    {
      title: en('Hysteresis'),
      description: en(
        "Starting and stopping use two different thresholds, not one setpoint, so a reading " +
          "sitting at the boundary doesn't switch the pump on and off repeatedly.",
      ),
    },
    {
      title: en('Runtime protection'),
      description: en(
        'A maximum runtime cuts the pump if a run goes long, and locks that zone out until it ' +
          'has been reviewed — a bounded worst case, not an assumption of a happy path.',
      ),
    },
    {
      title: en('Offline operation'),
      description: en(
        'None of the above depends on a network connection reaching the farm at all — the ' +
          'controller decides alone, and reports what it did once the link is back.',
      ),
    },
  ],
};

const field: FieldContent = {
  eyebrow: en('Built for the field'),
  headline: en('Designed for real conditions, not a demo bench.'),
  lede: en(
    'The engineering exists to be checked, not taken on faith — including the parts still in ' +
      'progress. The controller compiles for its target hardware and is verified against 50 ' +
      'firmware tests; running on a physical board, and calibrating each probe against real ' +
      'soil, is the next step, not a claimed one.',
  ),
  gallery: [
    {
      image: '/assets/crop-rows-sunset.jpg',
      imageAlt: en('Cultivated rows stretching to the horizon at golden hour'),
      caption: en('Cultivated rows, golden hour'),
    },
    {
      image: '/assets/irrigation-sprinkler.jpg',
      imageAlt: en('Center-pivot irrigation rig watering a green crop field'),
      caption: en('Center-pivot irrigation, in operation'),
    },
  ],
  // Structured form of the same claim the lede above already makes in prose —
  // taken from docs/HARDWARE_VALIDATION.md, not invented for this CMS.
  statusBadges: [
    { title: en('Control firmware'), status: 'SOFTWARE_VERIFIED' },
    { title: en('Physical hardware'), status: 'PENDING_HARDWARE_VALIDATION' },
  ],
  stats: [
    { value: 50, label: en('firmware tests') },
    { value: 1082, label: en('assertions on the control logic') },
    { value: 129, label: en('backend tests') },
    { value: 0, label: en('cloud dependencies in the control path') },
  ],
  statsNote: en(
    'Counts from the automated test suites in the repository — a measurement of the software, ' +
      'not of field performance.',
  ),
};

const contact: ContactContent = {
  eyebrow: en('Get in touch'),
  headline: en('Tell us about your farm.'),
  lede: en(
    'Send your zone count and how you irrigate today, and we will come back with a specific ' +
      'configuration and quote. No account, no obligation.',
  ),
  ctaLabel: en('Request a HYDRAX System'),
  ctaHref: '/request',
  email: 'ingeniummteam@email.com',
  // Kept in the same locally-dialable form the site already displays. The
  // original hardcoded `tel:+201279159200` used the international form for
  // the link only; the CMS uses one value for both the visible text and the
  // tel: link it builds (see website/js/content.js), so publishing this
  // exact seed switches the link to the local-dial form (still correct
  // dialed from within Egypt) rather than the international one — a small,
  // disclosed behavior change, not a functional break.
  phone: '0127 915 9200',
  location: en('Mansoura'),
};

const footer: FooterContent = {
  tagline: en('Water that lets every field thrive.'),
  // Transcribed verbatim from index.html's <nav class="footer-links"> — note
  // it is not the same list as `navigation.items` (it also links "Built for
  // the field", Dashboard, Request, Privacy and Terms).
  links: [
    { label: en('Problem'), href: '#problem', visible: true },
    { label: en('How it works'), href: '#how', visible: true },
    { label: en('Product'), href: '#product', visible: true },
    { label: en('Benefits'), href: '#benefits', visible: true },
    { label: en('Built for the field'), href: '#field', visible: true },
    { label: en('Dashboard'), href: '/dashboard', visible: true },
    { label: en('Request a System'), href: '/request', visible: true },
    { label: en('Privacy'), href: '/privacy', visible: true },
    { label: en('Terms'), href: '/terms', visible: true },
  ],
  legalText: en(
    'Relative soil moisture is measured between a dry-air and a submerged reference per probe. ' +
      'It is not volumetric water content, and is not presented as such anywhere in this system.',
  ),
  photoCreditsText: en(
    'Photography: Bernd Dittrich, Mostafijur Rahman Nasim, Aaron Burden, Lumin Osity and Dan ' +
      'Meyers, via Unsplash — used under the Unsplash License. These images illustrate ' +
      'agriculture and irrigation in general; none depict a HYDRAX installation.',
  ),
};

const sections: SectionsContent = {
  order: ['problem', 'how', 'product', 'benefits', 'field'],
  enabled: { problem: true, how: true, product: true, benefits: true, field: true },
};

const seo: SeoContent = {
  siteTitle: en('HYDRAX — Water that lets every field thrive'),
  metaDescription: en(
    'HYDRAX SmartFarm Guardian measures soil moisture per zone and decides when to irrigate on ' +
      'the controller itself — so watering keeps working when the network does not.',
  ),
  ogTitle: en('HYDRAX — Water that lets every field thrive'),
  ogDescription: en('Soil-based irrigation control that runs on the farm, not in the cloud.'),
  // The current og:image is a static SVG (website/og-image.svg), which is
  // outside the CMS's image model (uploads are raster-only — see
  // routes/media.ts on why SVG uploads are refused). Left unset so the
  // site's static fallback meta tag continues to be used until a raster
  // replacement is uploaded and set here.
  ogImage: '',
};

const settings: SiteSettingsContent = {
  logo: '/assets/logo.jpeg',
  // The sticky mobile CTA's real current button text (index.html) — kept
  // distinct from hero/contact's "Request a HYDRAX System" rather than
  // forced to match it; "default CTA" means "the one secondary placements
  // fall back to," not "identical wording everywhere."
  defaultCtaLabel: en('Request a quote'),
  defaultCtaHref: '/request',
  // Only the bold headline half of the sticky CTA's two-part sentence — see
  // index.html's `<strong>`. "No account, no obligation." stays fixed brand
  // copy so the field styling isn't lost the way a plain-text field would.
  stickyCtaText: en('Ready to talk to us?'),
};

// Deliberately not annotated as `Record<SectionId, unknown>`: that would
// widen every field back to `unknown` and make this object useless to read
// from directly (as the test suite does, to assert the seed matches the
// real page). Left to infer its own precise shape instead; `satisfies`
// still confirms the key set is exactly SECTION_IDS, with no typo and none
// missing.
export const DEFAULT_WEBSITE_CONTENT = {
  hero,
  navigation,
  problem,
  how,
  product,
  benefits,
  field,
  contact,
  footer,
  sections,
  seo,
  settings,
} satisfies Record<SectionId, unknown>;
