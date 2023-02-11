import { ingestContract, targetContract } from '@meteric-boss/api';
import { createRPCClient, FetchFn, RPCClient } from '@typed-doc/core';

export type { FetchFn };

export type Client = { i: RPCClient<typeof ingestContract>; target: RPCClient<typeof targetContract> };

export const createClient = (fetchFn: FetchFn): Client => ({
  i: createRPCClient(ingestContract, fetchFn, '/'),
  target: createRPCClient(targetContract, fetchFn, '/targets'),
});

export default createClient;
