import {
  type Content,
  type FunctionDeclaration,
  GoogleGenAI,
  ThinkingLevel,
  Type,
} from '@google/genai';
import 'dotenv/config';
import express, { type Request, type Response } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { createServer as createViteServer } from 'vite';
import {
  checkSupabaseHealth,
  createEstablishment,
  deleteEstablishment,
  getCatalogMetadata,
  getEstablishmentById,
  isSupabaseConfigured,
  listChatMessages,
  listEstablishments,
  saveChatTurn,
  updateEstablishment,
} from './src/server/db.ts';
import {
  type Establishment,
  type EstablishmentCategory,
  type EstablishmentInput,
  type ServiceInput,
} from './src/types/petcare.ts';

const PORT = Number(process.env.PORT) || 3000;

function validateEstablishmentInput(
  body: unknown
): { data?: EstablishmentInput; error?: string } {
  if (!body || typeof body !== 'object') {
    return { error: 'El cuerpo de la solicitud debe ser un objeto JSON válido.' };
  }

  const b = body as Record<string, unknown>;
  const name = typeof b.name === 'string' ? b.name.trim() : '';
  const category = typeof b.category === 'string' ? b.category.trim() : '';
  const address = typeof b.address === 'string' ? b.address.trim() : '';
  const phone = typeof b.phone === 'string' ? b.phone.trim() : '';
  const hours = typeof b.hours === 'string' ? b.hours.trim() : '';
  const description = typeof b.description === 'string' ? b.description.trim() : '';
  const latitude = Number(b.latitude);
  const longitude = Number(b.longitude);

  if (name.length < 2 || name.length > 140) {
    return { error: 'El nombre del establecimiento debe tener entre 2 y 140 caracteres.' };
  }
  if (category.length < 2 || category.length > 80) {
    return {
      error: 'La categoría del establecimiento debe tener entre 2 y 80 caracteres.',
    };
  }
  if (address.length < 4 || address.length > 240) {
    return { error: 'La dirección es obligatoria y debe tener al menos 4 caracteres.' };
  }
  if (phone.length < 5 || phone.length > 60) {
    return { error: 'El contacto/teléfono es obligatorio.' };
  }
  if (hours.length < 3 || hours.length > 160) {
    return { error: 'El horario de atención es obligatorio.' };
  }
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
    return { error: 'La latitud debe ser un número válido entre -90 y 90.' };
  }
  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    return { error: 'La longitud debe ser un número válido entre -180 y 180.' };
  }

  const petTypesRaw = Array.isArray(b.pet_types) ? b.pet_types : [];
  const pet_types = petTypesRaw
    .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    .map((item) => item.trim());

  if (pet_types.length === 0) {
    return { error: 'Seleccioná al menos un tipo de mascota que atiende el establecimiento.' };
  }

  const servicesRaw = Array.isArray(b.services) ? b.services : [];
  const services: ServiceInput[] = [];

  for (const rawSvc of servicesRaw) {
    if (!rawSvc || typeof rawSvc !== 'object') {
      return { error: 'Formato inválido en uno de los servicios.' };
    }
    const s = rawSvc as Record<string, unknown>;
    const svcName = typeof s.name === 'string' ? s.name.trim() : '';
    const svcCat = typeof s.category === 'string' ? s.category.trim() : '';
    const svcPet = typeof s.pet_type === 'string' ? s.pet_type.trim() : '';
    const svcDesc = typeof s.description === 'string' ? s.description.trim() : '';
    const price = Number(s.price_pyg);
    const duration =
      s.duration_minutes === null ||
      s.duration_minutes === undefined ||
      s.duration_minutes === ''
        ? null
        : Number(s.duration_minutes);

    if (!svcName) {
      return { error: 'Todos los servicios deben tener un nombre.' };
    }
    if (!svcCat) {
      return { error: `El servicio "${svcName}" debe incluir una categoría.` };
    }
    if (!svcPet) {
      return { error: `El servicio "${svcName}" debe indicar el tipo de mascota.` };
    }
    if (!Number.isFinite(price) || price < 0) {
      return { error: `El precio del servicio "${svcName}" debe ser un número mayor o igual a 0.` };
    }
    if (duration !== null && (!Number.isFinite(duration) || duration <= 0)) {
      return { error: `La duración del servicio "${svcName}" debe ser mayor a 0 minutos.` };
    }

    services.push({
      id: typeof s.id === 'string' ? s.id : undefined,
      name: svcName,
      category: svcCat,
      pet_type: svcPet,
      price_pyg: Math.round(price),
      duration_minutes: duration !== null ? Math.round(duration) : null,
      description: svcDesc,
    });
  }

  return {
    data: {
      name,
      category: category as EstablishmentCategory,
      address,
      phone,
      hours,
      latitude,
      longitude,
      pet_types,
      description,
      services,
    },
  };
}

