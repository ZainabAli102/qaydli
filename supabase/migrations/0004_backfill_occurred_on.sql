-- Backfill: a transaction with a NULL occurred_on drops out of every month view
-- (it only shows under "All time"). Give those rows a date from their creation
-- time, interpreted in the app's timezone (Asia/Baghdad), so they appear in the
-- right local month. New saves always set occurred_on, so this is one-off.
update public.transactions
set occurred_on = (created_at at time zone 'Asia/Baghdad')::date
where occurred_on is null;
