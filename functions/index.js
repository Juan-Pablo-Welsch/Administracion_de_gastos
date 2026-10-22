const { onCall, onRequest, HttpsError } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const { GoogleGenAI, Type } = require("@google/genai");
const crypto = require("crypto");

const GEMINI_API_KEY = defineSecret("GEMINI_API_KEY");
const MP_ACCESS_TOKEN = defineSecret("MP_ACCESS_TOKEN");
const MP_WEBHOOK_SECRET = defineSecret("MP_WEBHOOK_SECRET");

// 💰 EL PRECIO VIVE ACÁ — cambiar este número alcanza para ajustar la suscripción
const PRECIO_PRO_ARS = 3500;
const URL_APP = "https://zorwel-gastos-mensuales.firebaseapp.com/index.html";

exports.procesarMovimientoPorVoz = onCall(
  { secrets: [GEMINI_API_KEY], region: "us-central1" },
  async (request) => {

    // 🔐 Solo usuarios logueados pueden usar esto
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Debés iniciar sesión para usar esta función.");
    }

    const { audioBase64, mimeType, categorias, fechaHoy } = request.data;

    if (!audioBase64 || !mimeType) {
      throw new HttpsError("invalid-argument", "Falta el audio grabado.");
    }
    // categorias viene como array de objetos { value, label }
    if (!Array.isArray(categorias) || categorias.length === 0) {
      throw new HttpsError("invalid-argument", "Falta la lista de categorías de la casa.");
    }
    if (!fechaHoy) {
      throw new HttpsError("invalid-argument", "Falta la fecha de hoy.");
    }

    const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY.value() });

    // Le mandamos al modelo solo los LABELS legibles (ej: "Supermercado"),
    // después mapeamos su elección de vuelta al VALUE real (ej: "SUPERMERCADO")
    const listaLabels = categorias.map(c => c.label).join(", ");

    const prompt = `Sos un asistente que interpreta un audio en español rioplatense (Argentina) donde una persona describe un gasto o ingreso de dinero para una app de finanzas familiares.

La fecha de HOY es: ${fechaHoy} (formato YYYY-MM-DD).

Categorías disponibles (elegí SIEMPRE una de esta lista exacta, la que mejor coincida semánticamente, nunca inventes una categoría nueva): ${listaLabels}

Instrucciones:
- "tipo": "egreso" si la persona gastó plata, "ingreso" si recibió plata (sueldo, cobro, etc).
- "categoria": elegí el texto EXACTO de una de las categorías de la lista de arriba.
- "detalle": un resumen corto (máximo 6 palabras) de qué se compró o el motivo.
- "monto": el número en pesos argentinos, sin puntos ni comas, solo el valor numérico.
- "fecha": resolvé expresiones relativas ("hoy", "ayer", "anteayer", "el sábado pasado", etc) tomando como referencia que HOY es ${fechaHoy}. Devolvé siempre en formato YYYY-MM-DD. Si no menciona ninguna fecha, usá HOY.

Respondé ÚNICAMENTE con el JSON pedido, sin texto adicional ni explicaciones.`;

    try {
      const response = await ai.models.generateContent({
        model: "gemini-flash-lite-latest",
        contents: [
          {
            role: "user",
            parts: [
              { text: prompt },
              { inlineData: { mimeType: mimeType, data: audioBase64 } }
            ]
          }
        ],
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              tipo: { type: Type.STRING, enum: ["ingreso", "egreso"] },
              categoria: { type: Type.STRING },
              detalle: { type: Type.STRING },
              monto: { type: Type.NUMBER },
              fecha: { type: Type.STRING }
            },
            required: ["tipo", "categoria", "detalle", "monto", "fecha"]
          },
          temperature: 0.1
        }
      });

      const resultado = JSON.parse(response.text);

      // Mapeamos el label elegido de vuelta al value real de esa categoría
      const catEncontrada = categorias.find(c => c.label === resultado.categoria);
      resultado.categoria_value = catEncontrada ? catEncontrada.value : categorias[0].value;

      return resultado;

    } catch (error) {
      console.error("Error llamando a Gemini:", error);
      throw new HttpsError("internal", "No se pudo interpretar el audio. Intentá de nuevo o cargalo manualmente.");
    }
  }
);


