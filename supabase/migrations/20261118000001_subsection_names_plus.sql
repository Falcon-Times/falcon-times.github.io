-- Sub-section names use "+" like the section names (Opinion + Advice, ...), not "&".
--
-- The public site now uses one connector everywhere. Sub-section names live in
-- public.sections.subsections, and every article stores the name of its sub-section, so both
-- are renamed together ("Clubs & Activities" -> "Clubs + Activities"). Fresh databases get the
-- new names from the starter data; this brings existing sites in line. Only " & " (with spaces)
-- is touched, so a name such as "R&B" is left alone. Run by the migration owner, so the
-- article guard trigger's trusted path applies: "last edited" times don't change.

update public.sections
set subsections = array(
  select replace(name, ' & ', ' + ')
  from unnest(subsections) with ordinality as t(name, pos)
  order by pos
)
where exists (select 1 from unnest(subsections) as n where n like '% & %');

update public.articles
set subsection = replace(subsection, ' & ', ' + ')
where subsection like '% & %';
