import request from 'supertest';
import { DEMO_PASSWORD } from '@/lib/db/seedData';
import type { TestServer } from './server';

/** The seeded accounts (lib/db/seedData.ts). Everyone logs in with DEMO_PASSWORD. */
export const SEEDED = {
  achieng: 'achieng.otieno@example.com', // graduate grd_0101, enrolled in crs_501 with certificate UJZ-2026-00123
  brian: 'brian.kamau@example.com', // graduate grd_0102, enrolled in crs_501 with a revoked certificate
  mwanaisha: 'mwanaisha.juma@example.com', // graduate grd_0103, enrolled in crs_505 (centre cen_13), no certificate
  westlands: 'wanjiru.njeri@example.com', // staff usr_0001 at cen_11 (crs_501, crs_502; bookings 6001, 6002)
  hurlingham: 'peter.mwangi@example.com', // staff usr_0002 at cen_12 (crs_503, crs_504)
  ruaka: 'grace.wambui@example.com', // staff usr_0003 at cen_13 (crs_505, crs_506)
  thikaRoad: 'joseph.kiprop@example.com', // staff usr_0004 at cen_14 (crs_507)
  nyali: 'fatuma.hassan@example.com', // staff usr_0005 at cen_15 (crs_508, crs_509)
} as const;

/** Logs in and returns the token. */
export async function login(app: TestServer, email: string, password: string = DEMO_PASSWORD): Promise<string> {
  const res = await request(app.server).post('/api/auth/login').send({ email, password });
  if (res.status !== 200) throw new Error(`login as ${email} answered ${res.status}: ${JSON.stringify(res.body)}`);
  return res.body.token as string;
}

/** Requests that carry a login token: as(app, token).get('/api/me'). */
export function as(app: TestServer, token: string) {
  return request.agent(app.server).set('Authorization', `Bearer ${token}`);
}

/** Logs in as a seeded person and returns requests that carry their token. */
export async function loggedInAs(app: TestServer, email: string) {
  return as(app, await login(app, email));
}