// ====================================================================
// 📝 RESUMEN NARRATIVO PARA EL MAIL
// ====================================================================
exports.generarResumenNarrativo = onCall(
  { secrets: [GEMINI_API_KEY], region: "us-central1" },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Debés iniciar sesión.");
    }

    const { datosResumen } = request.data;
    if (!datosResumen) {
      throw new HttpsError("invalid-argument", "Faltan los datos del resumen.");
    }

    const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY.value() });

        const prompt = `Sos un asistente financiero que redacta un resumen corto en español de Argentina, tratando al usuario de "vos", para un mail de reporte mensual de finanzas familiares.

Datos del período (JSON): ${JSON.stringify(datosResumen)}

Instrucciones:
- Escribí entre 2 y 4 oraciones, tono profesional y cordial, sin modismos ni muletillas coloquiales (nada de "che"), sin emojis.
- Mencioná el dato más relevante o llamativo (por ejemplo: si el balance fue negativo o positivo, si alguna categoría subió mucho, si mejoró respecto al mes anterior).
- No inventes números que no están en los datos. Usá solo lo que te paso.
- No uses la palabra "resumen" ni frases genéricas de introducción, andá directo al contenido.
- Respondé solo el texto plano, sin comillas ni markdown.`;

    try {
      const response = await ai.models.generateContent({
        model: "gemini-flash-lite-latest",
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        config: { temperature: 0.4 }
      });

      return { texto: response.text.trim() };

    } catch (error) {
      console.error("Error generando resumen narrativo:", error);
      throw new HttpsError("internal", "No se pudo generar el resumen narrativo.");
    }
  }
);

// ====================================================================
// 🤖 CHAT: "PREGUNTALE A TUS FINANZAS"
// La IA interpreta la pregunta y arma un filtro; el código hace las cuentas.
// ====================================================================
const MODELO_IA = "gemini-flash-lite-latest";

