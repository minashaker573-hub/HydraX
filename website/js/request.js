/**
 * HYDRAX — quote request form.
 *
 * Three panels in one <form>, so the browser keeps all the state and nothing
 * is lost moving between steps.
 *
 * Client-side validation exists to give fast, specific feedback — it is not a
 * security control. The server validates the same payload independently and is
 * the only authority; if the two ever disagree, the server wins and its errors
 * are what the user sees.
 */

import { API_BASE } from './config.js';

const form = document.getElementById('request-form');
const steps = document.getElementById('steps');
const confirmation = document.getElementById('confirmation');
const formError = document.getElementById('form-error');
const submitBtn = document.getElementById('submit-btn');

const PANELS = [1, 2, 3];
let current = 1;

/* ----------------------------------------------------------------- helpers */

const panel = (n) => form.querySelector(`[data-panel="${n}"]`);

function setError(name, message) {
  const node = form.querySelector(`[data-error-for="${name}"]`);
  if (node === null) return;
  if (message === null) {
    node.hidden = true;
    node.textContent = '';
  } else {
    node.hidden = false;
    node.textContent = message;
  }
  for (const field of form.querySelectorAll(`[name="${name}"]`)) {
    field.setAttribute('aria-invalid', message === null ? 'false' : 'true');
  }
}

function clearErrors(names) {
  for (const name of names) setError(name, null);
  formError.hidden = true;
  formError.textContent = '';
}

