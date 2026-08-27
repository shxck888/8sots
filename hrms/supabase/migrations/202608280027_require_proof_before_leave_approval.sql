begin;

-- A proof-required leave request may be submitted before the employee has the
-- file ready, but it cannot be approved until at least one attachment exists.
-- Rejection remains available so a reviewer can close an invalid request.
do $migration$
declare
  v_definition text;
  v_anchor text := $old$  if p_review_note is not null and char_length\(trim\(p_review_note\)\) > 500 then
    raise exception 'review note too long' using errcode = '22023';
  end if;$old$;
  v_replacement text := $new$  if p_review_note is not null and char_length(trim(p_review_note)) > 500 then
    raise exception 'review note too long' using errcode = '22023';
  end if;
  if p_decision = 'approved' and exists (
    select 1
    from public.work_requests wr
    join public.leave_types lt
      on lt.tenant_id = wr.tenant_id and lt.id = wr.leave_type_id
    where wr.tenant_id = p_tenant_id
      and wr.id = p_request_id
      and wr.request_type = 'leave'
      and lt.requires_proof
      and not exists (
        select 1 from public.work_request_attachments attachment
        where attachment.tenant_id = wr.tenant_id
          and attachment.work_request_id = wr.id
      )
  ) then
    raise exception 'required leave proof missing' using errcode = '23514';
  end if;$new$;
begin
  select pg_get_functiondef(
    'public.decide_work_request(uuid,uuid,public.work_request_decision_type,text)'::regprocedure
  ) into v_definition;
  if v_definition = regexp_replace(v_definition, v_anchor, v_replacement) then
    raise exception 'decide_work_request proof insertion point not found';
  end if;
  execute regexp_replace(v_definition, v_anchor, v_replacement);
end;
$migration$;

commit;
