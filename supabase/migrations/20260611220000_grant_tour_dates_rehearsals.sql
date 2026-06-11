-- Grant authenticated role access to tour_dates and rehearsals.
-- The service_role grant was added in the spine migration but the
-- authenticated role (used by client-side queries via RLS) was missing.

grant select, insert, update, delete on tour_dates to authenticated;
grant select, insert, update, delete on rehearsals to authenticated;