function showPanel(n) {
  current = n;
  for (const p of PANELS) panel(p).hidden = p !== n;

  for (const li of steps.querySelectorAll('.step')) {
    const step = Number(li.dataset.step);
    li.classList.toggle('is-current', step === n);
    li.classList.toggle('is-done', step < n);
  }

  // Move focus to the panel's heading region so screen readers and keyboard
  // users land in the new step rather than back at the top of the document.
  const legend = panel(n).querySelector('.fs-legend');
  if (legend !== null) {
    legend.setAttribute('tabindex', '-1');
    legend.focus({ preventScroll: true });
  }
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* -------------------------------------------------------------- validation */

const FIELDS = {
  1: ['farm_size', 'farm_location', 'irrigation_type', 'zone_count'],
  2: ['capabilities'],
  3: ['full_name', 'phone', 'email', 'notes'],
};

function value(name) {
  const field = form.elements[name];
  if (field === undefined) return '';
  return typeof field.value === 'string' ? field.value.trim() : '';
}

function validateStep(n) {
  clearErrors(FIELDS[n]);
  let firstBad = null;

  const fail = (name, message) => {
    setError(name, message);
    if (firstBad === null) firstBad = name;
  };

  if (n === 1) {
    if (value('farm_size') === '') fail('farm_size', 'Please tell us roughly how large the farm is.');
    if (value('farm_location') === '') fail('farm_location', 'Please tell us where the farm is.');

    const type = form.querySelector('input[name="irrigation_type"]:checked');
    if (type === null) fail('irrigation_type', 'Please choose an irrigation type.');

    const zones = Number(value('zone_count'));
    if (!Number.isInteger(zones) || zones < 1 || zones > 64) {
      fail('zone_count', 'Enter a whole number of zones between 1 and 64.');
    }
  }

  if (n === 2) {
    const chosen = form.querySelectorAll('input[name="capabilities"]:checked');
    if (chosen.length === 0) fail('capabilities', 'Select at least one capability.');
  }

  if (n === 3) {
    const name = value('full_name');
    if (name.length < 2) fail('full_name', 'Please enter your name.');

    const phone = value('phone');
    const digits = phone.replace(/\D/g, '').length;
    if (phone === '') fail('phone', 'Please enter a phone number we can reach you on.');
    else if (!/^[+()\-.\s\d]+$/.test(phone)) {
      fail('phone', 'Use only digits, spaces and + ( ) - .');
    } else if (digits < 7 || digits > 20) {
      fail('phone', 'That does not look like a complete phone number.');
    }

    const email = value('email');
    if (email !== '' && !/^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/.test(email)) {
      fail('email', 'That email address does not look right.');
    }

    if (value('notes').length > 2000) fail('notes', 'Please keep notes under 2000 characters.');
  }

  if (firstBad !== null) {
    const field = form.querySelector(`[name="${firstBad}"]`);
    if (field !== null) field.focus();
    return false;
  }
  return true;
}

/* -------------------------------------------------------------- navigation */

form.addEventListener('click', (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;

  const next = target.dataset.next;
  if (next !== undefined) {
    if (validateStep(current)) showPanel(Number(next));
    return;
  }

  const back = target.dataset.back;
  if (back !== undefined) showPanel(Number(back));
});

// Clear a field's error as soon as the user starts fixing it.
form.addEventListener('input', (event) => {
  const target = event.target;
  if (target instanceof HTMLElement && target.getAttribute('name') !== null) {
    setError(target.getAttribute('name'), null);
  }
});
form.addEventListener('change', (event) => {
  const target = event.target;
  if (target instanceof HTMLElement && target.getAttribute('name') !== null) {
    setError(target.getAttribute('name'), null);
  }
});

// Enter should advance a step, not submit from step 1 or 2.
form.addEventListener('keydown', (event) => {
  if (event.key !== 'Enter') return;
  if (event.target instanceof HTMLTextAreaElement) return;
  if (current === 3) return;
  event.preventDefault();
  if (validateStep(current)) showPanel(current + 1);
});

/* ------------------------------------------------------------ notes counter */

const notes = document.getElementById('notes');
const notesUsed = document.getElementById('notes_used');
if (notes !== null && notesUsed !== null) {
  notes.addEventListener('input', () => {
    notesUsed.textContent = String(notes.value.length);
  });
}

/* ----------------------------------------------------------------- submit */

function buildPayload() {
  const capabilities = [...form.querySelectorAll('input[name="capabilities"]:checked')].map(
    (input) => input.value,
  );
  const type = form.querySelector('input[name="irrigation_type"]:checked');
  const email = value('email');
  const noteText = value('notes');

  return {
    farm_size: value('farm_size'),
    farm_location: value('farm_location'),
    irrigation_type: type === null ? '' : type.value,
    zone_count: Number(value('zone_count')),
    capabilities,
    full_name: value('full_name'),
    phone: value('phone'),
    email: email === '' ? null : email,
    notes: noteText === '' ? null : noteText,
  };
}

/** Maps a server error string back onto the field it refers to. */
function applyServerErrors(details) {
  if (!Array.isArray(details)) return false;
  let mapped = false;
  for (const detail of details) {
    if (typeof detail !== 'string') continue;
    const field = detail.split(' ')[0];
    if (form.querySelector(`[data-error-for="${field}"]`) !== null) {
      setError(field, detail);
      mapped = true;
    }
  }
  return mapped;
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();

  // Re-validate every step: a user can reach submit without revisiting step 1.
  for (const n of PANELS) {
    if (!validateStep(n)) {
      showPanel(n);
      return;
    }
  }

  submitBtn.disabled = true;
  submitBtn.textContent = 'Submitting…';
  formError.hidden = true;

  try {
    const response = await fetch(`${API_BASE}/api/v1/requests`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildPayload()),
    });

    let body = null;
    try {
      body = await response.json();
    } catch {
      body = null;
    }

    if (response.ok && body !== null && typeof body.reference === 'string') {
      showConfirmation(body.reference);
      return;
    }

    if (response.status === 429) {
      formError.textContent =
        'Too many requests have been sent from this connection. Please try again a little later, ' +
        'or contact us directly.';
      formError.hidden = false;
    } else if (response.status === 400 && body !== null && applyServerErrors(body.details)) {
      // Field-level errors are already shown; send the user to the first step
      // that now has one.
      const target = PANELS.find((n) =>
        FIELDS[n].some((name) => {
          const node = form.querySelector(`[data-error-for="${name}"]`);
          return node !== null && !node.hidden;
        }),
      );
      showPanel(target ?? 1);
    } else {
      formError.textContent =
        'We could not submit your request. Please check your connection and try again — ' +
        'nothing has been sent.';
      formError.hidden = false;
    }
  } catch {
    formError.textContent =
      'We could not reach the server. Please check your connection and try again — ' +
      'nothing has been sent.';
    formError.hidden = false;
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Submit request';
  }
});

function showConfirmation(reference) {
  form.hidden = true;
  steps.hidden = true;
  document.querySelector('.request-title').hidden = true;
  document.querySelector('.request-page .lede').hidden = true;
  document.querySelector('.request-page .eyebrow').hidden = true;

  document.getElementById('reference-value').textContent = reference;
  confirmation.hidden = false;
  confirmation.focus({ preventScroll: true });
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
