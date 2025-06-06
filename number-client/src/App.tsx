import { useQuery, useSubscription } from "@apollo/client";
import { PROJECTION_UPDATED, LATEST_PROJECTION } from "./graphql/subscriptions";

import "./App.css";
import { useEffect, useState } from "react";

function App() {
  const { data, loading } = useSubscription(PROJECTION_UPDATED);
  const [sub, setSub] = useState("Waiting for subscription...");
  const {
    data: latest,
    loading: latestLoading,
    error: latestError,
    refetch: refetchLatest,
  } = useQuery(LATEST_PROJECTION);

  useEffect(() => {
    if (data) {
      refetchLatest();
      setSub(
        `Subscription received: ${
          data.projectionUpdated.value
        } at ${new Date().toLocaleTimeString()}`
      );
    }
  }, [data, refetchLatest]);

  return (
    <>
      <div style={{ textAlign: "center", marginTop: "4rem" }}>
        <pre>{sub}</pre>
        <h3>📡 Real-time Number Tracker</h3>
        {loading ? (
          <p>Connecting to subscription...</p>
        ) : (
          <div>
            <h2>Current Number: {data?.projectionUpdated.value}</h2>
            <pre>Hmm..{JSON.stringify(latest, null, 2)}</pre>
          </div>
        )}
      </div>
    </>
  );
}

export default App;