const normalizarTexto = (t) =>
  String(t || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();

const formatearARS = (n) => {
  const redondeado = Math.round(n);
  return (redondeado < 0 ? "-" : "") + "$" + Math.abs(redondeado).toLocaleString("es-AR");
};

function resumirMovimientos(lista) {
  const total = lista.reduce((suma, m) => suma + m.monto, 0);
  const porMes = {};
  lista.forEach((m) => { porMes[m.mes_ref] = (porMes[m.mes_ref] || 0) + m.monto; });
  Object.keys(porMes).forEach((mes) => { porMes[mes] = formatearARS(porMes[mes]); });

  const mayores = [...lista]
    .sort((a, b) => b.monto - a.monto)
    .slice(0, 5)
    .map((m) => ({ fecha: m.fecha, categoria: m.categoria, detalle: m.detalle, monto: formatearARS(m.monto) }));

  return { total: formatearARS(total), cantidad: lista.length, por_mes: porMes, mayores_movimientos: mayores };
}

function calcularConsulta(movimientos, filtro) {
  const categoriaNorm = filtro.categoria ? normalizarTexto(filtro.categoria) : "";
  const meses = (filtro.meses || []).filter((m) => /^\d{4}-\d{2}$/.test(m));
  const terminos = (filtro.textos_detalle || []).filter((t) => normalizarTexto(t));

  const base = movimientos.filter((m) => {
    if (filtro.tipo !== "ambos" && m.tipo !== filtro.tipo) return false;
    if (meses.length && !meses.includes(m.mes_ref)) return false;
    if (categoriaNorm && normalizarTexto(m.categoria) !== categoriaNorm) return false;
    return true;
  });

  const coincide = (m, termino) => normalizarTexto(m.detalle).includes(normalizarTexto(termino));
  const filtrados = terminos.length ? base.filter((m) => terminos.some((t) => coincide(m, t))) : base;

  const resultado = {
    filtro_aplicado: {
      tipo: filtro.tipo,
      categoria: filtro.categoria || "cualquiera",
      textos_en_detalle: terminos,
      meses: meses.length ? meses : "todo el período"
    },
    ...resumirMovimientos(filtrados)
  };

  if (terminos.length > 1) {
    resultado.por_termino = terminos.map((t) => ({
      texto: t,
      ...resumirMovimientos(base.filter((m) => coincide(m, t)))
    }));
  }
  return resultado;
}

exports.responderPreguntaFinanciera = onCall(
  { secrets: [GEMINI_API_KEY], region: "us-central1" },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Debés iniciar sesión.");
    }

    const { pregunta, resumenDatos, movimientos, periodo, fechaHoy } = request.data;

    if (!pregunta || typeof pregunta !== "string" || !resumenDatos) {
      throw new HttpsError("invalid-argument", "Falta la pregunta o los datos.");
    }
    if (pregunta.length > 500) {
      throw new HttpsError("invalid-argument", "La pregunta es demasiado larga.");
    }

    const lista = (Array.isArray(movimientos) ? movimientos : [])
      .slice(0, 5000)
      .map((m) => ({
        fecha: String(m.fecha || ""),
        mes_ref: String(m.mes_ref || ""),
        tipo: m.tipo === "ingreso" ? "ingreso" : "egreso",
        categoria: String(m.categoria || ""),
        detalle: String(m.detalle || ""),
        monto: Number(m.monto) || 0
      }));

    const categoriasDisponibles = [...new Set(lista.map((m) => m.categoria).filter(Boolean))];
    const mesesDisponibles = [...new Set(lista.map((m) => m.mes_ref).filter(Boolean))].sort();
    const desde = (periodo && periodo.desde) || mesesDisponibles[0] || "";
    const hasta = (periodo && periodo.hasta) || mesesDisponibles[mesesDisponibles.length - 1] || "";
    const hoy = /^\d{4}-\d{2}-\d{2}$/.test(fechaHoy || "") ? fechaHoy : new Date().toISOString().slice(0, 10);

    const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY.value() });

    try {
      // PASO 1: la IA convierte la pregunta en un filtro (no ve ningún movimiento)
      let filtro = null;
      if (lista.length > 0) {
        try {
          const promptFiltro = `Sos un intérprete de preguntas para una app de finanzas familiares. NO respondas la pregunta: convertila en un filtro de búsqueda.

Fecha de hoy: ${hoy}.
Período con datos cargados: ${desde} a ${hasta}. Meses con movimientos: ${mesesDisponibles.join(", ")}.
Categorías existentes (valores exactos): ${categoriasDisponibles.join(", ")}.

Pregunta del usuario: "${pregunta}"

Reglas:
- "tipo_consulta": "filtro" si la pregunta pide un monto, una cantidad o un listado de movimientos que se pueda obtener filtrando por tipo, categoría, texto del detalle o mes. "general" si pide opinión, consejos, comparaciones amplias o algo que no se reduce a un filtro.
- "tipo": "ingreso" si habla de ingresos, cobros o sueldos; "egreso" si habla de gastos o pagos; "ambos" si no lo aclara.
- "textos_detalle": palabras clave (nombres de personas, lugares, productos) que el usuario quiere buscar dentro del detalle de los movimientos. Una sola palabra o nombre por elemento, sin artículos. Vacío si no pide ninguna.
- "categoria": copiá EXACTAMENTE uno de los valores de la lista si la pregunta nombra una categoría; si no, dejalo vacío ("").
- "meses": lista de meses en formato YYYY-MM a los que se refiere la pregunta (resolvé "este mes", "el mes pasado" o nombres de meses usando la fecha de hoy). Vacío si se refiere a todo el período.`;

          const respFiltro = await ai.models.generateContent({
            model: MODELO_IA,
            contents: [{ role: "user", parts: [{ text: promptFiltro }] }],
            config: {
              responseMimeType: "application/json",
              responseSchema: {
                type: Type.OBJECT,
                properties: {
                  tipo_consulta: { type: Type.STRING, enum: ["filtro", "general"] },
                  tipo: { type: Type.STRING, enum: ["ingreso", "egreso", "ambos"] },
                  categoria: { type: Type.STRING },
                  textos_detalle: { type: Type.ARRAY, items: { type: Type.STRING } },
                  meses: { type: Type.ARRAY, items: { type: Type.STRING } }
                },
                required: ["tipo_consulta", "tipo", "categoria", "textos_detalle", "meses"]
              },
              temperature: 0
            }
          });
          filtro = JSON.parse(respFiltro.text);
        } catch (errFiltro) {
          console.error("No se pudo interpretar el filtro, se responde en modo general:", errFiltro);
          filtro = null;
        }
      }

      // PASO 2: el código calcula y la IA solo redacta el resultado
      let promptRespuesta;
      if (filtro && filtro.tipo_consulta === "filtro") {
        const calculo = calcularConsulta(lista, filtro);
        promptRespuesta = `Sos el asistente financiero de la app ZorWel. Respondés en español de Argentina, tratando al usuario de "vos", con tono profesional y cordial. No uses modismos ni muletillas coloquiales (nada de "che", "dale", "bárbaro", "mirá"), no saludes ni uses interjecciones: andá directo a la respuesta.

Pregunta del usuario: "${pregunta}"

Resultado ya calculado de forma exacta sobre los movimientos del período ${desde} a ${hasta} (JSON): ${JSON.stringify(calculo)}

Instrucciones:
- Respondé usando ÚNICAMENTE este resultado. Copiá los montos tal cual figuran, sin recalcular ni redondear.
- Si "cantidad" es 0, decí que no hay movimientos que cumplan ese criterio en el período, mencionando qué se buscó.
- Si hay "por_termino", informá el resultado de cada texto por separado.
- Los nombres de categoría vienen en mayúsculas con guiones bajos; escribilos en forma natural (ej: "Supermercado").
- Mencioná el período analizado cuando ayude a entender la respuesta.
- Respondé en 1 a 3 oraciones, sin repetir la pregunta.`;
      } else {
        promptRespuesta = `Sos el asistente financiero de la app ZorWel. Respondés en español de Argentina, tratando al usuario de "vos", con tono profesional y cordial. No uses modismos ni muletillas coloquiales (nada de "che", "dale", "bárbaro", "mirá"), no saludes ni uses interjecciones: andá directo a la respuesta.

Estos son los datos financieros reales de la casa del usuario, agrupados por mes y categoría (JSON): ${JSON.stringify(resumenDatos)}

Pregunta del usuario: "${pregunta}"

Instrucciones:
- Respondé ÚNICAMENTE en base a los datos provistos arriba. Si la pregunta no se puede responder con esos datos, decilo claramente en vez de inventar.
- Sé breve: 1 a 3 oraciones, directo al grano.
- Si corresponde, mencioná montos en pesos argentinos con el formato $X.XXX.
- No repitas la pregunta, respondé directo.`;
      }

      const respuesta = await ai.models.generateContent({
        model: MODELO_IA,
        contents: [{ role: "user", parts: [{ text: promptRespuesta }] }],
        config: { temperature: 0.2 }
      });

      return { respuesta: respuesta.text.trim() };

    } catch (error) {
      console.error("Error respondiendo pregunta financiera:", error);
      throw new HttpsError("internal", "No se pudo procesar la pregunta.");
    }
  }
);


