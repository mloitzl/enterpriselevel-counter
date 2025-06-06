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
const QUEUE_PROJECTION_UPDATED = "PROJECTION_UPDATED";

const COUCHDB_URL = "http://localhost:5984/numbers";
const user = "admin";
const password = "changeme";
const COUCHDB_AUTH = Buffer.from(`${user}:${password}`).toString("base64");
const COUCHDB_AUTH_HEADER = `Basic ${COUCHDB_AUTH}`;

let currentNumber = 0;
let subscribers = [];

// Add new subscriber
const addSubscriber = (fn) => {
  console.log("New subscriber added");
  if (typeof fn !== "function") {
    throw new Error("Subscriber must be a function");
  }
  subscribers.push(fn);
};

// Notify subscribers
const notifySubscribers = (number) => {
  for (const fn of subscribers) fn(number);
};

// GraphQL Schema
const typeDefs = `#graphql
  type Projection {
    id: ID!
    value: Int!
  }

  type Query {
    latestProjection: Projection
    projectionById(id: ID!): Projection
  }

  type Subscription {
    projectionUpdated: Projection
  }
`;

const resolvers = {
  Query: {
    latestProjection: async () => {
      let headers: Record<string, string> = {
        "Content-Type": "application/json",
        Authorization: COUCHDB_AUTH_HEADER,
      };
      const response = await fetch(
        `${COUCHDB_URL}/_changes?include_docs=true&limit=1&descending=true`,
        {
          method: "GET",
          headers,
        }
      );
      if (!response.ok) {
        throw new Error(`Failed to fetch projections: ${response.statusText}`);
      }
      const data = (await response.json()) as {
        results?: { doc: { _id: string; value: number } }[];
      };
      if (Array.isArray(data.results) && data.results.length > 0) {
        const doc = data.results[0].doc;
        return {
          id: doc._id,
          value: doc.value,
        };
      }
    },
    projectionById: async (_, { id }) => {
      console.log("projectionById " + id);
      let headers: Record<string, string> = {
        "Content-Type": "application/json",
        Authorization: COUCHDB_AUTH_HEADER,
      };
      const response = await fetch(`${COUCHDB_URL}/${id}`, {
        method: "GET",
        headers,
      });
      if (response.ok) {
        const result = (await response.json()) as {
          _id: string;
          value: number;
        };
        return {
          id: result._id,
          value: result.value,
        };
      }
    },
  },
  Subscription: {
    projectionUpdated: {
      subscribe: async function* () {
        let queue = [];
        const push = (msg) => queue.push(msg);

        addSubscriber(push);

        while (true) {
          if (queue.length > 0) {
            yield { projectionUpdated: queue.shift() };
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
  await channel.assertQueue(QUEUE_PROJECTION_UPDATED);

  await channel.consume("PROJECTION_UPDATED", (msg) => {
    const event = JSON.parse(msg.content.toString());

    if (event.type === "PROJECTION_UPDATED") {
      notifySubscribers({ id: event.data.id, value: event.data.value }); // push to GraphQL subscription
    }

    channel.ack(msg);
  });
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
