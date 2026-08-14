import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  isHardwareConnected,
  lockHub,
  requestStatus,
  unlockHub,
} from './hardware.js';

export const bus = new EventEmitter();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', 'data');
const ACCESS_LOG_PATH = path.join(DATA_DIR, 'access-log.jsonl');

function loadAccessLogs() {
  if (!existsSync(ACCESS_LOG_PATH)) return [];

  try {
    return readFileSync(ACCESS_LOG_PATH, 'utf8')
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => JSON.parse(line))
      .reverse()
      .slice(0, 200);
  } catch (error) {
    console.error('[ACCESS LOG] Falha ao carregar histórico:', error.message);
    return [];
  }
}

function persistAccessLog(entry) {
  try {
    mkdirSync(DATA_DIR, { recursive: true });
    appendFileSync(ACCESS_LOG_PATH, `${JSON.stringify(entry)}\n`, 'utf8');
  } catch (error) {
    console.error('[ACCESS LOG] Falha ao persistir sessão:', error.message);
  }
}

const HUB_DEFS = [
  { id: 'HUB-001', name: 'Carregador Protegido', location: 'Posto Demonstração' },
  { id: 'HUB-002', name: 'Carregador Protegido', location: 'Estacionamento Central' },
  { id: 'HUB-003', name: 'Carregador Protegido', location: 'Rodovia BR-101 km 42' },
];

const hubs = new Map();
for (const definition of HUB_DEFS) {
  hubs.set(definition.id, freshHub(definition));
}

let events = [];
let requests = [];
let alerts = [];
let accessLogs = loadAccessLogs();
let totalAccesses = accessLogs.length;

const countedSessions = new Set(accessLogs.map((entry) => entry.sessionId));

// Evita que quedas muito curtas do Wokwi façam o dashboard piscar offline.
// Pode ser configurado no .env: HUB_OFFLINE_GRACE_MS=15000
const HUB_OFFLINE_GRACE_MS = Math.max(
  0,
  Number(process.env.HUB_OFFLINE_GRACE_MS || 15000),
);
const offlineTimers = new Map();

function freshHub(definition) {
  return {
    id: definition.id,
    name: definition.name,
    location: definition.location,
    online: false,
    lock: 'locked',
    door: 'closed',
    session: 'idle',
    tamper: false,
    vibration: false,
    statusLabel: 'Hub offline',
    currentSession: null,
    accessPhase: 'idle',
    accessStartedAt: null,
    accessElapsedMs: 0,
    doorOpenedDuringAccess: false,
    lastAccessDurationMs: null,
    lastRequestAt: null,
    lastSeenAt: null,
  };
}

function addEvent(hubId, type, message, details = {}) {
  const event = {
    id: randomUUID(),
    hubId,
    type,
    message,
    at: new Date().toISOString(),
    ...details,
  };

  events.unshift(event);
  if (events.length > 120) events.length = 120;
  return event;
}

function emitChange() {
  bus.emit('change', getState());
}

function publicHub(hub) {
  return { ...hub };
}

function hasActiveSecurityAlert(hubId) {
  return alerts.some((alert) => alert.hubId === hubId && !alert.resolved);
}

function refreshStatusLabel(hub) {
  if (!hub.online) {
    hub.statusLabel = 'Hub offline';
    return;
  }

  if (hub.tamper || hasActiveSecurityAlert(hub.id)) {
    hub.statusLabel = 'ALERTA: tentativa de violação';
    return;
  }

  if (hub.lock === 'unlocked') {
    hub.statusLabel = hub.door === 'open'
      ? 'Porta aberta — aguardando fechamento'
      : 'Fechadura liberada — aguardando abertura';
    return;
  }

  if (hub.door === 'open') {
    hub.statusLabel = 'Porta aberta';
    return;
  }

  if (hub.currentSession) {
    hub.statusLabel = 'Aguardando confirmação do hub';
    return;
  }

  hub.statusLabel = 'Fechadura bloqueada';
}

