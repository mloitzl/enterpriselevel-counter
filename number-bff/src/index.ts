import { ApolloServer } from "@apollo/server";
import { expressMiddleware } from "@apollo/server/express4";
import { ApolloServerPluginDrainHttpServer } from "@apollo/server/plugin/drainHttpServer";
import express from "express";
import { createServer } from "http";
import { makeExecutableSchema } from "@graphql-tools/schema";
import { WebSocketServer } from "ws";
import { useServer } from "graphql-ws/lib/use/ws";
import bodyParser from "body-parser";
import cors from "cors";
import amqplib from "amqplib";

const PORT = 4000;
const RABBITMQ_URL = "amqp://rabbit:changeme@localhost";
const QUEUE = "NUMBER_INCREMENTED";

let currentNumber = 0;
let subscribers = [];

// Add new subscriber
const addSubscriber = (fn) => {
  subscribers.push(fn);
};

// Notify subscribers
const notifySubscribers = (number) => {
  for (const fn of subscribers) fn(number);
};

// GraphQL Schema
const typeDefs = `#graphql
  type Query {
    currentNumber: Int
  }

  type Subscription {
    numberIncremented: Int
  }
`;

const resolvers = {
  Query: {
    currentNumber() {
      return currentNumber;
    },
  },
  Subscription: {
    numberIncremented: {
      subscribe: async function* () {
        let queue = [];
        const push = (msg) => queue.push(msg);

        addSubscriber(push);

        while (true) {
          if (queue.length > 0) {
            yield { numberIncremented: queue.shift() };
          }
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
      },
    },
  },
};

const schema = makeExecutableSchema({ typeDefs, resolvers });

const app = express();
const httpServer = createServer(app);
const wsServer = new WebSocketServer({ server: httpServer, path: "/graphql" });
const serverCleanup = useServer({ schema }, wsServer);

// Apollo Server setup
const server = new ApolloServer({
  schema,
  plugins: [
    ApolloServerPluginDrainHttpServer({ httpServer }),
    {
      async serverWillStart() {
        return {
          async drainServer() {
            await serverCleanup.dispose();
          },
        };
      },
    },
  ],
});

// Connect to RabbitMQ and start publishing
async function connectToRabbitMQAndStart() {
  const conn = await amqplib.connect(RABBITMQ_URL);
  const channel = await conn.createChannel();
  await channel.assertQueue(QUEUE);

  // Consume from the queue and notify GraphQL subscribers
  await channel.consume(
    QUEUE,
    (msg) => {
      if (msg !== null) {
        const number = parseInt(msg.content.toString(), 10);
        notifySubscribers(number);
        channel.ack(msg);
      }
    },
    { noAck: false }
  );
}

await server.start();
app.use("/graphql", cors(), bodyParser.json(), expressMiddleware(server));

httpServer.listen(PORT, () => {
  console.log(`🚀 Query endpoint ready at http://localhost:${PORT}/graphql`);
  console.log(
    `📡 Subscription endpoint ready at ws://localhost:${PORT}/graphql`
  );
});

connectToRabbitMQAndStart().catch(console.error);
