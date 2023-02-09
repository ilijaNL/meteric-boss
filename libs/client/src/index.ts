import type {
  Contract,
  InputContract,
  InferInput,
  InferOutput,
  PickQueries,
  PickMutations,
  ContractMethod,
  TypedDocument,
  MethodType,
} from '@typed-doc/core';
import { createDocument } from '@typed-doc/core';
import { ingestContract, targetContract } from '@meteric-boss/api';

export type ExecutionFn<T extends ContractMethod> = (
  input: InferInput<T>,
  headers?: HeadersInit
) => Promise<InferOutput<T>>;

export type Executions<C extends Contract> = {
  [P in keyof C]: ExecutionFn<C[P]>;
};

export interface RPCClient<TContract extends Contract> {
  query: Executions<PickQueries<TContract>>;
  mutate: Executions<PickMutations<TContract>>;
}

export type FetchFn = (
  doc: TypedDocument<string, MethodType, any, any>,
  props: { headers: HeadersInit; pathname: string }
) => Promise<any>;

const createExecutionFn = <T extends ContractMethod>(
  contractMethod: T,
  pathname: string,
  fetch: FetchFn
): ExecutionFn<T> => {
  return async function execute(input, headers?: HeadersInit) {
    const doc = createDocument(contractMethod, input);
    const finalHeaders: HeadersInit = {
      'content-type': 'application/json',
      ...headers,
    };
    const result = await fetch(doc, { headers: finalHeaders, pathname });
    return result as InferOutput<T>;
  };
};

function createRPCClient<TContract extends Contract<InputContract>>(
  _contract: TContract,
  fetchFn: FetchFn,
  pathname: string
): RPCClient<TContract> {
  const client = (Object.keys(_contract) as Array<keyof TContract>).reduce(
    (agg, key) => {
      const item = _contract[key];

      if (item.methodType === 'query') {
        (agg.query as any)[key] = createExecutionFn(item, pathname, fetchFn);
      }

      if (item.methodType === 'mutation') {
        (agg.mutate as any)[key] = createExecutionFn(item, pathname, fetchFn);
      }

      return agg;
    },
    {
      query: {},
      mutate: {},
    } as RPCClient<TContract>
  );

  return client;
}

export const createClient = (fetchFn: FetchFn) => ({
  i: createRPCClient(ingestContract, fetchFn, '/'),
  target: createRPCClient(targetContract, fetchFn, '/targets'),
});

export default createClient;
