\# Nexlock — Hub Modular Inteligente para Proteção de Carregadores Elétricos



Protótipo demonstrativo da camada \*\*física + digital\*\* de segurança para eletropostos, com autenticação por \*\*QR Code\*\*, envio de credenciais pelo celular, \*\*dashboard em tempo real\*\*, integração com \*\*ESP32 via MQTT\*\*, alertas de violação e controle de liberação da fechadura eletromecânica.



O projeto foi desenvolvido para demonstrar o ciclo completo de acesso ao hub:



```text

Cliente escaneia o QR Code

→ acessa a página mobile

→ informa nome, telefone e placa

→ solicitação aparece no dashboard

→ operador autoriza a abertura

→ backend envia comando MQTT

→ ESP32 recebe o comando

→ relé libera a fechadura

→ sensores monitoram porta, tamper e vibração

→ ESP32 envia eventos de volta ao backend

→ dashboard atualiza tudo em tempo real

```



A demonstração pode funcionar inicialmente com um \*\*ESP32 virtual no Wokwi\*\* e depois ser migrada para um \*\*ESP32 físico\*\*, mantendo o mesmo protocolo de comunicação e reduzindo a necessidade de alterações no backend.



\---



\## Páginas da demo



| URL               | O que é                                                                                          |

| ----------------- | ------------------------------------------------------------------------------------------------ |

| `/`               | Página de apresentação do projeto: problema, solução, funcionamento, modelo de negócio e roadmap |

| `/dashboard`      | Painel do operador: KPIs, hubs, alertas, solicitações e histórico de eventos                     |

| `/access/HUB-001` | Página mobile aberta pelo QR Code para envio das credenciais do usuário                          |



\---



\## Requisitos



