# Nexlock — Hub Modular Inteligente para Proteção de Carregadores Elétricos

Protótipo demonstrativo (V0) da camada **física + digital** de segurança para eletropostos:
autenticação por **QR Code**, envio de credenciais pelo celular, **dashboard em tempo real**,
**alertas de violação** e simulação da liberação da fechadura eletromecânica.

O PC roda a apresentação e o painel do operador; o celular escaneia o QR Code, preenche as
credenciais e o dashboard mostra o **ciclo completo de acesso** — da liberação até o
re-bloqueio automático — sem hardware nesta fase.

---

## Páginas da demo

| URL | O que é |
| --- | --- |
| `/` | Página de apresentação (pitch): problema, solução, como funciona, modelo de negócio e roadmap |
| `/dashboard` | Painel do operador: KPIs, hubs, alertas de segurança, solicitações e histórico de eventos |
| `/access/HUB-001` | Página mobile aberta pelo QR Code (formulário de credenciais) |

## Requisitos

- [Node.js](https://nodejs.org) 18 ou superior (testado com Node 24)
- PC e celular conectados na **mesma rede Wi-Fi**

## Como rodar

```bash
npm install
npm start
```

O terminal mostra algo assim:

```
  Nexlock — demonstração no ar
  ---------------------------------------------
  Apresentação (PC):  http://localhost:3000/
  Dashboard (PC):     http://localhost:3000/dashboard
  Dashboard (rede):   http://192.168.0.10:3000/dashboard
  Mobile (exemplo):   http://192.168.0.10:3000/access/HUB-001
  ---------------------------------------------
  IP local detectado: 192.168.0.10
```

## Roteiro sugerido para a apresentação

1. **Abra `http://localhost:3000/`** — apresente o problema e a proposta de valor com a página de pitch.
2. Clique em **"Ver demonstração ao vivo"** → abre o painel do operador.
3. Mostre os **KPIs** (hubs monitorados, online, acessos, alertas) e os 3 hubs em locais diferentes.
4. **Escaneie o QR Code** do HUB-001 com o celular (clique no QR para ampliar).
5. No celular: preencha **nome, telefone e placa**, aceite os termos e toque em **Solicitar acesso**.
6. No dashboard, acompanhe em tempo real o **ciclo completo**:
   *Acesso autorizado → Fechadura liberada → Porta aberta → Sessão ativa → Porta fechada → Fechadura bloqueada (re-bloqueio automático)*.
7. Mostre a **rastreabilidade**: a solicitação com os dados do usuário e o histórico de eventos.
8. Clique em **"Simular violação"** em um hub → alerta vermelho pulsante, KPI de alertas sobe,
   evento registrado. Clique em **"Resolver"** no painel de alertas para encerrar.
9. Feche com o **roadmap** na página de apresentação (V0 hoje → V1 bancada → ... → V4 comercial).

## Como descobrir o IP local do PC

O servidor **detecta o IP automaticamente** e já monta o QR Code com ele.
Se precisar conferir ou forçar manualmente:

**Windows** — abra o Prompt de Comando e rode:

```
ipconfig
```

Procure o adaptador de **Wi-Fi** e o campo **"Endereço IPv4"** (ex.: `192.168.0.10`).

Para forçar um IP específico (se o PC tiver várias interfaces de rede):

```bash
# PowerShell
$env:HOST_IP = "192.168.0.10"; npm start
```

Para trocar a porta: `$env:PORT = "8080"; npm start`

### Celular não abre a página?

- Confirme que PC e celular estão na **mesma rede Wi-Fi** (redes de visitante geralmente isolam os aparelhos).
- Na primeira execução, o Windows pergunta sobre o **Firewall** — clique em **Permitir acesso** (rede privada).
  Se não perguntou, libere a porta 3000 manualmente em *Firewall do Windows → Regras de Entrada*.

---

## Estrutura do projeto

```
tranca_tudo/
├── server.js            # Servidor Express: rotas, SSE, QR Code, detecção de IP
├── src/
│   ├── state.js         # Estado em memória + máquina de estados + alertas
│   └── hardware.js      # Camada de abstração de hardware (unlockHub/lockHub)
├── public/
│   ├── styles.css       # Design system "Vault Glass" (glassmorphism, verde-carvão + latão)
│   ├── fonts/           # Fontes locais (woff2) — a demo funciona 100% offline
│   ├── index.html       # Página de apresentação (pitch)
│   ├── dashboard.html   # Painel do operador (PC)
│   ├── dashboard.js
│   ├── mobile.html      # Página aberta pelo QR Code (celular)
│   └── mobile.js
└── package.json
```

## Fluxo da demonstração

```
Celular escaneia QR ──▶ /access/HUB-001 ──▶ formulário de credenciais
        │                                          │ POST /api/hubs/HUB-001/access
        ▼                                          ▼
  evento "scan"                        validação → unlockHub(hubId, sessionId)
        │                                          │
        └────────────▶  SSE /events  ◀─────────────┘
                             │
                             ▼
   Dashboard: Bloqueada → Acesso autorizado → Fechadura liberada
              → (3s) Porta aberta → (4s) Sessão ativa
              → (9s) Porta fechada → (2,5s) Fechadura bloqueada (auto)
```

## Segurança conceitual simulada

- Cada QR Code pertence a um hub específico (`/access/:hubId`)
- Cada solicitação gera uma **sessão de acesso** com UUID, data e hora
- A fechadura **só** libera após envio de credenciais válidas
- Ao final do ciclo, a fechadura **re-bloqueia automaticamente** (fail-secure conceitual)
- Sensores simulados de **tamper/vibração** geram alertas que exigem ação do operador
- Validação no **cliente e no servidor**: nome, telefone, placa e aceite dos termos são obrigatórios
- Todos os eventos ficam registrados no histórico do dashboard

## Integração futura com hardware real

A liberação da fechadura está isolada em [`src/hardware.js`](src/hardware.js), na função:

```js
unlockHub(hubId, sessionId)
```

Hoje ela apenas registra o comando; no futuro, **somente esse arquivo** precisa mudar
para enviar o comando a uma controladora IoT real (ESP32 + relé + fechadura
eletromecânica fail-secure), por exemplo via MQTT:

```js
client.publish(`nexlock/${hubId}/lock`, JSON.stringify({ cmd: 'unlock', sessionId }));
```
