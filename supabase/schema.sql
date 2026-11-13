-- Leak schema. Paste into Supabase → SQL Editor → Run. Safe to re-run only on an empty project.
-- Every row belongs to the signed-in Clerk user (the `sub` claim of the session token);
-- row level security makes each user see and change only their own rows.
--
-- Names, notes, tags and amounts are encrypted by the app before upload (src/crypt.ts), so those columns are text
-- holding 'e1:…' ciphertext and the app checks their values itself. Added in 0.14.1, on an existing database:
--   alter table categories drop constraint if exists categories_monthly_limit_check, alter column monthly_limit type text using monthly_limit::text;
--   alter table txs drop constraint if exists txs_amount_check, drop constraint if exists txs_orig_amount_check,
--     alter column amount type text using amount::text, alter column orig_amount type text using orig_amount::text;
--   alter table goals drop constraint if exists goals_target_check, drop constraint if exists goals_saved_check,
--     alter column target type text using target::text, alter column saved type text using saved::text;
--   alter table subs drop constraint if exists subs_amount_check, alter column amount type text using amount::text;
-- The app seals the rows already there on its next sync.

create table categories (
  id uuid primary key default gen_random_uuid(),
  user_id text not null default (auth.jwt() ->> 'sub'),
  name text not null, -- encrypted
  color text not null,
  kind text not null check (kind in ('income', 'expense')),
  bucket text not null check (bucket in ('needs', 'wants', 'investments')),
  icon text,
  monthly_limit text -- encrypted: most to spend in a month (minor units); null = none
);

create table txs (
  id uuid primary key default gen_random_uuid(),
  user_id text not null default (auth.jwt() ->> 'sub'),
  date date not null,
  amount text not null, -- encrypted: minor units (fillér / cents) of the base currency
  kind text not null check (kind in ('income', 'expense')),
  category_id uuid not null references categories on delete restrict, -- the app moves them to "Uncategorized" before deleting a category
  bucket text check (bucket in ('needs', 'wants', 'investments')), -- null for income
  note text not null default '', -- encrypted
  created_at timestamptz not null default now(),
  -- Paid in another currency: what it cost in that one; `amount` is it converted. Both or neither.
  orig_amount text, -- encrypted
  orig_currency text check (orig_currency ~ '^[A-Z]{3}$'),
  tags text[], -- each one encrypted, e.g. {balaton-2026}; null = none
  constraint txs_orig_both check ((orig_amount is null) = (orig_currency is null))
);
create index txs_user_date on txs (user_id, date);

create table goals (
  id uuid primary key default gen_random_uuid(),
  user_id text not null default (auth.jwt() ->> 'sub'),
  name text not null, -- encrypted
  target text not null, -- encrypted
  saved text not null -- encrypted
);

create table subs (
  id uuid primary key default gen_random_uuid(),
  user_id text not null default (auth.jwt() ->> 'sub'),
  name text not null, -- encrypted
  amount text not null, -- encrypted
  category_id uuid not null references categories on delete restrict,
  bucket text check (bucket in ('needs', 'wants', 'investments')),
  day int not null check (day between 1 and 31),
  last_month text not null, -- YYYY-MM of the last generated charge
  reviewed text check (reviewed ~ '^\d{4}-\d{2}$'), -- YYYY-MM the user last confirmed they still use it. Added in 0.9.0: alter table subs add column reviewed text check (reviewed ~ '^\d{4}-\d{2}$');
  currency text check (currency ~ '^[A-Z]{3}$') -- billed in another currency, `amount` in it; null = the base currency. Added in 0.8.0: alter table subs add column currency text check (currency ~ '^[A-Z]{3}$');
);

create table settings (
  user_id text primary key default (auth.jwt() ->> 'sub'),
  lang text not null check (lang in ('hu', 'en')),
  currency text not null,
  theme text not null check (theme in ('system', 'light', 'dark')),
  clock text check (clock in ('12', '24')),
  cat_chart text check (cat_chart in ('donut', 'treemap')), -- how category shares are drawn; null = treemap on a phone, donut wider. Added in 0.13.1: alter table settings add column cat_chart text check (cat_chart in ('donut', 'treemap'));
  colorblind boolean not null default false,
  colors jsonb, -- data colours picked in Settings {income: '#rrggbb', ...}; null = defaults. Added in 0.7.0: alter table settings add column colors jsonb;
  ratios jsonb not null,
  ratio_history jsonb, -- earlier splits [{until: 'YYYY-MM', ratios}], oldest first. Added in 0.7.0: alter table settings add column ratio_history jsonb;
  shortcuts jsonb -- keyboard shortcuts changed from the defaults {add: ['N'], ...}; null = defaults. Added in 0.8.0: alter table settings add column shortcuts jsonb;
);

do $$
declare t text;
begin
  foreach t in array array['categories', 'txs', 'goals', 'subs', 'settings'] loop
    execute format('alter table %I enable row level security', t);
    execute format(
      'create policy own_rows on %I for all to authenticated
         using (user_id = (select auth.jwt() ->> ''sub''))
         with check (user_id = (select auth.jwt() ->> ''sub''))',
      t);
  end loop;
end $$;
