/**
 * DEVELOPMENT ONLY: sends a fake Meta "leadgen" notification to the local API,
 * signed with META_APP_SECRET from api/.env, the way Meta would sign it.
 * The lead's answers are sent inline (field_data), which the API only accepts
 * outside production, so no real Meta app or page is needed.
 *
 *   npm run meta:test-webhook                  # a new random lead
 *   npm run meta:test-webhook -- 9876543210    # use this phone (try a duplicate)
 */
import 'dotenv/config';
import { createHmac, randomInt } from 'node:crypto';

const secret = process.env.META_APP_SECRET;
if (process.env.NODE_ENV === 'production') throw new Error('Refusing to run in production');
if (!secret) throw new Error('Set META_APP_SECRET in api/.env first');

const phone = process.argv[2] ?? `9${randomInt(100000000, 999999999)}`;
const leadgenId = `dev-${Date.now()}`;
const payload = {
  object: 'page',
  entry: [
    {
      id: 'dev-page',
      time: Math.floor(Date.now() / 1000),
      changes: [
        {
          field: 'leadgen',
          value: {
            leadgen_id: leadgenId,
            form_id: 'dev-form-1',
            page_id: 'dev-page',
            created_time: Math.floor(Date.now() / 1000),
            field_data: [
              { name: 'full_name', values: ['Meta Test Customer'] },
              { name: 'phone_number', values: [`+91${phone.slice(-10)}`] },
              { name: 'city', values: ['Coimbatore'] },
              { name: 'sump_size', values: ['10,000 L'] },
              { name: 'when_do_you_need_it', values: ['Within a month'] },
            ],
          },
        },
      ],
    },
  ],
};

const body = JSON.stringify(payload);
const signature = 'sha256=' + createHmac('sha256', secret).update(body).digest('hex');
const url = `http://localhost:${process.env.PORT ?? 4000}/api/v1/webhooks/meta`;

const res = await fetch(url, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'X-Hub-Signature-256': signature },
  body,
});
console.log(`POST ${url} -> ${res.status}`);
console.log(JSON.stringify(await res.json(), null, 2));
