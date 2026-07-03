/**
 * ChargeShield Hub — painel do operador.
 * Conecta ao stream SSE (/events) e re-renderiza os cards a cada mudança.
 */
(() => {
  const $hubs = document.getElementById('hubs');
  const $requests = document.getElementById('requests');
  const $events = document.getElementById('events');
  const $connChip = document.getElementById('conn-chip');
  const $connText = document.getElementById('conn-text');

  let baseUrl = window.location.origin; // trocado pelo IP local via /api/config

  // ---------------------------------------------------------------------
  // Ícones SVG reutilizáveis
  // ---------------------------------------------------------------------
  const icons = {
    user: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',
    phone: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/></svg>',
    car: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 16H9m10 0h3v-3.15a1 1 0 0 0-.84-.99L16 11l-2.7-3.6a1 1 0 0 0-.8-.4H5.24a2 2 0 0 0-1.8 1.1l-.8 1.63a6 6 0 0 0-.64 2.67V16h3"/><circle cx="6.5" cy="16.5" r="2.5"/><circle cx="16.5" cy="16.5" r="2.5"/></svg>',
    mail: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>',
    clock: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
    pin: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z"/><circle cx="12" cy="10" r="3"/></svg>',
    lockClosed: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>',
    lockOpen: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/></svg>',
    door: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 4h3a2 2 0 0 1 2 2v14"/><path d="M2 20h20"/><path d="M13 20V4L4 6v14"/><path d="M10 12h.01"/></svg>',
    bolt: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>',
    qr: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3h-3zM21 14v.01M14 21v.01M21 21v.01M17.5 17.5h3.5v3.5"/></svg>',
    check: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>',
    reset: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>',
  };

  const eventIcons = {
    scan: icons.qr,
    credentials: icons.user,
    authorized: icons.check,
    unlocked: icons.lockOpen,
    door: icons.door,
    session: icons.bolt,
    reset: icons.reset,
  };

  // ---------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------
  const esc = (s) =>
    String(s ?? '').replace(/[&<>"']/g, (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const fmtTime = (iso) => {
    if (!iso) return '—';
    const d = new Date(iso);
    return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  const statusClass = (hub) => {
    if (hub.session === 'active') return 'status-session';
    if (hub.door === 'open') return 'status-door';
    if (hub.lock === 'unlocked') return 'status-unlocked';
    if (hub.statusLabel === 'Acesso autorizado') return 'status-authorized';
    return 'status-locked';
  };

  const statusIcon = (hub) => {
    if (hub.session === 'active') return icons.bolt;
    if (hub.door === 'open') return icons.door;
    if (hub.lock === 'unlocked') return icons.lockOpen;
    return icons.lockClosed;
  };

  // ---------------------------------------------------------------------
  // Renderização
  // ---------------------------------------------------------------------
  function renderHub(hub) {
    const s = hub.currentSession;
    const unlocked = hub.lock === 'unlocked';

    const sessionHtml = s
      ? `<div class="session-box">
           <div class="session-row"><span class="k">${icons.user} Nome</span><b>${esc(s.name)}</b></div>
           <div class="session-row"><span class="k">${icons.phone} Telefone</span><b>${esc(s.phone)}</b></div>
           <div class="session-row"><span class="k">${icons.car} Placa</span><b>${esc(s.plate)}</b></div>
           ${s.email ? `<div class="session-row"><span class="k">${icons.mail} E-mail</span><b>${esc(s.email)}</b></div>` : ''}
           <div class="session-row"><span class="k">${icons.clock} Horário</span><b>${fmtTime(s.requestedAt)}</b></div>
         </div>`
      : `<div class="session-box empty">Última solicitação: nenhuma</div>`;

    const authorizedBanner = s && unlocked
      ? `<div class="status-label status-session" style="font-size:13px">
           ${icons.check}
           <span>Acesso autorizado para <b>${esc(s.name)}</b> — veículo <b>${esc(s.plate)}</b></span>
         </div>`
      : '';

    return `
      <article class="card hub" data-hub="${esc(hub.id)}">
        <div class="hub-head">
          <div>
            <div class="hub-id">${esc(hub.id)}</div>
            <div class="hub-loc">${icons.pin} ${esc(hub.location)}</div>
            <div class="hub-name">${esc(hub.name)}</div>
          </div>
          <span class="chip ${hub.online ? 'online' : 'offline'}"><span class="dot"></span>${hub.online ? 'Online' : 'Offline'}</span>
        </div>

        <div class="status-label ${statusClass(hub)}">
          <span class="ico">${statusIcon(hub)}</span>
          <span>${esc(hub.statusLabel)}</span>
        </div>

        <div class="badges">
          <span class="chip">${unlocked ? icons.lockOpen : icons.lockClosed}&nbsp;Fechadura: <b>&nbsp;${unlocked ? 'Liberada' : 'Bloqueada'}</b></span>
          <span class="chip">${icons.door}&nbsp;Porta: <b>&nbsp;${hub.door === 'open' ? 'Aberta' : 'Fechada'}</b></span>
          <span class="chip">${icons.bolt}&nbsp;Sessão: <b>&nbsp;${hub.session === 'active' ? 'Ativa' : '—'}</b></span>
        </div>

        <div class="lockviz ${unlocked ? 'unlocked' : 'locked'}">
          <svg class="padlock" viewBox="0 0 64 64" fill="none">
            <path class="shackle" d="M20 30 V20 a12 12 0 0 1 24 0 v10" stroke-width="5" stroke-linecap="round"/>
            <rect class="body" x="14" y="30" width="36" height="26" rx="6" stroke-width="4"/>
            <circle cx="32" cy="41" r="3.4" fill="currentColor" opacity="0.85"/>
            <path d="M32 44 v5" stroke="currentColor" stroke-width="3" stroke-linecap="round" opacity="0.85"/>
          </svg>
          <div class="lock-text">
            <div class="t1">${unlocked ? 'Fechadura liberada' : 'Fechadura bloqueada'}</div>
            <div class="t2">${unlocked ? 'Comando unlockHub() executado — acesso em andamento' : 'Aguardando autenticação por QR Code'}</div>
          </div>
        </div>

        ${authorizedBanner}
        ${sessionHtml}

        <div class="qr-wrap">
          <img class="qr-img" src="/qr/${esc(hub.id)}.png" alt="QR Code do ${esc(hub.id)}" />
          <div class="qr-meta">
            <div class="lbl">Escaneie com o celular</div>
            <div class="qr-url">${esc(baseUrl)}/access/${esc(hub.id)}</div>
            <div class="qr-hint">O celular precisa estar na mesma rede Wi-Fi do PC.</div>
          </div>
        </div>

        <div class="hub-actions">
          <button class="btn ghost block btn-reset-hub" data-hub="${esc(hub.id)}">${icons.reset}&nbsp;Resetar ${esc(hub.id)}</button>
        </div>
      </article>`;
  }

  function renderRequests(requests) {
    if (!requests.length) {
      $requests.innerHTML = '<div class="empty-note">Nenhuma solicitação recebida ainda.</div>';
      return;
    }
    $requests.innerHTML = requests
      .map(
        (r) => `
        <div class="req">
          <div class="avatar">${icons.user}</div>
          <div class="info">
            <div class="name">${esc(r.name)}</div>
            <div class="sub">
              <span>${icons.phone} ${esc(r.phone)}</span>
              <span>${icons.car} ${esc(r.plate)}</span>
              <span class="tag">${esc(r.hubId)}</span>
            </div>
          </div>
          <div class="time">${fmtTime(r.requestedAt)}</div>
        </div>`
      )
      .join('');
  }

  function renderEvents(events) {
    if (!events.length) {
      $events.innerHTML = '<div class="empty-note">Nenhum evento registrado.</div>';
      return;
    }
    $events.innerHTML = events
      .map(
        (ev) => `
        <div class="ev ev-${esc(ev.type)}">
          <div class="ico">${eventIcons[ev.type] || icons.clock}</div>
          <div class="body">
            <div class="msg">${esc(ev.message)}</div>
            <div class="meta">${ev.hubId ? `<span class="hub">${esc(ev.hubId)}</span>` : ''}<span>${fmtTime(ev.at)}</span></div>
          </div>
        </div>`
      )
      .join('');
  }

  function render(state) {
    $hubs.innerHTML = state.hubs.map(renderHub).join('');
    renderRequests(state.requests);
    renderEvents(state.events);
  }

  // ---------------------------------------------------------------------
  // Ações
  // ---------------------------------------------------------------------
  document.getElementById('btn-reset-all').addEventListener('click', () => {
    fetch('/api/reset-all', { method: 'POST' });
  });

  $hubs.addEventListener('click', (e) => {
    const btn = e.target.closest('.btn-reset-hub');
    if (btn) {
      fetch(`/api/hubs/${btn.dataset.hub}/reset`, { method: 'POST' });
      return;
    }
    const qr = e.target.closest('.qr-img');
    if (qr) openLightbox(qr.closest('article.hub')?.dataset.hub);
  });

  // ---------------------------------------------------------------------
  // Lightbox do QR Code (clique amplia; clique fora ou ESC fecha)
  // ---------------------------------------------------------------------
  const $lightbox = document.getElementById('qr-lightbox');
  const $lightboxImg = document.getElementById('qr-lightbox-img');
  const $lightboxHub = document.getElementById('qr-lightbox-hub');
  const $lightboxUrl = document.getElementById('qr-lightbox-url');

  function openLightbox(hubId) {
    if (!hubId) return;
    $lightboxImg.src = `/qr/${encodeURIComponent(hubId)}.png`;
    $lightboxHub.textContent = hubId;
    $lightboxUrl.textContent = `${baseUrl}/access/${hubId}`;
    $lightbox.classList.add('open');
    $lightbox.setAttribute('aria-hidden', 'false');
  }

  function closeLightbox() {
    $lightbox.classList.remove('open');
    $lightbox.setAttribute('aria-hidden', 'true');
  }

  // Clicar fora do card (no fundo) fecha; clicar no card não.
  $lightbox.addEventListener('click', (e) => {
    if (!e.target.closest('.qr-lightbox-card')) closeLightbox();
  });
  document.getElementById('qr-lightbox-close').addEventListener('click', closeLightbox);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeLightbox();
  });

  // ---------------------------------------------------------------------
  // Conexão SSE + config
  // ---------------------------------------------------------------------
  function setConn(ok) {
    $connChip.className = `chip ${ok ? 'online' : 'offline'}`;
    $connText.textContent = ok ? 'Sistema online' : 'Reconectando…';
  }

  fetch('/api/config')
    .then((r) => r.json())
    .then((cfg) => {
      baseUrl = cfg.baseUrl;
      // Re-renderiza com a URL correta assim que o estado chegar.
    })
    .catch(() => {});

  function connect() {
    const es = new EventSource('/events');
    es.onopen = () => setConn(true);
    es.onmessage = (msg) => {
      try {
        render(JSON.parse(msg.data));
      } catch (_) {}
    };
    es.onerror = () => {
      setConn(false);
      es.close();
      setTimeout(connect, 2000); // reconexão automática
    };
  }
  connect();
})();
