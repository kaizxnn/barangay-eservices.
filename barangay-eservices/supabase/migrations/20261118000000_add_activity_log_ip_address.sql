alter table public.activity_logs
  add column if not exists ip_address text;