\* \[Node.js](https://nodejs.org) 18 ou superior

\* NPM

\* Broker MQTT configurado, como HiveMQ Cloud

\* PC e celular conectados na mesma rede Wi-Fi para acessar a página mobile pelo QR Code

\* ESP32 virtual no Wokwi ou ESP32 físico com firmware compatível



\---



\## Instalação



Clone o repositório:



```bash

git clone https://github.com/felipe-nantes/locker.git

cd locker

```



Instale as dependências:



```bash

npm install

```



Crie um arquivo `.env` na raiz do projeto com as configurações do servidor e do broker MQTT:



```env

PORT=3000



MQTT\_URL=mqtts://SEU\_HOST\_HIVEMQ:8883

MQTT\_USERNAME=SEU\_USUARIO

MQTT\_PASSWORD=SUA\_SENHA

MQTT\_TOPIC\_ROOT=nexlock

MQTT\_CLIENT\_ID=nexlock-backend-demo

HUB\_OFFLINE\_GRACE\_MS=15000

```



> O arquivo `.env` não deve ser enviado para o GitHub, pois contém credenciais privadas.



Inicie o servidor:



```bash

npm start

```



O terminal deve mostrar os endereços da demonstração, por exemplo:



```text

Nexlock — demonstração no ar

\---------------------------------------------

Apresentação (PC):  http://localhost:3000/

Dashboard (PC):     http://localhost:3000/dashboard

Dashboard (rede):   http://192.168.0.10:3000/dashboard

Mobile (exemplo):   http://192.168.0.10:3000/access/HUB-001

\---------------------------------------------

IP local detectado: 192.168.0.10

```



\---



\## Como acessar pelo celular



O celular precisa estar na mesma rede Wi-Fi do notebook que está rodando o servidor.



O endereço no celular não deve usar `localhost`, pois `localhost` no celular aponta para o próprio celular, e não para o notebook.



Use o IP local do notebook:



```text

http://192.168.0.10:3000/access/HUB-001

```



Para descobrir o IP local no Windows, rode:



```bash

ipconfig

```



Procure o campo:



```text

Endereço IPv4

```



Exemplo:



```text

192.168.0.10

```



Se o PC tiver várias interfaces de rede, é possível forçar manualmente o IP usado pelo servidor:



```powershell

$env:HOST\_IP = "192.168.0.10"; npm start

```



Para trocar a porta:



```powershell

$env:PORT = "8080"; npm start

```



\---



\## Celular não abre a página?



Verifique:



\* se PC e celular estão na mesma rede Wi-Fi;

\* se a rede não é uma rede de visitantes com isolamento entre dispositivos;

\* se o Windows Firewall permitiu o acesso do Node.js;

\* se a porta configurada está liberada;

\* se o IP usado no QR Code é o IP correto do notebook.



Na primeira execução, o Windows pode perguntar sobre o firewall. Se aparecer, permita o acesso em rede privada.



\---



\## Estrutura do projeto



```text

locker/

├── server.js            # Servidor Express: rotas, SSE, QR Code, detecção de IP e inicialização MQTT

├── src/

│   ├── state.js         # Estado em memória, sessões, eventos, alertas e atualização dos hubs

│   └── hardware.js      # Camada de comunicação MQTT com ESP32 virtual ou físico

├── public/

│   ├── styles.css       # Design system da demonstração

│   ├── fonts/           # Fontes locais

│   ├── index.html       # Página de apresentação

│   ├── dashboard.html   # Painel do operador

│   ├── dashboard.js     # Lógica do dashboard e eventos em tempo real

│   ├── mobile.html      # Página aberta pelo QR Code

│   └── mobile.js        # Lógica da página mobile

├── package.json

├── package-lock.json

├── .gitignore

└── README.md

```



\---



\## Fluxo geral da demonstração



```text

Celular escaneia QR Code

&#x20;       │

&#x20;       ▼

/access/HUB-001

&#x20;       │

&#x20;       ▼

Formulário de credenciais

&#x20;       │

&#x20;       ▼

POST /api/hubs/HUB-001/access

&#x20;       │

&#x20;       ▼

Backend cria sessão de acesso

&#x20;       │

&#x20;       ▼

Dashboard mostra a solicitação

&#x20;       │

&#x20;       ▼

Operador autoriza

&#x20;       │

&#x20;       ▼

Backend publica comando MQTT

&#x20;       │

&#x20;       ▼

Broker MQTT entrega comando ao ESP32

&#x20;       │

&#x20;       ▼

ESP32 aciona relé e libera fechadura

&#x20;       │

&#x20;       ▼

ESP32 publica eventos e estado

&#x20;       │

&#x20;       ▼

Backend recebe mensagens MQTT

&#x20;       │

&#x20;       ▼

Dashboard atualiza em tempo real via SSE

```



\---



\## Integração com ESP32 via MQTT



Nesta versão, o webapp foi preparado para se comunicar com um ESP32 usando MQTT.



A ideia é que o sistema funcione primeiro com um ESP32 virtual no Wokwi e, depois, com o ESP32 físico usando o mesmo padrão de comunicação.



O backend não se conecta diretamente ao IP do ESP32. Em vez disso, backend e ESP32 se conectam ao mesmo broker MQTT.



```text

Backend → Broker MQTT → ESP32

ESP32 → Broker MQTT → Backend/Dashboard

```



Essa arquitetura facilita a migração para hardware real e também permite que, no futuro, múltiplos hubs sejam conectados ao mesmo sistema.



\---



\## Papel do broker MQTT



O broker MQTT funciona como uma central de mensagens.



O backend publica comandos em tópicos específicos. O ESP32 fica inscrito nesses tópicos e recebe os comandos. Depois, o ESP32 publica estados e eventos em outros tópicos, e o backend os recebe para atualizar o dashboard.



Exemplo:



```text

Backend publica:

nexlock/HUB-001/command



ESP32 recebe:

comando para abrir a fechadura



ESP32 publica:

nexlock/HUB-001/event

nexlock/HUB-001/state



Backend recebe:

eventos e estado atual do hub

```



Na demonstração, foi utilizado um broker MQTT em nuvem, como o HiveMQ Cloud, para permitir que tanto o notebook quanto o ESP32 virtual do Wokwi consigam se comunicar pela internet.



\---



\## Tópicos MQTT utilizados



Para o hub `HUB-001`, os tópicos seguem o padrão:



```text

nexlock/HUB-001/command

nexlock/HUB-001/state

nexlock/HUB-001/event

nexlock/HUB-001/availability

```



\---



\### Comandos



O backend publica comandos em:



```text

nexlock/HUB-001/command

```



Exemplo de comando para liberar a fechadura:



```json

{

&#x20; "type": "unlock",

&#x20; "sessionId": "id-da-sessao",

&#x20; "durationMs": 5000,

&#x20; "sentAt": "2026-07-14T15:00:00.000Z"

}

```



Exemplo de comando para solicitar status:



```json

{

&#x20; "type": "status"

}

```



Exemplo de comando para travar:



```json

{

&#x20; "type": "lock"

}

```



\---



\### Estado atual do hub



O ESP32 publica o estado atual em:



```text

nexlock/HUB-001/state

```



Exemplo:



```json

{

&#x20; "hubId": "HUB-001",

&#x20; "lock": "locked",

&#x20; "door": "closed",

&#x20; "tamper": false,

&#x20; "vibration": false,

&#x20; "sessionId": null,

&#x20; "uptimeMs": 15000

}

```



Campos principais:



| Campo       | Significado                                 |

| ----------- | ------------------------------------------- |

| `hubId`     | Identificador do hub                        |

| `lock`      | Estado da fechadura: `locked` ou `unlocked` |

| `door`      | Estado da porta: `closed` ou `open`         |

| `tamper`    | Indica violação da caixa                    |

| `vibration` | Indica vibração ou impacto                  |

| `sessionId` | Sessão de acesso associada, quando houver   |

| `uptimeMs`  | Tempo de execução do ESP32 em milissegundos |



\---



\### Eventos físicos



Eventos do ESP32 são publicados em:



```text

nexlock/HUB-001/event

```



Exemplo de fechadura liberada:



```json

{

&#x20; "type": "lock\_unlocked",

&#x20; "hubId": "HUB-001",

&#x20; "sessionId": "id-da-sessao",

&#x20; "reason": "access\_authorized",

&#x20; "lock": "unlocked",

&#x20; "door": "closed",

&#x20; "tamper": false,

&#x20; "vibration": false

}

```



Exemplo de travamento automático:



```json

{

&#x20; "type": "lock\_locked",

&#x20; "hubId": "HUB-001",

&#x20; "sessionId": "id-da-sessao",

&#x20; "reason": "automatic\_timeout",

&#x20; "lock": "locked"

}

```



Exemplo de porta aberta:



```json

{

&#x20; "type": "door\_opened",

&#x20; "hubId": "HUB-001"

}

```



Exemplo de porta fechada:



```json

{

&#x20; "type": "door\_closed",

&#x20; "hubId": "HUB-001"

}

```



Exemplo de tamper detectado:



```json

{

&#x20; "type": "tamper\_detected",

&#x20; "hubId": "HUB-001",

&#x20; "alert": true

}

```



Exemplo de vibração detectada:



```json

{

&#x20; "type": "vibration\_detected",

&#x20; "hubId": "HUB-001",

&#x20; "alert": true

}

```



\---



\### Disponibilidade



A disponibilidade do hub é publicada em:



```text

nexlock/HUB-001/availability

```



Exemplo de hub online:



```json

{

&#x20; "online": true,

&#x20; "hubId": "HUB-001"

}

```



Exemplo de hub offline:



```json

{

&#x20; "online": false,

&#x20; "hubId": "HUB-001"

}

```



O ESP32 pode usar o recurso de Last Will do MQTT para que o broker publique automaticamente uma mensagem de offline caso o dispositivo perca a conexão inesperadamente.



O backend também possui uma tolerância configurável para pequenas quedas de conexão:



```env

HUB\_OFFLINE\_GRACE\_MS=15000

```



Isso evita que o dashboard fique alternando entre online e offline em reconexões rápidas.



\---



\## ESP32 virtual no Wokwi



Durante a fase de desenvolvimento, o ESP32 pode ser simulado no Wokwi.



No Wokwi, o circuito representa:



| Componente real     | Representação na simulação |

| ------------------- | -------------------------- |

| ESP32 DevKit        | ESP32 DevKit virtual       |

| Relé                | Relay Module               |

| Fechadura solenoide | LEDs de travada/liberada   |

| Sensor de porta     | Slide switch               |

| Tamper              | Pushbutton                 |

| Sensor de vibração  | Pushbutton                 |

| Alerta sonoro       | Buzzer                     |



O ESP32 virtual se conecta ao Wi-Fi do Wokwi e ao broker MQTT configurado.



O backend e o dashboard não precisam saber se o dispositivo é virtual ou físico. Eles apenas recebem mensagens MQTT e atualizam o estado do hub.



\---



\## ESP32 físico



Quando os componentes físicos forem comprados, o ESP32 real deverá usar o mesmo protocolo MQTT e os mesmos tópicos.



A principal mudança será no firmware:



```cpp

// No Wokwi:

WIFI\_SSID = "Wokwi-GUEST"



// No ESP32 físico:

WIFI\_SSID = "Nome da rede real"

WIFI\_PASSWORD = "Senha da rede real"

```



O fluxo continuará o mesmo:



```text

Backend publica comando MQTT

→ ESP32 recebe comando

→ ESP32 aciona relé

→ fechadura libera

→ sensores detectam eventos

→ ESP32 publica estado/eventos

→ dashboard atualiza

```



Assim, o webapp não precisa ser refeito ao trocar o ESP32 virtual pelo físico.



\---



\## Funcionamento físico esperado



Na bancada, o sistema deverá funcionar assim:



```text

Notebook

→ roda o webapp, backend e dashboard



Celular

→ escaneia o QR Code e envia credenciais



Broker MQTT

→ intermedia as mensagens entre backend e ESP32



ESP32

→ recebe comandos MQTT

→ controla o relé

→ lê sensores

→ publica eventos



Relé

→ chaveia a alimentação da fechadura



Fonte 12 V

→ alimenta a fechadura



Fechadura

→ libera ou bloqueia o compartimento protegido

```



O ESP32 não deve alimentar a fechadura diretamente. Ele apenas envia o sinal de controle para o relé.



A fechadura deve ser alimentada por uma fonte externa de 12 V.



\---



\## Sensores previstos



| Sensor                    | Função                                             |

| ------------------------- | -------------------------------------------------- |

| Sensor magnético de porta | Detectar se a porta está aberta ou fechada         |

| Micro switch de tamper    | Detectar abertura indevida da caixa eletrônica     |

| Sensor de vibração SW-420 | Detectar impacto, pancada ou tentativa de violação |

| Buzzer                    | Emitir alerta sonoro em caso de violação           |

| LEDs                      | Indicar visualmente o estado da fechadura          |



\---



\## Segurança conceitual



\* Cada QR Code pertence a um hub específico.

\* Cada solicitação gera uma sessão de acesso com UUID, data e hora.

\* A fechadura só libera após envio de credenciais válidas e autorização.

\* O ESP32 confirma a liberação antes do dashboard atualizar o estado.

\* Ao final do tempo configurado, a fechadura trava automaticamente.

\* Eventos de porta, tamper e vibração são enviados pelo ESP32 ao backend.

\* O dashboard registra histórico de eventos.

\* O hub pode ser marcado como online ou offline com base na conexão MQTT.

\* As credenciais reais do broker não ficam no repositório.



\---



\## Roteiro sugerido para apresentação



1\. Abra a página inicial:



```text

http://localhost:3000/

```



2\. Apresente o problema e a proposta de valor.



3\. Clique em \*\*Ver demonstração ao vivo\*\* para abrir o dashboard.



4\. Mostre os KPIs, hubs, alertas e histórico de eventos.



5\. Escaneie o QR Code do `HUB-001` com o celular.



6\. No celular, preencha:



```text

Nome

Telefone

Placa

Aceite dos termos

```



7\. Envie a solicitação.



8\. No dashboard, acompanhe a solicitação recebida.



9\. Autorize a abertura.



10\. Mostre o ESP32 recebendo o comando MQTT.



11\. Mostre a fechadura sendo liberada.



12\. Acione o sensor de porta.



13\. Mostre o evento de porta aberta no dashboard.



14\. Aguarde o travamento automático.



15\. Acione o tamper ou sensor de vibração.



16\. Mostre o alerta no dashboard.



17\. Explique que a mesma lógica será usada no ESP32 físico.



\---



\## Diferença entre demo e produto final



Na demo:



```text

Notebook roda o backend e dashboard

ESP32 pode ser virtual no Wokwi

Broker MQTT fica na nuvem

Fechadura pode ser simulada ou de bancada

```



No produto final:



```text

Backend deverá rodar em servidor ou nuvem

ESP32/controladora ficará instalada no hub físico

Fechadura e sensores serão reais

Dashboard poderá ser remoto

Logs deverão ser persistidos em banco de dados

Comunicação deverá usar credenciais seguras por dispositivo

```



\---



\## Melhorias implementadas nesta etapa



\* Integração do backend com broker MQTT.

\* Criação de camada de comunicação com hardware em `src/hardware.js`.

\* Atualização dos estados do hub a partir de mensagens reais do ESP32.

\* Remoção da simulação automática baseada apenas em temporizadores internos.

\* Suporte a eventos de fechadura, porta, tamper, vibração e disponibilidade.

\* Tolerância para reconexões rápidas do hub.

\* Preparação para alternar entre ESP32 virtual e ESP32 físico.

\* Manutenção do fluxo de QR Code, formulário mobile e dashboard em tempo real.

\* Estrutura mais próxima de uma aplicação IoT real.



\---



\## Observações importantes



\* Não commitar o arquivo `.env`.

\* Não colocar usuário e senha reais do broker no README.

\* Não alimentar a fechadura diretamente pelo ESP32.

\* Usar fonte externa adequada para a fechadura.

\* Usar relé ou driver apropriado para chavear a carga.

\* Validar a polaridade da fechadura e da fonte antes de energizar.

\* Testar primeiro em bancada antes de instalar em um ambiente real.

\* Para produção, será necessário revisar segurança elétrica, caixa, conectores, proteção, autenticação e logs persistentes.



\---



\## Tecnologias utilizadas



\* Node.js

\* Express

\* Server-Sent Events

\* MQTT

\* ESP32

\* Wokwi

\* HTML

\* CSS

\* JavaScript



\---



\## Comandos úteis



Instalar dependências:



```bash

npm install

```



Rodar o servidor:



```bash

npm start

```



Rodar em outra porta:



```powershell

$env:PORT = "8080"; npm start

```



Forçar IP local:



```powershell

$env:HOST\_IP = "192.168.0.10"; npm start

```



Verificar alterações no Git:



```bash

git status

```



Criar commit:



```bash

git add README.md

git commit -m "docs: atualiza README com integração MQTT e ESP32"

```



Enviar branch:



```bash

git push

```



\---



\## Status do projeto



A versão atual representa uma demonstração funcional do fluxo completo:



```text

QR Code

→ formulário mobile

→ dashboard

→ backend

→ MQTT

→ ESP32 virtual ou físico

→ relé/fechadura

→ sensores

→ eventos em tempo real

```



O próximo passo natural é montar a bancada física com ESP32, relé, fonte 12 V, fechadura solenoide e sensores, reaproveitando o mesmo contrato MQTT já validado na simulação.



