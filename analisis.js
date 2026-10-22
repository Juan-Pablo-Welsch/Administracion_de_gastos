// analisis.js - ZorWel Analytics Pro (Estructura Separada)
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
// 🚨 Agregamos doc y getDoc a las importaciones
import { getFirestore, collection, query, where, getDocs, addDoc, doc, getDoc, updateDoc, orderBy, limit } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-functions.js";

const firebaseConfig = {
    apiKey: "AIzaSyCMLX7f_oLO-kxp5aQCGVz3VC124pQpJxQ",
    authDomain: "zorwel-gastos-mensuales.firebaseapp.com",
    projectId: "zorwel-gastos-mensuales",
    storageBucket: "zorwel-gastos-mensuales.firebasestorage.app",
    messagingSenderId: "770642369665",
    appId: "1:770642369665:web:dede4d3d980b084c304180"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
const functions = getFunctions(app);
const responderPreguntaFinanciera = httpsCallable(functions, 'responderPreguntaFinanciera');
const generarResumenNarrativo = httpsCallable(functions, 'generarResumenNarrativo');

let graficoEvolucion = null, chartBarrasH = null, chartLineasSalud = null;

let familiaIdActual = null;
let rolUsuarioActual = 'admin';
let familiaSaldoInicialActual = 0;
let nombreFamiliaActual = '';
let datosParaIA = null;
let movimientosParaIA = [];

const COLECCION = "movimientos";
const formatoMoneda = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' });

// =====================================================================
// 1. EL PATOVICA (Control de Acceso SaaS)
// =====================================================================
onAuthStateChanged(auth, async (user) => {
    if (user) {
        const emailLimpio = user.email.toLowerCase().trim();
        familiaIdActual = user.uid;
        rolUsuarioActual = 'admin';

        try {
            // 1. ¿Es invitado (esposa/hijo) o es dueño de la casa?
            const invitacionRef = doc(db, "invitaciones", emailLimpio);
            const invitacionSnap = await getDoc(invitacionRef);
            
            if (invitacionSnap.exists()) {
                familiaIdActual = invitacionSnap.data().familia_id;
                rolUsuarioActual = invitacionSnap.data().rol;
            }

            // 2. Control de Menores (El hijo no ve las finanzas globales de la casa)
            if (rolUsuarioActual === 'dependiente') {
                await Swal.fire({
                    icon: 'info',
                    title: 'Área Restringida',
                    text: 'El panel de análisis es solo para los administradores de la casa.',
                    confirmButtonText: 'Volver a mi Billetera',
                    confirmButtonColor: '#1D4ED8',
                    allowOutsideClick: false,
                    allowEscapeKey: false
                });
                window.location.href = "index.html";
                return; // Corta la ejecución acá
            }

            // 3. Verificamos la Suscripción de la Casa (El Muro de Pago)
            const familiaRef = doc(db, "familias", familiaIdActual);
            const familiaSnap = await getDoc(familiaRef);

                        if (familiaSnap.exists() && familiaSnap.data().es_pro === true) {
                // 🟢 LA CASA PAGÓ (o son ustedes): Pasa directo al análisis
                console.log("💎 Usuario PRO detectado. Cargando Análisis...");
                                familiaSaldoInicialActual = familiaSnap.data().saldo_inicial || 0;
                nombreFamiliaActual = familiaSnap.data().nombre_familia || '';
                const hoy = new Date();
                const hace4 = new Date(hoy.getFullYear(), hoy.getMonth() - 3, 1);
                document.getElementById('fecha-desde').value = `${hace4.getFullYear()}-${String(hace4.getMonth() + 1).padStart(2, '0')}`;
                document.getElementById('fecha-hasta').value = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}`;
                
                // Ejecutamos tu motor principal
                ejecutarAnalisisAvanzado(); 
                calcularSaldoAcumuladoReal();
                cargarDeudasActivas();
            } else {
                // 🔴 LA CASA ES FREE: Salta el candado
                // 🔴 LA CASA ES FREE: Salta el candado con fondo difuminado
                Swal.fire({
                    icon: 'warning',
                    title: '💎 ZorWel Análisis Pro',
                    html: `
                        <p class="text-sm text-gray-600 dark:text-gray-300 mb-4">Descubrí tus gastos invisibles y tu score financiero.</p>
                        <div class="bg-blue-50 dark:bg-slate-700 border border-blue-200 dark:border-slate-600 p-3 rounded-lg text-left text-sm">
                            <p class="font-bold text-blue-800 dark:text-blue-300 mb-1">Pasate a Premium para desbloquear:</p>
                            <ul class="text-blue-700 dark:text-blue-200 list-disc list-inside">
                                <li>Gráficos de Evolución Financiera</li>
                                <li>Gestión Familiar (Cuentas compartidas)</li>
                                <li>Alertas de Vencimiento de Boletas</li>
                            </ul>
                        </div>
                    `,
                    confirmButtonText: '🚀 Ver Suscripción',
                    confirmButtonColor: '#1D4ED8',
                    showCancelButton: true,
                    cancelButtonText: 'Volver al Inicio',
                    cancelButtonColor: '#64748b',
                    allowOutsideClick: false,
                    allowEscapeKey: false,
                    // 👇 ACÁ ESTÁ LA MAGIA DEL BLUR PREMIUM 👇
                    backdrop: `
                        rgba(15, 23, 42, 0.6)
                        backdrop-filter: blur(8px)
                        -webkit-backdrop-filter: blur(8px)
                    `
                }).then((result) => {
                    if (result.isConfirmed) {
                        window.open("https://www.mercadopago.com.ar/subscriptions/checkout?preapproval_plan_id=9c1ac7363ca448a98c8a212de92028a8", "_blank");
                        window.location.href = "index.html"; 
                    } else {
                        window.location.href = "index.html"; 
                    }
                });
            }
        } catch (error) {
            console.error("Error validando accesos:", error);
            window.location.href = "index.html";
        }
    } else {
        // No está logueado, lo mandamos al index
        window.location.href = "index.html";
    }
});

// =====================================================================
// 💼 SALDO ACUMULADO REAL
// =====================================================================
async function calcularSaldoAcumuladoReal() {
    try {
        const q = query(
            collection(db, COLECCION),
            where("uid", "==", familiaIdActual)
        );
        const snapshot = await getDocs(q);

        let ingresosHistoricos = 0;
        let egresosHistoricos = 0;

        snapshot.forEach(docSnap => {
            const m = docSnap.data();
            const monto = parseFloat(m.monto) || 0;
            if (m.tipo === 'ingreso' && !m.esMesada) {
                ingresosHistoricos += monto;
            } else if (m.tipo === 'egreso' || m.esMesada) {
                egresosHistoricos += monto;
            }
        });

        const saldoReal = familiaSaldoInicialActual + ingresosHistoricos - egresosHistoricos;

        const elValor = document.getElementById('saldo-acumulado-valor');
        if (elValor) {
            elValor.textContent = formatoMoneda.format(saldoReal);
            elValor.className = `text-2xl sm:text-3xl font-black mt-1 ${saldoReal >= 0 ? 'text-success' : 'text-danger'}`;
        }
    } catch (error) {
        console.error("Error calculando saldo acumulado real:", error);
    }
}

window.abrirEditarSaldoInicial = async () => {
    const { value: nuevoSaldo } = await Swal.fire({
        title: '💼 Saldo Inicial Declarado',
        html: `<p class="text-xs text-gray-500 dark:text-gray-400 mb-3 text-left">Es la plata que ya tenías (banco, efectivo, etc.) antes de empezar a usar ZorWel. Se suma a tu historial completo para calcular tu Saldo Acumulado Real.</p>`,
        input: 'number',
        inputValue: familiaSaldoInicialActual,
        inputPlaceholder: 'Ej: 500000',
        showCancelButton: true,
        confirmButtonText: 'Guardar',
        cancelButtonText: 'Cancelar',
        confirmButtonColor: '#1D4ED8',
        background: document.documentElement.classList.contains('dark') ? '#1e293b' : '#ffffff',
        color: document.documentElement.classList.contains('dark') ? '#f8fafc' : '#1f2937'
    });

    if (nuevoSaldo !== undefined && nuevoSaldo !== null && nuevoSaldo !== '') {
        try {
            const familiaRef = doc(db, "familias", familiaIdActual);
            await updateDoc(familiaRef, {
                saldo_inicial: parseFloat(nuevoSaldo) || 0,
                saldo_inicial_fecha: new Date()
            });
            familiaSaldoInicialActual = parseFloat(nuevoSaldo) || 0;
            await calcularSaldoAcumuladoReal();
        } catch (error) {
            console.error("Error guardando saldo inicial:", error);
            Swal.fire('Error', 'No se pudo guardar el saldo inicial.', 'error');
        }
    }
};

// =====================================================================
// 📋 CONTROL DE DEUDAS
// =====================================================================
const DEUDAS_COLLECCION = "deudas_pendientes";
const FIJOS_CONFIG_COLLECCION = "fijos_config";
const MESES_A_ESCANEAR = 12;

function mesActualRef() {
    const hoy = new Date();
    return `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}`;
}

async function buscarFijosImpagos() {
    const contenedor = document.getElementById('contenedor-impagos-detectados');
    contenedor.innerHTML = '<p class="text-xs text-gray-400 italic">Escaneando meses anteriores...</p>';

    const mesActual = mesActualRef();
    const hallazgos = [];

    try {
        const qConfigs = query(
            collection(db, FIJOS_CONFIG_COLLECCION),
            where("uid", "==", familiaIdActual)
        );
        const configsSnap = await getDocs(qConfigs);

        for (const configDoc of configsSnap.docs) {
            const config = configDoc.data();
            const mesRef = config.mes_ref;
            if (!mesRef || mesRef >= mesActual) continue; // solo meses pasados

            const camposIgnorar = ['uid', 'mes_ref', 'fechaActualizacion', 'ultimaActualizacion', 'limites_variables'];

            for (const catKey in config) {
                if (camposIgnorar.includes(catKey)) continue;
                const item = config[catKey];
                if (!item || typeof item !== 'object') continue;
                if (item.activo === false) continue;
                const montoEstimado = item.monto || 0;
                if (montoEstimado <= 0) continue;

                // ¿Ya está convertido en deuda?
                const qYaExiste = query(
                    collection(db, DEUDAS_COLLECCION),
                    where("uid", "==", familiaIdActual),
                    where("mes_origen", "==", mesRef),
                    where("categoria", "==", catKey)
                );
                const yaExisteSnap = await getDocs(qYaExiste);
                if (!yaExisteSnap.empty) continue;

                // ¿Cuánto se pagó realmente ese mes de ese fijo?
                const qPagos = query(
                    collection(db, COLECCION),
                    where("uid", "==", familiaIdActual),
                    where("mes_ref", "==", mesRef),
                    where("categoria", "==", catKey),
                    where("tipo", "==", "egreso")
                );
                const pagosSnap = await getDocs(qPagos);
                let pagado = 0;
                pagosSnap.forEach(d => pagado += (parseFloat(d.data().monto) || 0));

                if (pagado < montoEstimado) {
                    hallazgos.push({
                        categoria: catKey,
                        label: item.detalle ? `${catKey} (${item.detalle})` : catKey,
                        mes_origen: mesRef,
                        monto_original: montoEstimado - pagado
                    });
                }
            }
        }

        renderizarImpagosDetectados(hallazgos);

    } catch (error) {
        console.error("Error buscando fijos impagos:", error);
        contenedor.innerHTML = '<p class="text-xs text-red-500">Error al escanear. Intentá de nuevo.</p>';
    }
}

async function marcarComoDeuda(hallazgo, botonEl) {
    botonEl.disabled = true;
    botonEl.textContent = 'Guardando...';

    try {
        await addDoc(collection(db, DEUDAS_COLLECCION), {
            uid: familiaIdActual,
            categoria: hallazgo.categoria,
            label: hallazgo.label,
            mes_origen: hallazgo.mes_origen,
            monto_original: hallazgo.monto_original,
            pagos: [],
            estado: "pendiente",
            fecha_creacion: new Date(),
            fecha_saldada: null
        });

        const filaEl = botonEl.closest('div.flex.justify-between');
        if (filaEl) filaEl.remove();

        await cargarDeudasActivas();

    } catch (error) {
        console.error("Error marcando como deuda:", error);
        botonEl.disabled = false;
        botonEl.textContent = '+ Marcar como Deuda';
        Swal.fire('Error', 'No se pudo guardar la deuda.', 'error');
    }
}

async function cargarDeudasActivas() {
    const contenedor = document.getElementById('lista-deudas-activas');
    contenedor.innerHTML = '<p class="text-xs text-gray-400 italic">Cargando...</p>';

    try {
        const q = query(
            collection(db, DEUDAS_COLLECCION),
            where("uid", "==", familiaIdActual),
            where("estado", "in", ["pendiente", "parcial"])
        );
        const snap = await getDocs(q);

        if (snap.empty) {
            contenedor.innerHTML = '<p class="text-xs text-green-500 font-medium py-2">✅ No tenés deudas activas.</p>';
            return;
        }

        const deudas = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        window._deudasActivas = deudas;

        contenedor.innerHTML = deudas.map((d, i) => {
            const pagado = (d.pagos || []).reduce((sum, p) => sum + (parseFloat(p.monto) || 0), 0);
            const porcentaje = Math.min(100, (pagado / d.monto_original) * 100);
            const pendiente = Math.max(0, d.monto_original - pagado);

            return `
                <div class="p-3 bg-gray-50 dark:bg-slate-700/50 border border-gray-100 dark:border-gray-600 rounded-xl">
                    <div class="flex justify-between items-start mb-2">
                        <div>
                            <p class="text-sm font-bold text-gray-800 dark:text-white">${d.label}</p>
                            <p class="text-[10px] text-gray-500 dark:text-gray-400">Origen: ${d.mes_origen} · Debía: ${formatoMoneda.format(d.monto_original)}</p>
                        </div>
                        <button data-idx="${i}" class="btn-registrar-pago bg-primary hover:bg-blue-700 text-white text-[10px] font-bold px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap">
                            💳 Registrar Pago
                        </button>
                    </div>
                    <div class="w-full bg-gray-200 dark:bg-slate-600 rounded-full h-2 mb-1">
                        <div class="bg-success h-2 rounded-full transition-all" style="width: ${porcentaje}%"></div>
                    </div>
                    <p class="text-[10px] text-gray-500 dark:text-gray-400">
                        Pagado: ${formatoMoneda.format(pagado)} · Pendiente: <b class="text-danger">${formatoMoneda.format(pendiente)}</b>
                    </p>
                </div>
            `;
        }).join('');

        document.querySelectorAll('.btn-registrar-pago').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const idx = parseInt(e.currentTarget.dataset.idx);
                abrirModalRegistrarPago(window._deudasActivas[idx]);
            });
        });

    } catch (error) {
        console.error("Error cargando deudas activas:", error);
        contenedor.innerHTML = '<p class="text-xs text-red-500">Error al cargar deudas.</p>';
    }
}

let deudasSaldadasYaCargadas = false;

document.getElementById('btn-toggle-deudas-saldadas')?.addEventListener('click', async () => {
    const lista = document.getElementById('lista-deudas-saldadas');
    const icono = document.getElementById('icon-deudas-saldadas');
    const estaOculto = lista.classList.contains('hidden');

    if (estaOculto) {
        lista.classList.remove('hidden');
        icono.textContent = '▲';
        if (!deudasSaldadasYaCargadas) {
            await cargarDeudasSaldadas();
            deudasSaldadasYaCargadas = true;
        }
    } else {
        lista.classList.add('hidden');
        icono.textContent = '▼';
    }
});

async function cargarDeudasSaldadas() {
    const contenedor = document.getElementById('lista-deudas-saldadas');
    contenedor.innerHTML = '<p class="text-xs text-gray-400 italic">Cargando...</p>';

    try {
        const q = query(
            collection(db, DEUDAS_COLLECCION),
            where("uid", "==", familiaIdActual),
            where("estado", "==", "pagada")
        );
        const snap = await getDocs(q);

        if (snap.empty) {
            contenedor.innerHTML = '<p class="text-xs text-gray-400 italic">Todavía no saldaste ninguna deuda.</p>';
            return;
        }

        const deudas = snap.docs.map(d => ({ id: d.id, ...d.data() }));

        deudas.sort((a, b) => {
            const fa = a.fecha_saldada?.toDate ? a.fecha_saldada.toDate() : new Date(0);
            const fb = b.fecha_saldada?.toDate ? b.fecha_saldada.toDate() : new Date(0);
            return fb - fa;
        });

        contenedor.innerHTML = deudas.map(d => {
            const pagado = (d.pagos || []).reduce((sum, p) => sum + (parseFloat(p.monto) || 0), 0);
            const porcSobrepago = ((pagado - d.monto_original) / d.monto_original) * 100;
            const tuvoSobrepago = porcSobrepago > 0.5;

            const fechaSaldada = d.fecha_saldada?.toDate
                ? d.fecha_saldada.toDate().toLocaleDateString('es-AR')
                : '—';

            return `
                <div class="p-3 bg-gray-50 dark:bg-slate-700/30 border border-gray-100 dark:border-gray-700 rounded-xl opacity-90">
                    <div class="flex justify-between items-start">
                        <div>
                            <p class="text-sm font-bold text-gray-700 dark:text-gray-300">✅ ${d.label}</p>
                            <p class="text-[10px] text-gray-500 dark:text-gray-400">Origen: ${d.mes_origen} · Saldada: ${fechaSaldada}</p>
                        </div>
                        ${tuvoSobrepago ? `
                            <span class="text-[10px] bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 px-2 py-1 rounded-lg font-bold whitespace-nowrap">
                                +${porcSobrepago.toFixed(1)}% de más
                            </span>
                        ` : `
                            <span class="text-[10px] bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 px-2 py-1 rounded-lg font-bold whitespace-nowrap">
                                Sin recargo
                            </span>
                        `}
                    </div>
                    <p class="text-[10px] text-gray-500 dark:text-gray-400 mt-1">
                        Debías: ${formatoMoneda.format(d.monto_original)} · Pagaste en total: ${formatoMoneda.format(pagado)}
                    </p>
                </div>
            `;
        }).join('');

    } catch (error) {
        console.error("Error cargando deudas saldadas:", error);
        contenedor.innerHTML = '<p class="text-xs text-red-500">Error al cargar el historial.</p>';
    }
}

async function abrirModalRegistrarPago(deuda) {
    const pagadoActual = (deuda.pagos || []).reduce((sum, p) => sum + (parseFloat(p.monto) || 0), 0);
    const pendienteActual = Math.max(0, deuda.monto_original - pagadoActual);

    const { value: formValues } = await Swal.fire({
        title: `💳 Pagar: ${deuda.label}`,
        html: `
            <div class="text-left space-y-3">
                <p class="text-xs text-gray-500 dark:text-gray-400">Pendiente actual: <b>${formatoMoneda.format(pendienteActual)}</b></p>
                <label class="block text-xs font-bold text-gray-500 uppercase">Monto a pagar</label>
                <input id="swal-monto-pago" type="number" class="swal2-input !mt-1" placeholder="Ej: ${pendienteActual}">
                <label class="block text-xs font-bold text-gray-500 uppercase">Fecha del pago</label>
                <input id="swal-fecha-pago" type="date" class="swal2-input !mt-1" value="${new Date().toISOString().split('T')[0]}">
            </div>
        `,
        showCancelButton: true,
        confirmButtonText: 'Registrar Pago',
        confirmButtonColor: '#1D4ED8',
        background: document.documentElement.classList.contains('dark') ? '#1e293b' : '#ffffff',
        color: document.documentElement.classList.contains('dark') ? '#f8fafc' : '#1f2937',
        preConfirm: () => {
            const monto = parseFloat(document.getElementById('swal-monto-pago').value);
            const fecha = document.getElementById('swal-fecha-pago').value;
            if (!monto || monto <= 0 || !fecha) {
                Swal.showValidationMessage('Ingresá un monto y una fecha válidos.');
                return false;
            }
            return { monto, fecha };
        }
    });

    if (formValues) {
        await registrarPagoDeuda(deuda, formValues.monto, formValues.fecha);
    }
}

async function registrarPagoDeuda(deuda, monto, fecha) {
    try {
        const nuevosPagos = [...(deuda.pagos || []), { fecha, monto }];
        const totalPagado = nuevosPagos.reduce((sum, p) => sum + (parseFloat(p.monto) || 0), 0);

        const nuevoEstado = totalPagado >= deuda.monto_original ? "pagada" : "parcial";
        const datosActualizar = {
            pagos: nuevosPagos,
            estado: nuevoEstado
        };

        if (nuevoEstado === "pagada") {
            datosActualizar.fecha_saldada = new Date();
        }

        await updateDoc(doc(db, DEUDAS_COLLECCION, deuda.id), datosActualizar);

        // También lo registramos como movimiento normal, para que no se pierda del historial
        const mesRefPago = fecha.substring(0, 7);
        await addDoc(collection(db, COLECCION), {
            uid: familiaIdActual,
            quien_cargo: auth.currentUser.email,
            fecha: fecha,
            tipo: 'egreso',
            categoria: deuda.categoria,
            detalle: `Pago deuda: ${deuda.label}`,
            monto: monto,
            mes_ref: mesRefPago,
            esFijo: false,
            esPagoDeuda: true,
            timestamp: new Date()
        });

        if (nuevoEstado === "pagada") {
            const porcSobrepago = ((totalPagado - deuda.monto_original) / deuda.monto_original) * 100;
            if (porcSobrepago > 0.5) {
                Swal.fire({
                    icon: 'warning',
                    title: '¡Deuda saldada! 🎉',
                    html: `Pero pagaste <b class="text-danger">${porcSobrepago.toFixed(1)}% más</b> de lo que originalmente debías.<br><br>Debías ${formatoMoneda.format(deuda.monto_original)} y en total pagaste ${formatoMoneda.format(totalPagado)}.`,
                    confirmButtonColor: '#1D4ED8'
                });
            } else {
                Swal.fire({
                    icon: 'success',
                    title: '¡Deuda saldada! 🎉',
                    text: `Terminaste de pagar ${deuda.label}.`,
                    confirmButtonColor: '#1D4ED8'
                });
            }
        } else {
            Swal.fire({ icon: 'success', title: 'Pago registrado', confirmButtonColor: '#1D4ED8' });
        }

        await cargarDeudasActivas();

    } catch (error) {
        console.error("Error registrando pago:", error);
        Swal.fire('Error', 'No se pudo registrar el pago.', 'error');
    }
}

function renderizarImpagosDetectados(hallazgos) {
    const contenedor = document.getElementById('contenedor-impagos-detectados');

    if (hallazgos.length === 0) {
        contenedor.innerHTML = '<p class="text-xs text-green-500 font-medium py-2">✅ No se detectaron fijos impagos sin marcar.</p>';
        return;
    }

    contenedor.innerHTML = hallazgos.map((h, i) => `
        <div class="flex justify-between items-center p-3 bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800/50 rounded-xl">
            <div>
                <p class="text-sm font-bold text-gray-800 dark:text-white">${h.label}</p>
                <p class="text-[10px] text-gray-500 dark:text-gray-400">Mes: ${h.mes_origen} · Pendiente: ${formatoMoneda.format(h.monto_original)}</p>
            </div>
            <button data-idx="${i}" class="btn-marcar-deuda bg-amber-500 hover:bg-amber-600 text-white text-[10px] font-bold px-3 py-1.5 rounded-lg transition-colors">
                + Marcar como Deuda
            </button>
        </div>
    `).join('');

    window._hallazgosImpagos = hallazgos;

    document.querySelectorAll('.btn-marcar-deuda').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const idx = parseInt(e.target.dataset.idx);
            marcarComoDeuda(window._hallazgosImpagos[idx], e.target);
        });
    });
}

document.getElementById('btn-buscar-impagos')?.addEventListener('click', buscarFijosImpagos);

// =====================================================================
// 🏛️ INFLACIÓN OFICIAL (INDEC/BCRA vía ArgentinaDatos API)
// =====================================================================
const INDEC_CACHE_KEY = 'zorwel_inflacion_indec_cache';
const INDEC_CACHE_HORAS = 24;

async function obtenerInflacionOficial() {
    try {
        const cacheStr = localStorage.getItem(INDEC_CACHE_KEY);
        if (cacheStr) {
            const cache = JSON.parse(cacheStr);
            const horasPasadas = (Date.now() - cache.timestamp) / (1000 * 60 * 60);
            if (horasPasadas < INDEC_CACHE_HORAS) {
                return cache.datos;
            }
        }

        const resp = await fetch('https://api.argentinadatos.com/v1/finanzas/indices/inflacion');
        if (!resp.ok) throw new Error('API INDEC no disponible');
        const datos = await resp.json();

        localStorage.setItem(INDEC_CACHE_KEY, JSON.stringify({ datos, timestamp: Date.now() }));
        return datos;

    } catch (error) {
        console.error("Error obteniendo inflación oficial:", error);
        return null;
    }
}

async function actualizarComparativaInflacion(listaMeses, dataFinal) {
    const contenedor = document.getElementById('contenedor-inflacion-indec');
    if (!contenedor) return;

    const datosOficiales = await obtenerInflacionOficial();

    if (!datosOficiales || datosOficiales.length === 0) {
        contenedor.innerHTML = '<p class="text-xs text-gray-400 italic text-center py-4">No se pudo obtener la inflación oficial en este momento.</p>';
        return;
    }

    // Mapeamos fecha "YYYY-MM-DD" -> "YYYY-MM" para poder cruzar con mes_ref
    const mapaOficial = {};
    datosOficiales.forEach(d => {
        const mesRef = d.fecha.substring(0, 7);
        mapaOficial[mesRef] = parseFloat(d.valor) || 0;
    });

            // Último mes del rango seleccionado (se sigue usando más abajo, para tu variación real)
    const ultimoMes = listaMeses[listaMeses.length - 1];

    // 1. Inflación oficial del mes MÁS RECIENTE con dato publicado (buscando hacia atrás,
    // porque el mes actual suele no tener dato todavía por el retraso normal de publicación)
    let mesConDatoReciente = null;
    let valorMesReciente = null;
    for (let i = listaMeses.length - 1; i >= 0; i--) {
        if (mapaOficial[listaMeses[i]] !== undefined) {
            mesConDatoReciente = listaMeses[i];
            valorMesReciente = mapaOficial[listaMeses[i]];
            break;
        }
    }

    const elMensual = document.getElementById('indec-mensual');
    const elMensualLabel = document.querySelector('#contenedor-inflacion-indec p.text-\\[10px\\]');
    if (elMensual) {
        if (valorMesReciente !== null) {
            elMensual.textContent = `${valorMesReciente.toFixed(1)}%`;
            const [anio, mes] = mesConDatoReciente.split('-');
            const nombreMes = new Date(anio, mes - 1, 1).toLocaleString('es-AR', { month: 'long', year: 'numeric' });
            if (elMensualLabel) elMensualLabel.textContent = `Inflación Oficial (${nombreMes})`;
        } else {
            elMensual.textContent = 'S/D';
        }
    }

    // 2. Inflación oficial ACUMULADA de todo el período (compuesta, no sumada)
    let acumulado = 1;
    let mesesConDato = 0;
    listaMeses.forEach(m => {
        if (mapaOficial[m] !== undefined) {
            acumulado *= (1 + (mapaOficial[m] / 100));
            mesesConDato++;
        }
    });
    const inflacionAcumuladaPct = (acumulado - 1) * 100;

    const elAcumulada = document.getElementById('indec-acumulada');
    if (elAcumulada) {
        elAcumulada.textContent = mesesConDato > 0 ? `${inflacionAcumuladaPct.toFixed(1)}%` : 'S/D';
    }

    // 3. Tu variación real de gasto en el mismo período (primer mes vs último mes con datos)
    const primerMes = listaMeses[0];
    const egresoInicial = dataFinal[primerMes]?.egresos || 0;
    const egresoFinal = dataFinal[ultimoMes]?.egresos || 0;

    const elConsumoReal = document.getElementById('consumo-real-vs-indec');
    const elExplicacion = document.getElementById('indec-explicacion');

    if (egresoInicial > 0 && mesesConDato > 0) {
        const variacionNominal = ((egresoFinal - egresoInicial) / egresoInicial) * 100;
        const variacionReal = variacionNominal - inflacionAcumuladaPct;

        if (elConsumoReal) {
            elConsumoReal.textContent = `${variacionReal >= 0 ? '+' : ''}${variacionReal.toFixed(1)}%`;
            elConsumoReal.className = `text-2xl font-black ${variacionReal > 0 ? 'text-danger' : 'text-success'}`;
        }
        if (elExplicacion) {
            if (variacionReal > 0) {
                elExplicacion.innerHTML = `Tu gasto subió <b>${variacionNominal.toFixed(1)}%</b> nominal, pero la inflación oficial fue <b>${inflacionAcumuladaPct.toFixed(1)}%</b> → en términos reales, <b class="text-danger">estás consumiendo ${variacionReal.toFixed(1)}% más</b>, no solo pagando precios más caros.`;
            } else {
                elExplicacion.innerHTML = `Tu gasto subió <b>${variacionNominal.toFixed(1)}%</b> nominal, pero la inflación oficial fue <b>${inflacionAcumuladaPct.toFixed(1)}%</b> → en términos reales, <b class="text-success">estás consumiendo ${Math.abs(variacionReal).toFixed(1)}% menos</b>. ¡Bien ahí!`;
            }
        }
    } else {
        if (elConsumoReal) elConsumoReal.textContent = 'S/D';
        if (elExplicacion) elExplicacion.textContent = 'Necesitás datos de al menos 2 meses en el período para calcular esto.';
    }
}

// =====================================================================
// 🔮 SIMULADOR "¿QUÉ PASARÍA SI...?"
// =====================================================================
let egresosPromedioPorCategoria = {};
let ingresoPromedioMensual = 0;

function actualizarDatosSimulador(egresosPorCategoria, listaMeses, totalIngreso) {
    const cantidadMeses = listaMeses.length || 1;

    egresosPromedioPorCategoria = {};
    for (const cat in egresosPorCategoria) {
        egresosPromedioPorCategoria[cat] = egresosPorCategoria[cat] / cantidadMeses;
    }

    ingresoPromedioMensual = totalIngreso / cantidadMeses;

    const select = document.getElementById('sim-categoria');
    if (!select) return;

    const valorPrevio = select.value;
    select.innerHTML = '<option value="">-- Elegir --</option>';

    Object.keys(egresosPromedioPorCategoria)
        .sort((a, b) => egresosPromedioPorCategoria[b] - egresosPromedioPorCategoria[a])
        .forEach(cat => {
            const promedio = egresosPromedioPorCategoria[cat];
            const option = document.createElement('option');
            option.value = cat;
            option.textContent = `${cat} (prom: ${formatoMoneda.format(promedio)}/mes)`;
            select.appendChild(option);
        });

    if (valorPrevio && egresosPromedioPorCategoria[valorPrevio] !== undefined) {
        select.value = valorPrevio;
    }
}

async function ejecutarSimulacion() {
    const categoria = document.getElementById('sim-categoria').value;
    const porcentaje = parseFloat(document.getElementById('sim-porcentaje').value);

    if (!categoria) {
        Swal.fire('Atención', 'Elegí una categoría para simular.', 'warning');
        return;
    }
    if (!porcentaje || porcentaje <= 0 || porcentaje > 100) {
        Swal.fire('Atención', 'Ingresá un porcentaje válido entre 1 y 100.', 'warning');
        return;
    }

    const promedioActual = egresosPromedioPorCategoria[categoria] || 0;
    const ahorroMensual = promedioActual * (porcentaje / 100);
    const ahorro6m = ahorroMensual * 6;
    const ahorro12m = ahorroMensual * 12;

    document.getElementById('sim-ahorro-mes').textContent = formatoMoneda.format(ahorroMensual);
    document.getElementById('sim-ahorro-6m').textContent = formatoMoneda.format(ahorro6m);
    document.getElementById('sim-ahorro-12m').textContent = formatoMoneda.format(ahorro12m);

    // Buscamos si hay deudas activas para conectar el ahorro con ellas
    let mensajeExtra = '';
    try {
        const q = query(
            collection(db, DEUDAS_COLLECCION),
            where("uid", "==", familiaIdActual),
            where("estado", "in", ["pendiente", "parcial"])
        );
        const snap = await getDocs(q);

        if (!snap.empty) {
            let totalDeudaPendiente = 0;
            snap.forEach(d => {
                const deuda = d.data();
                const pagado = (deuda.pagos || []).reduce((sum, p) => sum + (parseFloat(p.monto) || 0), 0);
                totalDeudaPendiente += Math.max(0, deuda.monto_original - pagado);
            });

            if (totalDeudaPendiente > 0 && ahorroMensual > 0) {
                const mesesParaCancelar = Math.ceil(totalDeudaPendiente / ahorroMensual);
                mensajeExtra = `💡 Con ese ahorro mensual, cancelarías tu deuda pendiente de ${formatoMoneda.format(totalDeudaPendiente)} en aproximadamente <b>${mesesParaCancelar} mes${mesesParaCancelar !== 1 ? 'es' : ''}</b>.`;
            }
        }
    } catch (error) {
        console.error("Error consultando deudas para el simulador:", error);
    }

    if (!mensajeExtra && ingresoPromedioMensual > 0) {
        const pctDelIngreso = (ahorroMensual / ingresoPromedioMensual) * 100;
        mensajeExtra = `💡 Ese ahorro equivale a un <b>${pctDelIngreso.toFixed(1)}%</b> de tu ingreso mensual promedio.`;
    }

    document.getElementById('sim-mensaje-extra').innerHTML = mensajeExtra || '';
    document.getElementById('resultado-simulador').classList.remove('hidden');
}

document.getElementById('btn-simular')?.addEventListener('click', ejecutarSimulacion);

// =====================================================================
// 2. MOTOR PRINCIPAL
// =====================================================================
async function ejecutarAnalisisAvanzado() {
    const desde = document.getElementById('fecha-desde').value;
    const hasta = document.getElementById('fecha-hasta').value;
    const textoBusqueda = document.getElementById('filtro-texto').value.toLowerCase().trim();

    if (!desde || !hasta) return;
    const listaMeses = generarRangoMeses(desde, hasta);
    
    let totalCantidad = 0, totalEgreso = 0, totalIngreso = 0;
    const egresosPorCategoria = {}; 
    const dataFinal = {};
    listaMeses.forEach(m => dataFinal[m] = { ingresos: 0, egresos: 0 });

    try {
        const q = query(
            collection(db, COLECCION),
            where("uid", "==", familiaIdActual),
            where("mes_ref", "in", listaMeses)
        );

        const snap = await getDocs(q);
        
        snap.forEach(doc => {
            const d = doc.data();
            const monto = parseFloat(d.monto) || 0;
            const coincide = textoBusqueda === "" || d.categoria.toLowerCase().includes(textoBusqueda) || d.detalle.toLowerCase().includes(textoBusqueda);

            if (coincide && dataFinal[d.mes_ref]) {
                totalCantidad++;
                if (d.tipo === 'egreso') {
                    dataFinal[d.mes_ref].egresos += monto;
                    totalEgreso += monto;
                    egresosPorCategoria[d.categoria] = (egresosPorCategoria[d.categoria] || 0) + monto;
                } else {
                    dataFinal[d.mes_ref].ingresos += monto;
                    totalIngreso += monto;
                }
            }
        });

        // 1. UI Básica y Costo Diario (En la tarjeta de arriba)
        document.getElementById('stats-cantidad').textContent = totalCantidad;
        document.getElementById('stats-dinero-egreso').textContent = formatoMoneda.format(totalEgreso);
        document.getElementById('stats-dinero-ingreso').textContent = formatoMoneda.format(totalIngreso);
        
        const diasEnRango = listaMeses.length * 30;
        const costoDiario = totalEgreso / (diasEnRango || 1);
        const elCosto = document.getElementById('costo-diario');
        if(elCosto) elCosto.textContent = formatoMoneda.format(costoDiario);

        // 2. Gráficos y Lógica
        dibujarGraficoEvolucion(listaMeses, dataFinal);
        dibujarTop5Horizontal(egresosPorCategoria);
        dibujarCurvaSalud(listaMeses, dataFinal);
        actualizarRatioAhorro(totalIngreso, totalEgreso);
        
        // 3. Inteligencia Separada (Alertas vs Insights)
        analizarTendencias(listaMeses); // Va al id="contenedor-alertas"
        ejecutarPsicologiaFinanciera(listaMeses, totalIngreso, totalEgreso, snap); // Va al id="contenedor-insights"
                actualizarComparativaInflacion(listaMeses, dataFinal); // Va al id="contenedor-inflacion-indec"
        actualizarDatosSimulador(egresosPorCategoria, listaMeses, totalIngreso);

        // Guardamos un resumen agregado (NO el detalle crudo) para mandarle a la IA
        datosParaIA = {
            periodo: { desde: listaMeses[0], hasta: listaMeses[listaMeses.length - 1] },
            por_mes: dataFinal,
            egresos_por_categoria: egresosPorCategoria,
                        totales: {
                ingresos: totalIngreso,
                egresos: totalEgreso,
                balance: totalIngreso - totalEgreso,
                cantidad_movimientos: totalCantidad
            }
        };

        // Lista de movimientos del período para que la función filtre y sume (ignora el buscador de texto)
        movimientosParaIA = [];
        snap.forEach(docSnap => {
            const d = docSnap.data();
            if (!dataFinal[d.mes_ref]) return;
            movimientosParaIA.push({
                fecha: d.fecha || '',
                mes_ref: d.mes_ref,
                tipo: d.tipo === 'ingreso' ? 'ingreso' : 'egreso',
                categoria: d.categoria || '',
                detalle: d.detalle || '',
                monto: parseFloat(d.monto) || 0
            });
        });

    } catch (e) { console.error(e); }
}

// =====================================================================
// 3. PSICOLOGÍA FINANCIERA (Insights separados)
// =====================================================================
// =====================================================================
// 3. PSICOLOGÍA FINANCIERA (Insights en Tarjetas)
// =====================================================================
function ejecutarPsicologiaFinanciera(labels, ingTotal, egrTotal, snap) {
    const contenedor = document.getElementById('contenedor-insights');
    if (!contenedor) return;

    let html = '';
    let conteoCategorias = {}, totalEsenciales = 0, totalInvisibles = 0;
    let gastosPorDiaSemana = [0,0,0,0,0,0,0];
    const esenciales = ['SUPERMERCADO', 'NAFTA', 'ALQUILER', 'LUZ', 'GAS', 'AGUA', 'INTERNET', 'FARMACIA'];

    snap.forEach(doc => {
        const d = doc.data();
        const m = parseFloat(d.monto) || 0;
        if (d.tipo === 'egreso') {
            conteoCategorias[d.categoria] = (conteoCategorias[d.categoria] || 0) + 1;
            const fechaPartes = d.fecha.split('-');
            if(fechaPartes.length === 3) {
                const f = new Date(fechaPartes[0], fechaPartes[1] - 1, fechaPartes[2]);
                gastosPorDiaSemana[f.getDay()] += m;
            }
            if (esenciales.includes(d.categoria.toUpperCase())) totalEsenciales += m;
            if (m < 10000 || ['KIOSCO', 'APPS', 'DELIVERY'].includes(d.categoria.toUpperCase())) totalInvisibles += m;
        }
    });

    // Tarjeta: Impacto Real
    const porcGastado = ingTotal > 0 ? (egrTotal / ingTotal) * 100 : 0;
    html += `
        <div class="p-4 bg-gray-50 dark:bg-slate-700 rounded-xl border border-gray-100 dark:border-gray-600 shadow-sm flex flex-col justify-center">
            <p class="font-bold text-gray-400 uppercase text-[10px] mb-1">Impacto Real</p>
            <p class="text-sm dark:text-gray-200">Gastaste el <b class="text-primary text-lg">${porcGastado.toFixed(1)}%</b> de tu ingreso.</p>
        </div>
    `;

    // Tarjeta: Gastos Invisibles
    if (totalInvisibles > 0) {
        html += `
            <div class="p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl shadow-sm flex flex-col justify-center">
                <p class="font-bold text-amber-700 dark:text-amber-500 uppercase text-[10px] mb-1">💣 Gastos Invisibles</p>
                <p class="text-sm dark:text-gray-200">Suman <b class="text-amber-600 dark:text-amber-400 text-lg">${formatoMoneda.format(totalInvisibles)}</b> en hormigas.</p>
            </div>
        `;
    }

    // Tarjeta: Día Peligroso
    const diasN = ["Domingos", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábados"];
    const diaMaxIndex = gastosPorDiaSemana.indexOf(Math.max(...gastosPorDiaSemana));
    if (Math.max(...gastosPorDiaSemana) > 0) {
        html += `
            <div class="p-4 bg-gray-50 dark:bg-slate-700 rounded-xl border border-gray-100 dark:border-gray-600 shadow-sm flex flex-col justify-center">
                <p class="font-bold text-gray-400 uppercase text-[10px] mb-1">📅 Día Peligroso</p>
                <p class="text-sm dark:text-gray-200">Los <b class="text-danger text-lg">${diasN[diaMaxIndex]}</b> es cuando más gastás.</p>
            </div>
        `;
    }

    // Tarjetas: Hábitos Detectados
    for (const cat in conteoCategorias) {
        if (conteoCategorias[cat] >= 8) {
            html += `
            <div class="flex items-center gap-3 p-4 bg-red-50 dark:bg-red-900/10 rounded-xl border border-red-100 dark:border-red-900/50 shadow-sm">
                <span class="text-2xl">⚠️</span>
                <div>
                    <p class="font-bold text-red-700 dark:text-red-400 text-xs uppercase">Hábito: ${cat}</p>
                    <p class="text-red-600 dark:text-red-500 text-[10px] mt-1">${conteoCategorias[cat]} transacciones registradas.</p>
                </div>
            </div>`;
        }
    }

    contenedor.innerHTML = html;
}

async function analizarTendencias(meses) {
    const contenedor = document.getElementById('contenedor-alertas');
    if (!contenedor || meses.length < 2) return;
    const actual = meses[meses.length - 1];
    const anterior = meses[meses.length - 2];
    const q = query(
        collection(db, COLECCION),
        where("uid", "==", familiaIdActual),
        where("mes_ref", "in", [actual, anterior])
    );
    const snap = await getDocs(q);
    const stats = {};
    [actual, anterior].forEach(m => stats[m] = {});
    snap.forEach(doc => {
        const d = doc.data();
        if (d.tipo === 'egreso') {
            if (!stats[d.mes_ref][d.categoria]) stats[d.mes_ref][d.categoria] = { monto: 0 };
            stats[d.mes_ref][d.categoria].monto += parseFloat(d.monto);
        }
    });
    let html = "";
    for (const cat in stats[actual]) {
        const montoActual = stats[actual][cat].monto;
        const montoAnterior = (stats[anterior][cat] && stats[anterior][cat].monto) || 0;
        if (montoAnterior > 0) {
            const incremento = ((montoActual - montoAnterior) / montoAnterior) * 100;
            if (incremento >= 15) {
                html += `
                <div class="p-3 bg-red-50 dark:bg-red-900/20 border-l-4 border-red-500 rounded-r-lg mb-2 text-[11px] shadow-sm">
                    <div class="flex justify-between font-bold dark:text-red-400"><span>${cat}</span><span>+${incremento.toFixed(0)}%</span></div>
                    <p class="mt-1 text-gray-600 dark:text-gray-400">Gastaste ${formatoMoneda.format(montoActual - montoAnterior)} más.</p>
                </div>`;
            }
        }
    }
    contenedor.innerHTML = html || '<p class="text-[11px] text-green-500 font-medium py-2">✅ Sin fugas detectadas este mes.</p>';
}

// =====================================================================
// 4. GRÁFICOS
// =====================================================================
function getC() { return document.documentElement.classList.contains('dark') ? '#94a3b8' : '#64748b'; }

function dibujarGraficoEvolucion(labels, datos) {
    const ctx = document.getElementById('graficoEvolucion');
    if (!ctx) return;
    if (graficoEvolucion) graficoEvolucion.destroy();
    graficoEvolucion = new Chart(ctx, {
        type: 'bar',
        data: {
            labels,
            datasets: [
                { label: 'Ingresos', data: labels.map(l => datos[l].ingresos), backgroundColor: '#059669', borderRadius: 5 },
                { label: 'Egresos', data: labels.map(l => datos[l].egresos), backgroundColor: '#EF4444', borderRadius: 5 }
            ]
        },
        options: { responsive: true, maintainAspectRatio: false, scales: { x: { ticks: { color: getC() } }, y: { ticks: { color: getC() }, beginAtZero: true } }, plugins: { legend: { labels: { color: getC() } } } }
    });
}

function dibujarTop5Horizontal(datosPorCategoria) {
    const ctx = document.getElementById('graficoBarrasHorizontal');
    if (!ctx) return;
    if (chartBarrasH) chartBarrasH.destroy();
    const sortedCats = Object.keys(datosPorCategoria).sort((a, b) => datosPorCategoria[b] - datosPorCategoria[a]).slice(0, 5);
    chartBarrasH = new Chart(ctx, {
        type: 'bar',
        data: { labels: sortedCats, datasets: [{ label: 'Pesos ($)', data: sortedCats.map(c => datosPorCategoria[c]), backgroundColor: '#6366f1', borderRadius: 8 }] },
        options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false, scales: { x: { ticks: { color: getC() } }, y: { ticks: { color: getC() } } }, plugins: { legend: { display: false } } }
    });
}

function dibujarCurvaSalud(labels, datos) {
    const ctx = document.getElementById('graficoLineasSalud');
    if (!ctx) return;
    if (chartLineasSalud) chartLineasSalud.destroy();
    const superavitData = labels.map(m => datos[m].ingresos - datos[m].egresos);
    chartLineasSalud = new Chart(ctx, {
        type: 'line',
        data: { labels: labels, datasets: [{ label: 'Superávit', data: superavitData, borderColor: '#10b981', backgroundColor: 'rgba(16, 185, 129, 0.1)', fill: true, tension: 0.4 }] },
        options: { responsive: true, maintainAspectRatio: false, scales: { x: { ticks: { color: getC() } }, y: { ticks: { color: getC() } } }, plugins: { legend: { display: false } } }
    });
}

function actualizarRatioAhorro(ing, egr) {
    const ratio = ing > 0 ? ((ing - egr) / ing) * 100 : 0;
    const b = document.getElementById('ratio-ahorro');
    
    if(b) {
        b.textContent = `Ahorro: ${ratio.toFixed(1)}%`;
        
        // Asignamos colores diferentes según el porcentaje y sumamos el dark mode
        if (ratio > 20) {
            b.className = "text-xs font-black px-3 py-1 rounded-full uppercase bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400";
        } else if (ratio > 0) {
            b.className = "text-xs font-black px-3 py-1 rounded-full uppercase bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400";
        } else {
            b.className = "text-xs font-black px-3 py-1 rounded-full uppercase bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400";
        }
    }
}

// =====================================================================
// 5. AUXILIARES E INYECTOR
// =====================================================================
function generarRangoMeses(inicio, fin) {
    let start = new Date(inicio + '-02');
    let end = new Date(fin + '-02');
    const meses = [];
    while (start <= end) {
        meses.push(`${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}`);
        start.setMonth(start.getMonth() + 1);
    }
    return meses;
}

document.getElementById('btn-ejecutar-analisis')?.addEventListener('click', ejecutarAnalisisAvanzado);
window.addEventListener('themeChanged', () => { if (graficoEvolucion) ejecutarAnalisisAvanzado(); });

// =====================================================================
// 📧 REPORTE MANUAL POR MAIL
// =====================================================================
async function calcularDeudaPendienteTotal() {
    try {
        const q = query(
            collection(db, DEUDAS_COLLECCION),
            where("uid", "==", familiaIdActual),
            where("estado", "in", ["pendiente", "parcial"])
        );
        const snap = await getDocs(q);
        let total = 0;
        snap.forEach(d => {
            const deuda = d.data();
            const pagado = (deuda.pagos || []).reduce((sum, p) => sum + (parseFloat(p.monto) || 0), 0);
            total += Math.max(0, deuda.monto_original - pagado);
        });
        return total;
    } catch (error) {
        console.error("Error calculando deuda pendiente total:", error);
        return 0;
    }
}

function formatearPeriodo(desde, hasta) {
    const formatearMes = (mesRef) => {
        const [anio, mes] = mesRef.split('-');
        const nombre = new Date(anio, mes - 1, 1).toLocaleString('es-AR', { month: 'long', year: 'numeric' });
        return nombre.charAt(0).toUpperCase() + nombre.slice(1);
    };
    if (desde === hasta) return formatearMes(desde);
    return `${formatearMes(desde)} — ${formatearMes(hasta)}`;
}

async function enviarReportePorMail() {
    const btn = document.getElementById('btn-enviar-reporte');
    if (btn) { btn.disabled = true; btn.textContent = 'Enviando...'; }

    try {
        const parseMonto = (txt) => parseFloat((txt || '0').replace(/[^\d,-]/g, '').replace(',', '.')) || 0;

        const totalIngresosTxt = document.getElementById('stats-dinero-ingreso')?.textContent || '$ 0,00';
        const totalEgresosTxt = document.getElementById('stats-dinero-egreso')?.textContent || '$ 0,00';
        const balanceNum = parseMonto(totalIngresosTxt) - parseMonto(totalEgresosTxt);

        const saldoAcumuladoTxt = document.getElementById('saldo-acumulado-valor')?.textContent || '$ 0,00';
        const mensajeInflacion = document.getElementById('indec-explicacion')?.innerHTML
            || 'Necesitás más datos cargados para comparar con la inflación oficial.';

                const deudaPendienteTotal = await calcularDeudaPendienteTotal();

        const desde = document.getElementById('fecha-desde').value;
        const hasta = document.getElementById('fecha-hasta').value;

        // 🤖 Pedimos a la IA un resumen narrativo del período
        let resumenNarrativo = '';
        try {
            if (datosParaIA) {
                const resNarrativo = await generarResumenNarrativo({
                    datosResumen: { ...datosParaIA, deuda_pendiente_total: deudaPendienteTotal }
                });
                resumenNarrativo = resNarrativo.data.texto || '';
            }
        } catch (errIA) {
            console.error("No se pudo generar el resumen narrativo:", errIA);
        }

        const templateParams = {
            resumen_narrativo: resumenNarrativo,
            email_destino: auth.currentUser.email,
            nombre_casa: nombreFamiliaActual ? ` ${nombreFamiliaActual}` : '',
            periodo: formatearPeriodo(desde, hasta),
            total_ingresos: totalIngresosTxt,
            total_egresos: totalEgresosTxt,
            balance_periodo: formatoMoneda.format(balanceNum),
            saldo_acumulado: saldoAcumuladoTxt,
            deuda_pendiente: formatoMoneda.format(deudaPendienteTotal),
            mensaje_inflacion: mensajeInflacion
        };

                await emailjs.send('service_bnoj1ne', 'template_wq9ushj', templateParams);

        Swal.fire({
            icon: 'success',
            title: '¡Reporte enviado! 📧',
            text: `Revisá tu casilla: ${auth.currentUser.email}`,
            confirmButtonColor: '#1D4ED8'
        });

    } catch (error) {
        console.error("Error enviando reporte:", error);
        Swal.fire('Error', 'No se pudo enviar el reporte. Intentá de nuevo.', 'error');
    } finally {
        if (btn) { btn.disabled = false; btn.textContent = '📧 Enviar Reporte por Mail'; }
    }
}

document.getElementById('btn-enviar-reporte')?.addEventListener('click', enviarReportePorMail);

// =====================================================================
// 🤖 CHAT: PREGUNTALE A TUS FINANZAS
// =====================================================================
async function preguntarAlaIA() {
    const input = document.getElementById('input-pregunta-ia');
    const contenedorRespuesta = document.getElementById('respuesta-ia');
    const btn = document.getElementById('btn-preguntar-ia');

    const pregunta = input.value.trim();
    if (!pregunta) {
        Swal.fire('Atención', 'Escribí una pregunta primero.', 'warning');
        return;
    }

    if (!datosParaIA) {
        Swal.fire('Atención', 'Primero tocá "Analizar Datos" para cargar el período.', 'info');
        return;
    }

    btn.disabled = true;
    btn.textContent = 'Pensando...';
    contenedorRespuesta.classList.remove('hidden');
    contenedorRespuesta.innerHTML = '<span class="italic opacity-70">Analizando tus datos...</span>';

    try {
                const resultado = await responderPreguntaFinanciera({
            pregunta: pregunta,
            resumenDatos: datosParaIA,
            movimientos: movimientosParaIA,
            periodo: datosParaIA.periodo,
            fechaHoy: new Date().toLocaleDateString('en-CA')
        });

        contenedorRespuesta.textContent = resultado.data.respuesta;

    } catch (error) {
        console.error("Error preguntando a la IA:", error);
        contenedorRespuesta.innerHTML = '<span class="text-red-500">No se pudo procesar la pregunta. Intentá de nuevo.</span>';
    } finally {
        btn.disabled = false;
        btn.textContent = 'Preguntar';
    }
}

document.getElementById('btn-preguntar-ia')?.addEventListener('click', preguntarAlaIA);
document.getElementById('input-pregunta-ia')?.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') preguntarAlaIA();
});