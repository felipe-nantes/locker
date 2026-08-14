import 'dotenv/config';

import express from 'express';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import QRCode from 'qrcode';

import * as store from './src/state.js';
import {
  hardwareBus,
  requestStatus,
  startHardware,
  stopHardware,
} from './src/hardware.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3000;
const app = express();

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

function getLanIp() {
  if (process.env.HOST_IP) return process.env.HOST_IP;

  const interfaces = os.networkInterfaces();
  const candidates = [];

  for (const name of Object.keys(interfaces)) {
    for (const network of interfaces[name] || []) {
      if (network.family === 'IPv4' && !network.internal) {
        candidates.push(network.address);
      }
    }
  }

  return (
    candidates.find((address) => address.startsWith('192.168.')) ||
    candidates.find((address) => address.startsWith('10.')) ||
    candidates.find((address) => address.startsWith('172.')) ||
    candidates[0] ||
    'localhost'
  );
}

function baseUrl() {
  return `http://${getLanIp()}:${PORT}`;
}

// ---------------------------------------------------------------------------
// MQTT / hardware
// ---------------------------------------------------------------------------

hardwareBus.on('message', (message) => {
  store.applyHardwareMessage(message);
});

hardwareBus.on('connected', () => {
  for (const hub of store.getState().hubs) {
    requestStatus(hub.id);
  }
});

hardwareBus.on('error', (error) => {
  console.error('[HARDWARE]', error.message);
});

startHardware();

// ---------------------------------------------------------------------------
// Páginas
// ---------------------------------------------------------------------------

app.get('/', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/dashboard', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

app.get('/access/:hubId', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'mobile.html'));
});

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------

app.get('/api/config', (_req, res) => {
  res.json({ lanIp: getLanIp(), port: PORT, baseUrl: baseUrl() });
});

app.get('/api/state', (_req, res) => res.json(store.getState()));

app.get('/api/access-logs', (_req, res) => {
  res.json({ logs: store.getAccessLogs() });
});

app.get('/api/hubs/:hubId', (req, res) => {
  const hub = store.getHub(req.params.hubId);
  if (!hub) return res.status(404).json({ error: 'Hub não encontrado' });
  return res.json(hub);
});

app.get('/qr/:hubId.png', async (req, res) => {
  const hub = store.getHub(req.params.hubId);
  if (!hub) return res.status(404).send('Hub não encontrado');

  const url = `${baseUrl()}/access/${hub.id}`;

  try {
    const buffer = await QRCode.toBuffer(url, {
      type: 'png',
      width: 480,
      margin: 2,
      color: { dark: '#0a100c', light: '#fdfdf9' },
    });

    res.set('Content-Type', 'image/png');
    res.set('Cache-Control', 'no-store');
    return res.send(buffer);
  } catch (error) {
    console.error('[QR]', error);
    return res.status(500).send('Erro ao gerar QR Code');
  }
});

app.post('/api/hubs/:hubId/scan', (req, res) => {
  const hub = store.scanHub(req.params.hubId);
  if (!hub) return res.status(404).json({ error: 'Hub não encontrado' });
  return res.json({ ok: true, hub });
});

app.post('/api/hubs/:hubId/access', (req, res) => {
  const hub = store.getHub(req.params.hubId);
  if (!hub) return res.status(404).json({ error: 'Hub não encontrado' });

  const { name, phone, plate, email, acceptTerms } = req.body || {};
  const errors = {};

  if (!name || !String(name).trim()) errors.name = 'Nome é obrigatório';
  if (!phone || !String(phone).trim()) errors.phone = 'Telefone é obrigatório';
  if (!plate || !String(plate).trim()) errors.plate = 'Placa é obrigatória';
  if (!acceptTerms) errors.acceptTerms = 'É necessário aceitar os termos de uso';

  if (Object.keys(errors).length > 0) {
    return res.status(400).json({ error: 'Formulário incompleto', errors });
  }

  try {
    const result = store.requestAccess(hub.id, {
      name: String(name).trim(),
      phone: String(phone).trim(),
      plate: String(plate).trim().toUpperCase(),
      email: email ? String(email).trim() : null,
    });

    return res.json({
      ok: true,
      hubId: hub.id,
      status: 'command_sent',
      session: result.session,
    });
  } catch (error) {
    const serviceUnavailableCodes = [
      'HUB_OFFLINE',
      'MQTT_OFFLINE',
      'COMMAND_NOT_SENT',
    ];

    const status = error.code === 'ACCESS_IN_PROGRESS'
      ? 409
      : serviceUnavailableCodes.includes(error.code)
        ? 503
        : 500;

    return res.status(status).json({
      error: error.message || 'Erro ao solicitar acesso',
      code: error.code || 'ACCESS_ERROR',
    });
  }
});

// Mantido para a apresentação manual. Os sensores reais também chegam por MQTT.
app.post('/api/hubs/:hubId/tamper', (req, res) => {
  const alert = store.triggerTamper(req.params.hubId);
  if (!alert) return res.status(404).json({ error: 'Hub não encontrado' });
  return res.json({ ok: true, alert });
});

app.post('/api/alerts/:alertId/resolve', (req, res) => {
  const alert = store.resolveAlert(req.params.alertId);
  if (!alert) return res.status(404).json({ error: 'Alerta não encontrado' });
  return res.json({ ok: true, alert });
});

app.post('/api/hubs/:hubId/reset', (req, res) => {
  const hub = store.resetHub(req.params.hubId);
  if (!hub) return res.status(404).json({ error: 'Hub não encontrado' });
  return res.json({ ok: true, hub });
});

app.post('/api/reset-all', (_req, res) => {
  store.resetAll();
  return res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// SSE — tempo real para o dashboard
// ---------------------------------------------------------------------------

app.get('/events', (req, res) => {
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  res.flushHeaders();
  res.write(`data: ${JSON.stringify(store.getState())}\n\n`);

  const onChange = (state) => {
    res.write(`data: ${JSON.stringify(state)}\n\n`);
  };

  store.bus.on('change', onChange);

  const keepAlive = setInterval(() => {
    res.write(': ping\n\n');
  }, 20_000);

  req.on('close', () => {
    clearInterval(keepAlive);
    store.bus.off('change', onChange);
  });
});

const server = app.listen(PORT, '0.0.0.0', () => {
  const ip = getLanIp();

  console.log('\n Nexlock — demonstração no ar');
  console.log(' ---------------------------------------------');
  console.log(` Apresentação (PC): http://localhost:${PORT}/`);
  console.log(` Dashboard (PC): http://localhost:${PORT}/dashboard`);
  console.log(` Dashboard (rede): http://${ip}:${PORT}/dashboard`);
  console.log(` Mobile (exemplo): http://${ip}:${PORT}/access/HUB-001`);
  console.log(' ---------------------------------------------');
  console.log(` IP local detectado: ${ip} (use HOST_IP=... para forçar outro)\n`);
});

function shutdown(signal) {
  console.log(`\n${signal} recebido. Encerrando Nexlock...`);
  stopHardware();
  server.close(() => process.exit(0));

  setTimeout(() => process.exit(1), 5_000).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
