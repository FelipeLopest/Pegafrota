-- O PostgreSQL só permite usar um valor novo de enum depois do commit.
alter type public.odometer_source_type add value if not exists 'trip_departure';
