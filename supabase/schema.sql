-- PetCare AI - Esquema completo PostgreSQL para Supabase
-- IMPORTANTE: Ejecutá este script en Supabase -> SQL Editor (no en Logs Explorer).
-- Es seguro ejecutarlo aunque ya hayas creado establishments y services antes.

create extension if not exists "pgcrypto";

-- 1. Categorías de establecimientos (Veterinaria, Peluquería Canina, Tienda de Mascotas, etc.)
create table if not exists public.establishment_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text not null default '',
  color_hex text not null default '#0F766E',
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

-- 2. Tipos de mascotas (Perros, Gatos, Pequeños Animales, Aves y Roedores, etc.)
create table if not exists public.pet_types (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text not null default '',
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

-- 3. Rubros / Categorías de servicios (Vacunación, Peluquería Canina, Accesorios, etc.)
create table if not exists public.service_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text not null default '',
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

-- 4. Establecimientos registrados en el catálogo y mapa
create table if not exists public.establishments (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text not null,
  address text not null,
  phone text not null,
  hours text not null,
  latitude double precision not null,
  longitude double precision not null,
  pet_types text[] not null default '{}',
  description text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.establishments
  drop constraint if exists establishments_category_check;

-- 5. Servicios y precios en guaraníes ofrecidos por cada establecimiento
create table if not exists public.services (
  id uuid primary key default gen_random_uuid(),
  establishment_id uuid not null references public.establishments(id) on delete cascade,
  name text not null,
  category text not null,
  pet_type text not null,
  price_pyg integer not null check (price_pyg >= 0),
  duration_minutes integer,
  description text not null default '',
  created_at timestamptz not null default now()
);

-- 6. Consultas sugeridas del Asistente Inteligente PetCare AI
create table if not exists public.suggested_queries (
  id uuid primary key default gen_random_uuid(),
  question text not null unique,
  category text not null default 'General',
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- 7. Historial de conversaciones y consultas al Asistente IA
create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  session_id text not null default 'default',
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  referenced_establishments jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

-- Índices para consultas rápidas
create index if not exists idx_establishments_category on public.establishments(category);
create index if not exists idx_services_establishment_id on public.services(establishment_id);
create index if not exists idx_services_category on public.services(category);
create index if not exists idx_chat_messages_session on public.chat_messages(session_id, created_at);

-- Trigger de actualización automática de updated_at
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_establishments_updated_at on public.establishments;
create trigger trg_establishments_updated_at
before update on public.establishments
for each row
execute function public.set_updated_at();

-- Habilitar Row Level Security (RLS) y políticas en todas las tablas
alter table public.establishment_categories enable row level security;
alter table public.pet_types enable row level security;
alter table public.service_categories enable row level security;
alter table public.establishments enable row level security;
alter table public.services enable row level security;
alter table public.suggested_queries enable row level security;
alter table public.chat_messages enable row level security;

drop policy if exists "Lectura publica de categorias" on public.establishment_categories;
create policy "Lectura publica de categorias"
  on public.establishment_categories for select using (true);
drop policy if exists "Escritura de categorias" on public.establishment_categories;
create policy "Escritura de categorias"
  on public.establishment_categories for all using (true) with check (true);

drop policy if exists "Lectura publica de tipos de mascotas" on public.pet_types;
create policy "Lectura publica de tipos de mascotas"
  on public.pet_types for select using (true);
drop policy if exists "Escritura de tipos de mascotas" on public.pet_types;
create policy "Escritura de tipos de mascotas"
  on public.pet_types for all using (true) with check (true);

drop policy if exists "Lectura publica de rubros de servicios" on public.service_categories;
create policy "Lectura publica de rubros de servicios"
  on public.service_categories for select using (true);
drop policy if exists "Escritura de rubros de servicios" on public.service_categories;
create policy "Escritura de rubros de servicios"
  on public.service_categories for all using (true) with check (true);

drop policy if exists "Lectura publica de establecimientos" on public.establishments;
create policy "Lectura publica de establecimientos"
  on public.establishments for select using (true);
drop policy if exists "Escritura de establecimientos" on public.establishments;
create policy "Escritura de establecimientos"
  on public.establishments for all using (true) with check (true);

drop policy if exists "Lectura publica de servicios" on public.services;
create policy "Lectura publica de servicios"
  on public.services for select using (true);
drop policy if exists "Escritura de servicios" on public.services;
create policy "Escritura de servicios"
  on public.services for all using (true) with check (true);

drop policy if exists "Lectura publica de consultas sugeridas" on public.suggested_queries;
create policy "Lectura publica de consultas sugeridas"
  on public.suggested_queries for select using (true);
drop policy if exists "Escritura de consultas sugeridas" on public.suggested_queries;
create policy "Escritura de consultas sugeridas"
  on public.suggested_queries for all using (true) with check (true);

drop policy if exists "Lectura publica de mensajes del asistente" on public.chat_messages;
create policy "Lectura publica de mensajes del asistente"
  on public.chat_messages for select using (true);
drop policy if exists "Escritura de mensajes del asistente" on public.chat_messages;
create policy "Escritura de mensajes del asistente"
  on public.chat_messages for all using (true) with check (true);

-- Datos iniciales de catálogos de la página web
insert into public.establishment_categories (name, description, color_hex, sort_order) values
  ('Veterinaria', 'Clínicas y hospitales veterinarios con atención médica y urgencias.', '#0F766E', 1),
  ('Peluquería Canina', 'Estética, baño terapéutico, corte e higiene para mascotas.', '#B45309', 2),
  ('Tienda de Mascotas', 'Pet shops de alimentos balanceados, accesorios y equipamiento.', '#4338CA', 3)
on conflict (name) do nothing;

insert into public.pet_types (name, description, sort_order) values
  ('Perros', 'Cachorros, adultos y razas grandes o pequeñas.', 1),
  ('Gatos', 'Felinos domésticos de todas las edades.', 2),
  ('Pequeños Animales', 'Conejos, cobayos y otras mascotas pequeñas.', 3),
  ('Aves y Roedores', 'Aves ornamentales, hámsters y roedores domésticos.', 4)
on conflict (name) do nothing;

insert into public.service_categories (name, description, sort_order) values
  ('Consulta Veterinaria', 'Evaluación clínica general, control de peso y carnet sanitario.', 1),
  ('Vacunación', 'Planes de vacunación para cachorros, refuerzos y desparasitación.', 2),
  ('Urgencias', 'Atención médica inmediata y estabilización 24 horas.', 3),
  ('Diagnóstico', 'Ecografías, laboratorio y análisis clínicos veterinarios.', 4),
  ('Peluquería Canina', 'Baños terapéuticos, cortes de raza y spa canino.', 5),
  ('Peluquería Felina', 'Cepillado y deslanado suave para gatos.', 6),
  ('Higiene', 'Corte de uñas, limpieza de oídos y cuidados básicos.', 7),
  ('Accesorios y Alimentos', 'Alimentos balanceados, areneros, rascadores, correas y placas.', 8)
on conflict (name) do nothing;

insert into public.suggested_queries (question, category, sort_order, is_active) values
  ('¿Qué cuidados básicos necesita un cachorro?', 'Cuidados Veterinarios', 1, true),
  ('¿Qué establecimientos ofrecen peluquería canina?', 'Catálogo y Servicios', 2, true),
  ('¿Qué accesorios necesita un gato?', 'Accesorios y Cuidado', 3, true)
on conflict (question) do nothing;

-- Carga inicial de 6 establecimientos reales de ejemplo (si la tabla está vacía)
do $$
declare
  est_id uuid;
begin
  if not exists (select 1 from public.establishments) then
    insert into public.establishments (name, category, address, phone, hours, latitude, longitude, pet_types, description)
    values (
      'Clínica Veterinaria San Roque',
      'Veterinaria',
      'Av. Mariscal López 1420 c/ Perú, Asunción',
      '+595 21 224 810',
      'Lun a Sáb: 08:00 - 20:00 · Urgencias 24h',
      -25.2886,
      -57.6195,
      array['Perros', 'Gatos', 'Pequeños Animales'],
      'Clínica integral con atención médica preventiva, planes de vacunación para cachorros y servicio de guardia nocturna.'
    ) returning id into est_id;

    insert into public.services (establishment_id, name, category, pet_type, price_pyg, duration_minutes, description) values
      (est_id, 'Consulta clínica general', 'Consulta Veterinaria', 'Perros y Gatos', 120000, 30, 'Evaluación física completa, control de peso y carnet sanitario.'),
      (est_id, 'Plan de vacunación cachorro / refuerzo', 'Vacunación', 'Perros y Gatos', 95000, 20, 'Aplicación de vacuna séxtuple, antirrábica o triple felina con registro.'),
      (est_id, 'Atención de urgencias 24 hs', 'Urgencias', 'Todas las Mascotas', 180000, 45, 'Estabilización clínica inmediata y monitoreo continuo.');

    insert into public.establishments (name, category, address, phone, hours, latitude, longitude, pet_types, description)
    values (
      'Guau & Estilo Peluquería Canina',
      'Peluquería Canina',
      'Senador Long 645 c/ España, Villa Morra, Asunción',
      '+595 981 452 310',
      'Mar a Sáb: 08:30 - 18:30',
      -25.2912,
      -57.5818,
      array['Perros'],
      'Estética canina libre de estrés con shampoos hipoalergénicos, secado silencioso y cortes adaptados a cada raza.'
    ) returning id into est_id;

    insert into public.services (establishment_id, name, category, pet_type, price_pyg, duration_minutes, description) values
      (est_id, 'Baño terapéutico y secado', 'Peluquería Canina', 'Perros', 85000, 60, 'Baño con productos dermatológicos, cepillado y perfumado suave.'),
      (est_id, 'Corte de raza y perfilado estético', 'Peluquería Canina', 'Perros', 135000, 90, 'Corte completo con tijera y máquina, incluye baño e higiene.'),
      (est_id, 'Corte de uñas y limpieza de oídos', 'Higiene', 'Perros', 45000, 25, 'Recorte seguro de uñas y limpieza auricular preventiva.');

    insert into public.establishments (name, category, address, phone, hours, latitude, longitude, pet_types, description)
    values (
      'Mundo Mascota Pet Shop',
      'Tienda de Mascotas',
      'Av. España 980 c/ Brasilia, Las Mercedes, Asunción',
      '+595 21 208 540',
      'Lun a Sáb: 09:00 - 20:00 · Dom: 10:00 - 14:00',
      -25.2841,
      -57.6054,
      array['Perros', 'Gatos', 'Aves y Roedores'],
      'Tienda especializada en nutrición balanceada, accesorios ergonómicos para gatos y perros, y juguetes interactivos.'
    ) returning id into est_id;

    insert into public.services (establishment_id, name, category, pet_type, price_pyg, duration_minutes, description) values
      (est_id, 'Kit inicial para gatos (arenero, rascador y comedero)', 'Accesorios y Alimentos', 'Gatos', 240000, null, 'Combo completo con bandeja sanitaria, pala, rascador de sisal y doble plato.'),
      (est_id, 'Alimento balanceado premium cachorros 15 kg', 'Accesorios y Alimentos', 'Perros', 310000, null, 'Fórmula alta en proteínas y DHA para crecimiento saludable.'),
      (est_id, 'Placa identificatoria grabada y asesoría nutricional', 'Accesorios y Alimentos', 'Perros y Gatos', 40000, 15, 'Grabado láser inmediato con nombre y teléfono del tutor.');

    insert into public.establishments (name, category, address, phone, hours, latitude, longitude, pet_types, description)
    values (
      'Hospital Veterinario Carmelitas',
      'Veterinaria',
      'Malutín 712 c/ Guido Spano, Carmelitas, Asunción',
      '+595 21 612 900',
      'Lun a Dom: 24 horas',
      -25.2804,
      -57.5712,
      array['Perros', 'Gatos', 'Aves y Roedores'],
      'Centro veterinario de alta complejidad con laboratorio propio, diagnóstico por imágenes y baños medicados supervisados.'
    ) returning id into est_id;

    insert into public.services (establishment_id, name, category, pet_type, price_pyg, duration_minutes, description) values
      (est_id, 'Ecografía y análisis clínicos veterinarios', 'Diagnóstico', 'Perros y Gatos', 210000, 40, 'Estudio abdominal completo y hemograma con entrega en el día.'),
      (est_id, 'Desparasitación interna y externa', 'Vacunación', 'Perros y Gatos', 65000, 15, 'Dosificación ajustada por peso para cachorros y adultos.'),
      (est_id, 'Baño medicado dermatológico', 'Peluquería Canina', 'Perros y Gatos', 110000, 60, 'Tratamiento tópico supervisado para pieles sensibles o alergias.');

    insert into public.establishments (name, category, address, phone, hours, latitude, longitude, pet_types, description)
    values (
      'Patitas Limpias Spa & Grooming',
      'Peluquería Canina',
      'Av. Carlos Antonio López 1850, Sajonia, Asunción',
      '+595 971 334 890',
      'Lun a Sáb: 08:00 - 19:00',
      -25.2899,
      -57.6512,
      array['Perros', 'Gatos'],
      'Peluquería canina y felina equipada con tinas ergonómicas, ozonoterapia y servicio de traslado puerta a puerta.'
    ) returning id into est_id;

    insert into public.services (establishment_id, name, category, pet_type, price_pyg, duration_minutes, description) values
      (est_id, 'Peluquería canina completa (baño, corte y uñas)', 'Peluquería Canina', 'Perros', 120000, 90, 'Servicio integral de higiene, corte higiénico y acabado estético.'),
      (est_id, 'Cepillado y deslanado suave para gatos', 'Peluquería Felina', 'Gatos', 115000, 60, 'Remoción de pelo muerto y nudos sin sedación en ambiente tranquilo.'),
      (est_id, 'Spa relajante con ozonoterapia', 'Peluquería Canina', 'Perros', 150000, 75, 'Hidratación profunda de manto y alivio dérmico con agua ozonizada.');

    insert into public.establishments (name, category, address, phone, hours, latitude, longitude, pet_types, description)
    values (
      'La Huella Boutique & Veterinaria',
      'Tienda de Mascotas',
      'Av. Choferes del Chaco 1120, Recoleta, Asunción',
      '+595 982 770 125',
      'Lun a Sáb: 08:30 - 19:30',
      -25.2995,
      -57.5901,
      array['Perros', 'Gatos'],
      'Boutique de accesorios y alimentos naturales con consultorio preventivo y peluquería canina express.'
    ) returning id into est_id;

    insert into public.services (establishment_id, name, category, pet_type, price_pyg, duration_minutes, description) values
      (est_id, 'Transportadora rígida, arnés y correa antitirones', 'Accesorios y Alimentos', 'Perros y Gatos', 195000, null, 'Equipamiento seguro para traslados veterinarios y paseos diarios.'),
      (est_id, 'Peluquería canina express (baño y recorte higiénico)', 'Peluquería Canina', 'Perros', 90000, 50, 'Limpieza rápida ideal entre cortes completos.'),
      (est_id, 'Consulta preventiva y control de peso', 'Consulta Veterinaria', 'Perros y Gatos', 100000, 30, 'Chequeo general, control dental y guía de alimentación.');
  end if;
end $$;
