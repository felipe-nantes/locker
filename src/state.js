/**
 * Estado da demonstração (em memória) + máquina de estados da fechadura.
 * -------------------------------------------------------------
 * Mantém a lista de hubs, o histórico de eventos, as solicitações recebidas
 * e os alertas de segurança. Qualquer mudança emite o evento "change" no
 * `bus`, que o servidor usa para empurrar o estado para os dashboards
 * conectados via SSE (tempo real).
 */
import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import { unlockHub, lockHub } from './hardware.js';

/** Barramento de eventos: emite "change" com o estado público a cada alteração. */
export const bus = new EventEmitter();

/** Tempos (ms) da simulação do ciclo de acesso. Ajustáveis para a demo. */
const DELAY_DOOR_OPEN = 3000; // após liberar a fechadura → "Porta aberta"
const DELAY_SESSION = 4000; // após abrir a porta → "Sessão ativa"
const DELAY_DOOR_CLOSE = 9000; // após sessão ativa → "Porta fechada"
const DELAY_RELOCK = 2500; // após fechar a porta → re-bloqueio automático

/** Definição dos hubs disponíveis na demonstração. */
const HUB_DEFS = [
  { id: 'HUB-001', name: 'Carregador Protegido', location: 'Posto Demonstração' },
  { id: 'HUB-002', name: 'Carregador Protegido', location: 'Estacionamento Central' },
  { id: 'HUB-003', name: 'Carregador Protegido', location: 'Rodovia BR-101 km 42' },
];

/** Mapa hubId -> estado do hub. */
const hubs = new Map();
for (const def of HUB_DEFS) hubs.set(def.id, freshHub(def));

/** Histórico global de eventos (mais recentes primeiro). */
let events = [];
/** Solicitações de acesso recebidas (mais recentes primeiro). */
let requests = [];
/** Alertas de segurança (mais recentes primeiro). */
let alerts = [];
/** Contador de acessos autorizados desde o início da demo. */
let totalAccesses = 0;

function freshHub(def) {
  return {
    id: def.id,
    name: def.name,
    location: def.location,
    online: true,
    lock: 'locked', // 'locked' | 'unlocked'
    door: 'closed', // 'closed' | 'open'
    session: 'idle', // 'idle' | 'active'
    tamper: false, // alerta de violação ativo?
    statusLabel: 'Fechadura bloqueada',
    currentSession: null, // { id, name, phone, plate, email, requestedAt }
    lastRequestAt: null,
    _timers: [], // timers internos (não expostos)
  };
}

function addEvent(hubId, type, message) {
  const ev = {
    id: randomUUID(),
    hubId,
    type,
    message,
    at: new Date().toISOString(),
  };
  events.unshift(ev);
  if (events.length > 120) events.length = 120;
  return ev;
}

function clearTimers(hub) {
  for (const t of hub._timers) clearTimeout(t);
  hub._timers = [];
}

/** Remove campos internos antes de enviar ao cliente. */
function publicHub(hub) {
  const { _timers, ...rest } = hub;
  return rest;
}

/** Estado público completo (o que os clientes recebem). */
export function getState() {
  const hubList = [...hubs.values()];
  return {
    hubs: hubList.map(publicHub),
    events: events.slice(0, 50),
    requests: requests.slice(0, 20),
    alerts: alerts.slice(0, 20),
    stats: {
      hubsTotal: hubList.length,
      hubsOnline: hubList.filter((h) => h.online).length,
      totalAccesses,
      activeAlerts: alerts.filter((a) => !a.resolved).length,
    },
    updatedAt: new Date().toISOString(),
  };
}

function emitChange() {
  bus.emit('change', getState());
}

export function getHub(hubId) {
  return hubs.get(hubId);
}

/** Registra que o QR Code de um hub foi escaneado (chamado pela página mobile). */
export function scanHub(hubId) {
  const hub = hubs.get(hubId);
  if (!hub) return null;
  addEvent(hubId, 'scan', `QR Code do ${hubId} escaneado pelo celular`);
  emitChange();
  return publicHub(hub);
}

/**
 * Processa uma solicitação de acesso: cria a sessão, LIBERA a fechadura
 * (via camada de hardware) e dispara a progressão temporizada de estados,
 * incluindo o RE-BLOQUEIO automático ao final do ciclo:
 *
 *   Autorizado → Liberada → Porta aberta → Sessão ativa
 *             → Porta fechada → Fechadura bloqueada (ciclo completo)
 *
 * A validação dos campos acontece na rota, antes de chegar aqui.
 */