// ====================================================================
// 💳 CREAR SUSCRIPCIÓN DE MERCADO PAGO (vinculada a la casa)
// ====================================================================
exports.crearSuscripcionMP = onCall(
  { secrets: [MP_ACCESS_TOKEN], region: "us-central1" },
  async (request) => {

    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Debés iniciar sesión.");
    }

    const { familiaId } = request.data;
    const emailUsuario = request.auth.token.email;

    if (!familiaId) {
      throw new HttpsError("invalid-argument", "Falta el ID de la casa.");
    }

        // Se carga acá adentro, no arriba de todo, para que el deploy no se demore leyendo este paquete
    const { MercadoPagoConfig, PreApproval } = require("mercadopago");

    const client = new MercadoPagoConfig({
      accessToken: MP_ACCESS_TOKEN.value(),
      options: { timeout: 5000 }
    });

    const preapproval = new PreApproval(client);

    try {
            const resultado = await preapproval.create({
        body: {
          reason: "ZorWel Premium — Administración de Gastos",
          external_reference: familiaId,
          payer_email: emailUsuario,
          back_url: URL_APP,
          auto_recurring: {
            frequency: 1,
            frequency_type: "months",
            transaction_amount: PRECIO_PRO_ARS,
            currency_id: "ARS"
          }
        }
      });

      return { init_point: resultado.init_point };

    } catch (error) {
      console.error("Error creando suscripción MP:", error);
      throw new HttpsError("internal", "No se pudo generar el link de pago. Intentá de nuevo.");
    }
  }
);

// ====================================================================
// 🔔 WEBHOOK DE MERCADO PAGO
// MP avisa; la función consulta el estado real a MP y recién ahí escribe
// es_pro. Lo que trae el aviso nunca se toma como verdad.
// ====================================================================
const GRACIA_DIAS = 5;
const DIAS_SIN_FECHA = 35;
const DIA_MS = 24 * 60 * 60 * 1000;

