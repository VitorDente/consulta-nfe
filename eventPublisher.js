import axios from "axios";
import { PubSub } from "@google-cloud/pubsub";

// Inicializa o cliente Pub/Sub
const pubsub = new PubSub();
// Nome do tópico para publicação de eventos de plataforma
const TOPIC_NAME = "nfe-events";

/**
 * Publica um evento de plataforma contendo dados da NF-e
 * @param {{ numeroNfe: string, resultado: string }} eventData
 */
export async function publishPlatformEvent(eventData) {
  const dataBuffer = Buffer.from(JSON.stringify(eventData));
  try {
    const messageId = await pubsub.topic(TOPIC_NAME).publish(dataBuffer);
    console.log(`Evento publicado no tópico ${TOPIC_NAME}, ID: ${messageId}`);
  } catch (err) {
    console.error("Erro ao publicar evento:", err);
    throw err;
  }
}
