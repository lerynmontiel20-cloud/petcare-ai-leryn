-- PetCare AI - Esquema PostgreSQL para Supabase
-- Ejecutá este script completo en el SQL Editor de tu proyecto Supabase.

create extension if not exists "pgcrypto";

create table if not exists public.establishments (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text not null check (category in ('Veterinaria', 'Peluquería Canina', 'Tienda de Mascotas')),
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

create index if not exists idx_establishments_category on public.establishments(category);
create index if not exists idx_services_establishment_id on public.services(establishment_id);
create index if not exists idx_services_category on public.services(category);

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

alter table public.establishments enable row level security;
alter table public.services enable row level security;

-- Políticas de lectura y escritura para uso con clave pública o de servicio en servidor
drop policy if exists "Lectura publica de establecimientos" on public.establishments;
create policy "Lectura publica de establecimientos"
  on public.establishments for select
  using (true);

drop policy if exists "Escritura de establecimientos" on public.establishments;
create policy "Escritura de establecimientos"
  on public.establishments for all
  using (true)
  with check (true);

drop policy if exists "Lectura publica de servicios" on public.services;
create policy "Lectura publica de servicios"
  on public.services for select
  using (true);

drop policy if exists "Escritura de servicios" on public.services;
create policy "Escritura de servicios"
  on public.services for all
  using (true)
  with check (true);

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
