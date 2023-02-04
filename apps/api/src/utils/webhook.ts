import { IncomingHttpHeaders } from 'http';
import { request } from 'undici';

export async function callEndpoint(props: {
  callbackUrl: string;
  method: 'POST';
  headers: IncomingHttpHeaders | string[];
  body?: string | Buffer;
}) {
  const { body, callbackUrl, headers, method } = props;

  const res = await request(callbackUrl, {
    method,
    headers,
    body,
  });

  // successfull
  if (res.statusCode >= 200 && res.statusCode < 300) {
    return;
  }

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

  throw new Error(JSON.stringify(responseBody));
}
