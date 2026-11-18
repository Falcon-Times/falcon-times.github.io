-- Close the public tip line.
--
-- The website no longer has a tip line (button, form or front-page card), so the database stops
-- accepting tips from the public too, rather than leaving an unused open door behind.
--
--   * Nobody can submit a tip through the API any more: the "submit" policy and the INSERT
--     privileges for the public (anon) and signed-in (authenticated) roles are removed.
--   * Tips already received are kept. Section leaders and admins can still open, triage and
--     (admins) delete them in the newsroom's "Tip line" inbox; nothing is dropped.
--   * The "hotline" site setting (on/off + intro text) is deleted: nothing reads it any more.
--   * Wording on the existing site that pointed readers to the tip line is updated, but only
--     where it is still exactly as the starter content wrote it, so edits made in the admin panel
--     are never overwritten.

drop policy if exists tips_submit on public.tips;
revoke insert on public.tips from anon, authenticated;

delete from public.site_settings where key = 'hotline';

-- Editorial standards (starter wording): drop the tip line mentions.
update public.site_settings
set value = jsonb_set(
      value, '{points}',
      (select coalesce(jsonb_agg(
                case when p = 'No open comment sections. Respond with a Letter to the Editor or send us a tip.'
                     then 'No open comment sections. Respond with a Letter to the Editor.' else p end
                order by pos), '[]'::jsonb)
       from jsonb_array_elements_text(value -> 'points') with ordinality as t(p, pos)
       where p <> 'Tips can be anonymous. We never publish what you send without your permission.')
    )
where key = 'standards'
  and jsonb_typeof(value -> 'points') = 'array';

-- The welcome story (starter wording).
update public.articles
set body_md = replace(replace(body_md,
  $old$We don't run open comment sections. Instead, you can send a **Letter to the Editor**, vote in our **polls**, or use our **tip line**.$old$,
  $new$We don't run open comment sections. Instead, you can send a **Letter to the Editor** or vote in our **polls**.$new$),
  $old$## Tell us something

Know about a story we should cover? Spotted a mistake? Want to shout out a teammate? Use the **Tip Line** at the top of any page. You can stay completely anonymous — leave contact details only if you'd like us to follow up.

Interested in writing$old$,
  $new$## Get involved

Interested in writing$new$)
where slug = 'welcome-to-the-falcon-times' and body_md like '%tip line%';
