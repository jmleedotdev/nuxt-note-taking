import { defineEventHandler, readBody } from 'h3'
import { authService } from '../../server/auth/service'

// Test-only clock/state setup; never mounted by runtime Nuxt configuration.
export default defineEventHandler(async (event) => {
  const { email, ageSeconds, unverify, expire, failLogout } = await readBody(event)
  const { client } = authService()

  if (typeof ageSeconds === 'number') {
    await client`
      UPDATE session SET created_at = now() - ${ageSeconds} * interval '1 second'
      WHERE user_id IN (SELECT id FROM "user" WHERE email = ${email})
    `
  }

  if (expire === true) {
    await client`UPDATE session SET expires_at = now() - interval '1 second' WHERE user_id IN (SELECT id FROM "user" WHERE email = ${email})`
  }

  if (unverify === true) {
    await client`UPDATE "user" SET email_verified = false WHERE email = ${email}`
  }

  if (failLogout === true) {
    await client.unsafe(`
      CREATE TABLE IF NOT EXISTS test_session_delete_failure (user_id text PRIMARY KEY);
      CREATE OR REPLACE FUNCTION test_fail_session_delete() RETURNS trigger AS $$
      BEGIN
        IF EXISTS (SELECT 1 FROM test_session_delete_failure WHERE user_id = OLD.user_id) THEN
          RAISE EXCEPTION 'Synthetic session deletion failure';
        END IF;
        RETURN OLD;
      END;
      $$ LANGUAGE plpgsql;
      DROP TRIGGER IF EXISTS test_session_delete_failure ON session;
      CREATE TRIGGER test_session_delete_failure BEFORE DELETE ON session
        FOR EACH ROW EXECUTE FUNCTION test_fail_session_delete();
    `)
    await client`INSERT INTO test_session_delete_failure SELECT id FROM "user" WHERE email = ${email} ON CONFLICT DO NOTHING`
  } else if (failLogout === false) {
    await client`DELETE FROM test_session_delete_failure WHERE user_id IN (SELECT id FROM "user" WHERE email = ${email})`
  }

  return { status: 'configured' }
})