function createSecurityAlert(hub, type, message) {
  const duplicate = alerts.find(
    (alert) => alert.hubId === hub.id && alert.type === type && !alert.resolved,
  );

  if (duplicate) return duplicate;

  const alert = {
    id: randomUUID(),
    hubId: hub.id,
    type,
    message,
    at: new Date().toISOString(),
    resolved: false,
    resolvedAt: null,
  };

  alerts.unshift(alert);
  if (alerts.length > 50) alerts.length = 50;
  return alert;
}

function cancelOfflineTimer(hubId) {
  const timer = offlineTimers.get(hubId);
  if (!timer) return;

  clearTimeout(timer);
  offlineTimers.delete(hubId);
}

function scheduleOffline(hub) {
  cancelOfflineTimer(hub.id);

  console.warn(
    `[STATE] ${hub.id} sinalizou offline; aguardando ${HUB_OFFLINE_GRACE_MS} ms antes de atualizar o dashboard`,
  );

  const timer = setTimeout(() => {
    offlineTimers.delete(hub.id);

    if (!hub.online) return;

    hub.online = false;
    addEvent(hub.id, 'offline', `${hub.id} desconectado`);
    refreshStatusLabel(hub);
    emitChange();
  }, HUB_OFFLINE_GRACE_MS);

  offlineTimers.set(hub.id, timer);
}

function normalizeBoolean(value, fallback) {
  return typeof value === 'boolean' ? value : fallback;
}

function applyStateSnapshot(hub, data) {
  if (data.lock === 'locked' || data.lock === 'unlocked') {
    hub.lock = data.lock;
  }

  if (data.door === 'closed' || data.door === 'open') {
    hub.door = data.door;
  }

  hub.tamper = normalizeBoolean(data.tamper, hub.tamper);
  hub.vibration = normalizeBoolean(data.vibration, hub.vibration);
  hub.doorOpenedDuringAccess = normalizeBoolean(
    data.doorOpenedDuringAccess,
    hub.doorOpenedDuringAccess,
  );

  if (typeof data.accessPhase === 'string' && data.accessPhase) {
    hub.accessPhase = data.accessPhase;
  }

  const elapsedMs = Number(data.unlockElapsedMs);
  if (Number.isFinite(elapsedMs) && elapsedMs >= 0) {
    hub.accessElapsedMs = elapsedMs;
  }

  if (hub.lock === 'unlocked' && !hub.accessStartedAt) {
    hub.accessStartedAt = new Date(
      Date.now() - Math.max(0, hub.accessElapsedMs || 0),
    ).toISOString();
  }

  if (hub.lock === 'unlocked' && hub.door === 'open') {
    hub.session = 'active';
  } else if (hub.lock === 'locked') {
    hub.session = 'idle';
    hub.accessPhase = 'idle';
  }
}

