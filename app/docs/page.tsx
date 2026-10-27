'use client';

import dynamic from 'next/dynamic';
import 'swagger-ui-react/swagger-ui.css';

// Swagger UI renders the contract this deployment serves at /openapi.yaml. It only runs in the browser.
const SwaggerUI = dynamic(() => import('swagger-ui-react'), {
  ssr: false,
  loading: () => <p className="p-6 text-ink/60">Loading the API documentation…</p>,
});

export default function DocsPage() {
  return (
    <main className="mx-auto max-w-6xl bg-white px-2 py-6 sm:px-6">
      <h1 className="px-2 text-3xl font-bold text-brand-700">Ujuzi API</h1>
      <p className="mt-1 px-2 text-sm text-ink/70">
        The contract is also at <a className="underline" href="/openapi.yaml">/openapi.yaml</a>. Partner calls send an
        <code className="mx-1 rounded bg-brand-50 px-1">X-API-Key</code> header; website calls send a login token. Swagger UI
        cannot open the WebSocket endpoint.
      </p>
      <SwaggerUI url="/openapi.yaml" docExpansion="list" defaultModelsExpandDepth={0} />
    </main>
  );
}
