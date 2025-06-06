import { gql } from "@apollo/client";

export const PROJECTION_UPDATED = gql`
  subscription ProjectionUpdated {
    projectionUpdated {
      id
      value
    }
  }
`;

export const LATEST_PROJECTION = gql`
  query getLatest {
    latestProjection {
      id
      value
    }
  }
`;