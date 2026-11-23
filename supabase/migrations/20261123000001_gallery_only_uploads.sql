-- Photos come only from the photo gallery.
--
-- Before, every signed-in staff role could upload files to the public "media" bucket, so photos ended
-- up in three places: the gallery, story covers and story text. Now:
--
--   * photos are uploaded only by the people who manage the gallery (photographers, admins, and the
--     Photography + Video section leader), through the Photo gallery page; stories just pick from it;
--   * every staff member can still upload their own staff portrait, into their own "portraits/<their id>/"
--     folder (My profile and, for admins, the staff roster).
--
-- This is enforced here as well as in the screens, so a hand-made upload request is refused too. (A
-- story's text can still link to a picture elsewhere on the web by address; that can't be stopped here.)
--
-- Files already uploaded are not touched, and nothing changes for how photos are viewed.

drop policy media_upload on storage.objects;
create policy media_upload on storage.objects for insert to authenticated
  with check (
    bucket_id = 'media'
    and private.is_staff()
    and (
      private.can_manage_gallery()
      or name like 'portraits/' || auth.uid()::text || '/%'
    )
  );
