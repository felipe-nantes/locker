/**
 * Camada de abstração de HARDWARE (fechadura).
 * -------------------------------------------------------------
 * No protótipo atual estas funções apenas registram no console — a mudança
 * de estado visual é feita pela máquina de estados em `state.js`.
 *
 * No futuro, ESTE é o único arquivo que precisa mudar para integrar hardware
 * real (ESP32 + relé + fechadura eletromecânica), por exemplo via MQTT:
 *
 *   import mqtt from 'mqtt';
 *   const client = mqtt.connect('mqtt://192.168.0.50:1883');
 *   export function unlockHub(hubId, sessionId) {
 *     client.publish(`chargeshield/${hubId}/lock`,
 *       JSON.stringify({ cmd: 'unlock', sessionId }));
 *   }
 *
 * A assinatura conceitual pedida — unlockHub(hubId, sessionId) — é mantida.
 */

/**
 * Envia o comando de LIBERAÇÃO da fechadura para o hub.
 * @param {string} hubId    Identificador do hub (ex.: "HUB-001")
 * @param {string} sessionId Identificador da sessão de acesso
 * @returns {boolean} true se o comando foi despachado
 */
export function unlockHub(hubId, sessionId) {
  console.log(`[HARDWARE] unlockHub(${hubId}, ${sessionId}) → LIBERAR fechadura`);
  // TODO (produção): enviar comando real ao dispositivo IoT aqui.
  return true;
}

/**
 * Envia o comando de BLOQUEIO da fechadura (usado no reset).
 * @param {string} hubId Identificador do hub
 * @returns {boolean} true se o comando foi despachado
 */
export function lockHub(hubId) {
  console.log(`[HARDWARE] lockHub(${hubId}) → BLOQUEAR fechadura`);
  // TODO (produção): enviar comando real ao dispositivo IoT aqui.
  return true;
}
