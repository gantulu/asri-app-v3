import { equal, hash, hmac, validEmail } from '../_shared.ts';

Deno.test('SHA-256 hash is deterministic', async () => {
  const actual = await hash('asri-test');
  if (actual !== '0611977f9e6ab956fa6dd121aca9d827696f82adfa1b3bb66df360e3d870e08e') {
    throw new Error('Unexpected SHA-256 digest');
  }
});

Deno.test('HMAC-SHA256 uses the expected signature', async () => {
  const actual = await hmac('secret', 'message');
  if (actual !== '8b5f48702995c1598c573db1e21866a9b825d4a794d169d7060a03605796360b') {
    throw new Error('Unexpected HMAC digest');
  }
});

Deno.test('constant-time equality helper rejects mismatches', () => {
  if (!equal('abc', 'abc') || equal('abc', 'abd') || equal('abc', 'abcd')) {
    throw new Error('Equality helper returned an unexpected result');
  }
});

Deno.test('email validation rejects malformed and oversized values', () => {
  if (!validEmail('customer@example.com') || validEmail('not-an-email') || validEmail('x'.repeat(260) + '@example.com')) {
    throw new Error('Email validation returned an unexpected result');
  }
});
