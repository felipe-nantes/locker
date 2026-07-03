/**
 * ChargeShield Hub — servidor da demonstração.
 * -------------------------------------------------------------
 * Um único processo Node/Express que serve:
 *   • /dashboard        → painel do operador (PC)
 *   • /access/:hubId    → página mobile (celular, aberta pelo QR Code)
 *   • /events           → stream SSE (tempo real para o dashboard)
 *   • /qr/:hubId.png    → imagem do QR Code (aponta para o IP local)
 *   • /api/*            → API REST (estado, acesso, reset)
 *
 * Roda em toda a rede local (0.0.0.0), então o celular acessa pelo IP do PC.
 */
import express from 'express';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import QRCode from 'qrcode';
import * as store from './src/state.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3000;

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

/** Descobre o IP local (LAN) do PC para montar as URLs do QR Code. */
function getLanIp() {
  if (process.env.HOST_IP) return process.env.HOST_IP; // permite forçar manualmente
  const ifaces = os.networkInterfaces();
  const candidates = [];
  for (const name of Object.keys(ifaces)) {
    for (const net of ifaces[name] || []) {
      if (net.family === 'IPv4' && !net.internal) candidates.push(net.address);
    }
  }
  // Prioriza faixas privadas comuns (Wi-Fi doméstico costuma ser 192.168.x).
  return (
    candidates.find((a) => a.startsWith('192.168.')) ||
    candidates.find((a) => a.startsWith('10.')) ||
    candidates.find((a) => a.startsWith('172.')) ||
    candidates[0] ||
    'localhost'
  );
}

function baseUrl() {
  return `http://${getLanIp()}:${PORT}`;
}

// ---------------------------------------------------------------------------
// Páginas
// ---------------------------------------------------------------------------
app.get('/', (_req, res) => res.redirect('/dashboard'));

app.get('/dashboard', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

app.get('/access/:hubId', (_req, res) => {
  // A página lê o hubId a partir da própria URL (no cliente).
  res.sendFile(path.join(__dirname, 'public', 'mobile.html'));
});

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------
app.get('/api/config', (_req, res) => {
  res.json({ lanIp: getLanIp(), port: PORT, baseUrl: baseUrl() });
});

app.get('/api/state', (_req, res) => res.json(store.getState()));

app.get('/api/hubs/:hubId', (req, res) => {
  const hub = store.getHub(req.params.hubId);
  if (!hub) return res.status(404).json({ error: 'Hub não encontrado' });
  const { _timers, ...pub } = hub;
  res.json(pub);
});

// QR Code (PNG) apontando para a URL mobile do hub, usando o IP local.
app.get('/qr/:hubId.png', async (req, res) => {
  const hub = store.getHub(req.params.hubId);
  if (!hub) return res.status(404).send('Hub não encontrado');
  const url = `${baseUrl()}/access/${hub.id}`;
  try {
    const buf = await QRCode.toBuffer(url, {
      type: 'png',
      width: 480,
      margin: 2,
      color: { dark: '#0b1220', light: '#ffffff' },
    });
    res.set('Content-Type', 'image/png');
    res.set('Cache-Control', 'no-store');
    res.send(buf);
  } catch (err) {
    res.status(500).send('Erro ao gerar QR Code');
  }
});

// Registra o escaneamento do QR (a página mobile chama ao carregar).
app.post('/api/hubs/:hubId/scan', (req, res) => {
  const hub = store.scanHub(req.params.hubId);
  if (!hub) return res.status(404).json({ error: 'Hub não encontrado' });
  res.json({ ok: true, hub });
});

// Recebe as credenciais e libera o acesso (com validação server-side).
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

  const result = store.requestAccess(hub.id, {
    name: String(name).trim(),
    phone: String(phone).trim(),
    plate: String(plate).trim().toUpperCase(),
    email: email ? String(email).trim() : null,
  });

  res.json({ ok: true, hubId: hub.id, session: result.session });
});

app.post('/api/hubs/:hubId/reset', (req, res) => {
  const hub = store.resetHub(req.params.hubId);
  if (!hub) return res.status(404).json({ error: 'Hub não encontrado' });
  res.json({ ok: true, hub });
});

app.post('/api/reset-all', (_req, res) => {
  store.resetAll();
  res.json({ ok: true });
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

  // Envia o estado atual imediatamente ao conectar.
  res.write(`data: ${JSON.stringify(store.getState())}\n\n`);

  const onChange = (state) => res.write(`data: ${JSON.stringify(state)}\n\n`);
  store.bus.on('change', onChange);

  // Ping periódico para manter a conexão viva.
  const keepAlive = setInterval(() => res.write(': ping\n\n'), 20000);

  req.on('close', () => {
    clearInterval(keepAlive);
    store.bus.off('change', onChange);
  });
});

// ---------------------------------------------------------------------------
app.listen(PORT, '0.0.0.0', () => {
  const ip = getLanIp();
  console.log('\n  ChargeShield Hub — demonstração no ar');
  console.log('  ---------------------------------------------');
  console.log(`  Dashboard (PC):     http://localhost:${PORT}/dashboard`);
  console.log(`  Dashboard (rede):   http://${ip}:${PORT}/dashboard`);
  console.log(`  Mobile (exemplo):   http://${ip}:${PORT}/access/HUB-001`);
  console.log('  ---------------------------------------------');
  console.log(`  IP local detectado: ${ip}  (use HOST_IP=... para forçar outro)\n`);
});
