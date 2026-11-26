# PetCare AI

Sistema web dinámico dedicado a veterinarias, peluquerías caninas y tiendas de mascotas, con persistencia en **Supabase**, mapa interactivo con **Google Maps** y asistente inteligente integrado con **Gemini API**.

## Funcionalidades principales

- **Catálogo dinámico**: establecimientos con categoría, dirección, teléfono, horarios, coordenadas (`latitude`, `longitude`) y servicios con precios en guaraníes (`Gs.`) y duración.
- **CRUD completo (Altas, Bajas, Modificaciones y Consultas)**: creación, edición y eliminación de establecimientos y sus servicios tanto desde la vista de catálogo como desde la tabla de gestión.
- **Búsqueda y filtrado**: filtro en tiempo real por texto, tipo de establecimiento, tipo de mascota (`Perros`, `Gatos`, `Pequeños Animales`, `Aves y Roedores`) y categoría de servicio.
- **Mapa interactivo con Google Maps**: marcadores avanzados por categoría con `InfoWindow` informativo y selector de coordenadas por clic en el mapa al registrar o editar establecimientos.
- **Asistente inteligente PetCare AI (Gemini)**: chat conectado en tiempo real a los registros de Supabase mediante *function calling*, con orientación general sobre mascotas (aclarando que no sustituye al médico veterinario).

---

## 1. Configuración de Supabase

1. Creá un nuevo proyecto en [Supabase](https://supabase.com/).
2. En el menú lateral, abrí **SQL Editor** y ejecutá el contenido completo del archivo `supabase/schema.sql`. Esto creará las tablas `establishments` y `services`, sus políticas de seguridad y cargará los 6 establecimientos iniciales.
3. En **Project Settings → API**, copiá:
   - **Project URL** (`SUPABASE_URL`)
   - **service_role secret** (`SUPABASE_SERVICE_ROLE_KEY`)

---

## 2. Variables de entorno

Copiá `.env.example` a `.env` para desarrollo local (nunca subas `.env` a GitHub):

```bash
GEMINI_API_KEY=tu_clave_de_gemini
SUPABASE_URL=https://tu-proyecto.supabase.co
SUPABASE_SERVICE_ROLE_KEY=tu_service_role_key
VITE_GOOGLE_MAPS_API_KEY=tu_clave_de_google_maps
```

> **Seguridad:** `GEMINI_API_KEY` y `SUPABASE_SERVICE_ROLE_KEY` se utilizan únicamente en el servidor (`server.ts`) y nunca se envían al navegador. Para `VITE_GOOGLE_MAPS_API_KEY`, restringí la clave por *HTTP referrers* y APIs permitidas en Google Cloud Console.

---

## 3. Publicación en GitHub

```bash
git init
git add .
git commit -m "Implementación completa de PetCare AI con Supabase, Google Maps y Gemini"
git branch -M main
git remote add origin https://github.com/TU_USUARIO/petcare-ai.git
git push -u origin main
```

---

## 4. Despliegue en Render

1. Ingresá a [Render](https://render.com/) y seleccioná **New + → Web Service** (o **Blueprint** usando `render.yaml`).
2. Conectá tu repositorio de GitHub `petcare-ai`.
3. Configurá:
   - **Build Command:** `npm install && npm run build`
   - **Start Command:** `npm start`
4. Agregá las **Environment Variables** en Render:
   - `NODE_ENV` = `production`
   - `GEMINI_API_KEY`
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `VITE_GOOGLE_MAPS_API_KEY`
5. Desplegá el servicio. En **Environment**, recordá configurar en Google Cloud Console el dominio público `https://tu-app.onrender.com/*` dentro de las restricciones HTTP referrer de tu clave de Google Maps.
