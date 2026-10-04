-- Veya Stage 4 migration
-- Safe client features: events/RSVPs, opportunities/applications, bookings,
-- portfolio sharing, private post-media storage, and in-app notifications.
-- Run after schema.sql + grants.sql in the development Supabase project.
-- No service-role/secret key is used by the app.

create or replace function private.push_notification(
  p_recipient uuid,
  p_type text,
  p_title text,
  p_body text default null,
  p_entity_type text default null,
  p_entity_id uuid default null,
  p_source_community uuid default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_recipient is null or p_recipient = auth.uid() then return; end if;
  insert into public.notifications (
    recipient_id, source_community_id, notification_type, title, body, entity_type, entity_id
  ) values (
    p_recipient, p_source_community, left(p_type, 80), left(p_title, 160), left(p_body, 1000),
    left(p_entity_type, 80), p_entity_id
  );
end;
$$;

-- Friend requests / acceptance.
create or replace function private.notify_friendship_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare recipient uuid;
begin
  if tg_op = 'INSERT' and new.status = 'pending' then
    recipient := case when new.requested_by = new.user_a then new.user_b else new.user_a end;
    perform private.push_notification(
      recipient, 'friend_request', 'New friend request',
      'Someone sent you a friend request on Veya.', 'friendship', null, null
    );
  elsif tg_op = 'UPDATE' and old.status = 'pending' and new.status = 'accepted' then
    recipient := new.requested_by;
    perform private.push_notification(
      recipient, 'friend_request_accepted', 'Friend request accepted',
      'Your friend request was accepted.', 'friendship', null, null
    );
  end if;
  return new;
end;
$$;

drop trigger if exists friendships_notifications on public.friendships;
create trigger friendships_notifications
after insert or update of status on public.friendships
for each row execute function private.notify_friendship_change();

-- New direct message notification. The message body is not copied into the
-- notification to avoid putting sensitive message content into the inbox.
create or replace function private.notify_direct_message()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform private.push_notification(
    new.recipient_id, 'message', 'New message',
    'You have a new Veya message.', 'message', new.id, null
  );
  return new;
end;
$$;

drop trigger if exists direct_messages_notifications on public.direct_messages;
create trigger direct_messages_notifications
after insert on public.direct_messages
for each row execute function private.notify_direct_message();

-- Event approval / rejection.
create or replace function private.notify_event_review()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if old.status = 'proposed' and new.status in ('approved', 'rejected') then
    perform private.push_notification(
      new.proposed_by, 'event_review',
      case when new.status = 'approved' then 'Event approved' else 'Event proposal declined' end,
      case when new.status = 'approved' then new.title || ' is now visible to students.' else new.title || ' was not approved.' end,
      'event', new.id, new.community_id
    );
  end if;
  return new;
end;
$$;

drop trigger if exists events_notifications on public.events;
create trigger events_notifications
after update of status on public.events
for each row execute function private.notify_event_review();

-- Booking decisions.
create or replace function private.notify_booking_decision()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare resource_name text;
begin
  if old.status = 'requested' and new.status in ('confirmed', 'declined') then
    select name into resource_name from public.bookable_resources where id = new.resource_id;
    perform private.push_notification(
      new.user_id, 'booking_decision',
      case when new.status = 'confirmed' then 'Booking confirmed' else 'Booking declined' end,
      coalesce(resource_name, 'Your booking') || case when new.status = 'confirmed' then ' is confirmed.' else ' was declined.' end,
      'booking', new.id, null
    );
  end if;
  return new;
end;
$$;

drop trigger if exists bookings_notifications on public.bookings;
create trigger bookings_notifications
after update of status on public.bookings
for each row execute function private.notify_booking_decision();

-- Opportunity applications: provider staff gets a notification when a new
-- application arrives; student gets a notification when provider updates it.
create or replace function private.notify_application_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  provider_admin uuid;
  opp_title text;
  v_community uuid;   -- not named community_id: that clashes with community_memberships.community_id below
begin
  select o.title, o.provider_community_id into opp_title, v_community
  from public.opportunities o where o.id = coalesce(new.opportunity_id, old.opportunity_id);

  if tg_op = 'INSERT' and new.status = 'submitted' then
    for provider_admin in
      select cm.user_id from public.community_memberships cm
      where cm.community_id = v_community and cm.membership_state = 'admin'
    loop
      perform private.push_notification(
        provider_admin, 'opportunity_application', 'New application',
        'A student applied for ' || coalesce(opp_title, 'an opportunity') || '.',
        'opportunity_application', new.id, v_community
      );
    end loop;
  elsif tg_op = 'UPDATE' and old.status <> new.status and new.status in ('shortlisted', 'declined') then
    perform private.push_notification(
      new.applicant_id, 'application_update',
      case when new.status = 'shortlisted' then 'Application update' else 'Application declined' end,
      coalesce(opp_title, 'Your opportunity application') ||
        case when new.status = 'shortlisted' then ' moved to shortlisted.' else ' was declined.' end,
      'opportunity_application', new.id, v_community
    );
  end if;
  return new;
end;
$$;

drop trigger if exists opportunity_applications_notifications on public.opportunity_applications;
create trigger opportunity_applications_notifications
after insert or update of status on public.opportunity_applications
for each row execute function private.notify_application_change();

-- Media review notification.
create or replace function private.notify_media_review()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if old.approval_state = 'pending' and new.approval_state in ('approved', 'rejected') then
    perform private.push_notification(
      new.owner_id, 'media_review',
      case when new.approval_state = 'approved' then 'Photo approved' else 'Photo rejected' end,
      case when new.approval_state = 'approved' then 'Your photo is now approved for the post.' else coalesce(new.review_note, 'Your photo was not approved.') end,
      'media', new.id, null
    );
  end if;
  return new;
end;
$$;

drop trigger if exists post_media_notifications on public.post_media;
create trigger post_media_notifications
after update of approval_state on public.post_media
for each row execute function private.notify_media_review();

-- Private storage for post media. The app stores only storage_path in
-- public.post_media and obtains short-lived signed URLs when displaying media.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'veya-media', 'veya-media', false, 10485760,
  array['image/jpeg','image/png','image/webp','image/gif']::text[]
)
on conflict (id) do update set
  public = false,
  file_size_limit = 10485760,
  allowed_mime_types = excluded.allowed_mime_types;

