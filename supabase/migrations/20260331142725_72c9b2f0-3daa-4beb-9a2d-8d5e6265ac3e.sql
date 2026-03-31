
SELECT cron.schedule(
  'check-payment-reminders-8am',
  '0 11 * * *',
  $$
  SELECT extensions.http(
    (
      'POST',
      concat(current_setting('app.settings.supabase_url', true), '/functions/v1/check-payment-reminders'),
      ARRAY[
        extensions.http_header('Authorization', concat('Bearer ', current_setting('app.settings.service_role_key', true))),
        extensions.http_header('Content-Type', 'application/json')
      ],
      'application/json',
      '{}'
    )::extensions.http_request
  );
  $$
);
