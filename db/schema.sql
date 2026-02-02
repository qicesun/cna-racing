-- CNA Racing signup schema (Supabase Postgres).
-- Apply in Supabase SQL Editor.

create table if not exists cna_users (
    iracing_cust_id bigint primary key,
    iracing_name text not null,
    updated_at timestamptz not null default now()
);

create table if not exists cna_signups (
    event_id text not null,
    iracing_cust_id bigint not null references cna_users(iracing_cust_id) on delete cascade,
    created_at timestamptz not null default now(),
    primary key (event_id, iracing_cust_id)
);

create index if not exists cna_signups_event_created_at_idx on cna_signups (event_id, created_at);
create index if not exists cna_signups_user_created_at_idx on cna_signups (iracing_cust_id, created_at);

-- Optional user profile fields (public).
create table if not exists cna_user_profiles (
    iracing_cust_id bigint primary key references cna_users(iracing_cust_id) on delete cascade,
    nickname text,
    discord text,
    bio text,
    preferred_car text,
    car_number text,
    links jsonb not null default '[]'::jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index if not exists cna_user_profiles_updated_at_idx on cna_user_profiles (updated_at);
