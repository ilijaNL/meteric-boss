import { ingestContract, targetContract } from '@meteric-boss/api';
import { createRPCClient, FetchFn } from '@typed-doc/core';

export type { FetchFn };

export const createClient = (fetchFn: FetchFn) => ({
  i: createRPCClient(ingestContract, fetchFn, '/'),
  target: createRPCClient(targetContract, fetchFn, '/targets'),
});

export default createClient;
