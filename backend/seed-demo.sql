-- Fictional Honey Campus reference data.
--
-- This seed intentionally contains only non-sensitive directory/reference rows.
-- It does not create auth users, profiles, posts, messages, bookings,
-- verification requests, or notification subscriptions. It does add three
-- fictional published opportunities so the Opportunities tab has real rows.
-- Run after schema.sql. It is safe to run again in the development project.

-- Modules visible to the read-only reference directory.
insert into public.modules (code, name) values
  ('ACC201', 'Accounting'),
  ('ACC202', 'Accounting'),
  ('CSC101', 'Computer Science'),
  ('ECO101', 'Economics'),
  ('MAN101', 'Management')
on conflict (code) do update set name = excluded.name;

-- Module reference pages. ACC201 remains the active prototype configuration;
-- no ACC202 representative is created here.
insert into public.communities (kind, name, description, verified_source, sponsored, sponsor_label, module_id)
select 'module', m.code || ' ' || m.name,
  case m.code
    when 'ACC201' then 'Fictional ACC201 module page for the Honey Campus demo. Tutorial updates, resources, and class representative questions live here.'
    when 'ACC202' then 'Fictional ACC202 module page for the Honey Campus demo. Module reminders and worked examples live here.'
    when 'CSC101' then 'Fictional CSC101 module page for the Honey Campus demo. Labs, practicals, and coding support live here.'
    when 'ECO101' then 'Fictional ECO101 module page for the Honey Campus demo. Tutorials, lecture changes, and study prompts live here.'
    when 'MAN101' then 'Fictional MAN101 module page for the Honey Campus demo. Case studies, groups, and tutorial updates live here.'
  end,
  true, false, null, m.id
from public.modules m
where m.code in ('ACC201', 'ACC202', 'CSC101', 'ECO101', 'MAN101')
on conflict (kind, name) do update set
  description = excluded.description,
  verified_source = excluded.verified_source,
  sponsored = excluded.sponsored,
  sponsor_label = excluded.sponsor_label,
  module_id = excluded.module_id;

-- Fictional residence, house, society, company, campus, and opportunity pages.
insert into public.communities (kind, name, description, verified_source, sponsored, sponsor_label)
values
  ('campus', 'Honey Campus', 'Fictional campus directory for the Veya prototype. Find residence communities, modules, student groups, and verified local pages.', true, false, null),
  ('residence', 'Northbank Residence', 'Fictional residence page for announcements, houses, events, safety information, and verified residence updates.', true, false, null),
  ('residence', 'Riverside Residence', 'Fictional residence page for residence notices, inter-house activities, and student support information.', true, false, null),
  ('house', 'Kora House', 'Fictional Northbank house community for welcome updates, house events, study moments, and respectful community posts.', true, false, null),
  ('house', 'Hilltop House', 'Fictional Riverside house community for residence activities, sports, and student announcements.', true, false, null),
  ('house', 'Oak House', 'Fictional residence house community for events, study groups, and house committee notices.', true, false, null),
  ('society', 'Culture Circle', 'Fictional society for arts, open mic nights, creative projects, and campus culture.', true, false, null),
  ('society', 'Drama Society', 'Fictional society for theatre, performance, rehearsal notices, and showcase opportunities.', true, false, null),
  ('society', 'Chess Club', 'Fictional society for weekly tournaments, casual games, and beginner-friendly sessions.', true, false, null),
  ('society', 'Debating Union', 'Fictional society for public speaking, debates, training sessions, and competitions.', true, false, null),
  ('society', 'Coding Collective', 'Fictional student group for peer coding sessions, projects, and practical support.', true, false, null),
  ('society', 'Five-a-side FC', 'Fictional student sports group for five-a-side fixtures, training, and inter-house matches.', true, false, null),
  ('company', 'Silo Coffee Co.', 'Fictional local coffee company page with clearly labelled student offers and sponsored updates.', true, true, 'Sponsored · Verified business'),
  ('company', 'Makhanda Mobile', 'Fictional local connectivity provider page for clearly labelled data and student-support offers.', true, true, 'Sponsored · Verified business'),
  ('company', 'Theatre Lane', 'Fictional local events partner page for verified showcases, tickets, and student culture offers.', true, true, 'Sponsored · Verified business'),
  ('company', 'Green Basket Market', 'Fictional local food partner page for campus-friendly produce boxes and community offers.', true, true, 'Sponsored · Verified business'),
  ('opportunity', 'FutureFound Study Bursary', 'Fictional opportunity listing from a verified external provider. Students should confirm all terms with the provider before applying.', true, true, 'Sponsored · Verified provider'),
  ('opportunity', 'Peer Mentor Programme', 'Fictional student development opportunity for peer support, leadership, and participation.', true, false, null),
  ('opportunity', 'Campus Creator Internship', 'Fictional opportunity for media, events, and student storytelling work.', true, true, 'Sponsored · Verified provider')
on conflict (kind, name) do update set
  description = excluded.description,
  verified_source = excluded.verified_source,
  sponsored = excluded.sponsored,
  sponsor_label = excluded.sponsor_label;

-- Fictional published opportunities (no creator, so no review trail is required).
insert into public.opportunities (provider_community_id, kind, title, summary, value_label, eligibility, required_documents, location_type, closes_at, review_state, trust_label)
select c.id, v.kind, v.title, v.summary, v.value_label, v.eligibility, v.docs, v.loc, now() + v.closes, 'published', v.trust
from (values
  ('FutureFound Study Bursary', 'bursary', 'FutureFound study bursary', 'Fictional study support for students with demonstrated need.', 'R 15,000 study support', 'Open to registered undergraduates. Confirm all terms with the provider.', 'Academic record, motivation letter', null, interval '21 days', 'sponsored'),
  ('Campus Creator Internship', 'internship', 'Campus creator internship', 'Fictional media and events internship.', 'Media and events', 'Open to students interested in storytelling and campus events.', 'Short portfolio or sample', 'campus', interval '14 days', 'sponsored'),
  ('Peer Mentor Programme', 'programme', 'Peer mentor programme', 'Fictional student development programme for peer support and leadership.', 'Leadership credential', 'Second-year students and above in good standing.', 'None', 'campus', interval '30 days', 'verified')
) as v(community_name, kind, title, summary, value_label, eligibility, docs, loc, closes, trust)
join public.communities c on c.kind = 'opportunity' and c.name = v.community_name
where not exists (select 1 from public.opportunities o where o.title = v.title);

-- The reference directory is safe to read without a real account. Content,
-- messages, verification, and notification tables remain protected by RLS.
drop policy if exists communities_read_reference_anon on public.communities;
create policy communities_read_reference_anon on public.communities
  for select to anon, authenticated using (true);

drop policy if exists modules_read_reference_anon on public.modules;
create policy modules_read_reference_anon on public.modules
  for select to anon, authenticated using (true);

-- After creating fictional development users, add the active representative
-- explicitly for ACC201. Do not recreate the rejected ACC202 default:
--
-- insert into public.module_representatives (module_id, user_id)
-- select m.id, '<development-user-uuid>'::uuid
-- from public.modules m where m.code = 'ACC201';
