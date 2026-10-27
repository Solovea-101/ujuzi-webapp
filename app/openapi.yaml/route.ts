import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { guarded } from '@/lib/http';

export const dynamic = 'force-dynamic';

// The contract itself, so a partner or a docs page can read exactly what this deployment promises.
export async function GET() {
  return guarded(async () => {
    const yaml = await readFile(path.join(process.cwd(), 'openapi.yaml'), 'utf8');
    return new Response(yaml, { headers: { 'Content-Type': 'application/yaml; charset=utf-8' } }) as never;
  });
}
