-- Local QA only. Keep all network-capable scheduled jobs disabled until an
-- isolated environment has been explicitly reviewed and its Vault populated.
DO $safety$
DECLARE
  v_job_id bigint;
BEGIN
  FOR v_job_id IN SELECT jobid FROM cron.job WHERE active LOOP
    PERFORM cron.alter_job(v_job_id, active := false);
  END LOOP;

  IF EXISTS (SELECT 1 FROM cron.job WHERE active) THEN
    RAISE EXCEPTION 'QA safety: active pg_cron jobs remain';
  END IF;
  IF EXISTS (SELECT 1 FROM vault.decrypted_secrets) THEN
    RAISE EXCEPTION 'QA safety: Vault must be empty on a fresh baseline';
  END IF;
  IF EXISTS (SELECT 1 FROM net.http_request_queue) THEN
    RAISE EXCEPTION 'QA safety: pg_net has pending network requests';
  END IF;
  IF EXISTS (SELECT 1 FROM net._http_response) THEN
    RAISE EXCEPTION 'QA safety: pg_net recorded an outbound response during baseline';
  END IF;
END;
$safety$;
