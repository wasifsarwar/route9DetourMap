import { getRealtime } from '../../src/realtime/relay';
export default async (request: Request) => {
  if (request.method !== 'GET') return new Response('Method not allowed', { status: 405 });
  const data = await getRealtime();
  return Response.json(data, { headers: {
    'Access-Control-Allow-Origin': 'https://wasifsarwar.github.io',
    'Cache-Control': 'public, max-age=10',
    'Netlify-CDN-Cache-Control': 'public, durable, s-maxage=20',
  } });
};
