-- Work request proof attachment integration test.
-- Run as a Supabase project owner in SQL Editor. Every fixture is rolled back.
-- A successful run returns one row with all booleans true, then ROLLBACK.

begin;

select set_config('test.proof_tenant', id::text, true)
from public.tenants where slug = '8sots' limit 1;
select set_config('test.proof_user', gen_random_uuid()::text, true);
select set_config('test.proof_employee', gen_random_uuid()::text, true);
select set_config('test.proof_membership', gen_random_uuid()::text, true);
select set_config('test.proof_outsider', gen_random_uuid()::text, true);
select set_config('test.proof_outsider_tenant', gen_random_uuid()::text, true);

do $$
begin
  if current_setting('test.proof_tenant', true) is null then
    raise exception 'production tenant fixture not found';
  end if;
  if (select requires_proof from public.leave_types
      where tenant_id = current_setting('test.proof_tenant')::uuid and code = 'SICK') is not true then
    raise exception 'sick leave requires_proof not set';
  end if;
end;
$$;

insert into auth.users (id, email, aud, role)
values (
  current_setting('test.proof_user')::uuid,
  'proof-fixture@auth.8sots.com.tw', 'authenticated', 'authenticated'
);

insert into public.tenant_memberships (id, tenant_id, user_id, status)
values (
  current_setting('test.proof_membership')::uuid,
  current_setting('test.proof_tenant')::uuid,
  current_setting('test.proof_user')::uuid,
  'active'
);

insert into public.employees (id, tenant_id, auth_user_id, employee_no, full_name, hire_date, status)
values (
  current_setting('test.proof_employee')::uuid,
  current_setting('test.proof_tenant')::uuid,
  current_setting('test.proof_user')::uuid,
  'PROOF-FIXTURE', 'Proof Fixture Employee', current_date, 'active'
);

-- Outsider in a separate tenant (no access to the request above).
insert into public.tenants (id, name, slug)
values (current_setting('test.proof_outsider_tenant')::uuid, 'Proof Test Tenant', 'proof-test-fixture');

insert into auth.users (id, email, aud, role)
values (
  current_setting('test.proof_outsider')::uuid,
  'proof-outsider@auth.8sots.com.tw', 'authenticated', 'authenticated'
);

insert into public.tenant_memberships (tenant_id, user_id, status)
values (
  current_setting('test.proof_outsider_tenant')::uuid,
  current_setting('test.proof_outsider')::uuid,
  'active'
);

set local role authenticated;

-- Owner creates a leave request and attaches a proof.
select set_config('request.jwt.claim.sub', current_setting('test.proof_user'), true);

do $$
declare
  v_leave_type uuid;
  v_request uuid;
  v_attachment uuid;
begin
  select id into v_leave_type from public.leave_types
  where tenant_id = current_setting('test.proof_tenant')::uuid and code = 'SICK';

  v_request := public.create_work_request(
    to_char(current_date + 10, 'YYYY-MM-DD') || ' 13:00',
    gen_random_uuid()::text,
    v_leave_type,
    '病假就醫，附證明',
    'leave',
    to_char(current_date + 10, 'YYYY-MM-DD') || ' 09:00',
    current_setting('test.proof_tenant')::uuid
  );
  perform set_config('test.proof_request', v_request::text, true);

  v_attachment := public.attach_work_request_proof(
    current_setting('test.proof_tenant')::uuid, v_request,
    current_setting('test.proof_tenant') || '/' || current_setting('test.proof_user') || '/' || v_request || '/cert.pdf',
    'cert.pdf', 'application/pdf', 20480
  );
  if v_attachment is null then raise exception 'proof attachment failed'; end if;
end;
$$;

-- Outsider cannot attach a proof to the owner's request.
select set_config('request.jwt.claim.sub', current_setting('test.proof_outsider'), true);

do $$
begin
  begin
    perform public.attach_work_request_proof(
      current_setting('test.proof_tenant')::uuid,
      current_setting('test.proof_request')::uuid,
      current_setting('test.proof_tenant') || '/x/y/hack.pdf',
      'hack.pdf', 'application/pdf', 1024
    );
    raise exception 'unauthorized proof attach unexpectedly succeeded';
  exception
    when sqlstate '42501' then null;
  end;
end;
$$;

-- After withdrawal the owner can no longer attach proofs.
select set_config('request.jwt.claim.sub', current_setting('test.proof_user'), true);

do $$
begin
  perform public.withdraw_work_request(
    current_setting('test.proof_tenant')::uuid,
    current_setting('test.proof_request')::uuid
  );
  begin
    perform public.attach_work_request_proof(
      current_setting('test.proof_tenant')::uuid,
      current_setting('test.proof_request')::uuid,
      current_setting('test.proof_tenant') || '/' || current_setting('test.proof_user') || '/late.pdf',
      'late.pdf', 'application/pdf', 2048
    );
    raise exception 'withdrawn request proof attach unexpectedly succeeded';
  exception
    when sqlstate '55000' then null;
  end;
end;
$$;

reset role;

select
  true as owner_attach_ok,
  true as unauthorized_attach_blocked,
  true as withdrawn_attach_blocked;

rollback;
