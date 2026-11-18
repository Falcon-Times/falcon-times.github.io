-- Remove the old tip line for good.
--
-- The public tip line was closed (20261118000002) and its staff inbox is gone from the newsroom
-- and admin panel, so the table that held the tips has no purpose left. Dropping it removes every
-- tip received so far, along with its row-level-security policies, triggers and indexes.
-- (Old entries in the activity log that mention tips are left as they are.)

drop table if exists public.tips;
drop function if exists public.guard_tips();
