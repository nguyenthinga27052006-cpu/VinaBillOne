create table if not exists staff (
  id serial primary key,
  full_name varchar(150) not null,
  email varchar(255) not null unique,
  role varchar(20) not null check (role in ('admin','chief','accountant','viewer')),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists customer_groups (
  id serial primary key,
  name varchar(100) not null unique,
  discount_percent numeric(5,2) not null default 0
);

create table if not exists customers (
  id serial primary key,
  code varchar(50) not null unique,
  name varchar(255) not null,
  tax_code varchar(20),
  address text,
  email varchar(255),
  phone varchar(20),
  customer_type varchar(20) not null check (customer_type in ('enterprise','individual')),
  payment_term_days int not null default 30,
  credit_limit numeric(18,2),
  group_id int references customer_groups(id),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists tax_rates (
  id serial primary key,
  name varchar(80) not null,
  rate numeric(5,2) not null,
  is_active boolean not null default true
);

create table if not exists products (
  id serial primary key,
  code varchar(50) not null unique,
  name varchar(255) not null,
  unit varchar(30) not null default 'lần',
  unit_price numeric(18,2) not null default 0,
  tax_rate_id int not null references tax_rates(id),
  category varchar(80) not null default 'Dịch vụ',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists invoice_series (
  id serial primary key,
  code varchar(20) not null unique,
  name varchar(120) not null,
  prefix varchar(20) not null default '',
  current_number int not null default 0,
  year int not null,
  is_active boolean not null default true
);

create table if not exists invoices (
  id serial primary key,
  invoice_number varchar(50),
  series_id int not null references invoice_series(id),
  customer_id int not null references customers(id),
  issue_date date not null,
  due_date date not null,
  status varchar(20) not null default 'draft'
    check (status in ('draft','pending','issued','partial','paid','overdue','adjusted','cancelled')),
  subtotal numeric(18,2) not null default 0,
  tax_amount numeric(18,2) not null default 0,
  total_amount numeric(18,2) not null default 0,
  paid_amount numeric(18,2) not null default 0,
  currency char(3) not null default 'VND',
  notes text,
  e_invoice_id varchar(100),
  xml_body text,
  created_by int not null references staff(id),
  issued_at timestamptz,
  cancelled_at timestamptz,
  cancel_reason text,
  adjusted_from_id int references invoices(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (series_id, invoice_number)
);

create index if not exists idx_invoices_customer_status on invoices (customer_id, status, issue_date);
create index if not exists idx_invoices_due_date on invoices (due_date, status);
create index if not exists idx_invoices_status on invoices (status);

create table if not exists invoice_items (
  id serial primary key,
  invoice_id int not null references invoices(id) on delete cascade,
  product_id int references products(id),
  description varchar(500) not null,
  quantity numeric(18,4) not null default 1,
  unit_price numeric(18,2) not null default 0,
  discount_percent numeric(5,2) not null default 0,
  tax_rate_id int not null references tax_rates(id),
  tax_amount numeric(18,2) not null default 0,
  line_total numeric(18,2) not null default 0,
  sort_order int not null default 0
);

create table if not exists invoice_status_history (
  id serial primary key,
  invoice_id int not null references invoices(id) on delete cascade,
  from_status varchar(20),
  to_status varchar(20) not null,
  note text,
  actor_id int not null references staff(id),
  created_at timestamptz not null default now()
);

create table if not exists payment_methods (
  id serial primary key,
  code varchar(30) not null unique,
  name varchar(80) not null
);

create table if not exists payments (
  id serial primary key,
  customer_id int not null references customers(id),
  payment_date date not null,
  amount numeric(18,2) not null check (amount > 0),
  payment_method_id int not null references payment_methods(id),
  reference varchar(100),
  status varchar(20) not null default 'confirmed'
    check (status in ('draft','confirmed','reversed')),
  notes text,
  recorded_by int not null references staff(id),
  created_at timestamptz not null default now()
);

create table if not exists payment_allocations (
  id serial primary key,
  payment_id int not null references payments(id) on delete cascade,
  invoice_id int not null references invoices(id),
  allocated_amount numeric(18,2) not null check (allocated_amount > 0),
  allocated_at timestamptz not null default now(),
  unique (payment_id, invoice_id)
);

create index if not exists idx_allocations_invoice on payment_allocations (invoice_id);

create table if not exists reminder_rules (
  id serial primary key,
  name varchar(120) not null,
  days_overdue int not null,
  channel varchar(20) not null default 'email',
  template text not null,
  is_active boolean not null default true
);

create table if not exists reminder_logs (
  id serial primary key,
  invoice_id int not null references invoices(id),
  rule_id int references reminder_rules(id),
  reminder_type varchar(20) not null default 'email',
  status varchar(20) not null default 'sent'
    check (status in ('scheduled','sending','sent','failed','cancelled')),
  sent_at timestamptz,
  content_snapshot text,
  provider_response text,
  retry_count int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists audit_logs (
  id serial primary key,
  actor_id int not null references staff(id),
  action varchar(80) not null,
  entity_type varchar(40) not null,
  entity_id int not null,
  summary text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_audit_created on audit_logs (created_at desc);

create table if not exists system_settings (
  key varchar(80) primary key,
  value text not null
);

create table if not exists seed_meta (
  id int primary key check (id = 1),
  seeded_at timestamptz not null default now()
);