const searchEstablishmentsTool: FunctionDeclaration = {
  name: 'consultar_establecimientos',
  description:
    'Busca y filtra establecimientos reales (veterinarias, peluquerías caninas y tiendas de mascotas) y sus servicios, precios y horarios registrados en la base de datos Supabase.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      texto_busqueda: {
        type: Type.STRING,
        description:
          'Palabra clave opcional para buscar por nombre, dirección o servicio (por ejemplo: "peluquería", "vacuna", "arenero", "urgencias").',
      },
      categoria: {
        type: Type.STRING,
        description:
          'Categoría opcional del establecimiento: "Veterinaria", "Peluquería Canina" o "Tienda de Mascotas".',
      },
      tipo_mascota: {
        type: Type.STRING,
        description:
          'Tipo de mascota opcional: "Perros", "Gatos", "Pequeños Animales" o "Aves y Roedores".',
      },
    },
  },
};

const listAllEstablishmentsTool: FunctionDeclaration = {
  name: 'listar_catalogo_completo',
  description:
    'Obtiene el catálogo completo de todos los establecimientos, direcciones, teléfonos, horarios, coordenadas y servicios con precios desde la base de datos.',
  parameters: {
    type: Type.OBJECT,
    properties: {},
  },
};

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  app.get('/api/health', async (_req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    const supabaseStatus = await checkSupabaseHealth();

    res.json({
      ok: true,
      storage: isSupabaseConfigured() ? 'supabase' : 'local',
      supabaseOk: supabaseStatus.ok,
      supabaseDetail: supabaseStatus.detail ?? null,
      missingTables: supabaseStatus.missingTables ?? [],
      geminiConfigured: Boolean(process.env.GEMINI_API_KEY?.trim()),
    });
  });

  app.get('/api/catalog-meta', async (_req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      const metadata = await getCatalogMetadata();
      res.json(metadata);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Error al cargar catálogos de Supabase.';
      res.status(500).json({ error: message });
    }
  });

  app.get('/api/chat/history', async (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      const sessionId =
        typeof req.query.sessionId === 'string' && req.query.sessionId.trim()
          ? req.query.sessionId.trim()
          : 'default';
      const messages = await listChatMessages(sessionId);
      res.json({ messages });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Error al obtener historial del asistente.';
      res.status(500).json({ error: message });
    }
  });

  app.get('/api/public-config', (_req: Request, res: Response) => {
    res.json({
      mapsApiKey:
        process.env.VITE_GOOGLE_MAPS_API_KEY?.trim() ||
        process.env.GOOGLE_MAPS_API_KEY?.trim() ||
        '',
    });
  });

  app.get('/api/establishments', async (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      const q = typeof req.query.q === 'string' ? req.query.q : undefined;
      const category =
        typeof req.query.category === 'string' ? req.query.category : undefined;
      const petType =
        typeof req.query.petType === 'string' ? req.query.petType : undefined;
      const serviceCategory =
        typeof req.query.serviceCategory === 'string'
          ? req.query.serviceCategory
          : undefined;

      const items = await listEstablishments({
        q,
        category,
        petType,
        serviceCategory,
      });
      res.json({ establishments: items });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Error al obtener los establecimientos.';
      res.status(500).json({ error: message });
    }
  });

  app.get('/api/establishments/:id', async (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      const id = String(req.params.id || '').trim();
      if (!id) {
        res.status(400).json({ error: 'ID inválido.' });
        return;
      }
      const item = await getEstablishmentById(id);
      if (!item) {
        res.status(404).json({ error: 'Establecimiento no encontrado.' });
        return;
      }
      res.json({ establishment: item });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Error al consultar el establecimiento.';
      res.status(500).json({ error: message });
    }
  });

  app.post('/api/establishments', async (req: Request, res: Response) => {
    const parsed = validateEstablishmentInput(req.body);
    if (!parsed.data) {
      res.status(400).json({ error: parsed.error });
      return;
    }

    try {
      const created = await createEstablishment(parsed.data);
      res.status(201).json({ establishment: created });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Error al registrar el establecimiento.';
      res.status(500).json({ error: message });
    }
  });

  app.put('/api/establishments/:id', async (req: Request, res: Response) => {
    const id = String(req.params.id || '').trim();
    if (!id) {
      res.status(400).json({ error: 'ID inválido.' });
      return;
    }

    const parsed = validateEstablishmentInput(req.body);
    if (!parsed.data) {
      res.status(400).json({ error: parsed.error });
      return;
    }

    try {
      const updated = await updateEstablishment(id, parsed.data);
      if (!updated) {
        res.status(404).json({ error: 'Establecimiento no encontrado.' });
        return;
      }
      res.json({ establishment: updated });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Error al actualizar el establecimiento.';
      res.status(500).json({ error: message });
    }
  });

  app.delete('/api/establishments/:id', async (req: Request, res: Response) => {
    const id = String(req.params.id || '').trim();
    if (!id) {
      res.status(400).json({ error: 'ID inválido.' });
      return;
    }

    try {
      const deleted = await deleteEstablishment(id);
      if (!deleted) {
        res.status(404).json({ error: 'Establecimiento no encontrado.' });
        return;
      }
      res.json({ deleted: true });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Error al eliminar el establecimiento.';
      res.status(500).json({ error: message });
    }
  });

  app.post('/api/chat', async (req: Request, res: Response) => {
    const apiKey = process.env.GEMINI_API_KEY?.trim();
    if (!apiKey) {
      res.status(500).json({
        error:
          'GEMINI_API_KEY no está configurada en el servidor. Configurala en las variables de entorno para habilitar el asistente.',
      });
      return;
    }

    const body = req.body as {
      message?: unknown;
      sessionId?: unknown;
      history?: Array<{ role?: string; content?: string }>;
    };
    const userMessage =
      typeof body?.message === 'string' ? body.message.trim() : '';
    const sessionId =
      typeof body?.sessionId === 'string' && body.sessionId.trim()
        ? body.sessionId.trim()
        : 'default';

    if (!userMessage) {
      res.status(400).json({ error: 'Escribí una consulta antes de enviar.' });
      return;
    }

    try {
      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          },
        },
      });

      const systemInstruction = `Sos PetCare AI, el asistente inteligente del sistema PetCare AI dedicado a veterinarias, peluquerías caninas y tiendas de mascotas en Asunción.

Reglas de comportamiento:
1. Respondé siempre en español claro, cordial y bien estructurado (usando listas cortas cuando sea útil).
2. Siempre que el usuario pregunte por establecimientos, peluquerías caninas, veterinarias, tiendas de mascotas, servicios, precios, direcciones, teléfonos u horarios, DEBÉS consultar los registros reales del sistema usando las herramientas "consultar_establecimientos" o "listar_catalogo_completo". Nunca inventes establecimientos, precios ni direcciones.
3. Si el usuario hace preguntas generales sobre cuidado de mascotas (como cuidados básicos de un cachorro, vacunas, alimentación o qué accesorios necesita un gato), brindá una orientación práctica y completa, y si existen establecimientos o servicios relacionados en el catálogo real, mencionalos como opción concreta.
4. Aclaración obligatoria en consultas de salud o cuidados veterinarios: recordá de forma breve y clara que la orientación brindada es informativa y **no sustituye la consulta presencial con un médico veterinario**.
5. Expresá los precios en guaraníes (Gs.) con separador de miles cuando cites servicios del catálogo.`;

      const historyContents: Content[] = Array.isArray(body?.history)
        ? body.history
            .filter(
              (m) =>
                (m.role === 'user' || m.role === 'assistant') &&
                typeof m.content === 'string' &&
                m.content.trim().length > 0
            )
            .slice(-10)
            .map((m) => ({
              role: m.role === 'assistant' ? 'model' : 'user',
              parts: [{ text: m.content!.trim() }],
            }))
        : [];

      const contents: Content[] = [
        ...historyContents,
        { role: 'user', parts: [{ text: userMessage }] },
      ];

      const referencedMap: Record<string, Establishment> = {};

      const callGeminiWithRetry = async () => {
        const attempts: Array<{ model: string; delayMs: number }> = [
          { model: 'gemini-4-hydrogen', delayMs: 0 },
          { model: 'gemini-4-hydrogen', delayMs: 800 },
          { model: 'gemini-3.1-flash-lite', delayMs: 500 },
        ];
        let lastError: unknown;
        for (let i = 0; i < attempts.length; i += 1) {
          const { model, delayMs } = attempts[i];
          if (delayMs > 0) {
            await new Promise((resolve) => setTimeout(resolve, delayMs));
          }
          try {
            return await ai.models.generateContent({
              model,
              contents,
              config: {
                systemInstruction,
                thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
                tools: [
                  {
                    functionDeclarations: [
                      searchEstablishmentsTool,
                      listAllEstablishmentsTool,
                    ],
                  },
                ],
              },
            });
          } catch (err) {
            lastError = err;
            const msg = err instanceof Error ? err.message : String(err);
            const isTransient =
              msg.includes('503') ||
              msg.includes('UNAVAILABLE') ||
              msg.includes('429') ||
              msg.includes('RESOURCE_EXHAUSTED');
            if (!isTransient || i === attempts.length - 1) {
              throw err;
            }
          }
        }
        throw lastError;
      };

      let response = await callGeminiWithRetry();

      let rounds = 0;
      while (response.functionCalls && response.functionCalls.length > 0 && rounds < 3) {
        rounds += 1;
        const modelContent = response.candidates?.[0]?.content;
        if (!modelContent) break;

        contents.push(modelContent);

        const toolResponseParts = [];
        for (const call of response.functionCalls) {
          let results: Establishment[] = [];
          if (call.name === 'listar_catalogo_completo') {
            results = await listEstablishments();
          } else if (call.name === 'consultar_establecimientos') {
            const args = (call.args ?? {}) as Record<string, unknown>;
            results = await listEstablishments({
              q:
                typeof args.texto_busqueda === 'string'
                  ? args.texto_busqueda
                  : undefined,
              category:
                typeof args.categoria === 'string' ? args.categoria : undefined,
              petType:
                typeof args.tipo_mascota === 'string'
                  ? args.tipo_mascota
                  : undefined,
            });
            if (results.length === 0) {
              results = await listEstablishments();
            }
          }

          for (const est of results) {
            referencedMap[est.id] = est;
          }

          toolResponseParts.push({
            functionResponse: {
              id: call.id,
              name: call.name ?? 'consultar_establecimientos',
              response: {
                total: results.length,
                establecimientos: results.map((est) => ({
                  id: est.id,
                  nombre: est.name,
                  categoria: est.category,
                  direccion: est.address,
                  telefono: est.phone,
                  horarios: est.hours,
                  tipos_de_mascotas: est.pet_types,
                  descripcion: est.description,
                  servicios: est.services.map((s) => ({
                    nombre: s.name,
                    categoria: s.category,
                    mascota: s.pet_type,
                    precio_gs: s.price_pyg,
                    duracion_min: s.duration_minutes,
                    descripcion: s.description,
                  })),
                })),
              },
            },
          });
        }

        contents.push({
          role: 'user',
          parts: toolResponseParts,
        });

        response = await callGeminiWithRetry();
      }

      const replyText =
        response.text?.trim() ||
        'No pude generar una respuesta en este momento. Intentá reformular tu consulta.';

      const referencedEstablishments = Object.values(referencedMap)
        .filter((est) => replyText.toLowerCase().includes(est.name.toLowerCase()))
        .map((est) => ({
          id: est.id,
          name: est.name,
          category: est.category,
          address: est.address,
        }));

      try {
        await saveChatTurn(sessionId, 'user', userMessage);
        await saveChatTurn(
          sessionId,
          'assistant',
          replyText,
          referencedEstablishments
        );
      } catch {
        // No bloquear la respuesta al usuario si la tabla chat_messages aún no fue creada
      }

      res.json({
        reply: replyText,
        referencedEstablishments,
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Error al comunicarse con la API de Gemini.';
      res.status(502).json({
        error: `No se pudo obtener respuesta del asistente: ${message}`,
      });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (req: Request, res: Response) => {
      if (req.path.startsWith('/api/')) {
        res.status(404).json({ error: 'Ruta de API no encontrada.' });
        return;
      }
      const indexFile = path.join(distDir, 'index.html');
      if (fs.existsSync(indexFile)) {
        res.sendFile(indexFile);
      } else {
        res.status(404).send('Compilación no encontrada.');
      }
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`PetCare AI escuchando en http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Error fatal al iniciar el servidor PetCare AI:', err);
  process.exit(1);
});