function formatDuration(durationMs) {
  const totalSeconds = Math.max(0, Math.floor(Number(durationMs || 0) / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds].map((part) => String(part).padStart(2, '0')).join(':');
}

function recordAccessCompletion(hub, sessionId, data, receivedAt) {
  if (!sessionId) return null;

  const existing = accessLogs.find((entry) => entry.sessionId === sessionId);
  if (existing) return existing;

  const session = hub.currentSession?.id === sessionId
    ? hub.currentSession
    : requests.find((request) => request.id === sessionId);
  const durationMs = Math.max(0, Number(data?.accessDurationMs || 0));
  const endedAt = receivedAt || new Date().toISOString();
  const derivedStartedAt = new Date(
    Math.max(0, new Date(endedAt).getTime() - durationMs),
  ).toISOString();

  const entry = {
    id: randomUUID(),
    hubId: hub.id,
    sessionId,
    name: session?.name || 'Usuário não identificado',
    plate: session?.plate || null,
    startedAt: session?.startedAt || hub.accessStartedAt || derivedStartedAt,
    doorOpenedAt: session?.doorOpenedAt || null,
    endedAt,
    durationMs,
    reason: String(data?.reason || 'hardware_lock'),
    completedByDoor: data?.reason === 'door_closed_after_open',
  };

  accessLogs.unshift(entry);
  if (accessLogs.length > 200) accessLogs.length = 200;
  persistAccessLog(entry);
  return entry;
}

export function getState() {
  const hubList = [...hubs.values()];

  return {
    hubs: hubList.map(publicHub),
    events: events.slice(0, 50),
    requests: requests.slice(0, 20),
    accessLogs: accessLogs.slice(0, 50),
    alerts: alerts.slice(0, 20),
    stats: {
      hubsTotal: hubList.length,
      hubsOnline: hubList.filter((hub) => hub.online).length,
      totalAccesses,
      activeAlerts: alerts.filter((alert) => !alert.resolved).length,
    },
    updatedAt: new Date().toISOString(),
  };
}

export function getAccessLogs() {
  return accessLogs.slice(0, 200);
}

export function getHub(hubId) {
  return hubs.get(hubId);
}

export function scanHub(hubId) {
  const hub = hubs.get(hubId);
  if (!hub) return null;

  addEvent(hubId, 'scan', `QR Code do ${hubId} escaneado pelo celular`);
  emitChange();
  return publicHub(hub);
}

export function requestAccess(hubId, credentials) {
  const hub = hubs.get(hubId);
  if (!hub) throw new Error('Hub não encontrado');

  if (!hub.online) {
    const error = new Error('O hub está offline');
    error.code = 'HUB_OFFLINE';
    throw error;
  }

  if (!isHardwareConnected()) {
    const error = new Error('O backend não está conectado ao broker MQTT');
    error.code = 'MQTT_OFFLINE';
    throw error;
  }

  if (hub.lock === 'unlocked' || hub.currentSession) {
    const error = new Error('Já existe uma sessão de acesso em andamento');
    error.code = 'ACCESS_IN_PROGRESS';
    throw error;
  }

  const session = {
    id: randomUUID(),
    name: credentials.name,
    phone: credentials.phone,
    plate: credentials.plate,
    email: credentials.email || null,
    requestedAt: new Date().toISOString(),
    startedAt: null,
    doorOpenedAt: null,
    accessPhase: 'awaiting_unlock',
  };

  hub.currentSession = session;
  hub.lastRequestAt = session.requestedAt;
  hub.session = 'idle';
  hub.accessPhase = 'awaiting_unlock';
  hub.accessStartedAt = null;
  hub.accessElapsedMs = 0;
  hub.doorOpenedDuringAccess = false;

  requests.unshift({ hubId, ...session });
  if (requests.length > 50) requests.length = 50;

  addEvent(
    hubId,
    'credentials',
    `Credenciais enviadas por ${session.name} — veículo ${session.plate}`,
  );
  addEvent(hubId, 'authorized', `Acesso autorizado para ${session.name}`);

  hub.statusLabel = 'Aguardando confirmação do hub';
  emitChange();

  const dispatched = unlockHub(hubId, session.id);

  if (!dispatched) {
    hub.currentSession = null;
    refreshStatusLabel(hub);
    addEvent(hubId, 'error', 'Falha ao enviar comando de abertura ao hub');
    emitChange();

    const error = new Error('Não foi possível enviar o comando ao hub');
    error.code = 'COMMAND_NOT_SENT';
    throw error;
  }

  return { session };
}

export function applyHardwareMessage(message) {
  const { hubId, channel, data, receivedAt } = message;
  const hub = hubs.get(hubId);

  if (!hub) {
    console.warn(`[STATE] Mensagem recebida de hub desconhecido: ${hubId}`);
    return false;
  }

  hub.lastSeenAt = receivedAt || new Date().toISOString();

  if (channel === 'availability') {
    const online = data?.online === true;

    if (!online) {
      scheduleOffline(hub);
      return true;
    }

    cancelOfflineTimer(hubId);
    const changed = !hub.online;
    hub.online = true;

    if (changed) {
      addEvent(hubId, 'online', `${hubId} conectado`);
    }

    requestStatus(hubId);
    refreshStatusLabel(hub);
    emitChange();
    return true;
  }

  // Qualquer state/event válido prova que o dispositivo está online agora.
  cancelOfflineTimer(hubId);
  hub.online = true;

  if (channel === 'state') {
    applyStateSnapshot(hub, data || {});
    refreshStatusLabel(hub);
    emitChange();
    return true;
  }

  if (channel !== 'event') return false;

  const type = String(data?.type || data?.event || '').trim();
  const sessionId = data?.sessionId || null;

  switch (type) {
    case 'system_started':
      applyStateSnapshot(hub, data);
      addEvent(hubId, 'online', `${hubId} inicializado e conectado`);
      break;

    case 'lock_unlocked':
      applyStateSnapshot(hub, data || {});
      hub.lock = 'unlocked';
      hub.session = hub.door === 'open' ? 'active' : 'idle';
      hub.accessPhase = hub.door === 'open' ? 'door_open' : 'awaiting_open';
      hub.accessStartedAt = receivedAt || new Date().toISOString();
      hub.accessElapsedMs = 0;

      if (hub.currentSession?.id === sessionId) {
        hub.currentSession.startedAt = hub.accessStartedAt;
        hub.currentSession.accessPhase = hub.accessPhase;
      }

      if (sessionId && !countedSessions.has(sessionId)) {
        countedSessions.add(sessionId);
        totalAccesses += 1;
      }

      addEvent(
        hubId,
        'unlocked',
        `Fechadura liberada sem temporizador${sessionId ? ` — sessão ${sessionId.slice(0, 8)}` : ''}`,
      );
      break;

    case 'access_completed': {
      const accessLog = recordAccessCompletion(hub, sessionId, data, receivedAt);
      const durationMs = accessLog?.durationMs || Number(data?.accessDurationMs || 0);
      hub.lastAccessDurationMs = durationMs;
      hub.accessElapsedMs = durationMs;
      hub.accessPhase = 'completed';

      addEvent(
        hubId,
        'access-completed',
        `Acesso concluído em ${formatDuration(durationMs)} — ${
          data?.reason === 'door_closed_after_open'
            ? 'MC-38 fechou e a trava foi acionada'
            : `encerrado por ${data?.reason || 'comando do hardware'}`
        }`,
        { durationMs, sessionId, reason: data?.reason || null },
      );
      break;
    }

    case 'lock_locked': {
      applyStateSnapshot(hub, data || {});
      hub.lock = 'locked';
      if (hub.door === 'closed') hub.session = 'idle';

      const endedSession = hub.currentSession?.id;
      addEvent(
        hubId,
        'relocked',
        endedSession
          ? `Sessão ${endedSession.slice(0, 8)} encerrada — fechadura bloqueada`
          : 'Fechadura bloqueada',
      );

      if (hub.door === 'closed') hub.currentSession = null;
      hub.accessStartedAt = null;
      hub.doorOpenedDuringAccess = false;
      hub.accessPhase = 'idle';
      break;
    }

    case 'door_opened':
      hub.door = 'open';
      hub.session = 'active';
      hub.accessPhase = hub.lock === 'unlocked' ? 'door_open' : hub.accessPhase;
      hub.doorOpenedDuringAccess = hub.lock === 'unlocked';
      if (hub.currentSession && hub.lock === 'unlocked') {
        hub.currentSession.doorOpenedAt = receivedAt || new Date().toISOString();
        hub.currentSession.accessPhase = 'door_open';
      }
      addEvent(hubId, 'door', 'Sensor de porta: porta aberta');
      addEvent(hubId, 'session', 'MC-38 aberto — aguardando fechamento para travar');
      break;

    case 'door_closed':
      hub.door = 'closed';
      if (hub.lock === 'locked') {
        hub.session = 'idle';
        hub.currentSession = null;
      }
      addEvent(hubId, 'door', 'Sensor de porta: porta fechada');
      break;

    case 'tamper_detected':
      hub.tamper = true;
      createSecurityAlert(
        hub,
        'tamper',
        `Abertura indevida da caixa detectada no ${hubId}`,
      );
      addEvent(
        hubId,
        'tamper',
        `⚠ Tamper acionado no ${hubId} — operador notificado`,
      );
      break;

    case 'tamper_normal':
      hub.tamper = false;
      addEvent(hubId, 'resolved', `Sensor tamper do ${hubId} voltou ao estado normal`);
      break;

    case 'vibration_detected':
      hub.vibration = true;
      // Mantém compatibilidade visual com o dashboard atual, que destaca hub.tamper.
      hub.tamper = true;
      createSecurityAlert(
        hub,
        'vibration',
        `Vibração ou impacto detectado no ${hubId}`,
      );
      addEvent(
        hubId,
        'tamper',
        `⚠ Vibração detectada no ${hubId} — operador notificado`,
      );
      break;

    case 'vibration_finished':
      hub.vibration = false;
      addEvent(hubId, 'resolved', `Sensor de vibração do ${hubId} voltou ao estado normal`);
      break;

    case 'access_denied':
      addEvent(
        hubId,
        'tamper',
        `Abertura recusada pelo dispositivo: ${data?.reason || 'motivo não informado'}`,
      );
      break;

    case 'unlock_ignored':
      addEvent(
        hubId,
        'unlocked',
        `Comando de abertura ignorado: ${data?.reason || 'motivo não informado'}`,
      );
      break;

    case 'auto_lock':
      addEvent(hubId, 'relocked', 'Temporizador de abertura encerrado');
      break;

    default:
      addEvent(
        hubId,
        'hardware',
        `Evento do dispositivo: ${type || JSON.stringify(data)}`,
      );
  }

  refreshStatusLabel(hub);
  emitChange();
  return true;
}

export function triggerTamper(hubId) {
  const hub = hubs.get(hubId);
  if (!hub) return null;

  hub.tamper = true;

  const alert = createSecurityAlert(
    hub,
    'tamper',
    `Sensores detectaram vibração e tentativa de violação no ${hubId}`,
  );

  addEvent(
    hubId,
    'tamper',
    `⚠ Tentativa de violação detectada no ${hubId} — operador notificado`,
  );

  refreshStatusLabel(hub);
  emitChange();
  return alert;
}

export function resolveAlert(alertId) {
  const alert = alerts.find((item) => item.id === alertId);
  if (!alert) return null;

  if (!alert.resolved) {
    alert.resolved = true;
    alert.resolvedAt = new Date().toISOString();

    const hub = hubs.get(alert.hubId);
    if (hub && !hasActiveSecurityAlert(hub.id)) {
      hub.tamper = false;
      refreshStatusLabel(hub);
    }

    addEvent(
      alert.hubId,
      'resolved',
      `Alerta de violação do ${alert.hubId} verificado e resolvido pelo operador`,
    );
    emitChange();
  }

  return alert;
}

export function resetHub(hubId) {
  const hub = hubs.get(hubId);
  if (!hub) return null;

  lockHub(hubId, 'manual_reset');

  hub.lock = 'locked';
  hub.door = 'closed';
  hub.session = 'idle';
  hub.tamper = false;
  hub.vibration = false;
  hub.currentSession = null;
  hub.accessPhase = 'idle';
  hub.accessStartedAt = null;
  hub.accessElapsedMs = 0;
  hub.doorOpenedDuringAccess = false;

  for (const alert of alerts) {
    if (alert.hubId === hubId && !alert.resolved) {
      alert.resolved = true;
      alert.resolvedAt = new Date().toISOString();
    }
  }

  refreshStatusLabel(hub);
  addEvent(hubId, 'reset', `Demonstração do ${hubId} resetada manualmente`);
  emitChange();

  if (hub.online) requestStatus(hubId);
  return publicHub(hub);
}

export function resetAll() {
  for (const hub of hubs.values()) {
    lockHub(hub.id, 'reset_all');

    hub.lock = 'locked';
    hub.door = 'closed';
    hub.session = 'idle';
    hub.tamper = false;
    hub.vibration = false;
    hub.currentSession = null;
    hub.accessPhase = 'idle';
    hub.accessStartedAt = null;
    hub.accessElapsedMs = 0;
    hub.doorOpenedDuringAccess = false;
    refreshStatusLabel(hub);
  }

  for (const alert of alerts) {
    if (!alert.resolved) {
      alert.resolved = true;
      alert.resolvedAt = new Date().toISOString();
    }
  }

  addEvent(null, 'reset', 'Demonstração completa resetada (todos os hubs)');
  emitChange();
}
