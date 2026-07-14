import { EventEmitter } from 'node:events';
import mqtt from 'mqtt';

export const hardwareBus = new EventEmitter();

let client = null;
let started = false;

function env(name, fallback = '') {
  return String(process.env[name] ?? fallback).trim();
}

function topicRoot() {
  return env('MQTT_TOPIC_ROOT', 'nexlock').replace(/^\/+|\/+$/g, '');
}

function commandTopic(hubId) {
  return `${topicRoot()}/${hubId}/command`;
}

function parseIncomingTopic(topic) {
  const prefix = `${topicRoot()}/`;
  if (!topic.startsWith(prefix)) return null;

  const parts = topic.slice(prefix.length).split('/');
  if (parts.length !== 2) return null;

  const [hubId, channel] = parts;
  if (!hubId || !['state', 'event', 'availability'].includes(channel)) {
    return null;
  }

  return { hubId, channel };
}

function parsePayload(buffer) {
  const text = buffer.toString('utf8');

  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

export function startHardware() {
  if (started) return client;
  started = true;

  const url = env('MQTT_URL');
  const username = env('MQTT_USERNAME');
  const password = env('MQTT_PASSWORD');

  if (!url) {
    console.error('[MQTT] MQTT_URL não foi configurada no arquivo .env');
    hardwareBus.emit('configurationError', {
      message: 'MQTT_URL ausente',
    });
    return null;
  }

  const configuredClientId = env('MQTT_CLIENT_ID', 'nexlock-backend-demo');

  client = mqtt.connect(url, {
    clientId: `${configuredClientId}-${process.pid}`,
    username: username || undefined,
    password: password || undefined,
    clean: true,
    keepalive: 30,
    connectTimeout: 15_000,
    reconnectPeriod: 3_000,
    rejectUnauthorized: true,
  });

  client.on('connect', () => {
    console.log(`[MQTT] Backend conectado em ${url}`);

    const subscriptions = [
      `${topicRoot()}/+/state`,
      `${topicRoot()}/+/event`,
      `${topicRoot()}/+/availability`,
    ];

    client.subscribe(subscriptions, { qos: 1 }, (error, granted) => {
      if (error) {
        console.error('[MQTT] Falha ao assinar tópicos:', error.message);
        hardwareBus.emit('error', error);
        return;
      }

      console.log(
        '[MQTT] Tópicos assinados:',
        granted.map((item) => item.topic).join(', '),
      );

      hardwareBus.emit('connected');
    });
  });

  client.on('reconnect', () => {
    console.log('[MQTT] Tentando reconectar...');
  });

  client.on('offline', () => {
    console.warn('[MQTT] Backend MQTT offline');
    hardwareBus.emit('offline');
  });

  client.on('close', () => {
    hardwareBus.emit('disconnected');
  });

  client.on('error', (error) => {
    console.error('[MQTT] Erro:', error.message);
    hardwareBus.emit('error', error);
  });

  client.on('message', (topic, buffer) => {
    const parsedTopic = parseIncomingTopic(topic);
    if (!parsedTopic) return;

    hardwareBus.emit('message', {
      ...parsedTopic,
      topic,
      data: parsePayload(buffer),
      receivedAt: new Date().toISOString(),
    });
  });

  return client;
}

export function stopHardware() {
  if (!client) return;

  client.end(true);
  client = null;
  started = false;
}

export function isHardwareConnected() {
  return Boolean(client?.connected);
}

function publishCommand(hubId, command) {
  if (!client?.connected) {
    console.error(`[MQTT] Comando não enviado para ${hubId}: backend desconectado`);
    return false;
  }

  const payload = JSON.stringify({
    ...command,
    sentAt: new Date().toISOString(),
  });

  client.publish(commandTopic(hubId), payload, {
    qos: 1,
    retain: false,
  });

  console.log(`[MQTT] ${commandTopic(hubId)} <- ${payload}`);
  return true;
}

export function unlockHub(hubId, sessionId, durationMs = 5000) {
  return publishCommand(hubId, {
    type: 'unlock',
    sessionId,
    durationMs,
  });
}

export function lockHub(hubId, reason = 'backend_command') {
  return publishCommand(hubId, {
    type: 'lock',
    reason,
  });
}

export function requestStatus(hubId) {
  return publishCommand(hubId, {
    type: 'status',
  });
}
