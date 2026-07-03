# ChargeShield Hub — Demonstração de Controle de Acesso

Protótipo demonstrativo de autenticação por **QR Code** para liberação segura de um
hub modular de proteção de carregadores de veículos elétricos.

O PC roda o painel do operador; o celular escaneia o QR Code, preenche as credenciais
e o dashboard mostra a liberação da fechadura **em tempo real** (simulação visual —
sem hardware nesta fase).

---

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
  ChargeShield Hub — demonstração no ar
  ---------------------------------------------
  Dashboard (PC):     http://localhost:3000/dashboard
  Dashboard (rede):   http://192.168.0.10:3000/dashboard
  Mobile (exemplo):   http://192.168.0.10:3000/access/HUB-001
  ---------------------------------------------
  IP local detectado: 192.168.0.10
```

1. Abra o **dashboard** no PC: `http://localhost:3000/dashboard`
2. Escaneie o **QR Code** de um hub com a câmera do celular
3. Preencha nome, telefone e placa, aceite os termos e toque em **Solicitar acesso**
4. Veja o dashboard mudar em tempo real: *Fechadura liberada → Porta aberta → Sessão ativa*
5. Use **Resetar demonstração** para repetir o fluxo

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
│   ├── state.js         # Estado em memória + máquina de estados da fechadura
│   └── hardware.js      # Camada de abstração de hardware (unlockHub/lockHub)
├── public/
│   ├── styles.css       # Design system (dark, segurança/IoT)
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
                 → (3s) Porta aberta → (4s) Sessão de acesso ativa
```

## Segurança conceitual simulada

- Cada QR Code pertence a um hub específico (`/access/:hubId`)
- Cada solicitação gera uma **sessão de acesso** com UUID, data e hora
- A fechadura **só** libera após envio de credenciais válidas
- Validação no **cliente e no servidor**: nome, telefone, placa e aceite dos termos são obrigatórios
- Todos os eventos ficam registrados no histórico do dashboard

## Integração futura com hardware real

A liberação da fechadura está isolada em [`src/hardware.js`](src/hardware.js), na função:

```js
unlockHub(hubId, sessionId)
```

Hoje ela apenas registra o comando; no futuro, **somente esse arquivo** precisa mudar
para enviar o comando a uma controladora IoT real (ESP32 + relé + fechadura
eletromecânica), por exemplo via MQTT:

```js
client.publish(`chargeshield/${hubId}/lock`, JSON.stringify({ cmd: 'unlock', sessionId }));
```
