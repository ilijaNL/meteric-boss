import { MethodType } from '@typed-doc/core';
import { createClient } from '@meteric-boss/client';
import { Dispatcher, request } from 'undici';
import fastJson from 'fast-json-stable-stringify';

const methodTypeMapping: Record<MethodType, Dispatcher.HttpMethod> = {
  mutation: 'POST',
  query: 'GET',
};

export const metericClient = createClient(async (doc, { headers, pathname }) => {
  const url = new URL('http://127.0.0.1:3001');
  url.pathname = `${pathname}/${doc.method}`.replaceAll('//', '/');

  if (doc.methodType === 'query') {
    Object.entries(doc.input).forEach(([key, value]) => {
      url.searchParams.set(key, value as any);
    });
  }

  const res = await request(url.toString(), {
    method: methodTypeMapping[doc.methodType],
    headers,
    body: doc.methodType === 'mutation' ? fastJson(doc.input) : undefined,
  });

  let responseBody;
  if (res.headers['content-type']?.indexOf('application/json') === 0) {
    responseBody = await res.body.json();
  } else if (res.headers['content-type'] === 'text/plain') {
    responseBody = await res.body.text();
  } else {
    res.body.resume();
    // not interested in the errors
    res.body.on('error', () => {});
  }

  // usuccessfull
  if (res.statusCode >= 400) {
    throw new Error(JSON.stringify(responseBody));
  }

  return responseBody;
});