function firmaValida(req, secreto) {
  const xSignature = req.get("x-signature");
  const xRequestId = req.get("x-request-id");
  if (!xSignature || !secreto) return false;

  const partes = {};
  xSignature.split(",").forEach((p) => {
    const i = p.indexOf("=");
    if (i > 0) partes[p.slice(0, i).trim()] = p.slice(i + 1).trim();
  });
  if (!partes.ts || !partes.v1) return false;

  let dataId = String(req.query["data.id"] || (req.body && req.body.data && req.body.data.id) || "");
  if (/^[a-z0-9]+$/i.test(dataId)) dataId = dataId.toLowerCase();

  // Si algún valor no viene en el aviso, esa parte se omite del manifiesto
  let manifiesto = "";
  if (dataId) manifiesto += `id:${dataId};`;
  if (xRequestId) manifiesto += `request-id:${xRequestId};`;
  manifiesto += `ts:${partes.ts};`;

  const esperado = crypto.createHmac("sha256", secreto).update(manifiesto).digest("hex");
  const a = Buffer.from(esperado);
  const b = Buffer.from(partes.v1);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

async function obtenerSuscripcionMP(id, token) {
  const resp = await fetch(`https://api.mercadopago.com/preapproval/${encodeURIComponent(id)}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (resp.status === 404) return null;
  if (!resp.ok) throw new Error(`Mercado Pago respondió ${resp.status} al consultar la suscripción ${id}`);
  return resp.json();
}

async function aplicarEstadoSuscripcion(preapproval) {
  const admin = require("firebase-admin");
  if (!admin.apps.length) admin.initializeApp();
  const db = admin.firestore();

  const familiaId = preapproval.external_reference;
  if (!familiaId) return { ok: false, motivo: "la suscripción no trae external_reference", id: preapproval.id };

  const ref = db.collection("familias").doc(familiaId);
  const snap = await ref.get();
  if (!snap.exists) return { ok: false, motivo: "la casa no existe", familiaId };

  const datos = {
    mp_preapproval_id: preapproval.id,
    mp_status: preapproval.status,
    mp_actualizado: admin.firestore.FieldValue.serverTimestamp()
  };

  if (preapproval.status === "authorized") {
    const proximo = preapproval.next_payment_date ? new Date(preapproval.next_payment_date) : null;
    const base = proximo && !isNaN(proximo.getTime()) ? proximo : new Date(Date.now() + DIAS_SIN_FECHA * DIA_MS);
    datos.es_pro = true;
    datos.pro_hasta = admin.firestore.Timestamp.fromDate(new Date(base.getTime() + GRACIA_DIAS * DIA_MS));
  }
  // paused / cancelled / pending: no se toca es_pro ni pro_hasta.
  // El PRO vence solo cuando pasa pro_hasta (lo apaga el job diario).

  await ref.set(datos, { merge: true });
  return { ok: true, familiaId, estado: preapproval.status, es_pro_activado: preapproval.status === "authorized" };
}

exports.webhookMercadoPago = onRequest(
  { secrets: [MP_ACCESS_TOKEN, MP_WEBHOOK_SECRET], region: "us-central1", invoker: "public" },
  async (req, res) => {
    if (req.method !== "POST") {
      return res.status(405).send("Método no permitido");
    }

    if (!firmaValida(req, MP_WEBHOOK_SECRET.value())) {
      console.warn("Webhook MP rechazado: firma inválida");
      return res.status(401).send("Firma inválida");
    }

    const tipo = req.body && req.body.type;
    const dataId = req.body && req.body.data && req.body.data.id;

    if (tipo !== "subscription_preapproval" || !dataId) {
      console.log("Webhook MP ignorado (tipo no manejado):", tipo);
      return res.status(200).send("ok");
    }

    try {
      const preapproval = await obtenerSuscripcionMP(dataId, MP_ACCESS_TOKEN.value());
      if (!preapproval) {
        console.warn("Suscripción no encontrada en MP (¿simulación?):", dataId);
        return res.status(200).send("ok");
      }
      const resultado = await aplicarEstadoSuscripcion(preapproval);
      console.log("Suscripción procesada:", JSON.stringify(resultado));
      return res.status(200).send("ok");
    } catch (error) {
      console.error("Error procesando webhook MP:", error);
      return res.status(500).send("error"); // MP reintenta
    }
  }
);