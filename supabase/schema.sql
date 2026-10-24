-- Leak schema. Paste into Supabase → SQL Editor → Run. Safe to re-run only on an empty project.
-- Every row belongs to the signed-in Clerk user (the `sub` claim of the session token);
-- row level security makes each user see and change only their own rows.

create table categories (
  id uuid primary key default gen_random_uuid(),
  user_id text not null default (auth.jwt() ->> 'sub'),
  name text not null,
  color text not null,
  kind text not null check (kind in ('income', 'expense')),
  bucket text not null check (bucket in ('needs', 'wants', 'investments')),
  icon text
);

create table txs (
  id uuid primary key default gen_random_uuid(),
  user_id text not null default (auth.jwt() ->> 'sub'),
  date date not null,
  amount bigint not null check (amount >= 0), -- minor units (fillér / cents)
  kind text not null check (kind in ('income', 'expense')),
  category_id uuid not null references categories on delete restrict, -- the app moves them to "Uncategorized" before deleting a category
  bucket text check (bucket in ('needs', 'wants', 'investments')), -- null for income
  note text not null default '',
  created_at timestamptz not null default now()
);
create index txs_user_date on txs (user_id, date);

create table goals (
  id uuid primary key default gen_random_uuid(),
  user_id text not null default (auth.jwt() ->> 'sub'),
  name text not null,
  target bigint not null check (target >= 0),
  saved bigint not null check (saved >= 0)
);

create table subs (
  id uuid primary key default gen_random_uuid(),
  user_id text not null default (auth.jwt() ->> 'sub'),
  name text not null,
  amount bigint not null check (amount >= 0),
  category_id uuid not null references categories on delete restrict,
  bucket text check (bucket in ('needs', 'wants', 'investments')),
  day int not null check (day between 1 and 31),
  last_month text not null -- YYYY-MM of the last generated charge
);

create table settings (
  user_id text primary key default (auth.jwt() ->> 'sub'),
  lang text not null check (lang in ('hu', 'en')),
  currency text not null,
  theme text not null check (theme in ('system', 'light', 'dark')),
  clock text check (clock in ('12', '24')),
  colorblind boolean not null default false,
  colors jsonb, -- data colours picked in Settings {income: '#rrggbb', ...}; null = defaults. Added in 0.7.0: alter table settings add column colors jsonb;
  ratios jsonb not null,
  ratio_history jsonb -- earlier splits [{until: 'YYYY-MM', ratios}], oldest first. Added in 0.7.0: alter table settings add column ratio_history jsonb;
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
