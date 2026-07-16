alter table public.attachments
  add column subject public.subject_code;

create index attachments_exam_subject_order_idx
  on public.attachments (exam_id, subject, page_order)
  where deleted_at is null;

comment on column public.attachments.subject is
  'Optional subject associated with an answer sheet or exam image.';
