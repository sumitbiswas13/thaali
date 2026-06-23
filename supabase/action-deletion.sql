-- ===========================================================================
-- Thaali — ACTION an account-deletion request  (run-script, by hand)
--
--   ⚠️  DESTRUCTIVE AND IRREVERSIBLE.  Read this header before running.
--
-- This is the deliberate, human-in-the-loop step that actually deletes a cook's
-- account. Run it in the Supabase SQL Editor ONLY when:
--   1. the grace window (24–48h) has passed, AND
--   2. the cook has NOT emailed to cancel, AND
--   3. there's a matching 'pending' row in deletion_requests.
--
-- HOW TO USE:
--   1. Paste the request's User ID into `target_user` below (from the admin
--      notification email, or from the queue: select * from deletion_requests
--      where status = 'pending' order by requested_at).
--   2. Set `wipe_recipes` to match what the cook chose (the email states it):
--        true  → delete their recipes too
--        false → KEEP their recipes, reattributed to "A Thaali cook"
--   3. Run the whole file. It runs in a single transaction — all or nothing.
--
-- WHAT GETS DELETED (via on-delete cascades already in the schema):
--   • deleting the auth.users row cascades to: profiles, likes, comments,
--     and this deletion_requests row.
--   • recipes.author_id is ON DELETE SET NULL, so by default recipes SURVIVE
--     with a null author_id. We additionally blank the stored `author` text so
--     the app renders them as "A Thaali cook" (see file006 app change).
--   • if wipe_recipes = true, we delete the recipes FIRST (which cascades to
--     remove likes/comments on those recipes), then delete the user.
-- ===========================================================================

do $$
declare
  -- ▼▼▼  EDIT THESE TWO LINES, THEN RUN  ▼▼▼
  target_user uuid := '00000000-0000-0000-0000-000000000000';  -- paste User ID
  wipe_recipes boolean := false;  -- true = delete recipes too; false = keep & reattribute
  -- ▲▲▲  ----------------------------------  ▲▲▲

  pending_count int;
  recipe_count  int;
begin
  -- Safety: refuse the placeholder id.
  if target_user = '00000000-0000-0000-0000-000000000000' then
    raise exception 'Set target_user to a real User ID before running.';
  end if;

  -- Safety: there must be a pending request for this user. (Prevents actioning
  -- a cancelled/already-completed/nonexistent request by mistake.)
  select count(*) into pending_count
  from public.deletion_requests
  where user_id = target_user and status = 'pending';

  if pending_count = 0 then
    raise exception 'No PENDING deletion request for %. Aborting (nothing actioned).', target_user;
  end if;

  select count(*) into recipe_count from public.recipes where author_id = target_user;
  raise notice 'Actioning deletion for %  (recipes: %, wipe_recipes: %)', target_user, recipe_count, wipe_recipes;

  -- Mark the request completed BEFORE the user is gone (the row cascades away
  -- with the user, so this notice is mostly for the transaction log).
  update public.deletion_requests
  set status = 'completed'
  where user_id = target_user and status = 'pending';

  if wipe_recipes then
    -- Delete their recipes first; FK cascades clear likes/comments on them.
    delete from public.recipes where author_id = target_user;
    raise notice 'Deleted % recipe(s).', recipe_count;
  else
    -- Keep recipes. Reattribute: null the author link and blank the stored
    -- author/author_email so the app shows "A Thaali cook" instead of a name.
    -- (author_id would be set null by the cascade anyway, but doing it here
    -- makes the reattribution explicit and atomic with the author blanking.)
    update public.recipes
    set author_id = null,
        author = null,
        author_email = null
    where author_id = target_user;
    raise notice 'Kept % recipe(s), reattributed to "A Thaali cook".', recipe_count;
  end if;

  -- Finally, delete the auth user. Cascades remove: profiles, likes, comments,
  -- and the deletion_requests row(s) for this user.
  delete from auth.users where id = target_user;

  raise notice 'Done. User % deleted.', target_user;
end $$;
