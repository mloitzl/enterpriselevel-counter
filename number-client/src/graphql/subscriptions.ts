import { gql } from "@apollo/client";

export const NUMBER_INCREMENTED = gql`
  subscription NumberIncremented {
    numberIncremented
  }
`;
