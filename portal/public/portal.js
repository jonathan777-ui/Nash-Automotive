// Shared helpers for every portal page. Deliberately no build step / framework — this whole site
// is plain static HTML + this one script, matching the "Netlify, unchanged" scope from the brief
// (the brief never asked for a frontend framework here, and the pages are simple enough not to
// need one).

function getOpportunityId() {
  return new URLSearchParams(window.location.search).get('id') || '';
}

async function fetchOpportunity() {
  const id = getOpportunityId();
  if (!id) return { ok: false, reason: 'No ?id= in the URL — this page needs a link from the CRM/Demo Dashboard.' };
  try {
    const res = await fetch(`/api/opportunity?id=${encodeURIComponent(id)}`);
    return await res.json();
  } catch (err) {
    return { ok: false, reason: 'Could not reach the portal backend: ' + err.message };
  }
}

function statusBadge(label, state) {
  // state: 'ok' | 'pending' | 'error'
  const cls = state === 'ok' ? '' : state === 'pending' ? ' pending' : ' error';
  return `<span class="status-badge${cls}">${label}</span>`;
}

function escapeHtml(s) {
  const div = document.createElement('div');
  div.textContent = s ?? '';
  return div.innerHTML;
}
