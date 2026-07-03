/**
 * ChargeShield Hub — página mobile (aberta ao escanear o QR Code).
 * Identifica o hub pela URL (/access/:hubId), registra o scan,
 * valida o formulário e envia as credenciais para o servidor.
 */
(() => {
  // Identifica o hub a partir da URL: /access/HUB-001
  const hubId = decodeURIComponent(window.location.pathname.split('/').pop() || '');

  const $title = document.getElementById('hub-title');
  const $sub = document.getElementById('hub-sub');
  const $loc = document.getElementById('hub-loc');
  const $form = document.getElementById('form');
  const $success = document.getElementById('success');
  const $summary = document.getElementById('success-summary');
  const $formError = document.getElementById('form-error');
  const $formErrorText = document.getElementById('form-error-text');
  const $btnSubmit = document.getElementById('btn-submit');

  const fields = {
    name: document.getElementById('f-name'),
    phone: document.getElementById('f-phone'),
    plate: document.getElementById('f-plate'),
    email: document.getElementById('f-email'),
    terms: document.getElementById('f-terms'),
  };
  const errs = {
    name: document.getElementById('e-name'),
    phone: document.getElementById('e-phone'),
    plate: document.getElementById('e-plate'),
    email: document.getElementById('e-email'),
    terms: document.getElementById('e-terms'),
  };

  const esc = (s) =>
    String(s ?? '').replace(/[&<>"']/g, (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // -----------------------------------------------------------------
  // Identificação do hub + registro do scan
  // -----------------------------------------------------------------
  $title.textContent = `Hub ${hubId}`;

  fetch(`/api/hubs/${encodeURIComponent(hubId)}`)
    .then((r) => (r.ok ? r.json() : Promise.reject()))
    .then((hub) => {
      $title.textContent = `Hub ${hub.id}`;
      $sub.textContent = `${hub.name}`;
      $loc.textContent = hub.location;
      // Registra o evento "QR Code escaneado" no dashboard.
      fetch(`/api/hubs/${encodeURIComponent(hubId)}/scan`, { method: 'POST' });
    })
    .catch(() => {
      $title.textContent = 'Hub não encontrado';
      $sub.textContent = 'Verifique o QR Code e tente novamente.';
      $form.style.display = 'none';
    });

  // -----------------------------------------------------------------
  // Validação
  // -----------------------------------------------------------------
  function clearErrors() {
    for (const k of Object.keys(errs)) {
      errs[k].textContent = '';
      if (fields[k].classList) fields[k].classList.remove('invalid');
    }
    $formError.classList.remove('show');
  }

  function validate() {
    clearErrors();
    let ok = true;
    if (!fields.name.value.trim()) {
      errs.name.textContent = 'Nome é obrigatório';
      fields.name.classList.add('invalid');
      ok = false;
    }
    if (!fields.phone.value.trim()) {
      errs.phone.textContent = 'Telefone é obrigatório';
      fields.phone.classList.add('invalid');
      ok = false;
    }
    if (!fields.plate.value.trim()) {
      errs.plate.textContent = 'Placa é obrigatória';
      fields.plate.classList.add('invalid');
      ok = false;
    }
    const email = fields.email.value.trim();
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errs.email.textContent = 'E-mail inválido';
      fields.email.classList.add('invalid');
      ok = false;
    }
    if (!fields.terms.checked) {
      errs.terms.textContent = 'É necessário aceitar os termos de uso';
      ok = false;
    }
    if (!ok) {
      $formErrorText.textContent = 'Preencha os campos destacados para continuar.';
      $formError.classList.add('show');
    }
    return ok;
  }

  // -----------------------------------------------------------------
  // Envio
  // -----------------------------------------------------------------
  $form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!validate()) return;

    $btnSubmit.disabled = true;
    $btnSubmit.textContent = 'Enviando…';

    try {
      const res = await fetch(`/api/hubs/${encodeURIComponent(hubId)}/access`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: fields.name.value.trim(),
          phone: fields.phone.value.trim(),
          plate: fields.plate.value.trim().toUpperCase(),
          email: fields.email.value.trim() || null,
          acceptTerms: fields.terms.checked,
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        // Erros de validação do servidor (defesa em profundidade).
        if (data.errors) {
          for (const [k, msg] of Object.entries(data.errors)) {
            const key = k === 'acceptTerms' ? 'terms' : k;
            if (errs[key]) errs[key].textContent = msg;
            if (fields[key] && fields[key].classList) fields[key].classList.add('invalid');
          }
        }
        $formErrorText.textContent = data.error || 'Não foi possível autorizar o acesso.';
        $formError.classList.add('show');
        return;
      }

      // Sucesso: troca o formulário pela tela de confirmação.
      const s = data.session;
      $summary.innerHTML = `
        <div class="session-row"><span class="k">Hub</span><b>${esc(data.hubId)}</b></div>
        <div class="session-row"><span class="k">Nome</span><b>${esc(s.name)}</b></div>
        <div class="session-row"><span class="k">Veículo</span><b>${esc(s.plate)}</b></div>
        <div class="session-row"><span class="k">Sessão</span><b style="font-family:var(--mono);font-size:12px">${esc(s.id.slice(0, 8))}</b></div>
        <div class="session-row"><span class="k">Horário</span><b>${new Date(s.requestedAt).toLocaleTimeString('pt-BR')}</b></div>`;
      $form.style.display = 'none';
      $success.classList.add('show');
    } catch (_) {
      $formErrorText.textContent = 'Falha de conexão com o servidor. Verifique o Wi-Fi.';
      $formError.classList.add('show');
    } finally {
      $btnSubmit.disabled = false;
      $btnSubmit.innerHTML =
        '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/></svg> Solicitar acesso';
    }
  });

  // "Fazer nova solicitação" — volta ao formulário limpo.
  document.getElementById('btn-again').addEventListener('click', () => {
    $success.classList.remove('show');
    $form.reset();
    clearErrors();
    $form.style.display = '';
  });
})();
