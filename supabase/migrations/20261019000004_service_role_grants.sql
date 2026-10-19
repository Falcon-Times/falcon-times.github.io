-- Explicit privileges for the Edge Function's service-role connection.
--
-- Supabase's "Automatically expose new tables" project setting (recommended OFF)
-- controls whether new tables are granted to the API roles by default. The
-- schema migration already grants anon/authenticated exactly what they need;
-- this grants the server-side role the admin-users function uses, so the app
-- works whichever way that setting is configured.
grant usage on schema public to service_role;
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
