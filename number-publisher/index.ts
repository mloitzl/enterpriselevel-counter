import amqplib from "amqplib";

const RABBITMQ_URL = "amqp://rabbit:changeme@localhost";
const QUEUE = "NUMBER_INCREMENTED";

let currentNumber = 0;

async function startPublisher() {
  const conn = await amqplib.connect(RABBITMQ_URL);
  const channel = await conn.createChannel();
  await channel.assertQueue(QUEUE);

  console.log("📤 Publisher started. Sending messages every 1s...");

  setInterval(() => {
    currentNumber++;
    channel.sendToQueue(QUEUE, Buffer.from(currentNumber.toString()));
    console.log(`📤 Sent: ${currentNumber}`);
  }, 1000);
}

startPublisher().catch((err) => {
  console.error("❌ Publisher failed:", err);
});
