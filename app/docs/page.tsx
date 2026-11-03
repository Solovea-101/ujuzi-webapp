'use client';

import dynamic from 'next/dynamic';
import 'swagger-ui-react/swagger-ui.css';
import './swagger-overrides.css';
import { Page } from '@/components/ui';

// Swagger UI renders the contract this deployment serves at /openapi.yaml. It only runs in the browser.
const SwaggerUI = dynamic(() => import('swagger-ui-react'), {
  ssr: false,
  loading: () => <p role="status" className="p-4 text-ink-secondary">Loading the API documentation…</p>,
});

export default function DocsPage() {
  return (
    <Page title="Ujuzi API" width="wide" intro="Sherehe uses this API to find courses, check certificates and book crew training. Ujuzi in turn reads live jobs from Kazi Connect.">
      <p className="mb-4 max-w-3xl text-sm text-ink-secondary">
        The contract file is at <a className="font-semibold text-brand underline" href="/openapi.yaml">/openapi.yaml</a>. Partner calls send an{' '}
        <code className="rounded-xs bg-subtle px-1 font-mono">X-API-Key</code> header; website calls send a login token. Swagger UI cannot open the WebSocket endpoint.
      </p>
      <div className="overflow-x-auto rounded-md border border-line-strong bg-surface px-2 py-2 sm:px-4">
        <SwaggerUI url="/openapi.yaml" docExpansion="list" defaultModelsExpandDepth={0} />
      </div>
    </Page>
  );
}
