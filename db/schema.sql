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

-- iRacing Data API Workflow (scope: iracing.auth).
-- Tokens are stored server-side; refresh_token is encrypted at rest before persisting.
create table if not exists cna_iracing_tokens (
    iracing_cust_id bigint primary key references cna_users(iracing_cust_id) on delete cascade,
    access_token text not null,
    access_expires_at timestamptz not null,
    refresh_token_enc text,
    refresh_expires_at timestamptz,
    scope text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index if not exists cna_iracing_tokens_access_expires_at_idx on cna_iracing_tokens (access_expires_at);
create index if not exists cna_iracing_tokens_refresh_expires_at_idx on cna_iracing_tokens (refresh_expires_at);

-- Cached /data/member/info response (publicly displayed on /drivers/[custId]).
create table if not exists cna_iracing_member_info (
    iracing_cust_id bigint primary key references cna_users(iracing_cust_id) on delete cascade,
    data jsonb not null,
    fetched_at timestamptz not null default now(),
    expires_at timestamptz not null
);

create index if not exists cna_iracing_member_info_expires_at_idx on cna_iracing_member_info (expires_at);

-- Admin-managed mapping from CNA event_id (e.g. gt3open:26S1:8) to iRacing subsession_id.
create table if not exists cna_event_sources (
    event_id text primary key,
    series_key text not null,
    subsession_id bigint not null unique,
    created_by bigint references cna_users(iracing_cust_id) on delete set null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index if not exists cna_event_sources_series_updated_at_idx on cna_event_sources (series_key, updated_at);

-- Raw iRacing results + parsed race snapshot for CNA events.
create table if not exists cna_event_results (
    event_id text primary key,
    series_key text not null,
    subsession_id bigint not null unique,
    start_time timestamptz,
    track_name text,
    raw_json jsonb not null,
    race_results jsonb not null,
    fetched_at timestamptz not null default now()
);

create index if not exists cna_event_results_series_fetched_at_idx on cna_event_results (series_key, fetched_at);

-- Aggregated standings snapshot for a series + season (computed from cna_event_results.race_results).
create table if not exists cna_series_standings (
    series_key text not null,
    season_key text not null,
    data jsonb not null,
    updated_at timestamptz not null default now(),
    primary key (series_key, season_key)
);

create index if not exists cna_series_standings_updated_at_idx on cna_series_standings (updated_at);
