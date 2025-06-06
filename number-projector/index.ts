import amqplib from "amqplib";
import fetch from "node-fetch";

const RABBITMQ_URL = "amqp://rabbit:changeme@localhost";
const QUEUE = "NUMBER_INCREMENTED";
const QUEUE_PROJECTION_UPDATED = "PROJECTION_UPDATED";

const COUCHDB_URL = "http://localhost:5984/numbers";
const user = "admin";
const password = "changeme";
const COUCHDB_AUTH = Buffer.from(`${user}:${password}`).toString("base64");
const COUCHDB_AUTH_HEADER = `Basic ${COUCHDB_AUTH}`;

async function ensureDatabaseExists() {
  const response = await fetch(COUCHDB_URL, {
    method: "HEAD",
    headers: {
      Authorization: COUCHDB_AUTH_HEADER,
    },
  });
  if (response.status === 404) {
    // Database does not exist, create it
    const createResponse = await fetch(COUCHDB_URL, {
      method: "PUT",
      headers: {
        Authorization: COUCHDB_AUTH_HEADER,
      },
    });
    if (!createResponse.ok) {
      throw new Error(
        `Failed to create database: ${createResponse.statusText}`
      );
    }
    console.log("Created CouchDB database 'numbers'");
  }
}

async function startProjector() {
  await ensureDatabaseExists();
  const conn = await amqplib.connect(RABBITMQ_URL);
  const channel = await conn.createChannel();
  await channel.assertQueue(QUEUE);
  await channel.assertQueue(QUEUE_PROJECTION_UPDATED);

  console.log("📥 Projector started. Listening for messages...");

  await channel.consume(QUEUE, async (msg) => {
    if (!msg) return;
    console.log("Received message:", msg.content.toString());
    const event = JSON.parse(msg.content.toString());
    if (event.type === "NUMBER_INCREMENTED") {
      const number = event.data.payload;
      console.log(`Projecting number: ${number}`);

      let headers: Record<string, string> = {
        "Content-Type": "application/json",
        Authorization: COUCHDB_AUTH_HEADER,
      };

      // Store the number in CouchDB
      try {
        const response = await fetch(`${COUCHDB_URL}`, {
          method: "POST",
          headers,
          body: JSON.stringify({ value: number }),
        });

        if (!response.ok) {
          throw new Error(`Failed to store number: ${response.statusText}`);
        }

        console.log(`Stored number ${number} in CouchDB`);
        const result = (await response.json()) as { id: string };

        await channel.sendToQueue(
          QUEUE_PROJECTION_UPDATED,
          Buffer.from(
            JSON.stringify({
              type: "PROJECTION_UPDATED",
              data: { id: result.id, value: number },
            })
          )
        );

        console.log(`🗃️ Projection updated to ${number}`);
        channel.ack(msg);
      } catch (error) {
        console.error("Error storing number in CouchDB:", error);
      }
    }
  });
}

startProjector().catch((err) => {
  console.error("❌ Projector failed:", err);
});