-- Supabase Storage already manages RLS on storage.objects.
-- Do not ALTER the managed Storage table here; Supabase owns that table.

drop policy if exists "Veya media insert own" on storage.objects;
create policy "Veya media insert own"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'veya-media'
  and (storage.foldername(name))[1] = auth.uid()::text
  and (storage.extension(name) in ('jpg','jpeg','png','webp','gif'))
);

drop policy if exists "Veya media read own or approved" on storage.objects;
create policy "Veya media read own or approved"
on storage.objects for select to authenticated
using (
  bucket_id = 'veya-media'
  and (
    (storage.foldername(name))[1] = auth.uid()::text
    or private.is_staff(auth.uid())
    or exists (
      select 1 from public.post_media pm
      where pm.storage_path = storage.objects.name
        and pm.approval_state = 'approved'
    )
  )
);

drop policy if exists "Veya media delete own" on storage.objects;
create policy "Veya media delete own"
on storage.objects for delete to authenticated
using (
  bucket_id = 'veya-media'
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- Helpful indexes for Stage 4 inboxes and list screens.
create index if not exists notifications_unread_idx
  on public.notifications (recipient_id, read_at, created_at desc);
create index if not exists event_rsvps_user_idx
  on public.event_rsvps (user_id, created_at desc);
create index if not exists opportunity_saves_user_idx
  on public.opportunity_saves (user_id, created_at desc);
create index if not exists opportunity_applications_applicant_idx
  on public.opportunity_applications (applicant_id, created_at desc);
