/**
 * Nexlock — painel do operador.
 * Conecta ao stream SSE (/events) e re-renderiza os cards a cada mudança.
 */
(() => {
  const $hubs = document.getElementById('hubs');
  const $requests = document.getElementById('requests');
  const $events = document.getElementById('events');
  const $alerts = document.getElementById('alerts');
  const $accessLogs = document.getElementById('access-logs');
  const $connChip = document.getElementById('conn-chip');
  const $connText = document.getElementById('conn-text');
  const $soundToggle = document.getElementById('sound-toggle');
  const $soundLabel = document.getElementById('sound-label');
  const $soundStatus = document.getElementById('sound-status');

  const $kpiHubs = document.getElementById('kpi-hubs');
  const $kpiOnline = document.getElementById('kpi-online');
  const $kpiAccesses = document.getElementById('kpi-accesses');
  const $kpiAlerts = document.getElementById('kpi-alerts');
  const $kpiAlertsCard = document.getElementById('kpi-alerts-card');

  let baseUrl = window.location.origin; // trocado pelo IP local via /api/config
  let latestState = null;

  // ---------------------------------------------------------------------
  // Central sonora — Web Audio API, sem arquivos externos
  // ---------------------------------------------------------------------
  const SOUND_PREF_KEY = 'nexlock-dashboard-sound';
  const knownEventIds = new Set();
  let eventAudioReady = false;
  let audioContext = null;
  let soundEnabled = false;

  try {
    soundEnabled = window.localStorage.getItem(SOUND_PREF_KEY) === 'enabled';
  } catch (_) {}

  function getAudioContext() {
    if (audioContext) return audioContext;
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return null;
    audioContext = new AudioContextClass();
    return audioContext;
  }

  function updateSoundControl() {
    if (!$soundToggle) return;
    const running = soundEnabled && audioContext?.state === 'running';
    $soundToggle.classList.toggle('enabled', running);
    $soundToggle.classList.toggle('pending', soundEnabled && !running);
    $soundToggle.setAttribute('aria-pressed', String(soundEnabled));
    $soundToggle.title = running
      ? 'Desativar os alertas sonoros deste painel'
      : soundEnabled
        ? 'Clique para reativar o áudio deste painel'
        : 'Ativar os alertas sonoros deste painel';
    $soundLabel.textContent = running
      ? 'Som ativo'
      : soundEnabled
        ? 'Reativar som'
        : 'Ativar som';
  }

  async function resumeAudio() {
    if (!soundEnabled) return false;
    const context = getAudioContext();
    if (!context) {
      soundEnabled = false;
      $soundStatus.textContent = 'Este navegador não oferece suporte aos alertas sonoros.';
      updateSoundControl();
      return false;
    }

    try {
      if (context.state !== 'running') await context.resume();
    } catch (_) {}
    updateSoundControl();
    return context.state === 'running';
  }

  function scheduleTone({
    frequency,
    endFrequency = frequency,
    offset = 0,
    duration = 0.2,
    volume = 0.045,
    type = 'sine',
  }) {
    if (!audioContext || audioContext.state !== 'running') return;
    const start = audioContext.currentTime + offset;
    const stop = start + duration;
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();

    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, start);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(1, endFrequency), stop);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(volume, start + Math.min(0.025, duration / 3));
    gain.gain.exponentialRampToValueAtTime(0.0001, stop);

    oscillator.connect(gain);
    gain.connect(audioContext.destination);
    oscillator.start(start);
    oscillator.stop(stop + 0.03);
  }

  function playSound(kind) {
    if (!soundEnabled || !audioContext || audioContext.state !== 'running') return;

    if (kind === 'unlock') {
      scheduleTone({ frequency: 392, endFrequency: 523, duration: 0.28, volume: 0.04 });
      scheduleTone({ frequency: 659, endFrequency: 784, offset: 0.16, duration: 0.34, volume: 0.045 });
      return;
    }

    if (kind === 'lock') {
      scheduleTone({ frequency: 523, endFrequency: 330, duration: 0.34, volume: 0.045, type: 'triangle' });
      scheduleTone({ frequency: 165, endFrequency: 120, offset: 0.21, duration: 0.24, volume: 0.035, type: 'square' });
      return;
    }

    if (kind === 'tamper') {
      [0, 0.18, 0.36, 0.54, 0.72].forEach((offset, index) => {
        scheduleTone({
          frequency: index % 2 === 0 ? 880 : 620,
          endFrequency: index % 2 === 0 ? 1040 : 720,
          offset,
          duration: 0.14,
          volume: 0.055,
          type: 'sawtooth',
        });
      });
      return;
    }

    if (kind === 'vibration') {
      [0, 0.11, 0.22, 0.33, 0.44, 0.55].forEach((offset, index) => {
        scheduleTone({
          frequency: index % 2 === 0 ? 135 : 95,
          endFrequency: 72,
          offset,
          duration: 0.09,
          volume: 0.06,
          type: 'triangle',
        });
      });
      return;
    }

    scheduleTone({ frequency: 520, endFrequency: 620, duration: 0.18, volume: 0.025 });
    scheduleTone({ frequency: 720, endFrequency: 820, offset: 0.12, duration: 0.22, volume: 0.03 });
  }

  function soundForEvent(event) {
    if (event?.type === 'unlocked') return 'unlock';
    if (event?.type === 'relocked') return 'lock';
    if (event?.type === 'tamper') {
      return /vibra|impacto/i.test(event.message || '') ? 'vibration' : 'tamper';
    }
    return null;
  }

  function processSoundEvents(events = []) {
    if (!eventAudioReady) {
      events.forEach((event) => knownEventIds.add(event.id));
      eventAudioReady = true;
      return;
    }

    const newEvents = events
      .filter((event) => event?.id && !knownEventIds.has(event.id))
      .reverse();
    events.forEach((event) => knownEventIds.add(event.id));

    if (knownEventIds.size > 300) {
      knownEventIds.clear();
      events.forEach((event) => knownEventIds.add(event.id));
    }

    for (const event of newEvents) {
      const sound = soundForEvent(event);
      if (!sound || !soundEnabled) continue;
      void resumeAudio().then((running) => {
        if (running) playSound(sound);
      });
    }
  }

  async function setSoundEnabled(enabled, preview = false) {
    soundEnabled = enabled;
    try {
      window.localStorage.setItem(SOUND_PREF_KEY, enabled ? 'enabled' : 'disabled');
    } catch (_) {}

    if (!enabled) {
      if (audioContext?.state === 'running') await audioContext.suspend();
      $soundStatus.textContent = 'Alertas sonoros desativados.';
      updateSoundControl();
      return;
    }

    const running = await resumeAudio();
    $soundStatus.textContent = running
      ? 'Alertas sonoros ativados. Som de teste reproduzido.'
      : 'Clique novamente para autorizar o áudio do painel.';
    if (running && preview) playSound('preview');
  }

  updateSoundControl();

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
    alert: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3z"/><path d="M12 9v4M12 17h.01"/></svg>',
    shield: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>',
  };

  const eventIcons = {
    scan: icons.qr,
    credentials: icons.user,
    authorized: icons.check,
    unlocked: icons.lockOpen,
    door: icons.door,
    session: icons.bolt,
    'access-completed': icons.clock,
    relocked: icons.lockClosed,
    tamper: icons.alert,
    resolved: icons.shield,
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

  const fmtDateTime = (iso) => {
    if (!iso) return '—';
    return new Date(iso).toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  const fmtDuration = (durationMs) => {
    const totalSeconds = Math.max(0, Math.floor(Number(durationMs || 0) / 1000));
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return [hours, minutes, seconds]
      .map((part) => String(part).padStart(2, '0'))
      .join(':');
  };

  function updateLiveTimers() {
    document.querySelectorAll('[data-access-started-at]').forEach((timer) => {
      const startedAt = new Date(timer.dataset.accessStartedAt).getTime();
      if (Number.isFinite(startedAt)) {
        timer.textContent = fmtDuration(Date.now() - startedAt);
      }
    });
  }

  const statusClass = (hub) => {
    if (hub.tamper) return 'status-tamper';
    if (hub.session === 'active') return 'status-session';
    if (hub.door === 'open') return 'status-door';
    if (hub.lock === 'unlocked') return 'status-unlocked';
    if (hub.statusLabel === 'Acesso autorizado') return 'status-authorized';
    return 'status-locked';
  };

  const statusIcon = (hub) => {
    if (hub.tamper) return icons.alert;
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
    const accessStartedAt = s?.startedAt || hub.accessStartedAt;
    const accessPhaseLabel = hub.door === 'open'
      ? 'MC-38 aberto — feche a porta para travar'
      : 'Aguardando o usuário abrir o MC-38';

    const accessTimerHtml = unlocked && accessStartedAt
      ? `<div class="access-chronograph" aria-live="polite">
           <div class="chronograph-head">
             <span class="chronograph-label"><span class="live-pulse"></span> Tempo com a trava liberada</span>
             <strong class="access-timer" data-access-started-at="${esc(accessStartedAt)}">${fmtDuration(hub.accessElapsedMs)}</strong>
           </div>
           <div class="access-phase">${icons.door}<span>${accessPhaseLabel}</span></div>
           <div class="access-route" aria-label="Etapas do acesso">
             <span class="done">Liberada</span>
             <span class="${hub.doorOpenedDuringAccess || hub.door === 'open' ? 'done' : 'current'}">Porta aberta</span>
             <span class="pending">Fechar e travar</span>
           </div>
         </div>`
      : hub.lastAccessDurationMs != null
        ? `<div class="last-access-duration">${icons.clock}<span>Último acesso:</span><b>${fmtDuration(hub.lastAccessDurationMs)}</b></div>`
        : '';

    const sessionHtml = s
      ? `<div class="session-box">
           <div class="session-row"><span class="k">${icons.user} Nome</span><b>${esc(s.name)}</b></div>
           <div class="session-row"><span class="k">${icons.phone} Telefone</span><b>${esc(s.phone)}</b></div>
           <div class="session-row"><span class="k">${icons.car} Placa</span><b>${esc(s.plate)}</b></div>
           ${s.email ? `<div class="session-row"><span class="k">${icons.mail} E-mail</span><b>${esc(s.email)}</b></div>` : ''}
           <div class="session-row"><span class="k">${icons.clock} Horário</span><b>${fmtTime(s.requestedAt)}</b></div>
           ${s.startedAt ? `<div class="session-row"><span class="k">${icons.bolt} Liberada</span><b>${fmtTime(s.startedAt)}</b></div>` : ''}
         </div>`
      : `<div class="session-box empty">Última solicitação: nenhuma</div>`;

    const authorizedBanner = s && unlocked
      ? `<div class="status-label status-session" style="font-size:13px">
           ${icons.check}
           <span>Acesso autorizado para <b>${esc(s.name)}</b> — veículo <b>${esc(s.plate)}</b></span>
         </div>`
      : '';

    const lockText = hub.tamper
      ? { t1: 'Tentativa de violação detectada', t2: 'Sensores tamper/vibração dispararam — verificar local' }
      : unlocked
        ? {
            t1: hub.door === 'open' ? 'Porta aberta' : 'Fechadura liberada',
            t2: hub.door === 'open'
              ? 'O fechamento do MC-38 travará o hub imediatamente'
              : 'Sem temporizador — aguardando abertura do MC-38',
          }
        : { t1: 'Fechadura bloqueada', t2: 'Aguardando autenticação por QR Code' };

    return `
      <article class="card hub ${hub.tamper ? 'hub-tamper' : ''}" data-hub="${esc(hub.id)}">
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
          <span class="chip">${icons.bolt}&nbsp;Sessão: <b>&nbsp;${unlocked ? (hub.door === 'open' ? 'Porta aberta' : 'Aguardando porta') : '—'}</b></span>
        </div>

        <div class="lockviz ${hub.tamper ? 'tamper' : unlocked ? 'unlocked' : 'locked'}">
          <svg class="padlock" viewBox="0 0 64 64" fill="none">
            <path class="shackle" d="M20 30 V20 a12 12 0 0 1 24 0 v10" stroke-width="5" stroke-linecap="round"/>
            <rect class="body" x="14" y="30" width="36" height="26" rx="6" stroke-width="4"/>
            <circle cx="32" cy="41" r="3.4" fill="currentColor" opacity="0.85"/>
            <path d="M32 44 v5" stroke="currentColor" stroke-width="3" stroke-linecap="round" opacity="0.85"/>
          </svg>
          <div class="lock-text">
            <div class="t1">${lockText.t1}</div>
            <div class="t2">${lockText.t2}</div>
          </div>
        </div>

        ${accessTimerHtml}
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
          <button class="btn ghost btn-tamper" data-hub="${esc(hub.id)}" title="Simula os sensores detectando uma tentativa de violação">${icons.alert}&nbsp;Simular violação</button>
          <button class="btn ghost btn-reset-hub" data-hub="${esc(hub.id)}">${icons.reset}&nbsp;Resetar</button>
        </div>
      </article>`;
  }

  function renderAlerts(alerts) {
    if (!alerts.length) {
      $alerts.innerHTML = '<div class="empty-note">Nenhum alerta de segurança.</div>';
      return;
    }
    $alerts.innerHTML = alerts
      .map(
        (a) => `
        <div class="alert-item ${a.resolved ? 'resolved' : 'active'}">
          <div class="avatar">${a.resolved ? icons.shield : icons.alert}</div>
          <div class="info">
            <div class="name">${a.resolved ? 'Violação verificada' : 'Tentativa de violação'}</div>
            <div class="sub">
              <span class="tag">${esc(a.hubId)}</span>
              <span>${fmtTime(a.at)}</span>
              ${a.resolved ? `<span>resolvido às ${fmtTime(a.resolvedAt)}</span>` : ''}
            </div>
          </div>
          ${a.resolved
            ? `<span class="chip online">${icons.check}&nbsp;Resolvido</span>`
            : `<button class="btn danger btn-resolve" data-alert="${esc(a.id)}">Resolver</button>`}
        </div>`
      )
      .join('');
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
            <div class="meta">${ev.hubId ? `<span class="hub">${esc(ev.hubId)}</span>` : ''}<span>${fmtTime(ev.at)}</span>${ev.durationMs != null ? `<span class="event-duration">${fmtDuration(ev.durationMs)}</span>` : ''}</div>
          </div>
        </div>`
      )
      .join('');
  }

  function renderAccessLogs(logs) {
    if (!$accessLogs) return;
    if (!logs?.length) {
      $accessLogs.innerHTML = '<div class="empty-note">Nenhum ciclo completo registrado ainda.</div>';
      return;
    }

    $accessLogs.innerHTML = logs
      .map(
        (log) => `
        <article class="access-log-row">
          <div class="access-log-duration">
            <span>DURAÇÃO</span>
            <strong>${fmtDuration(log.durationMs)}</strong>
          </div>
          <div class="access-log-main">
            <div class="access-log-title">
              <b>${esc(log.name)}</b>
              ${log.plate ? `<span class="tag">${esc(log.plate)}</span>` : ''}
              <span class="tag">${esc(log.hubId)}</span>
            </div>
            <div class="access-log-times">
              <span>${icons.lockOpen} ${fmtDateTime(log.startedAt)}</span>
              <span>${icons.door} ${log.doorOpenedAt ? fmtTime(log.doorOpenedAt) : 'porta não aberta'}</span>
              <span>${icons.lockClosed} ${fmtTime(log.endedAt)}</span>
            </div>
          </div>
          <span class="access-log-result ${log.completedByDoor ? 'success' : 'interrupted'}">
            ${log.completedByDoor ? 'MC-38 concluído' : 'Interrompido'}
          </span>
        </article>`,
      )
      .join('');
  }

  function renderKpis(stats) {
    if (!stats) return;
    $kpiHubs.textContent = stats.hubsTotal;
    $kpiOnline.textContent = stats.hubsOnline;
    $kpiAccesses.textContent = stats.totalAccesses;
    $kpiAlerts.textContent = stats.activeAlerts;
    $kpiAlertsCard.classList.toggle('kpi-alarm', stats.activeAlerts > 0);
  }

  function render(state) {
    latestState = state;
    processSoundEvents(state.events || []);
    renderKpis(state.stats);
    $hubs.innerHTML = state.hubs.map(renderHub).join('');
    renderAlerts(state.alerts || []);
    renderRequests(state.requests);
    renderEvents(state.events);
    renderAccessLogs(state.accessLogs || []);
    updateLiveTimers();
  }

  // ---------------------------------------------------------------------
  // Ações
  // ---------------------------------------------------------------------
  $soundToggle?.addEventListener('click', () => {
    const needsActivation = soundEnabled && audioContext?.state !== 'running';
    void setSoundEnabled(needsActivation || !soundEnabled, true);
  });

  document.addEventListener('pointerdown', () => {
    if (soundEnabled && audioContext?.state !== 'running') void resumeAudio();
  }, { passive: true });

  document.getElementById('btn-reset-all').addEventListener('click', () => {
    fetch('/api/reset-all', { method: 'POST' });
  });

  $hubs.addEventListener('click', (e) => {
    const reset = e.target.closest('.btn-reset-hub');
    if (reset) {
      fetch(`/api/hubs/${reset.dataset.hub}/reset`, { method: 'POST' });
      return;
    }
    const tamper = e.target.closest('.btn-tamper');
    if (tamper) {
      fetch(`/api/hubs/${tamper.dataset.hub}/tamper`, { method: 'POST' });
      return;
    }
    const qr = e.target.closest('.qr-img');
    if (qr) openLightbox(qr.closest('article.hub')?.dataset.hub);
  });

  $alerts.addEventListener('click', (e) => {
    const btn = e.target.closest('.btn-resolve');
    if (btn) fetch(`/api/alerts/${btn.dataset.alert}/resolve`, { method: 'POST' });
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
      if (latestState) render(latestState);
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
  setInterval(updateLiveTimers, 250);
})();