export function requestAccess(hubId, creds) {
  const hub = hubs.get(hubId);
  if (!hub) throw new Error('Hub não encontrado');

  clearTimers(hub); // reinicia qualquer sessão anterior em andamento

  const session = {
    id: randomUUID(),
    name: creds.name,
    phone: creds.phone,
    plate: creds.plate,
    email: creds.email || null,
    requestedAt: new Date().toISOString(),
  };

  hub.currentSession = session;
  hub.lastRequestAt = session.requestedAt;
  hub.door = 'closed';
  hub.session = 'idle';
  requests.unshift({ hubId, ...session });
  if (requests.length > 50) requests.length = 50;
  totalAccesses += 1;

  addEvent(hubId, 'credentials', `Credenciais enviadas por ${session.name} — veículo ${session.plate}`);
  addEvent(hubId, 'authorized', `Acesso autorizado para ${session.name}`);
  hub.statusLabel = 'Acesso autorizado';
  emitChange();

  // ---- Liberação da fechadura (ponto de integração com hardware real) ----
  unlockHub(hubId, session.id);
  hub.lock = 'unlocked';
  hub.statusLabel = 'Fechadura liberada';
  addEvent(hubId, 'unlocked', `Fechadura liberada — sessão ${session.id.slice(0, 8)}`);
  emitChange();

  // Progressão temporizada: porta abre → sessão ativa → porta fecha → re-bloqueio.
  hub._timers.push(
    setTimeout(() => {
      hub.door = 'open';
      hub.statusLabel = 'Porta aberta';
      addEvent(hubId, 'door', 'Sensor de porta: porta aberta');
      emitChange();

      hub._timers.push(
        setTimeout(() => {
          hub.session = 'active';
          hub.statusLabel = 'Sessão de acesso ativa';
          addEvent(hubId, 'session', 'Sessão de acesso ativa');
          emitChange();

          hub._timers.push(
            setTimeout(() => {
              hub.door = 'closed';
              hub.statusLabel = 'Porta fechada';
              addEvent(hubId, 'door', 'Sensor de porta: porta fechada');
              emitChange();

              hub._timers.push(
                setTimeout(() => {
                  lockHub(hubId);
                  hub.lock = 'locked';
                  hub.session = 'idle';
                  hub.statusLabel = 'Fechadura bloqueada';
                  addEvent(
                    hubId,
                    'relocked',
                    `Sessão ${session.id.slice(0, 8)} encerrada — fechadura bloqueada automaticamente`
                  );
                  emitChange();
                }, DELAY_RELOCK)
              );
            }, DELAY_DOOR_CLOSE)
          );
        }, DELAY_SESSION)
      );
    }, DELAY_DOOR_OPEN)
  );

  return { session };
}

/**
 * Simula uma TENTATIVA DE VIOLAÇÃO detectada pelos sensores do hub
 * (tamper / vibração). Gera um alerta de segurança que fica ativo até
 * ser resolvido pelo operador no dashboard.
 */
export function triggerTamper(hubId) {
  const hub = hubs.get(hubId);
  if (!hub) return null;

  hub.tamper = true;
  hub.statusLabel = 'ALERTA: tentativa de violação';

  const alert = {
    id: randomUUID(),
    hubId,
    type: 'tamper',
    message: `Sensores detectaram vibração e tentativa de violação no ${hubId}`,
    at: new Date().toISOString(),
    resolved: false,
    resolvedAt: null,
  };
  alerts.unshift(alert);
  if (alerts.length > 50) alerts.length = 50;

  addEvent(hubId, 'tamper', `⚠ Tentativa de violação detectada no ${hubId} — operador notificado`);
  emitChange();
  return alert;
}

/** Marca um alerta como resolvido pelo operador. */
export function resolveAlert(alertId) {
  const alert = alerts.find((a) => a.id === alertId);
  if (!alert) return null;
  if (!alert.resolved) {
    alert.resolved = true;
    alert.resolvedAt = new Date().toISOString();
    const hub = hubs.get(alert.hubId);
    if (hub) {
      // Só limpa o estado de tamper se não houver outro alerta ativo no hub.
      const stillActive = alerts.some((a) => a.hubId === alert.hubId && !a.resolved);
      if (!stillActive) {
        hub.tamper = false;
        if (hub.lock === 'locked' && hub.door === 'closed' && hub.session === 'idle') {
          hub.statusLabel = 'Fechadura bloqueada';
        }
      }
    }
    addEvent(alert.hubId, 'resolved', `Alerta de violação do ${alert.hubId} verificado e resolvido pelo operador`);
    emitChange();
  }
  return alert;
}

/** Reseta um hub específico de volta ao estado "Fechadura bloqueada". */
export function resetHub(hubId) {
  const hub = hubs.get(hubId);
  if (!hub) return null;
  clearTimers(hub);
  lockHub(hubId);
  hub.lock = 'locked';
  hub.door = 'closed';
  hub.session = 'idle';
  hub.tamper = false;
  hub.statusLabel = 'Fechadura bloqueada';
  hub.currentSession = null;
  for (const a of alerts) {
    if (a.hubId === hubId && !a.resolved) {
      a.resolved = true;
      a.resolvedAt = new Date().toISOString();
    }
  }
  addEvent(hubId, 'reset', `Demonstração do ${hubId} resetada manualmente`);
  emitChange();
  return publicHub(hub);
}

/** Reseta todos os hubs (e limpa alertas ativos). */
export function resetAll() {
  for (const hubId of hubs.keys()) {
    const hub = hubs.get(hubId);
    clearTimers(hub);
    lockHub(hubId);
    hub.lock = 'locked';
    hub.door = 'closed';
    hub.session = 'idle';
    hub.tamper = false;
    hub.statusLabel = 'Fechadura bloqueada';
    hub.currentSession = null;
  }
  for (const a of alerts) {
    if (!a.resolved) {
      a.resolved = true;
      a.resolvedAt = new Date().toISOString();
    }
  }
  addEvent(null, 'reset', 'Demonstração completa resetada (todos os hubs)');
  emitChange();
}
