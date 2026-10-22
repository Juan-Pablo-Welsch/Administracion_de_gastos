import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";

import {
    getFirestore,
    initializeFirestore,         
    persistentLocalCache,         
    persistentMultipleTabManager, 
    collection, addDoc, getDocs, query, orderBy, where,
    doc, setDoc, getDoc, deleteDoc, updateDoc, deleteField, limit, documentId
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

import {
    getAuth, signInWithPopup, GoogleAuthProvider, signOut, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

import {
    getFunctions, httpsCallable
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-functions.js";


const firebaseConfig = {
    apiKey: "AIzaSyCMLX7f_oLO-kxp5aQCGVz3VC124pQpJxQ",
    authDomain: "zorwel-gastos-mensuales.firebaseapp.com",
    projectId: "zorwel-gastos-mensuales",
    storageBucket: "zorwel-gastos-mensuales.firebasestorage.app",
    messagingSenderId: "770642369665",
    appId: "1:770642369665:web:dede4d3d980b084c304180"
};

// Inicializar Firebase
const app = initializeApp(firebaseConfig);
const db = initializeFirestore(app, {
    localCache: persistentLocalCache({
        tabManager: persistentMultipleTabManager()
    })
});

const auth = getAuth(app);
const provider = new GoogleAuthProvider();
const functions = getFunctions(app);
const procesarMovimientoPorVoz = httpsCallable(functions, 'procesarMovimientoPorVoz');

// =================================================================
// 2. CONSTANTES GLOBALES Y ESTADO DE USUARIO
// =================================================================

let usuarioActual = null;
let familiaIdActual = null; 
let rolUsuarioActual = 'admin'; 


const MOVIMIENTOS_COLLECTION = "movimientos";
const FAMILIAS_COLLECTION = "familias"; 
const INVITACIONES_COLLECTION = "invitaciones"; 
const FIJOS_CONFIG_COLLECTION = "fijos_config";
const CATEGORIAS_PERSONALIZADAS_COLLECTION = "categorias_fijas_personalizadas";
const CATEGORIAS_USUARIO_COLLECTION = "categorias_usuarios"; 
const DEVIATION_THRESHOLD = 0.10;
const EMAIL_ADMIN_MAESTRO = "juanpablowelsch90@gmail.com";


let CATEGORIAS_VARIABLES = [];
let CATEGORIAS_FIJAS_BASE = [];

// 🧠 EL CEREBRO DEL ONBOARDING (Basado en tu lista maestra)
const PLANTILLAS_ONBOARDING = {
    base: { 
        fijos: ['Luz', 'Gas', 'Agua', 'Internet', 'Telefonía móvil', 'Tarjeta Visa', 'Tarjeta Mastercard'], 
        variables: ['Supermercado', 'Carnicería', 'Verdulería', 'Panadería','Kiosco','Almacen','Varios', 'Farmacia', 'Ropa', 'Limpieza', 'Imprevistos'] 
    },
    auto: { 
        fijos: ['Seguro del auto', 'Patente automotor', 'Cochera'], 
        variables: ['Combustible', 'Peaje', 'Mecánico', 'Gomería', 'Lavadero de auto'] 
    },
    casa: { 
        fijos: ['Alquiler / Expensas', 'Impuesto inmobiliario (ABL)', 'Seguro del hogar'], 
        variables: ['Ferretería', 'Decoración / Muebles', 'Reparaciones del hogar'] 
    },
    mascotas: { 
        fijos: [], 
        variables: ['Alimento Mascotas', 'Veterinaria', 'Paseador / Accesorios'] 
    },
    hijos: { 
        fijos: ['Cuota colegio / jardín', 'Transporte escolar', 'Cuota club / deportes'], 
        variables: ['Librería / útiles', 'Excursiones', 'Ropa niños', 'Juguetes', 'Regalos cumpleaños compañeros'] 
    },
    suscripciones: { 
        fijos: ['Netflix', 'Spotify', 'Disney+', 'HBO / Max', 'YouTube Premium'], 
        variables: [] 
    },
    salidas: { 
        fijos: [], 
        variables: ['Delivery', 'Restaurantes', 'Salidas / Ocio', 'Cine / Teatro', 'Vacaciones / Escapadas'] 
    }
};

// Variables para armar el borrador en el Onboarding
let borradorFijos = [];
let borradorVariables = [];

let myChartEgresos; 
let myChartIngresos; 
const formatoMoneda = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' });

let CATEGORIAS_FIJAS_VALUES = []; 
let categoriasFijasActuales = []; 
let configFijosMaestro = {};
let CATEGORIA_LABEL_MAP = {}; 

// Referencias a elementos del DOM
const formulario = document.getElementById('form-movimiento');
const selectMesFiltro = document.getElementById('mes-filtro');
const selectCategoria = document.getElementById('categoria');
const btnAplicarFiltro = document.getElementById('aplicar-filtro');
const btnHoy = document.getElementById('btn-hoy');
const btnAyer = document.getElementById('btn-ayer');
const fechaInput = document.getElementById('fecha');
const modalFijos = document.getElementById('modal-fijos');
const btnConfigFijos = document.getElementById('btn-config-fijos');
const btnCerrarModalFijos = document.getElementById('cerrar-modal-fijos');
const btnGuardarConfigFijos = document.getElementById('guardar-config-fijos');
const fijosMaestrosContainer = document.getElementById('fijos-maestros-container');
const btnAdministrarFijos = document.getElementById('btn-administrar-fijos'); 
const modalAdminCategorias = document.getElementById('modal-admin-categorias');
const btnCerrarAdminCategorias = document.getElementById('cerrar-modal-admin-categorias');
const btnCerrarAdminCategoriasBtn = document.getElementById('cerrar-modal-admin-categorias-btn'); 
const formNuevaCategoria = document.getElementById('form-nueva-categoria');
const listaCategoriasAdmin = document.getElementById('lista-categorias-admin');
const busquedaInput = document.getElementById('busqueda-movimientos');

// Referencias Panel Familiar
const btnMiFamilia = document.getElementById('btn-mi-familia');
const modalFamilia = document.getElementById('modal-familia');
const btnCerrarModalFamilia = document.getElementById('cerrar-modal-familia');
const btnCerrarModalFamiliaBtn = document.getElementById('cerrar-modal-familia-btn'); 

const MESES_FUTUROS_PLANIFICACION = 18; 
const MESES_PASADOS_HISTORICO = 12;

// =================================================================
// 3. LÓGICA DE AUTENTICACIÓN (LOGIN/LOGOUT) 
// =================================================================

const loginScreen = document.getElementById('login-screen');
const appContent = document.getElementById('app-content');
const btnLoginGoogle = document.getElementById('btn-login-google');
const btnLogout = document.getElementById('btn-logout');
const userInfoDisplay = document.getElementById('user-info-display');


const UID_CACHE_KEY = 'zorwel_uid_cache';
const EMAIL_CACHE_KEY = 'zorwel_email_cache';
const NOMBRE_CACHE_KEY = 'zorwel_nombre_cache';

onAuthStateChanged(auth, async (user) => {
    if (user) {
        localStorage.setItem(UID_CACHE_KEY, user.uid);
        localStorage.setItem(EMAIL_CACHE_KEY, user.email);
        localStorage.setItem(NOMBRE_CACHE_KEY, user.displayName || '');
        
        usuarioActual = user;
        await mostrarApp(user);

    } else {
        
        
        const uidCacheado = localStorage.getItem(UID_CACHE_KEY);
        const emailCacheado = localStorage.getItem(EMAIL_CACHE_KEY);
        
        if (uidCacheado && emailCacheado) {
            
            
            if (!navigator.onLine) {
                
                mostrarPantallaOffline();
                return;
            }

            console.log('⏳ Token posiblemente expirado. Esperando renovación...');
            await new Promise(resolve => setTimeout(resolve, 8000));
            
            if (usuarioActual) return;
            
            
            console.log('🚪 Sesión expirada definitivamente. Mostrando login.');
        }

        // Limpiamos la caché local solo cuando es un logout real
        localStorage.removeItem(UID_CACHE_KEY);
        localStorage.removeItem(EMAIL_CACHE_KEY);
        localStorage.removeItem(NOMBRE_CACHE_KEY);

        usuarioActual = null;
        familiaIdActual = null;
        rolUsuarioActual = null;
        if(appContent) appContent.classList.add('content-hidden');
        if(loginScreen) loginScreen.classList.remove('content-hidden');
        ocultarSplash();
    }
});


btnLoginGoogle.addEventListener('click', async () => {
    // Bloqueo offline: evita el popup que tira pantalla blanca
    if (!navigator.onLine) {
        Swal.fire({
            icon: 'warning',
            title: 'Sin conexión',
            text: 'Necesitás internet para iniciar sesión por primera vez. Una vez logueado, ZorWel funciona offline.',
            confirmButtonText: 'Entendido',
            confirmButtonColor: '#1D4ED8',
            background: document.documentElement.classList.contains('dark') ? '#1e293b' : '#ffffff',
            color: document.documentElement.classList.contains('dark') ? '#f8fafc' : '#1f2937'
        });
        return; 
    }

    try {
        await signInWithPopup(auth, provider);
    } catch (error) {
        console.error("Error al iniciar sesión:", error);
        mostrarNotificacion('error', 'Error al iniciar sesión. Intentá nuevamente.');
    }
});

// Función para Cerrar Sesión
if (btnLogout) {
    btnLogout.addEventListener('click', async () => {
        try {
            await signOut(auth);
            mostrarNotificacion('info', 'Sesión cerrada correctamente.');
        } catch (error) {
            console.error("Error al cerrar sesión:", error);
        }
    });
}

function mostrarLogin() {
    ocultarSplash(); // Quitamos el splash de carga
    if(appContent) appContent.classList.add('content-hidden');
    if(loginScreen) loginScreen.classList.remove('content-hidden');
    
    // Reseteamos el usuario en pantalla
    if (userInfoDisplay) userInfoDisplay.textContent = "";
}

async function mostrarApp(user) {
    if (loginScreen) loginScreen.classList.add('content-hidden');
    if (appContent) appContent.classList.remove('content-hidden');

    const emailLimpio = user.email.toLowerCase().trim();
    console.log("🔍 Buscando invitación para:", emailLimpio);

    const panelMaestro = document.getElementById('container-admin-maestro');

    if (emailLimpio === EMAIL_ADMIN_MAESTRO) {
        if (panelMaestro) panelMaestro.classList.remove('hidden');
    } else {
        if (panelMaestro) panelMaestro.remove();
    }

    try {
        const invitacionRef = doc(db, INVITACIONES_COLLECTION, emailLimpio);
        const invitacionSnap = await getDoc(invitacionRef);

        if (invitacionSnap.exists()) {
            const invitacion = invitacionSnap.data();

            familiaIdActual = invitacion.familia_id || invitacion.uid;
            rolUsuarioActual = invitacion.rol || 'dependiente';

            console.log("✅ Invitación encontrada! Casa ID:", familiaIdActual);

            if (userInfoDisplay) {
                userInfoDisplay.textContent = `🏡 Equipo | Sesión: ${user.email} (${rolUsuarioActual})`;
            }

            const familiaRefInvitado = doc(db, FAMILIAS_COLLECTION, familiaIdActual);
            const familiaSnapInvitado = await getDoc(familiaRefInvitado);

            if (familiaSnapInvitado.exists()) {
                const familiaData = familiaSnapInvitado.data();
                const miembros = familiaData.miembros || [];

                const yaExiste = miembros.some(
                    m => m.email?.toLowerCase() === emailLimpio
                );

                if (!yaExiste) {
                    console.log("🛠️ Reparando miembro faltante en familia...");

                    miembros.push({
                        email: emailLimpio,
                        rol: rolUsuarioActual,
                        estado: 'activo',
                        fecha: new Date()
                    });

                    await updateDoc(familiaRefInvitado, { miembros });

                    console.log("✅ Miembro reparado correctamente.");
                }
            }

        } else {
            console.log("❌ No hay invitación. Es dueño de su propia casa.");

            familiaIdActual = user.uid;
            rolUsuarioActual = 'admin';

            if (userInfoDisplay) {
                userInfoDisplay.textContent = `👑 Mi Casa | Sesión: ${user.email}`;
            }
        }

        const familiaRef = doc(db, FAMILIAS_COLLECTION, familiaIdActual);
        const familiaSnap = await getDoc(familiaRef);

                if (familiaSnap.exists()) {
            const dataFamilia = familiaSnap.data();

            if (dataFamilia.nombre_familia) {
                const pastillaNombre = document.getElementById('display-nombre-casa');
                if (pastillaNombre) {
                    pastillaNombre.textContent = dataFamilia.nombre_familia;
                }
            }

                        aplicarCandadosSaaS(dataFamilia.es_pro);

        } else if (rolUsuarioActual === 'admin') {
            const familiaVIPs = [
                'juanpablowelsch90@gmail.com',
                'ailenconstanzazorita@gmail.com',
                'felicianowelsch@gmail.com'
            ];

            const tieneProGratis = familiaVIPs.includes(emailLimpio);

                        await setDoc(familiaRef, {
                creador_email: emailLimpio,
                fecha_creacion: new Date(),
                es_pro: tieneProGratis,
                miembros: [],
                uid: familiaIdActual,
                saldo_inicial: 0
            });

            console.log("🏗️ Cimientos de la casa construidos.");

            aplicarCandadosSaaS(tieneProGratis);
        }

        const tieneConfiguracion = await cargarCategoriasUsuario();

                if (tieneConfiguracion) {
            console.log("🏠 La casa ya tiene categorías. Iniciando Dashboard...");
            inicializarDashboard();
            ocultarSplash();
            if (!localStorage.getItem('zorwel_gastos_onboarding_visto')) {
                setTimeout(() => { iniciarOnboarding(); }, 1500);
            }
        } else {
            if (rolUsuarioActual === 'admin') {
                console.log("✨ Casa nueva. Mostrando Onboarding...");
                document.getElementById('onboarding-nombre-usuario').textContent = user.displayName || 'Amigo';
                onboardingScreen.classList.remove('content-hidden');
                onboardingScreen.style.display = 'flex';
                appContent.classList.add('content-hidden');
                ocultarSplash();
            } else {
                mostrarNotificacion('warning', 'El administrador aún no configuró esta casa.');
                ocultarSplash();
            }
        }
    } catch (error) {
        console.error("🚨 Error en mostrarApp:", error.code, error.message);

        ocultarSplash();

        // Errores de red / offline: NO cerrar sesión, mostrar aviso suave
        const esErrorDeRed = (
            !navigator.onLine ||
            error.code === 'unavailable' ||
            error.code === 'failed-precondition' ||
            error.message?.includes('network') ||
            error.message?.includes('offline') ||
            error.message?.includes('Failed to fetch')
        );

        if (esErrorDeRed) {
            mostrarNotificacion('warning', '📡 Sin conexión. Mostrando datos guardados localmente.');
            
            try {
                await inicializarDashboard();
            } catch (e) {
                mostrarPantallaOffline();
            }
            return;
        }

        // Error real (no de red): ahí sí avisamos y cerramos sesión
        Swal.fire({
            icon: 'error',
            title: 'Error al cargar la cuenta',
            text: 'Cerrá sesión e intentá nuevamente.',
            confirmButtonText: 'Cerrar sesión',
            confirmButtonColor: '#1D4ED8',
            background: document.documentElement.classList.contains('dark') ? '#1e293b' : '#ffffff',
            color: document.documentElement.classList.contains('dark') ? '#f8fafc' : '#1f2937'
        }).then(async () => {
            await signOut(auth);
            location.href = '/index.html';  // Sin ?v=timestamp para no romper el SW
        });
    }
}

function ocultarSplash() {
    const splash = document.getElementById('splash');
    if (splash) {
        document.body.style.backgroundColor = 'transparent';
        document.body.classList.add('bg-zorwel-gradient');
        document.body.style.overflow = 'auto'; 
        splash.style.opacity = '0';
        splash.style.transition = 'opacity 0.8s ease';
        setTimeout(() => {
            splash.style.display = 'none';
        }, 800); 
    }
}

function mostrarPantallaOffline() {
    ocultarSplash();
    if(appContent) appContent.classList.add('content-hidden');

    const loginEl = document.getElementById('login-screen');
    if (!loginEl) return;

    // Guardamos el HTML original para poder restaurarlo
    if (!loginEl.dataset.originalHtml) {
        loginEl.dataset.originalHtml = loginEl.innerHTML;
    }

    loginEl.classList.remove('content-hidden');

    const isDark = document.documentElement.classList.contains('dark');
    const bg   = isDark ? '#0f172a' : '#f8fafc';
    const text = isDark ? '#f1f5f9' : '#1e293b';
    const sub  = isDark ? '#94a3b8' : '#64748b';

    loginEl.innerHTML = `
        <div style="
            display:flex; flex-direction:column; align-items:center;
            justify-content:center; text-align:center;
            padding:3rem 2rem; min-height:100vh; gap:1.5rem;
            background:${bg}; color:${text};
        ">
            <div style="font-size:4rem; animation: pulse 2s infinite;">📡</div>
            <h2 style="
                font-family:sans-serif; font-size:1.5rem;
                font-weight:800; margin:0; color:${text};
            ">Sin conexión a internet</h2>
            <p style="
                font-family:sans-serif; color:${sub};
                max-width:300px; line-height:1.65; margin:0; font-size:0.95rem;
            ">
                ZorWel necesita internet para verificar tu sesión.<br/>
                En cuanto te conectes, la app se abre sola.
            </p>
            <div style="
                background:rgba(245,158,11,0.1);
                border:1px solid rgba(245,158,11,0.3);
                border-radius:12px; padding:1rem 1.5rem;
                max-width:300px;
            ">
                <p style="
                    font-family:sans-serif; font-size:0.82rem;
                    color:#f59e0b; line-height:1.65; margin:0;
                ">
                    💡 <strong>Una vez que te conectes</strong>, ZorWel
                    recordará tu sesión y podrás abrirla offline
                    la próxima vez.
                </p>
            </div>
            <div id="offline-status" style="
                font-family:sans-serif; font-size:0.8rem;
                color:${sub}; margin-top:0.5rem;
            ">Esperando conexión...</div>
        </div>
        <style>
            @keyframes pulse {
                0%,100% { transform: scale(1); }
                50%      { transform: scale(1.12); }
            }
        </style>
    `;

    const checkInterval = setInterval(() => {
        if (navigator.onLine) {
            const statusEl = document.getElementById('offline-status');
            if (statusEl) statusEl.textContent = '✅ Conexión detectada. Cargando...';
            clearInterval(checkInterval);
            setTimeout(() => location.reload(), 800);
        }
    }, 3000);

    // También escuchamos el evento nativo por si acaso
    window.addEventListener('online', () => {
        clearInterval(checkInterval);
        const statusEl = document.getElementById('offline-status');
        if (statusEl) statusEl.textContent = '✅ Conexión detectada. Cargando...';
        setTimeout(() => location.reload(), 800);
    }, { once: true });
}

// =================================================================
// 4. FUNCIONES DE VISIBILIDAD DE DATOS (Las tuyas, intactas)
// =================================================================

function toggleSensitiveData(group) {
    const dataElements = document.querySelectorAll(`.${group}-data`);
    const iconElement = document.getElementById(`icon-${group}`);

    if (dataElements.length === 0) return;

    const isRevealed = dataElements[0].classList.contains('revealed');

    dataElements.forEach(element => {
        element.classList.toggle('revealed', !isRevealed);
    });

    if (iconElement) {
        if (isRevealed) {
            iconElement.textContent = '🙈'; 
            iconElement.title = 'Mostrar Montos';
            iconElement.parentElement.title = 'Mostrar Montos'; 
        } else {
            iconElement.textContent = '👁️'; 
            iconElement.title = 'Ocultar Montos';
            iconElement.parentElement.title = 'Ocultar Montos';
        }
    }
    localStorage.setItem(`data-revealed-${group}`, !isRevealed);
}

function aplicarEstadoVisibilidadInicial() {
    if (localStorage.getItem('data-revealed-resumen') === 'true') {
        toggleSensitiveData('resumen'); 
    } else {
        const iconResumen = document.getElementById('icon-resumen');
        if (iconResumen) iconResumen.textContent = '🙈';
    }

    if (localStorage.getItem('data-revealed-fijos') === 'true') {
        toggleSensitiveData('fijos');
    } else {
        const iconFijos = document.getElementById('icon-fijos');
        if (iconFijos) iconFijos.textContent = '🙈';
    }
}

window.toggleSensitiveData = toggleSensitiveData; 

function toggleAyuda() {
    const modal = document.getElementById('modalAyuda');
    if (modal) {
        modal.classList.toggle('hidden');
    }
}
window.toggleAyuda = toggleAyuda;



function toggleConfigMenu() {
    const modal = document.getElementById('modal-config');
    if (modal) {
        modal.classList.toggle('hidden');
    }
}
window.toggleConfigMenu = toggleConfigMenu;

// --- ONBOARDING: GUÍA PASO A PASO ---
const pasosOnboarding = [
    { target: 'btn-config-fijos', titulo: 'Configurá tu presupuesto', texto: 'Tocá acá para definir cuánto pensás gastar este mes en cada fijo (luz, alquiler, tarjetas, etc).' },
    { target: 'form-movimiento', titulo: 'Cargá tus gastos diarios', texto: 'Acá anotás cada gasto o ingreso del día a día: nafta, súper, sueldo, lo que sea.' },
    { target: 'dashboard', titulo: 'Tu resumen del mes', texto: 'Este panel te muestra ingresos, egresos y balance actualizados en tiempo real.' },
    { target: 'btn-analisis', titulo: 'Análisis avanzado', texto: 'Acá entrás al detalle completo: evolución financiera, ranking de fugas y alertas de tendencia (contenido PRO).' },
        { target: 'btn-config-menu', titulo: 'Ayuda cuando la necesites', texto: 'Tocá el ⚙️ y buscá "Ayuda y guía de inicio" en cualquier momento para volver a ver esta guía.' }
];
let pasoActualOnboarding = 0;

function iniciarOnboarding() {
    pasoActualOnboarding = 0;
    document.getElementById('onboarding-overlay').classList.remove('hidden');
    document.getElementById('onboarding-tooltip').classList.remove('hidden');
    mostrarPasoOnboarding();
}

function mostrarPasoOnboarding() {
    // Limpiamos el resaltado anterior — ahora NO movemos nada en el DOM, así que
    // limpiar es mucho más simple: solo sacamos la clase y los estilos inline.
    document.querySelectorAll('.onboarding-highlight').forEach(el => {
        el.classList.remove('onboarding-highlight');
        el.style.top = '';
        el.style.left = '';
        el.style.width = '';
        el.style.height = '';
        el.style.pointerEvents = '';
    });

    const paso = pasosOnboarding[pasoActualOnboarding];
    const el = document.getElementById(paso.target);
    const tooltip = document.getElementById('onboarding-tooltip');

    document.getElementById('onb-step-count').innerText = `Paso ${pasoActualOnboarding + 1} de ${pasosOnboarding.length}`;
    document.getElementById('onb-titulo').innerText = paso.titulo;
    document.getElementById('onb-texto').innerText = paso.texto;
    document.getElementById('onb-btn-siguiente').innerText = (pasoActualOnboarding === pasosOnboarding.length - 1) ? 'Entendido' : 'Siguiente';

    if (el) {
        el.scrollIntoView({ behavior: 'auto', block: 'start', inline: 'nearest' });
        window.scrollBy(0, -16);

        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                const rect = el.getBoundingClientRect();

                const topRecortado = Math.max(rect.top, 0);
                const bottomRecortado = Math.min(rect.bottom, window.innerHeight);
                const alturaRecortada = Math.max(bottomRecortado - topRecortado, 40);

                const leftRecortado = Math.max(rect.left, 0);
                const rightRecortado = Math.min(rect.right, window.innerWidth);
                const anchoRecortado = Math.max(rightRecortado - leftRecortado, 40);

                // 🚨 CLAVE: ya NO hacemos appendChild(el) a document.body.
                // La clase .onboarding-highlight ya trae position:fixed !important
                // y z-index:501, así que alcanza con aplicarla en el lugar donde está.
                el.classList.add('onboarding-highlight');
                el.style.top = topRecortado + 'px';
                el.style.left = leftRecortado + 'px';
                el.style.width = anchoRecortado + 'px';
                el.style.height = alturaRecortada + 'px';
                el.style.pointerEvents = 'none';

                const esParteInferior = rect.top > (window.innerHeight / 2);
                if (esParteInferior) {
                    tooltip.classList.remove('bottom-6');
                    tooltip.classList.add('top-6');
                } else {
                    tooltip.classList.remove('top-6');
                    tooltip.classList.add('bottom-6');
                }
            });
        });
    }
}

function siguientePasoOnboarding() {
    pasoActualOnboarding++;
    if (pasoActualOnboarding >= pasosOnboarding.length) {
        cerrarOnboarding();
        return;
    }
    mostrarPasoOnboarding();
}

function cerrarOnboarding() {
    document.querySelectorAll('.onboarding-highlight').forEach(el => {
        el.classList.remove('onboarding-highlight');
        el.style.top = '';
        el.style.left = '';
        el.style.width = '';
        el.style.height = '';
        el.style.pointerEvents = '';
    });
    document.getElementById('onboarding-overlay').classList.add('hidden');
    document.getElementById('onboarding-tooltip').classList.add('hidden');
    localStorage.setItem('zorwel_gastos_onboarding_visto', 'true');
}

window.iniciarOnboarding = iniciarOnboarding;
window.siguientePasoOnboarding = siguientePasoOnboarding;
window.cerrarOnboarding = cerrarOnboarding;



// ====================================================================
// 🎤 CARGA DE MOVIMIENTO POR VOZ
// ====================================================================
let mediaRecorder = null;
let audioChunks = [];
let grabandoVoz = false;

const btnVoz = document.getElementById('btn-voz');
const iconoVoz = document.getElementById('icono-voz');
const textoVoz = document.getElementById('texto-voz');

async function iniciarGrabacionVoz() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        audioChunks = [];

        mediaRecorder = new MediaRecorder(stream);

        mediaRecorder.ondataavailable = (e) => {
            audioChunks.push(e.data);
        };

        mediaRecorder.onstop = async () => {
            stream.getTracks().forEach(track => track.stop());
            await procesarAudioGrabado();
        };

        mediaRecorder.start();
        grabandoVoz = true;

        iconoVoz.textContent = '🔴';
        textoVoz.textContent = 'Grabando... (tocá para terminar)';
        btnVoz.classList.add('animate-pulse');

    } catch (error) {
        console.error("Error accediendo al micrófono:", error);
        mostrarNotificacion('error', 'No se pudo acceder al micrófono. Revisá los permisos.');
    }
}

function detenerGrabacionVoz() {
    if (mediaRecorder && grabandoVoz) {
        mediaRecorder.stop();
        grabandoVoz = false;
        btnVoz.classList.remove('animate-pulse');
        iconoVoz.textContent = '⏳';
        textoVoz.textContent = 'Interpretando...';
        btnVoz.disabled = true;
    }
}

function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
            const base64 = reader.result.split(',')[1];
            resolve(base64);
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}

async function procesarAudioGrabado() {
    try {
        const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
        const audioBase64 = await blobToBase64(audioBlob);

        // Armamos la lista de categorías reales de la casa (fijas + variables)
        const categoriasParaEnviar = [
            ...CATEGORIAS_VARIABLES,
            ...CATEGORIAS_FIJAS_BASE,
            { value: 'SUELDO', label: 'Sueldo (Ingreso)' },
            { value: 'EMPRENDIMIENTO', label: 'Emprendimiento (Ingreso)' },
            { value: 'OTROS_INGRESOS', label: 'Otros Ingresos' },
            { value: 'REGALO', label: 'Regalo / Transferencia' }
        ];

        const fechaHoy = obtenerFechaFormateada(0);

        const resultado = await procesarMovimientoPorVoz({
            audioBase64,
            mimeType: 'audio/webm',
            categorias: categoriasParaEnviar,
            fechaHoy
        });

        completarFormularioConVoz(resultado.data);

    } catch (error) {
        console.error("Error procesando audio:", error);
        mostrarNotificacion('error', 'No se pudo interpretar el audio. Probá cargar el movimiento manualmente.');
    } finally {
        iconoVoz.textContent = '🎤';
        textoVoz.textContent = 'Cargar por voz';
        btnVoz.disabled = false;
    }
}

function completarFormularioConVoz(datos) {
    document.getElementById('tipo').value = datos.tipo;
    document.getElementById('categoria').value = datos.categoria_value;
    document.getElementById('detalle').value = datos.detalle;
    document.getElementById('monto').value = datos.monto;
    document.getElementById('fecha').value = datos.fecha;

    mostrarNotificacion('success', '🎤 ¡Listo! Revisá los datos antes de guardar.');
}

if (btnVoz) {
    btnVoz.addEventListener('click', () => {
        if (grabandoVoz) {
            detenerGrabacionVoz();
        } else {
            iniciarGrabacionVoz();
        }
    });
}
// ===========================================
// 5. FUNCIONES DE UTILIDAD SWEETALERT2
// ===========================================

const mostrarNotificacion = (icon, title) => {
    const Toast = Swal.mixin({
        toast: true,
        position: 'top-end',
        showConfirmButton: false,
        timer: 3000,
        timerProgressBar: true,
        didOpen: (toast) => {
            toast.addEventListener('mouseenter', Swal.stopTimer);
            toast.addEventListener('mouseleave', Swal.resumeTimer);
        }
    });

    Toast.fire({
        icon: icon,
        title: title
    });
};

const confirmarAccion = async (title, text, callback) => {
    const result = await Swal.fire({
        title: title,
        text: text,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#1D4ED8', 
        cancelButtonColor: '#EF4444',  
        confirmButtonText: 'Sí, estoy seguro',
        cancelButtonText: 'Cancelar'
    });

    if (result.isConfirmed) {
        callback();
    }
};

// ====================================================================
// 6. FUNCIONES DE UTILIDAD (Formateo, Menu, Fechas)
// ====================================================================

let menuAbierto = null; 

window.mostrarMenuAcciones = function(event, id, fecha, tipo, categoria, detalle, monto) {
    if (menuAbierto) { menuAbierto.remove(); menuAbierto = null; }

    const menu = document.createElement('div');
    menu.className = 'absolute right-0 mt-2 w-40 bg-white rounded-md shadow-xl z-50 border border-gray-200';

    menu.innerHTML = `
        <button onclick="editarMovimiento('${id}', '${fecha}', '${tipo}', '${categoria}', '${detalle.replace(/'/g, "\\'")}', ${monto}); this.parentNode.remove();"
            class="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">
            ✏️ Editar
        </button>
        <button onclick="eliminarMovimiento('${id}', '${categoria}', ${monto}); this.parentNode.remove();"
            class="block w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50">
            🗑️ Eliminar
        </button>
    `;

    const celda = event.target.closest('td');
    celda.appendChild(menu);
    menuAbierto = menu;
}

document.addEventListener('click', (e) => {
    if (menuAbierto && !menuAbierto.contains(e.target) && !e.target.closest('button')) {
        menuAbierto.remove();
        menuAbierto = null;
    }
});

function obtenerFechaFormateada(restaDias = 0) {
    const d = new Date();
    d.setDate(d.getDate() - restaDias);
    const anio = d.getFullYear();
    const mes = String(d.getMonth() + 1).padStart(2, '0');
    const dia = String(d.getDate()).padStart(2, '0');
    return `${anio}-${mes}-${dia}`;
}

btnHoy.addEventListener('click', () => fechaInput.value = obtenerFechaFormateada(0));
btnAyer.addEventListener('click', () => fechaInput.value = obtenerFechaFormateada(1));

// ====================================================================
// 7. LÓGICA DE CATEGORÍAS FIJAS DINÁMICAS (SAAS)
// ====================================================================

async function cargarCategoriasFijas() {
    if (!usuarioActual) return [];

    const categoriasIngreso = [
        { value: 'SUELDO', label: 'Sueldo (Ingreso)' }, 
        { value: 'SALARIO', label: 'Salario (Ingreso)' },
        { value: 'EMPRENDIMIENTO', label: 'Emprendimiento (Ingreso)' }, 
    ];

    
    categoriasFijasActuales = [...CATEGORIAS_FIJAS_BASE, ...categoriasIngreso];

    CATEGORIAS_FIJAS_VALUES.length = 0; 
    CATEGORIAS_FIJAS_BASE.forEach(cat => CATEGORIAS_FIJAS_VALUES.push(cat.value));

    CATEGORIA_LABEL_MAP = {};
    [...CATEGORIAS_VARIABLES, ...CATEGORIAS_FIJAS_BASE, ...categoriasIngreso].forEach(cat => {
        CATEGORIA_LABEL_MAP[cat.value] = cat.label;
    });

    return categoriasFijasActuales;
}

function inicializarCategoriasDropdown() {
    selectCategoria.innerHTML = '<option value="" disabled selected>-- Seleccionar Categoría --</option>';

    // 1. VARIABLES
    const optgroupVariables = document.createElement('optgroup');
    optgroupVariables.label = 'GASTOS VARIABLES (Diario)';
    CATEGORIAS_VARIABLES.forEach(cat => optgroupVariables.appendChild(new Option(cat.label, cat.value)));
    selectCategoria.appendChild(optgroupVariables);

    // 2. FIJOS
    const optgroupFijos = document.createElement('optgroup');
    optgroupFijos.label = 'GASTOS FIJOS (Egreso de Cuenta)';
    CATEGORIAS_FIJAS_BASE.forEach(cat => optgroupFijos.appendChild(new Option(cat.label, cat.value)));
    selectCategoria.appendChild(optgroupFijos);

    // 3. INGRESOS (🛡️ Ahora son a prueba de fallos)
    const optgroupIngresos = document.createElement('optgroup');
    optgroupIngresos.label = 'INGRESOS';
    
    const CATEGORIAS_INGRESOS = [
        { label: '💰 Sueldo / Salario', value: 'SUELDO' },
        { label: '🚀 Emprendimiento', value: 'EMPRENDIMIENTO' },
        { label: '💵 Otros Ingresos', value: 'OTROS_INGRESOS' },
        { label: '🎁 Regalo / Transferencia', value: 'REGALO' }
    ];

    CATEGORIAS_INGRESOS.forEach(cat => optgroupIngresos.appendChild(new Option(cat.label, cat.value)));
    selectCategoria.appendChild(optgroupIngresos);
}

// ====================================================================
// 8. LÓGICA DE FIJOS RECURRENTES Y MODALES (MODIFICADOS PARA USUARIO)
// ====================================================================

btnConfigFijos.addEventListener('click', async () => {
    await cargarFijosMaestrosAlModal();
    modalFijos.classList.remove('hidden');
});

btnCerrarModalFijos.addEventListener('click', () => {
    modalFijos.classList.add('hidden');
});

async function cargarFijosMaestrosAlModal() {
    const mesVigenciaActual = selectMesFiltro.value; 
    let configFijosMaestro = {};
    let existeConfigParaEsteMesExacto = false;


    const qExacta = query(
        collection(db, FIJOS_CONFIG_COLLECTION),
        where("uid", "==", familiaIdActual), 
        where("mes_ref", "==", mesVigenciaActual)
    );

    try {
        const querySnapshotExacto = await getDocs(qExacta);
        if (!querySnapshotExacto.empty) {
            configFijosMaestro = querySnapshotExacto.docs[0].data();
            existeConfigParaEsteMesExacto = true;
        } else {
            console.log(`Mes ${mesVigenciaActual} sin configurar. Arrancando en $0.`);
        }
    } catch (error) {
        console.error("Error al cargar fijos:", error);
    }
    
    fijosMaestrosContainer.innerHTML = '';
    
    // Si es un mes nuevo, le agregamos el botón mágico para traer los del mes pasado
    if (!existeConfigParaEsteMesExacto) {
        fijosMaestrosContainer.innerHTML = `
            <div class="mb-4 flex justify-end">
                <button type="button" onclick="copiarFijosDelMesPasado()" class="text-xs font-bold text-primary bg-blue-50 dark:bg-blue-900/20 px-3 py-1.5 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors flex items-center gap-1">
                    <span>📋</span> Copiar del mes pasado
                </button>
            </div>
        `;
    }

    const egresosFijos = categoriasFijasActuales.filter(c => c.value !== 'SUELDO' && c.value !== 'SALARIO' && c.value !== 'EMPRENDIMIENTO');

    egresosFijos.forEach(cat => {
        const config = configFijosMaestro[cat.value] || { monto: 0, detalle: '', activo: true, vencimiento: '' }; 
        const div = document.createElement('div');
        div.className = 'flex flex-col sm:flex-row items-center space-y-2 sm:space-y-0 sm:space-x-3 p-2 border rounded-lg bg-gray-50';
        
        const montoDisplay = config.monto ? config.monto : '';

        div.innerHTML = `
            <div class="flex items-center w-full sm:w-1/4">
                <input type="checkbox" id="check-${cat.value}" data-categoria="${cat.value}" data-campo="activo" ${config.activo ? 'checked' : ''} class="h-4 w-4 text-primary border-gray-300 rounded focus:ring-primary mr-2"/>
                <label for="check-${cat.value}" class="font-medium text-gray-700 text-xs sm:text-sm truncate" title="${cat.label}">${cat.label}:</label>
            </div>
            
            <input type="number" data-categoria="${cat.value}" data-campo="monto" value="${montoDisplay}" placeholder="Monto" oninput="document.getElementById('check-${cat.value}').checked = true;" class="w-full sm:w-1/5 p-2 border border-gray-300 rounded-lg text-sm focus:ring-primary focus:border-primary"/>
            
            <input type="date" data-categoria="${cat.value}" data-campo="vencimiento" value="${config.vencimiento || ''}" class="w-full sm:w-1/5 p-2 border border-gray-300 rounded-lg text-sm focus:ring-primary focus:border-primary" title="Fecha de vencimiento"/>
            
            <input type="text" data-categoria="${cat.value}" data-campo="detalle" value="${config.detalle || ''}" placeholder="Nota (Ej: Cuota 2)" class="w-full sm:w-1/3 p-2 border border-gray-300 rounded-lg text-sm focus:ring-primary focus:border-primary"/>
        `;
        fijosMaestrosContainer.appendChild(div);
    });
}

// 🪄 BOTÓN MÁGICO: Copiar valores del mes pasado
window.copiarFijosDelMesPasado = async () => {
    const mesVigenciaActual = selectMesFiltro.value; 
    
    // Buscamos la última configuración guardada ANTES de este mes
    const qUltima = query(
        collection(db, FIJOS_CONFIG_COLLECTION),
        where("uid", "==", familiaIdActual), // 👈 CAMBIO: Busca el historial de la casa
        where("mes_ref", "<", mesVigenciaActual), 
        orderBy("mes_ref", "desc"),
        limit(1)
    );

    try {
        Swal.fire({ title: 'Copiando...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
        const querySnapshot = await getDocs(qUltima);
        
        if (!querySnapshot.empty) {
            const configAnterior = querySnapshot.docs[0].data();
            
            const inputsMonto = fijosMaestrosContainer.querySelectorAll('input[data-campo="monto"]');
            const inputsDetalle = fijosMaestrosContainer.querySelectorAll('input[data-campo="detalle"]');
            const inputsCheck = fijosMaestrosContainer.querySelectorAll('input[data-campo="activo"]');

            inputsMonto.forEach(input => {
                const cat = input.dataset.categoria;
                if(configAnterior[cat] && configAnterior[cat].monto) {
                    input.value = configAnterior[cat].monto;
                }
            });

            inputsDetalle.forEach(input => {
                const cat = input.dataset.categoria;
                if(configAnterior[cat] && configAnterior[cat].detalle) {
                    input.value = configAnterior[cat].detalle;
                }
            });
            
            inputsCheck.forEach(input => {
                const cat = input.dataset.categoria;
                if(configAnterior[cat] && configAnterior[cat].activo !== undefined) {
                    input.checked = configAnterior[cat].activo;
                }
            });

            Swal.close();
            mostrarNotificacion('success', '¡Valores copiados! Revisa y dale a Guardar.');
        } else {
            Swal.fire('Atención', 'No se encontraron gastos fijos en meses anteriores.', 'info');
        }
    } catch (error) {
        console.error("Error al copiar fijos:", error);
        Swal.fire('Error', 'No se pudieron copiar los valores.', 'error');
    }
};

btnGuardarConfigFijos.addEventListener('click', async () => {
    const mesVigencia = selectMesFiltro.value; 
    const nuevaConfig = {
        uid: familiaIdActual, // 👈 CAMBIO: Guarda la configuración a nombre de la casa
        mes_ref: mesVigencia,
        fechaActualizacion: new Date()
    };

    const inputs = fijosMaestrosContainer.querySelectorAll('input'); 
    
    inputs.forEach(input => {
        const categoria = input.dataset.categoria;
        const campo = input.dataset.campo; 
        let valor;

        if (campo === 'monto') {
            valor = parseFloat(input.value.replace(/[$.]/g, '').replace(',', '.')) || 0; 
        } else if (campo === 'activo') {
            valor = input.checked; 
        } else {
            valor = input.value; 
        }

        if (!nuevaConfig[categoria]) nuevaConfig[categoria] = { monto: 0, detalle: '', activo: true, vencimiento: '' }; 
        nuevaConfig[categoria][campo] = valor;
    });

    try {
        // 👈 CAMBIO: El ID de este documento ahora se basa en la familia, para que todos en la casa lo vean y editen
        const configId = `${familiaIdActual}_${mesVigencia}`;
        
        // 🚨 CORRECCIÓN: Agregamos { merge: true } para que no pise los límites variables
        await setDoc(doc(db, FIJOS_CONFIG_COLLECTION, configId), nuevaConfig, { merge: true });

        mostrarNotificacion('success', `Configuración de ${mesVigencia} guardada.`);
        modalFijos.classList.add('hidden');
        await cargarMovimientos(selectMesFiltro.value);
    } catch (error) {
        console.error("Error al guardar fijos:", error);
        mostrarNotificacion('error', "Error al guardar la configuración.");
    }
});

// ====================================================================
// 9. LÓGICA DE ADMINISTRACIÓN DE CATEGORÍAS (SAAS)
// ====================================================================

btnAdministrarFijos.addEventListener('click', () => {
    cargarCategoriasAdmin();
    modalAdminCategorias.classList.remove('content-hidden');
});

const cerrarAdminModal = () => modalAdminCategorias.classList.add('content-hidden');
btnCerrarAdminCategorias.addEventListener('click', cerrarAdminModal);
btnCerrarAdminCategoriasBtn.addEventListener('click', cerrarAdminModal);

function cargarCategoriasAdmin() {
    const listaVariables = document.getElementById('lista-admin-variables');
    const listaFijos = document.getElementById('lista-admin-fijos');
    
    listaVariables.innerHTML = '';
    listaFijos.innerHTML = '';

    const renderItem = (cat, index, tipo) => {
        const div = document.createElement('div');
        div.className = 'flex justify-between items-center p-2 mb-1 rounded border bg-white dark:bg-slate-800 dark:border-slate-700 shadow-sm';
        div.innerHTML = `
            <span class="text-sm text-gray-800 dark:text-gray-200">${cat.label}</span>
            <button onclick="eliminarCategoriaUsuario('${tipo}', ${index}, '${cat.label.replace(/'/g, "\\'")}')" class="text-danger hover:text-red-700 p-1 font-bold text-xs bg-red-50 dark:bg-red-900/20 rounded">🗑️ Borrar</button>
        `;
        return div;
    };

    if (CATEGORIAS_VARIABLES.length === 0) listaVariables.innerHTML = '<p class="text-xs text-gray-500">No hay variables.</p>';
    CATEGORIAS_VARIABLES.forEach((cat, index) => listaVariables.appendChild(renderItem(cat, index, 'variables')));

    if (CATEGORIAS_FIJAS_BASE.length === 0) listaFijos.innerHTML = '<p class="text-xs text-gray-500">No hay fijos.</p>';
    CATEGORIAS_FIJAS_BASE.forEach((cat, index) => listaFijos.appendChild(renderItem(cat, index, 'fijos')));
}


if (formNuevaCategoria) {
    formNuevaCategoria.addEventListener('submit', async (e) => {
        e.preventDefault();
        const nombre = document.getElementById('nombre-nueva-categoria').value.trim();
        const tipo = document.getElementById('tipo-nueva-categoria').value; // 'fijos' o 'variables'

        if (!nombre) return mostrarNotificacion('warning', "El nombre no puede estar vacío.");

        const value = nombre.toUpperCase().replace(/[^A-Z0-9]/g, '_');
        const nuevaCat = { value, label: nombre };

        try {
            // 🚀 CORRECCIÓN CLAVE: Guardamos en la "CASA" (familiaIdActual), no en el usuario individual.
            const docRef = doc(db, CATEGORIAS_USUARIO_COLLECTION, familiaIdActual);
            
            if (tipo === 'fijos') {
                CATEGORIAS_FIJAS_BASE.push(nuevaCat);
            } else {
                CATEGORIAS_VARIABLES.push(nuevaCat);
            }

            // Guardamos en Firebase
            await updateDoc(docRef, { 
                [tipo]: tipo === 'fijos' ? CATEGORIAS_FIJAS_BASE : CATEGORIAS_VARIABLES 
            });

            mostrarNotificacion('success', `¡"${nombre}" añadida a la casa!`);
            formNuevaCategoria.reset();
            
            // 🪄 MAGIA UX: Actualizamos la pantalla al instante sin F5 y sin gastar lecturas extra
            if (typeof cargarCategoriasAdmin === 'function') cargarCategoriasAdmin(); // Refresca la lista del Modal
            inicializarCategoriasDropdown(); // Refresca el <select> principal al instante

        } catch (error) {
            console.error("Error al añadir categoría:", error);
            mostrarNotificacion('error', "Error al guardar. Revisá la consola.");
        }
    });
}

window.eliminarCategoriaUsuario = async (tipo, index, nombre) => {
    confirmarAccion(
        `¿Eliminar "${nombre}"?`,
        `Ya no podrás seleccionarla para cargar nuevos gastos. (Tus gastos históricos no se borran).`,
        async () => {
            try {
                if (tipo === 'fijos') CATEGORIAS_FIJAS_BASE.splice(index, 1);
                else CATEGORIAS_VARIABLES.splice(index, 1);

                // 🚨 CAMBIO: Borramos la categoría de la CASA
                const docRef = doc(db, CATEGORIAS_USUARIO_COLLECTION, familiaIdActual); 
                await updateDoc(docRef, { [tipo]: tipo === 'fijos' ? CATEGORIAS_FIJAS_BASE : CATEGORIAS_VARIABLES });

                mostrarNotificacion('success', `Categoría eliminada.`);
                cargarCategoriasAdmin();
                await cargarCategoriasFijas();
                inicializarCategoriasDropdown();

            } catch (error) {
                console.error("Error al eliminar:", error);
                mostrarNotificacion('error', "Error al borrar.");
            }
        }
    );
};

// ====================================================================
// 10. LÓGICA DE GUARDADO, EDICIÓN Y ELIMINACIÓN DE MOVIMIENTOS
// ====================================================================

formulario.addEventListener('submit', async (e) => {
    e.preventDefault();
    const submitButton = formulario.querySelector('button[type="submit"]');

if (submitButton.disabled) return;

submitButton.disabled = true;

const textoOriginalBoton = submitButton.textContent;

submitButton.textContent = 'GUARDANDO...';

submitButton.classList.add('opacity-60', 'cursor-not-allowed'); 
    if(!usuarioActual) {
        mostrarNotificacion('error', 'Debes iniciar sesión para guardar datos.');
        return;
    }

    const id = document.getElementById('movimiento-id')?.value; 
    const fecha = document.getElementById('fecha').value;
    const monto = parseFloat(document.getElementById('monto').value);

    if (isNaN(monto) || monto <= 0 || !fecha || !selectCategoria.value) {
        mostrarNotificacion('warning', '¡Oops! Faltan datos obligatorios.');
        return;
    }

    const categoria = selectCategoria.value;
    const tipo = document.getElementById('tipo').value;
    const esFijo = CATEGORIAS_FIJAS_VALUES.includes(categoria) && tipo === 'egreso';
    const mesVigenciaMovimiento = fecha.substring(0, 7); 

    // VALIDACIÓN DE MONTOS FIJOS (Ajustada para UID)
    if (esFijo) {
        let configFijosMaestro = {};
        const q = query(
            collection(db, FIJOS_CONFIG_COLLECTION),
            where("uid", "==", familiaIdActual), // 👈
            where("mes_ref", "<=", mesVigenciaMovimiento), // Usamos mes_ref en lugar de documentId para mayor flexibilidad
            orderBy("mes_ref", "desc"),
            limit(1)
        );

        try {
            const querySnapshot = await getDocs(q);
            if (!querySnapshot.empty) {
                configFijosMaestro = querySnapshot.docs[0].data();
            }
        } catch (error) { console.error("Error al validar fijo:", error); }

        const presupuesto = configFijosMaestro[categoria]?.monto || 0;

        if (presupuesto > 0) {
            const deviation = Math.abs(monto - presupuesto) / presupuesto;
            if (deviation > DEVIATION_THRESHOLD) {
                const porcentaje = (deviation * 100).toFixed(1);
                const result = await Swal.fire({
                    title: '⚠️ Advertencia de Presupuesto',
                    html: `Estás registrando <b>${formatoMoneda.format(monto)}</b> para <b>${CATEGORIA_LABEL_MAP[categoria]}</b>.<br><br>Tu límite/presupuesto es ${formatoMoneda.format(presupuesto)}.<br>Desvío: <b>${porcentaje}%</b>.<br><br>¿Continuar?`,
                    icon: 'warning',
                    showCancelButton: true,
                    confirmButtonColor: '#1D4ED8',
                    cancelButtonColor: '#EF4444',
                    confirmButtonText: 'Sí, Continuar',
                    cancelButtonText: 'Cancelar'
                });

                if (!result.isConfirmed) return; 
            }
        }
    }

    // 🚨 DATOS DEL MOVIMIENTO (Ahora incluye el dueño)
    const movimientoData = {
    uid: familiaIdActual, // ✅ AHORA SÍ: GUARDA COMO "uid" Y BUSCA COMO "uid"
    quien_cargo: usuarioActual.email,
    fecha: fecha,
        tipo: tipo,
        categoria: categoria,
        detalle: document.getElementById('detalle').value.trim() || 'Sin detalle',
        monto: monto,
        mes_ref: mesVigenciaMovimiento, 
        esFijo: esFijo
    };

    try {
        if (id) {
            const docRef = doc(db, MOVIMIENTOS_COLLECTION, id);
            await updateDoc(docRef, movimientoData);
            mostrarNotificacion('success', `¡Movimiento actualizado!`);
        } else {
            movimientoData.timestamp = new Date(); 
            await addDoc(collection(db, MOVIMIENTOS_COLLECTION), movimientoData);
            mostrarNotificacion('success', `¡Gasto guardado!`);
        }

        // Limpiar
        formulario.reset();
        document.getElementById('movimiento-id')?.remove(); 
        
        submitButton.textContent = 'GUARDAR';
        submitButton.classList.remove('bg-amber-500', 'hover:bg-amber-600');
        submitButton.classList.add('bg-primary', 'hover:bg-blue-700');
        fechaInput.value = obtenerFechaFormateada(0); 
        await inicializarDashboard(); 

    } catch (error) {
    console.error(`Error al guardar:`, error);
    mostrarNotificacion('error', "Error de guardado.");
} finally {
    submitButton.disabled = false;
    submitButton.textContent = textoOriginalBoton;
    submitButton.classList.remove('opacity-60', 'cursor-not-allowed');
}
});

window.editarMovimiento = async (id, fecha, tipo, categoria, detalle, monto) => {
    let idInput = document.getElementById('movimiento-id');
    if (!idInput) {
        idInput = document.createElement('input');
        idInput.type = 'hidden';
        idInput.id = 'movimiento-id';
        formulario.appendChild(idInput);
    }
    idInput.value = id;
    document.getElementById('fecha').value = fecha;
    document.getElementById('tipo').value = tipo;
    document.getElementById('categoria').value = categoria;
    document.getElementById('detalle').value = detalle === 'Sin detalle' ? '' : detalle;
    document.getElementById('monto').value = monto;

    const submitButton = formulario.querySelector('button[type="submit"]');
    submitButton.textContent = 'ACTUALIZAR MOVIMIENTO';
    submitButton.classList.remove('bg-primary');
    submitButton.classList.add('bg-amber-500', 'hover:bg-amber-600');
    mostrarNotificacion('info', `Editando: ${CATEGORIA_LABEL_MAP[categoria]}. Presione 'ACTUALIZAR' al terminar.`);
};

window.eliminarMovimiento = async (id, categoria, monto) => {
    confirmarAccion(
        `¿Estás seguro de ELIMINAR?`,
        `Se eliminará el movimiento de ${CATEGORIA_LABEL_MAP[categoria]} por ${formatoMoneda.format(monto)}.`,
        async () => {
            try {
                await deleteDoc(doc(db, MOVIMIENTOS_COLLECTION, id));
                mostrarNotificacion('success', "Eliminado.");
                await inicializarDashboard(); 
            } catch (error) {
                console.error("Error al eliminar:", error);
            }
        }
    );
};

async function obtenerMovimientosPorMes(mesRef) {
    if (!usuarioActual || !familiaIdActual) return [];
    
    try {
        const q = query(
            collection(db, MOVIMIENTOS_COLLECTION),
            // USAMOS "uid" porque así están guardados en tu base
            where("uid", "==", familiaIdActual), 
            where("mes_ref", "==", mesRef),
            orderBy("fecha", "desc")
        );
        
        const snapshot = await getDocs(q);
        const resultados = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }));
        
        console.log(`📦 Mes ${mesRef}: Encontrados ${resultados.length} movimientos.`);
        
        return resultados;
    } catch (e) {
        console.error("❌ Error en Firebase:", e);
        return [];
    }
}

function cargarOpcionesDeMes() {
    const selector = selectMesFiltro; 
    selector.innerHTML = ''; 

    const hoy = new Date();
    let ultimoMesGuardado = "";

    for (let i = MESES_FUTUROS_PLANIFICACION; i >= 0; i--) {
        const d = new Date(hoy.getFullYear(), hoy.getMonth() + i, 1);
        const anio = d.getFullYear();
        const mes = String(d.getMonth() + 1).padStart(2, '0');
        const mesRef = `${anio}-${mes}`;

        const nombreMes = d.toLocaleString('es-AR', { month: 'long', year: 'numeric' });
        const option = new Option(nombreMes.charAt(0).toUpperCase() + nombreMes.slice(1), mesRef);
        selector.add(option);
        if (i === 0) ultimoMesGuardado = mesRef;
    }

    for (let i = 1; i <= MESES_PASADOS_HISTORICO; i++) {
        const d = new Date(hoy.getFullYear(), hoy.getMonth() - i, 1);
        const anio = d.getFullYear();
        const mes = String(d.getMonth() + 1).padStart(2, '0');
        const mesRef = `${anio}-${mes}`;

        const nombreMes = d.toLocaleString('es-AR', { month: 'long', year: 'numeric' });
        const option = new Option(nombreMes.charAt(0).toUpperCase() + nombreMes.slice(1), mesRef);
        selector.add(option);
    }
    
    selector.value = ultimoMesGuardado; 
    return ultimoMesGuardado;
}


async function cargarResumenFijos(mesSeleccionado, movimientosMesActual) {
    if(!usuarioActual) return { totalPagadoFijo: 0, fijosPagados: {} };

    let configFijosMaestro = {}; 
    const q = query(
        collection(db, FIJOS_CONFIG_COLLECTION),
        where("uid", "==", familiaIdActual), 
        where("mes_ref", "==", mesSeleccionado) 
    );

    try {
        const querySnapshot = await getDocs(q);
        if (!querySnapshot.empty) {
            configFijosMaestro = querySnapshot.docs[0].data();
        } else {
            console.log(`🧹 Limpiando vista de fijos: No hay configuración para ${mesSeleccionado}`);
        }
    } catch (error) { console.error("Error fijos vigentes:", error); }

    const fijosPagadosDisplay = document.getElementById('fijos-pagados');
    const fijosPresupuestoDisplay = document.getElementById('fijos-presupuesto');
    const fijosPendienteDisplay = document.getElementById('fijos-pendiente');
    const listaFijosContainer = document.getElementById('lista-fijos');

    listaFijosContainer.innerHTML = '';
    let totalPresupuestoFijo = 0;
    let totalPagadoFijo = 0;

    const fijosPagados = movimientosMesActual
        .filter(m => m.esFijo && m.tipo === 'egreso') 
        .reduce((acc, m) => {
            acc[m.categoria] = (acc[m.categoria] || 0) + m.monto;
            return acc;
        }, {});

    categoriasFijasActuales
        .filter(c => c.value !== 'SUELDO' && c.value !== 'SALARIO' && c.value !== 'EMPRENDIMIENTO')
        .forEach(cat => {
            const config = configFijosMaestro[cat.value] || { monto: 0, detalle: '', activo: true };

            if (!config.activo && (fijosPagados[cat.value] === undefined || fijosPagados[cat.value] === 0)) return; 

            const montoEstimado = config.monto || 0;
            const detalleCuota = config.detalle || '';
            const montoPagado = fijosPagados[cat.value] || 0;
            const pendiente = Math.max(0, montoEstimado - montoPagado);

            if (config.activo) totalPresupuestoFijo += montoEstimado;
            totalPagadoFijo += montoPagado; 

            const item = document.createElement('div');
            const baseClass = config.activo ? '' : 'opacity-70 border-gray-300 bg-gray-50'; 
            item.className = `flex justify-between items-center p-3 rounded-lg border ${baseClass}`;

            let statusClass = 'text-danger bg-danger/10 border-danger';
            let statusText = `${formatoMoneda.format(pendiente)} Pendiente`;

            if (!config.activo) {
                statusClass = 'text-gray-500 bg-gray-100 border-gray-300';
                statusText = montoPagado > 0 ? `Pagado ${formatoMoneda.format(montoPagado)} (INACTIVO)` : 'INACTIVO';
            } else if (montoPagado >= montoEstimado && montoEstimado > 0) {
                statusClass = 'text-success bg-success/10 border-success';
                statusText = '✅ Completo';
            } else if (montoPagado > 0 && montoPagado < montoEstimado) {
                statusClass = 'text-amber-600 bg-amber-100 border-amber-500';
                statusText = `${formatoMoneda.format(montoPagado)} pagado`;
            } else if (montoEstimado === 0 && montoPagado > 0) {
                statusClass = 'text-green-800 bg-green-200 border-green-500';
                statusText = '✅ Pagado (S/E)';
            } else if (montoEstimado === 0) {
                statusClass = 'text-gray-500 bg-gray-100 border-gray-300';
                statusText = 'S/P';
            }

            let fechaVtoHTML = '';
            let claseUrgencia = 'text-amber-600 dark:text-amber-400'; 

            if (config.vencimiento && config.activo && montoPagado < montoEstimado) {
                const [anio, mes, dia] = config.vencimiento.split('-');
                const fechaVto = new Date(anio, mes - 1, dia);
                const hoy = new Date();
                hoy.setHours(0, 0, 0, 0); 

                const diffTiempo = fechaVto - hoy;
                const diffDias = Math.ceil(diffTiempo / (1000 * 60 * 60 * 24));

                if (diffDias < 0) {
                    claseUrgencia = 'text-red-600 dark:text-red-500 font-black animate-pulse';
                    fechaVtoHTML = `<span class="${claseUrgencia} text-[10px] block mt-1 uppercase">⚠️ VENCIDO: ${dia}/${mes}</span>`;
                } else if (diffDias <= 3) {
                    claseUrgencia = 'text-orange-600 dark:text-orange-400 font-bold';
                    fechaVtoHTML = `<span class="${claseUrgencia} text-[10px] block mt-1 uppercase">⏳ VENCE EN ${diffDias} DÍAS</span>`;
                } else {
                    claseUrgencia = 'text-emerald-600 dark:text-emerald-400';
                    fechaVtoHTML = `<span class="${claseUrgencia} text-[10px] block mt-1 uppercase">📅 Vence: ${dia}/${mes}</span>`;
                }
            } else if (config.vencimiento) {
                const [anio, mes, dia] = config.vencimiento.split('-');
                fechaVtoHTML = `<span class="text-[10px] text-gray-400 block mt-1">📅 Vto: ${dia}/${mes}</span>`;
            } else {
                fechaVtoHTML = `<span class="text-[10px] text-gray-400 block mt-1 italic">Sin fecha vto.</span>`;
            }

            item.innerHTML = `
                <div class="flex flex-col">
                    <span class="font-medium text-gray-800 dark:text-gray-200 text-sm">${cat.label} 
                        ${detalleCuota ? `<span class="text-xs text-gray-500 block font-normal">${detalleCuota}</span>` : ''}
                    </span>
                    ${fechaVtoHTML} </div>
                <div class="text-right flex flex-col items-end justify-center">
                    <span class="text-[10px] text-gray-500 dark:text-gray-400 block uppercase">Est: ${formatoMoneda.format(montoEstimado)}</span>
                    <span class="font-bold text-xs ${statusClass} px-2 py-0.5 rounded mt-1">${statusText}</span>
                </div>
            `;
            listaFijosContainer.appendChild(item);
        });

    if(fijosPresupuestoDisplay) fijosPresupuestoDisplay.textContent = formatoMoneda.format(totalPresupuestoFijo);
    if(fijosPagadosDisplay) fijosPagadosDisplay.textContent = formatoMoneda.format(totalPagadoFijo);
    if(fijosPendienteDisplay) fijosPendienteDisplay.textContent = formatoMoneda.format(totalPresupuestoFijo - totalPagadoFijo);

    return { totalPagadoFijo, fijosPagados }; 
}

// ====================================================================
// 📄 PAGINADO DEL HISTORIAL: mostrar 10 y "Ver más"
// ====================================================================
const MOVIMIENTOS_VISIBLES_INICIAL = 10;
let mostrandoTodosMovimientos = false;

function aplicarPaginacionMovimientos() {
    const filas = Array.from(document.querySelectorAll('#lista-movimientos tr[data-fila-movimiento]'));
    const btnExistente = document.getElementById('btn-ver-mas-movimientos');
    if (btnExistente) btnExistente.remove();

    if (filas.length <= MOVIMIENTOS_VISIBLES_INICIAL) {
        filas.forEach(f => f.style.display = '');
        return;
    }

    filas.forEach((f, i) => {
        f.style.display = (mostrandoTodosMovimientos || i < MOVIMIENTOS_VISIBLES_INICIAL) ? '' : 'none';
    });

    insertarBotonVerMasMovimientos(filas.length);
}

function insertarBotonVerMasMovimientos(total) {
    const listaMovimientos = document.getElementById('lista-movimientos');
    const tr = document.createElement('tr');
    tr.id = 'btn-ver-mas-movimientos';
    const restantes = total - MOVIMIENTOS_VISIBLES_INICIAL;
    tr.innerHTML = `
        <td colspan="4" class="px-4 py-3 text-center">
            <button type="button" id="btn-toggle-ver-mas" class="text-xs font-bold text-primary hover:underline">
                ${mostrandoTodosMovimientos ? '▲ Ver menos' : `▼ Ver los ${restantes} restantes`}
            </button>
        </td>
    `;
    listaMovimientos.appendChild(tr);
    document.getElementById('btn-toggle-ver-mas').addEventListener('click', () => {
        mostrandoTodosMovimientos = !mostrandoTodosMovimientos;
        aplicarPaginacionMovimientos();
    });
}

// ====================================================================
// 💼 SALDO ACUMULADO REAL (Saldo inicial + historial completo)
// ====================================================================
async function calcularSaldoAcumuladoReal() {
    const contenedor = document.getElementById('contenedor-saldo-acumulado');
    if (!contenedor) return;

    if (rolUsuarioActual !== 'admin') {
        contenedor.classList.add('hidden');
        return;
    }
    contenedor.classList.remove('hidden');

    try {
        const q = query(
            collection(db, MOVIMIENTOS_COLLECTION),
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
            elValor.className = `sensitive-data resumen-data text-sm font-bold ${saldoReal >= 0 ? 'text-success' : 'text-danger'}`;
            if (document.querySelector('.resumen-data.revealed')) {
                elValor.classList.add('revealed');
            }
        }
    } catch (error) {
        console.error("Error calculando saldo acumulado real:", error);
    }
}
window.calcularSaldoAcumuladoReal = calcularSaldoAcumuladoReal;

window.abrirEditarSaldoInicial = async () => {
    if (rolUsuarioActual !== 'admin') return;

    const { value: nuevoSaldo } = await Swal.fire({
        title: '💼 Saldo Inicial Declarado',
        html: `<p class="text-xs text-gray-500 dark:text-gray-400 mb-3 text-left">Es la plata que ya tenías (banco, efectivo, etc.) antes de empezar a usar ZorWel. Se suma a tu historial para calcular tu Saldo Acumulado Real.</p>`,
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
            const familiaRef = doc(db, FAMILIAS_COLLECTION, familiaIdActual);
            await updateDoc(familiaRef, {
                saldo_inicial: parseFloat(nuevoSaldo) || 0,
                saldo_inicial_fecha: new Date()
            });
            familiaSaldoInicialActual = parseFloat(nuevoSaldo) || 0;
            mostrarNotificacion('success', 'Saldo inicial actualizado.');
            await calcularSaldoAcumuladoReal();
        } catch (error) {
            console.error("Error guardando saldo inicial:", error);
            mostrarNotificacion('error', 'No se pudo guardar el saldo inicial.');
        }
    }
};

async function cargarMovimientos(mesSeleccionado) {
    if (!mesSeleccionado || !usuarioActual) return;

    const listaMovimientos = document.getElementById('lista-movimientos');
    listaMovimientos.innerHTML = '<tr><td colspan="4" class="px-4 py-3 text-center">Analizando tus finanzas...</td></tr>'; 

    const [anio, mes] = mesSeleccionado.split('-').map(Number);
    const mesAnteriorDate = new Date(anio, mes - 2, 1);
    const mesAnteriorRef = `${mesAnteriorDate.getFullYear()}-${String(mesAnteriorDate.getMonth() + 1).padStart(2, '0')}`;
    document.getElementById('mes-actual').textContent = mesSeleccionado;

    const movimientosMesActual = await obtenerMovimientosPorMes(mesSeleccionado);
    const movimientosMesAnterior = await obtenerMovimientosPorMes(mesAnteriorRef);

        busquedaInput.value = ''; 
    mostrandoTodosMovimientos = false;
    const { totalPagadoFijo, fijosPagados } = await cargarResumenFijos(mesSeleccionado, movimientosMesActual);

    // --- VARIABLES DE CÁLCULO ---
    let totalIngresos = 0;
    let totalEgresosVariables = 0;
    const egresosPorCategoria = {}; 
    const ingresosPorCategoria = {}; 
    listaMovimientos.innerHTML = ''; 

    movimientosMesActual.forEach(data => {
        // 🛡️ LÓGICA DE PERTENENCIA (SaaS)
        const esMio = data.quien_cargo === usuarioActual.email;
        const esParaMi = data.destinatario === usuarioActual.email;
        const esIngreso = data.tipo === 'ingreso';
        const esFijo = data.esFijo && data.tipo === 'egreso';

        let debeSumar = false;
        if (rolUsuarioActual === 'admin') {
            debeSumar = true; // El admin ve y suma TODO
        } else {
            
            if (esIngreso && esMio) debeSumar = true;
            if (data.esMesada && esParaMi) debeSumar = true;
            if (!esIngreso && esMio) debeSumar = true;
        }

        if (debeSumar) {
            if (esIngreso || data.esMesada) {
                totalIngresos += data.monto;
                ingresosPorCategoria[data.categoria] = (ingresosPorCategoria[data.categoria] || 0) + data.monto; 
            } else if (!esFijo) { 
                totalEgresosVariables += data.monto;
            }

            if (!esIngreso && !data.esMesada) { 
                egresosPorCategoria[data.categoria] = (egresosPorCategoria[data.categoria] || 0) + data.monto;
            }
        }

        // --- DIBUJO DE LA TABLA (Mantenemos tu lógica de privacidad) ---
        const fechaPartes = data.fecha.split('-'); 
        const fechaDDMM = `${fechaPartes[2]}/${fechaPartes[1]}`;
        const tipoIcono = (esIngreso || data.esMesada) ? '<span class="text-success inline-block ml-1" title="INGRESO">▲</span>' : '<span class="text-danger inline-block ml-1" title="EGRESO">▼</span>';

        let categoriaLabel = CATEGORIA_LABEL_MAP[data.categoria] || data.categoria; 
        let detalleAMostrar = data.detalle || 'Sin detalle';
        let montoAMostrar = formatoMoneda.format(data.monto);

        if (rolUsuarioActual === 'dependiente' && !esMio && !esParaMi) {
            detalleAMostrar = '••••••••';
            montoAMostrar = '****';
            categoriaLabel = 'Privado (Admin)'; 
        }

                const tr = document.createElement('tr');
        tr.dataset.filaMovimiento = 'true';
        tr.className = (esIngreso || data.esMesada) ? 'row-ingreso hover:bg-gray-50' : 'row-egreso hover:bg-gray-50';
        tr.innerHTML = `
            <td class="px-2 sm:px-4 py-3 text-left font-semibold text-xs sm:text-sm whitespace-nowrap">${fechaDDMM}${tipoIcono}</td>
            <td class="px-2 sm:px-4 py-3 text-left ${esFijo ? 'text-blue-600 font-semibold' : 'text-gray-800'}">
                <span class="block text-sm truncate max-w-[120px] sm:max-w-xs">${categoriaLabel}</span>
                <span class="text-[10px] sm:text-xs text-gray-500 block truncate max-w-[120px] sm:max-w-xs">${detalleAMostrar}</span>
            </td>
            <td class="px-2 sm:px-4 py-3 text-left font-bold text-sm whitespace-nowrap">${montoAMostrar}</td>
            <td class="px-2 sm:px-4 py-3 text-center relative">
                ${(rolUsuarioActual === 'admin' || esMio) ? `
                    <button onclick="mostrarMenuAcciones(event, '${data.id}', '${data.fecha}', '${data.tipo}', '${data.categoria}', '${data.detalle.replace(/'/g, "\\'")}', ${data.monto})" 
                    class="text-gray-500 hover:text-gray-800 p-2 rounded-full text-lg font-bold leading-none">⋮</button>
                ` : '🔒'}
            </td>
        `;
        listaMovimientos.appendChild(tr);
    });

        // --- CÁLCULOS FINALES (Solo para el usuario logueado) ---
    if (movimientosMesActual.length === 0) {
        listaMovimientos.innerHTML = '<tr><td colspan="4" class="px-4 py-8 text-center text-gray-500">Todo tranquilo. No hay movimientos registrados.</td></tr>';
    } else {
        aplicarPaginacionMovimientos();
    }

    // Si es hijo, los gastos fijos de la casa no cuentan en su balance personal
    const fijosParaCalculo = (rolUsuarioActual === 'admin') ? totalPagadoFijo : 0;
    const totalEgresos = fijosParaCalculo + totalEgresosVariables;
    const balance = totalIngresos - totalEgresos;

  // --- ACTUALIZACIÓN DE TARJETAS (SISTEMA UNIFICADO) ---

   // 1. Ingresos
const elIngresos = document.getElementById('total-ingresos');
if (elIngresos) {
    elIngresos.textContent = formatoMoneda.format(totalIngresos);
    elIngresos.className = "text-xs sm:text-2xl font-bold text-success block truncate";
}

   // 2. Egresos
const elEgresos = document.getElementById('total-egresos');
if (elEgresos) {
    elEgresos.textContent = formatoMoneda.format(totalEgresos);
    elEgresos.className = "text-xs sm:text-2xl font-bold text-danger block truncate";
}

   // 3. Balance (Con color dinámico)
const elBalance = document.getElementById('balance-final');
if (elBalance) {
    elBalance.textContent = formatoMoneda.format(balance);
    const colorClase = balance >= 0 ? 'text-green-600' : 'text-red-600';
    elBalance.className = `text-xs sm:text-2xl font-bold ${colorClase} block truncate`;
}

   // 🪄 MAGIA MÓVIL: Efecto "Toque para ver detalle" (SOLO CELULARES)
const hacerTocableMovil = (elemento, titulo, valor, colorText) => {
    if (elemento && elemento.parentElement) {
           // Nos aseguramos de limpiar clics anteriores
        elemento.parentElement.onclick = null; 
        
        elemento.parentElement.onclick = () => {
               // El if mágico: Si la pantalla es de celular/tablet chica, dispara el cartel
            if (window.innerWidth <= 768) {
                Swal.fire({
                    title: titulo,
                    html: `<span class="text-3xl font-black ${colorText}">${formatoMoneda.format(valor)}</span>`,
                    toast: true,
                    position: 'top',
                    showConfirmButton: false,
                       timer: 2500, // Desaparece solo en 2.5 segundos
                    timerProgressBar: true
                });
            }
        };
    }
};

   // Le damos el poder de ser tocables a las 3 cajas
hacerTocableMovil(elIngresos, 'Total Ingresos', totalIngresos, 'text-success');
hacerTocableMovil(elEgresos, 'Total Egresos', totalEgresos, 'text-danger');
hacerTocableMovil(elBalance, 'Balance Actual', balance, balance >= 0 ? 'text-green-600' : 'text-red-600');

    
    // --- ANÁLISIS PORCENTUAL ---
    const pctFijos = totalIngresos > 0 ? (fijosParaCalculo / totalIngresos) * 100 : 0;
    const pctVars = totalIngresos > 0 ? (totalEgresosVariables / totalIngresos) * 100 : 0;
    const pctBal = totalIngresos > 0 ? (balance / totalIngresos) * 100 : 0;

    // Buscamos los elementos una sola vez
    const elPctFijos = document.getElementById('pct-fijos-vs-ingreso');
    const elPctVars = document.getElementById('pct-variables-vs-ingreso');
    const elPctBal = document.getElementById('pct-balance-vs-ingreso');

    // Actualizamos solo si existen en el HTML actual
    if (elPctFijos) elPctFijos.textContent = `${pctFijos.toFixed(1)}%`;
    if (elPctVars) elPctVars.textContent = `${pctVars.toFixed(1)}%`;
    if (elPctBal) elPctBal.textContent = `${pctBal.toFixed(1)}%`;

    // --- TOP CATEGORÍAS (SISTEMA CORREGIDO) ---
    const contenedorTopVars = document.getElementById('top-gastos-variables');
    const contenedorTopFijos = document.getElementById('top-gastos-fijos');

    if (contenedorTopVars) {
        // Sacamos los fijos de la lista de variables y cortamos en 3
        const topVars = Object.entries(egresosPorCategoria)
            .filter(([cat, monto]) => fijosPagados[cat] === undefined) 
            .sort((a, b) => b[1] - a[1])
            .slice(0, 3);
            
        let htmlVars = '<h4 class="text-md font-semibold text-gray-700 mb-2">Top Variables:</h4>';
        htmlVars += topVars.length ? topVars.map(v => 
            `<div class="flex justify-between items-center py-1 border-b border-gray-100 last:border-0">
                <span class="text-sm text-gray-600 truncate pr-2">${CATEGORIA_LABEL_MAP[v[0]] || v[0]}</span> 
                <span class="text-sm font-bold text-gray-800">${formatoMoneda.format(v[1])}</span>
            </div>`
        ).join('') : '<p class="text-xs text-gray-400 italic">Sin datos</p>';
        
        contenedorTopVars.innerHTML = htmlVars;
    }

    if (contenedorTopFijos) {
        // Ordenamos los fijos de mayor a menor y cortamos en 3
        const topFijosArr = Object.entries(fijosPagados)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 3);
            
        let htmlFijos = '<h4 class="text-md font-semibold text-gray-700 mb-2">Top Fijos:</h4>';
        htmlFijos += topFijosArr.length ? topFijosArr.map(v => 
            `<div class="flex justify-between items-center py-1 border-b border-gray-100 last:border-0">
                <span class="text-sm text-blue-600 truncate pr-2">${CATEGORIA_LABEL_MAP[v[0]] || v[0]}</span> 
                <span class="text-sm font-bold text-gray-800">${formatoMoneda.format(v[1])}</span>
            </div>`
        ).join('') : '<p class="text-xs text-gray-400 italic">Sin datos</p>';
        
        contenedorTopFijos.innerHTML = htmlFijos;
    }

    // Gráficos y Estrategia (Mantenemos funciones existentes)
    let totalEgresosAnterior = movimientosMesAnterior.filter(m => {
        if (rolUsuarioActual === 'admin') return m.tipo === 'egreso';
        return m.tipo === 'egreso' && m.quien_cargo === usuarioActual.email;
    }).reduce((sum, m) => sum + m.monto, 0);


    // --- RENDERIZAR MINI-HISTORIAL (3 en PC, 2 en Móvil) ---
    const listaMini = document.getElementById('lista-mini-historial');
    if (listaMini) {
        listaMini.innerHTML = '';
        
        // Cortamos los últimos 3 movimientos
        const ultimos3 = movimientosMesActual.filter(m => {
            if (rolUsuarioActual === 'admin') return true;
            return m.quien_cargo === usuarioActual.email || m.destinatario === usuarioActual.email;
        }).slice(0, 3); // 👈 Ahora pedimos 3

        if (ultimos3.length === 0) {
            listaMini.innerHTML = '<p class="text-[10px] text-gray-500 italic text-center py-2">No hay gastos recientes.</p>';
        } else {
            ultimos3.forEach((m, index) => {
                const esIngreso = m.tipo === 'ingreso' || m.esMesada;
                const color = esIngreso ? 'text-success' : 'text-gray-700 dark:text-gray-200';
                const signo = esIngreso ? '+' : '-';
                const catLabel = CATEGORIA_LABEL_MAP[m.categoria] || m.categoria;
                
                // 📅 Armamos la fecha cortita (Ej: 31/03)
                const partesFecha = m.fecha.split('-');
                const fechaCorta = `${partesFecha[2]}/${partesFecha[1]}`;
                
                // 🪄 EL TRUCO: Si es el tercer elemento (índice 2), lo ocultamos en celu (hidden) y lo mostramos en PC (md:flex)
                const visibilidad = index === 2 ? 'hidden md:flex' : 'flex';
                
                listaMini.innerHTML += `
                    <div class="${visibilidad} justify-between items-center bg-gray-50 dark:bg-slate-700/50 p-2 rounded border border-gray-100 dark:border-gray-600">
                        <span class="text-[11px] font-medium text-gray-600 dark:text-gray-300 truncate w-2/3" title="${catLabel}">
                            <span class="text-gray-400 mr-1.5">${fechaCorta}</span> ${catLabel}
                        </span>
                        <span class="text-xs font-bold ${color}">${signo}${formatoMoneda.format(m.monto)}</span>
                    </div>
                `;
            });
        }
    }

    calcularYMostrarIPC(totalEgresos, totalEgresosAnterior);
    generarGraficoEgresos(egresosPorCategoria);
    generarGraficoIngresos(ingresosPorCategoria);
    actualizarModulosPro(totalIngresos, totalEgresos, egresosPorCategoria, mesSeleccionado); 
    analizarTendencias(egresosPorCategoria, {});
    calcularTotales(movimientosMesActual);
    aplicarRestriccionesHijo();
    // Al final de cargarMovimientos...
    verificarAlertasVencimiento(mesSeleccionado, movimientosMesActual);

    // Al final de la definición de la función, agregamos esto:
window.cargarMovimientos = cargarMovimientos; 
window.familiaIdActual = familiaIdActual; // Hacé lo mismo con esta variable
}

function analizarTendencias(egresosActual, egresosAnterior) {
    const panel = document.getElementById('panel-estrategia');
    const contenido = document.getElementById('contenido-estrategia');
    if (!panel || !contenido) return;

    // Mostrar el panel solo si hay datos para comparar
    if (Object.keys(egresosAnterior).length === 0) {
        panel.classList.add('hidden');
        return;
    }
    panel.classList.remove('hidden');

    let htmlInsights = '';
    let alertasGeneradas = 0;

    // Analizamos solo variables críticas
    const categoriasParaAnalizar = ['DELIVERY', 'KIOSCO', 'OCIO', 'SALIDAS', 'SUPERMERCADO'];

    categoriasParaAnalizar.forEach(cat => {
        const montoActual = egresosActual[cat] || 0;
        const montoAnterior = egresosAnterior[cat] || 0;
        
        if (montoAnterior > 0 && montoActual > 0) {
            const diferenciaPct = ((montoActual / montoAnterior) - 1) * 100;
            const label = CATEGORIA_LABEL_MAP[cat] || cat;

            if (diferenciaPct > 20) {
                alertasGeneradas++;
                htmlInsights += `
                <div class="bg-white p-4 rounded-xl shadow-sm border-l-4 border-danger">
                    <p class="text-xs text-gray-500 uppercase font-bold tracking-wider mb-1">${label}</p>
                    <p class="text-sm text-gray-800">Has gastado un <strong class="text-danger">${diferenciaPct.toFixed(0)}% más</strong> que el mes pasado.</p>
                </div>`;
            } else if (diferenciaPct < -15) {
                alertasGeneradas++;
                htmlInsights += `
                <div class="bg-white p-4 rounded-xl shadow-sm border-l-4 border-success">
                    <p class="text-xs text-gray-500 uppercase font-bold tracking-wider mb-1">${label}</p>
                    <p class="text-sm text-gray-800">¡Excelente! Redujiste este gasto en un <strong class="text-success">${Math.abs(diferenciaPct).toFixed(0)}%</strong>.</p>
                </div>`;
            }
        }
    });

    if (alertasGeneradas === 0) {
        htmlInsights = `
        <div class="col-span-2 bg-white/50 p-6 rounded-xl text-center border border-gray-100">
            <p class="text-gray-600 font-medium">Tus hábitos de consumo están muy estables comparado con el mes anterior. Sigue así. 🧘‍♂️</p>
        </div>`;
    }

    contenido.innerHTML = htmlInsights;
}

function calcularYMostrarIPC(totalActual, totalAnterior) {
    
    if (rolUsuarioActual === 'dependiente') return; 

    const ipcValorDisplay = document.getElementById('ipc-valor');
    if (!ipcValorDisplay) return; // Seguridad extra

    if (totalAnterior === 0 || totalActual === 0) {
        ipcValorDisplay.textContent = 'N/A';
        ipcValorDisplay.className = 'font-semibold text-gray-600';
        return;
    }
    const ipc = ((totalActual / totalAnterior) - 1) * 100;
    ipcValorDisplay.textContent = `${ipc.toFixed(1)}%`;
    if (ipc > 5) ipcValorDisplay.className = 'font-semibold text-danger';
    else if (ipc > 0) ipcValorDisplay.className = 'font-semibold text-amber-500';
    else ipcValorDisplay.className = 'font-semibold text-success';
}

function generarGraficoEgresos(egresosPorCategoria) { 
    if (myChartEgresos) { myChartEgresos.destroy(); }
    const categorias = Object.keys(egresosPorCategoria).map(key => CATEGORIA_LABEL_MAP[key] || key);
    const montos = Object.values(egresosPorCategoria);
    const ctx = document.getElementById('graficoGastos')?.getContext('2d');
    if (!ctx) return; 
    myChartEgresos = new Chart(ctx, {
        type: 'doughnut', 
        data: {
            labels: categorias,
            datasets: [{ data: montos, backgroundColor: ['#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', '#9966FF', '#FF9F40', '#5c5c5c', '#1A79C2', '#C21A79', '#79C21A', '#800080', '#008080'], hoverOffset: 10 }]
        },
        options: {
    responsive: true,
    maintainAspectRatio: false, 
    plugins: {
        legend: {
            position: 'bottom', 
            labels: {
                boxWidth: 12,
                padding: 15,
                font: { size: 10 } 
            }
        }
    },
    layout: {
        padding: { top: 10, bottom: 10 }
    }
}
    });
}

function generarGraficoIngresos(ingresosPorCategoria) { 
    if (myChartIngresos) { myChartIngresos.destroy(); }
    const categorias = Object.keys(ingresosPorCategoria).map(key => CATEGORIA_LABEL_MAP[key] || key);
    const montos = Object.values(ingresosPorCategoria);
    const ctx = document.getElementById('graficoIngresos')?.getContext('2d');
    if (!ctx) return; 
    myChartIngresos = new Chart(ctx, {
        type: 'pie', 
        data: {
            labels: categorias,
            datasets: [{ data: montos, backgroundColor: ['#059669', '#1D4ED8', '#FFCE56', '#4BC0C0', '#9966FF'], hoverOffset: 10 }]
        },
        options: {
    responsive: true,
    maintainAspectRatio: false, // ¡CLAVE! Esto permite que se adapte al contenedor
    plugins: {
        legend: {
            position: 'bottom', // Abajo para que no robe ancho
            labels: {
                boxWidth: 12,
                padding: 15,
                font: { size: 10 } // Fuente más chica para que entren más
            }
        }
    },
    layout: {
        padding: { top: 10, bottom: 10 }
    }
}
    });
}

// --- LÓGICA DE BÚSQUEDA Y DARK MODE (INTACTOS) ---

function filtrarTabla() {
    const busquedaInput = document.getElementById('busqueda-movimientos');
    if (!busquedaInput) return;

    const filtro = busquedaInput.value.toLowerCase().trim();

    // Sin texto de búsqueda: volvemos al comportamiento normal paginado
    if (filtro === '') {
        const filaMensajeVacio = document.getElementById('fila-sin-resultados');
        if (filaMensajeVacio) filaMensajeVacio.remove();
        aplicarPaginacionMovimientos();
        return;
    }

    // Con texto: ocultamos el botón "Ver más" y buscamos en TODAS las filas, sin límite
    const btnVerMas = document.getElementById('btn-ver-mas-movimientos');
    if (btnVerMas) btnVerMas.remove();

    const filas = document.querySelectorAll('#lista-movimientos tr[data-fila-movimiento]');
    let resultadosVisibles = 0;

    filas.forEach(fila => {
        const textoFila = fila.textContent.toLowerCase();
        if (textoFila.includes(filtro)) {
            fila.style.display = '';
            resultadosVisibles++;
        } else {
            fila.style.display = 'none';
        }
    });

    // ==========================================
    // UX PRO: Mensaje de "No hay resultados"
    // ==========================================
    const listaMovimientos = document.getElementById('lista-movimientos');
    let filaMensaje = document.getElementById('fila-sin-resultados');

    if (resultadosVisibles === 0 && filtro !== '') {
        if (!filaMensaje) {
            listaMovimientos.insertAdjacentHTML('beforeend', `
                <tr id="fila-sin-resultados">
                    <td colspan="4" class="px-4 py-8 text-center text-gray-500 dark:text-gray-400 text-sm font-medium italic">
                        No se encontraron registros para "<span class="text-primary">${filtro}</span>" 🕵️‍♂️
                    </td>
                </tr>
            `);
        } else {
            filaMensaje.style.display = '';
            filaMensaje.querySelector('span').textContent = filtro;
        }
    } else if (filaMensaje) {
        filaMensaje.style.display = 'none';
    }
}

// Asegurate de que el input escuche cada vez que el usuario teclea:
const inputBusqueda = document.getElementById('busqueda-movimientos');
if (inputBusqueda) {
    inputBusqueda.addEventListener('input', filtrarTabla);
}

busquedaInput.addEventListener('keyup', filtrarTabla); 

const darkModeToggle = document.getElementById('dark-mode-toggle');
function aplicarTema(tema) {
    if (tema === 'dark') {
        document.documentElement.classList.add('dark');
        document.body.classList.add('dark');
        if(darkModeToggle) darkModeToggle.checked = true;
        localStorage.setItem('theme', 'dark');
    } else {
        document.documentElement.classList.remove('dark');
        document.body.classList.remove('dark');
        if(darkModeToggle) darkModeToggle.checked = false;
        localStorage.setItem('theme', 'light');
    }
}
if (localStorage.getItem('theme') === 'dark') { aplicarTema('dark'); }
if(darkModeToggle) {
    darkModeToggle.addEventListener('change', () => {
        aplicarTema(darkModeToggle.checked ? 'dark' : 'light');
        actualizarColoresGraficos(); 
    });
}

function actualizarColoresGraficos() {
    const esDark = document.body.classList.contains('dark');
    Chart.defaults.color = esDark ? '#f8fafc' : '#1f2937'; 
    if (myChartEgresos) myChartEgresos.update();
    if (myChartIngresos) myChartIngresos.update();
}
actualizarColoresGraficos();


// =================================================================
// 🚀 LÓGICA DE ONBOARDING INTELIGENTE
// =================================================================

const onboardingScreen = document.getElementById('onboarding-screen');
const step1 = document.getElementById('onboarding-step-1');
const step2 = document.getElementById('onboarding-step-2');
const btnNextOnboarding = document.getElementById('btn-onboarding-next');
const btnBackOnboarding = document.getElementById('btn-onboarding-back');
const stepText = document.getElementById('onboarding-step-text');

// 1. Efecto de las burbujas
document.querySelectorAll('.bubble-btn').forEach(btn => {
    btn.addEventListener('click', function() {
        this.classList.toggle('selected');
        if(this.classList.contains('selected')) {
            this.style.transform = 'scale(0.95)';
            setTimeout(() => this.style.transform = '', 150);
        }
    });
});

// 2. Renderizar listas en el Paso 2
function renderizarBorradorOnboarding() {
    const contenedorFijos = document.getElementById('onboarding-lista-fijos');
    const contenedorVariables = document.getElementById('onboarding-lista-variables');
    
    // Función para dibujar los items con botón de borrar
    const renderList = (array, container, type) => {
        container.innerHTML = array.length === 0 ? '<p class="text-sm text-gray-500">Ninguna seleccionada.</p>' : '';
        array.forEach((item, index) => {
            const div = document.createElement('div');
            div.className = 'flex justify-between items-center bg-gray-50 dark:bg-slate-700 p-2 rounded border border-gray-100 dark:border-gray-600';
            div.innerHTML = `
                <span class="text-sm text-gray-700 dark:text-gray-200 font-medium">${item}</span>
                <button onclick="eliminarItemBorrador(${index}, '${type}')" class="text-danger hover:text-red-700 p-1 font-bold text-xs">✕</button>
            `;
            container.appendChild(div);
        });
    };

    renderList(borradorFijos, contenedorFijos, 'fijos');
    renderList(borradorVariables, contenedorVariables, 'variables');
}

// Para que el botón ✕ funcione
window.eliminarItemBorrador = function(index, type) {
    if (type === 'fijos') borradorFijos.splice(index, 1);
    else borradorVariables.splice(index, 1);
    renderizarBorradorOnboarding();
};

// 3. Botones Siguiente / Comenzar
btnNextOnboarding.addEventListener('click', async () => {
    if (step1.classList.contains('hidden')) {
        // --- GUARDAR EN FIREBASE Y EMPEZAR ---
        btnNextOnboarding.textContent = 'Guardando...';
        btnNextOnboarding.disabled = true;

        try {
            // 🚨 CAMBIO: Guardamos las categorías base a nombre de la CASA
            const docRef = doc(db, CATEGORIAS_USUARIO_COLLECTION, familiaIdActual);
            await setDoc(docRef, {
                uid: familiaIdActual, // 👈 Vinculado a la casa
                fijos: borradorFijos.map(f => ({ value: f.toUpperCase().replace(/[^A-Z0-9]/g, '_'), label: f })),
                variables: borradorVariables.map(v => ({ value: v.toUpperCase().replace(/[^A-Z0-9]/g, '_'), label: v })),
                setupCompletado: true,
                fechaCreacion: new Date()
            });

            mostrarNotificacion('success', '¡Perfil configurado con éxito!');
            onboardingScreen.classList.add('content-hidden');
            appContent.classList.remove('content-hidden');
            await cargarCategoriasUsuario(); // Recargamos el cerebro
            await inicializarDashboard(); // Arrancamos la app
            
        } catch (error) { 
            console.error("Error guardando onboarding:", error);
            mostrarNotificacion('error', 'Error al guardar. Intenta de nuevo.');
            btnNextOnboarding.textContent = '¡Comenzar! 🚀';
            btnNextOnboarding.disabled = false;
        }

    } else {
        // --- PASAR AL PASO 2 (Mezclar plantillas) ---
        borradorFijos = [...PLANTILLAS_ONBOARDING.base.fijos];
        borradorVariables = [...PLANTILLAS_ONBOARDING.base.variables];

        document.querySelectorAll('.bubble-btn.selected').forEach(btn => {
            const tag = btn.dataset.tag;
            if (PLANTILLAS_ONBOARDING[tag]) {
                borradorFijos.push(...PLANTILLAS_ONBOARDING[tag].fijos);
                borradorVariables.push(...PLANTILLAS_ONBOARDING[tag].variables);
            }
        });

        // Eliminar duplicados por si acaso
        borradorFijos = [...new Set(borradorFijos)];
        borradorVariables = [...new Set(borradorVariables)];

        renderizarBorradorOnboarding();

        step1.classList.add('hidden');
        step2.classList.remove('hidden');
        btnBackOnboarding.classList.remove('invisible');
        stepText.textContent = 'Paso 2 de 2';
        btnNextOnboarding.textContent = '¡Guardar y Comenzar! 🚀';
    }
});

btnBackOnboarding.addEventListener('click', () => {
    step2.classList.add('hidden');
    step1.classList.remove('hidden');
    btnBackOnboarding.classList.add('invisible');
    stepText.textContent = 'Paso 1 de 2';
    btnNextOnboarding.textContent = 'Siguiente Paso ➡️';
});

// =================================================================
// 📡 CARGA DE CATEGORÍAS DESDE FIREBASE (Reemplaza lo viejo)
// =================================================================

async function cargarCategoriasUsuario() {
    if (!familiaIdActual) return false; // 🚨 IMPORTANTE: Usar familiaIdActual

    try {
        // Buscamos las categorías de la CASA, no del UID del que está logueado
        const docRef = doc(db, CATEGORIAS_USUARIO_COLLECTION, familiaIdActual);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
            const data = docSnap.data();
            CATEGORIAS_FIJAS_BASE = data.fijos || [];
            CATEGORIAS_VARIABLES = data.variables || [];
            return true; 
        } else {
            return false; 
        }
    } catch (error) {
        console.error("Error leyendo categorías:", error);
        return false;
    }
}

// ====================================================================
// 12. INICIALIZACIÓN (Se llama cuando hay usuario logueado)
// ====================================================================

async function inicializarDashboard() {
    // Chau patovica, ya sabemos que el usuario está logueado a esta altura.
    
    // 1. Cargamos el "cerebro" de categorías
    await cargarCategoriasFijas(); 
    inicializarCategoriasDropdown();

    fechaInput.value = obtenerFechaFormateada(0);
    const mesInicial = cargarOpcionesDeMes(); 

    // 2. Cargamos los datos (Esto ya ejecuta calcularTotales automáticamente)
    if (mesInicial) {
        await cargarMovimientos(mesInicial);
    }

    aplicarEstadoVisibilidadInicial();
    
    // 3. Lógica específica por Rol
    if (rolUsuarioActual === 'admin') {
        verificarPagosMesadaPendientes();
    } else {
        // Si es hijo, solo nos aseguramos de que el panel de la billetera exista
        const panelHijo = document.getElementById('panel-hijo-presupuesto');
        if (panelHijo) panelHijo.classList.remove('hidden');
    }

    if (rolUsuarioActual === 'admin') {
        verificarPagosMesadaPendientes();
    } else if (rolUsuarioActual === 'dependiente') {
        // 🚀 Si es hijo, calculamos su saldo histórico acá
        await calcularSaldoHistoricoHijo();
    }

            ocultarSplash(); 
    
    // 4. Aplicamos las restricciones finales (ocultar fijos, etc.)
    aplicarRestriccionesHijo();
}
    

btnAplicarFiltro.addEventListener('click', () => {
    cargarMovimientos(selectMesFiltro.value);
});

// ====================================================================
// 13. LÓGICA DE PANEL FAMILIAR Y GESTIÓN DE EQUIPO (SAAS)
// ====================================================================

const formInvitar = document.getElementById('form-invitar-miembro');
const listaMiembros = document.getElementById('lista-miembros-familia');

if(btnMiFamilia) {
    btnMiFamilia.addEventListener('click', () => {
        const menuDropdown = document.getElementById('menu-dropdown');
        if(menuDropdown) menuDropdown.classList.add('hidden');
        modalFamilia.classList.remove('content-hidden');
        cargarMiembrosFamilia(); 
    });
}

const cerrarModalFam = () => modalFamilia.classList.add('content-hidden');
if(btnCerrarModalFamilia) btnCerrarModalFamilia.addEventListener('click', cerrarModalFam);
if(btnCerrarModalFamiliaBtn) btnCerrarModalFamiliaBtn.addEventListener('click', cerrarModalFam);

async function cargarMiembrosFamilia() {
    if (!familiaIdActual) return;
    listaMiembros.innerHTML = '<p class="text-sm text-gray-500 text-center py-4">Cargando equipo...</p>';

    const zonaInvitacion = document.querySelector('#modal-familia .bg-blue-50');
    if (rolUsuarioActual !== 'admin') {
        if (zonaInvitacion) zonaInvitacion.classList.add('hidden'); 
    } else {
        if (zonaInvitacion) zonaInvitacion.classList.remove('hidden');
    }

    try {
        
        const docRef = doc(db, FAMILIAS_COLLECTION, familiaIdActual);
        const docSnap = await getDoc(docRef);

        let miembros = [];
        if (docSnap.exists() && docSnap.data().miembros) {
            miembros = docSnap.data().miembros;
        }

        listaMiembros.innerHTML = `
            <div class="flex justify-between items-center p-3 rounded-lg border bg-blue-50 dark:bg-blue-900/20 dark:border-blue-800 shadow-sm mb-2">
                <div class="flex items-center space-x-3">
                    <div class="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-white font-bold text-xs">👑</div>
                    <div>
                        <p class="text-sm font-bold text-gray-800 dark:text-white">Administrador Principal</p>
                        <p class="text-xs text-blue-600 dark:text-blue-400">Dueño de la Casa</p>
                    </div>
                </div>
                <span class="bg-green-100 text-green-800 text-[10px] font-bold px-2 py-1 rounded border border-green-200">ACTIVO</span>
            </div>
        `;

        
        miembros.forEach((m, index) => {
            const esHijo = m.rol === 'dependiente';
            const badgeClass = m.estado === 'pendiente' ? 'bg-amber-100 text-amber-800' : 'bg-green-100 text-green-800';
            const rolTexto = esHijo ? '👦 Hijo / Dependiente' : '👑 Administrador';

            listaMiembros.innerHTML += `
                <div class="flex justify-between items-center p-3 rounded-lg border bg-white dark:bg-slate-800 shadow-sm mt-2">
                    <div class="flex items-center space-x-3">
                        <div class="w-8 h-8 rounded-full bg-gray-200 dark:bg-slate-600 flex items-center justify-center font-bold text-xs uppercase">
                            ${m.email.substring(0, 2)}
                        </div>
                        <div>
                            <p class="text-sm font-bold text-gray-800 dark:text-white">${m.email}</p>
                            <p class="text-[10px] text-gray-500">${rolTexto}</p>
                        </div>
                    </div>
                    <div class="flex flex-col items-end space-y-2">
                        ${(rolUsuarioActual === 'admin' && esHijo) ? `
                            <button onclick="abrirConfigPresupuestoHijo('${m.email}')" 
                                    class="text-[10px] font-bold bg-blue-600 text-white px-2 py-1 rounded hover:bg-blue-700 transition">
                                💰 Mesada
                            </button>
                        ` : ''}
                        
                        <button onclick="eliminarInvitado(${index}, '${m.email}')" 
                                class="text-[10px] font-bold text-danger hover:underline">
                            ✕ Revocar
                        </button>
                    </div>
                </div>
            `;
        });

    } catch (error) {
        console.error("Error al cargar familia:", error);
    }
}

if(formInvitar) {
    formInvitar.addEventListener('submit', async (e) => {
        e.preventDefault();

        // 🛡️ REGLA DE ORO: Solo los PRO invitan
        const familiaRef = doc(db, FAMILIAS_COLLECTION, familiaIdActual);
        const familiaSnap = await getDoc(familiaRef);
        const esPro = familiaSnap.exists() && familiaSnap.data().es_pro === true;

        if (!esPro) {
            Swal.fire({
                icon: 'info',
                title: 'ZorWel Familiar (Premium)',
                text: 'Para invitar a tu pareja o hijos y compartir los gastos de la casa, necesitas la suscripción Premium.',
                confirmButtonText: 'Ver Planes',
                confirmButtonColor: '#1D4ED8',
                showCancelButton: true,
                cancelButtonText: 'Ahora no'
            }).then((result) => {
                if (result.isConfirmed) window.location.href = "analisis.html"; // Lo mandamos al muro de pago
            });
            return;
        }

        const emailInvitado = document.getElementById('email-invitacion').value.trim().toLowerCase();
        const rol = document.getElementById('rol-invitacion').value;

        if (!emailInvitado || emailInvitado === usuarioActual.email) {
            mostrarNotificacion('warning', 'Ingresá un correo válido distinto al tuyo.');
            return;
        }

        const btnSubmit = formInvitar.querySelector('button[type="submit"]');
        btnSubmit.disabled = true;
        btnSubmit.textContent = 'Enviando invitación...';

        try {
            // 1. Guardar invitación en Firebase (como ya hacías)
            const invitacionRef = doc(db, INVITACIONES_COLLECTION, emailInvitado);
            await setDoc(invitacionRef, {
    familia_id: familiaIdActual,
    uid: familiaIdActual, // 👈 ESTA ES LA CLAVE
    rol: rol,
    fecha_invitacion: new Date(),
    quien_invito: usuarioActual.email
}, { merge: true });

            let miembros = familiaSnap.data().miembros || [];
            if (!miembros.some(m => m.email === emailInvitado)) {
                miembros.push({ email: emailInvitado, rol: rol, estado: 'pendiente', fecha: new Date() });
                await updateDoc(familiaRef, { miembros: miembros });
            }

            // 🚀 2. DISPARAR EL MAIL REAL CON EMAILJS
            const templateParams = {
    nombre_invitado: emailInvitado.split('@')[0], 
    nombre_admin: usuarioActual.displayName || usuarioActual.email,
    email_destino: emailInvitado, // 👈 Se usa en el recuadro del mail
    link_app: "https://zorwel-gastos-mensuales.firebaseapp.com" 
};
            await emailjs.send('service_bnoj1ne', 'template_9v3vv0l', templateParams);

            mostrarNotificacion('success', `¡Invitación enviada y mail despachado a ${emailInvitado}!`);
            formInvitar.reset(); 
            cargarMiembrosFamilia(); 

        } catch (error) {
            console.error("Error al invitar:", error);
            mostrarNotificacion('error', 'No pudimos enviar el mail, pero la invitación se creó en el sistema.');
        } finally {
            btnSubmit.disabled = false;
            btnSubmit.textContent = '✉️ Enviar Invitación';
        }
    });
}

window.eliminarInvitado = async (index, email) => {
    confirmarAccion('¿Revocar acceso?', `La cuenta ${email} ya no podrá entrar a tu casa.`, async () => {
        try {
            // 🚨 CAMBIO: Buscamos la casa correcta para borrar al miembro
            const docRef = doc(db, FAMILIAS_COLLECTION, familiaIdActual); 
            const docSnap = await getDoc(docRef);
            if (docSnap.exists()) {
                let miembros = docSnap.data().miembros;
                miembros.splice(index, 1);
                await updateDoc(docRef, { miembros: miembros });
            }
            // Borramos el sobre del buzón (invitaciones)
            await deleteDoc(doc(db, INVITACIONES_COLLECTION, email));
            
            mostrarNotificacion('success', 'Acceso revocado.');
            cargarMiembrosFamilia();
        } catch (error) {
            console.error("Error al revocar:", error);
        }
    });
};

function aplicarRestriccionesHijo() {
    if (rolUsuarioActual !== 'dependiente') return;

    document.body.classList.add('user-hijo');

    // 1. Buscamos TODOS los contenedores principales
    const todasLasTarjetas = document.querySelectorAll('.bg-white, .rounded-xl, section, div');

    const palabrasProhibidas = [
        'Fijos Recurrentes',
        'Análisis Porcentual',
        'Distribución de Gastos',
        'Distribución de Ingresos',
        'Insights & Tendencias',
        'Estrategia',
        'IPC',
        'Inflación Personal',
        'Límites Variables', 
        'Pronóstico'         
    ];

    todasLasTarjetas.forEach(tarjeta => {
        const contenido = tarjeta.innerText || "";
        
        // Si la tarjeta tiene alguna palabra prohibida, la DESAPARECEMOS
        if (palabrasProhibidas.some(palabra => contenido.includes(palabra))) {
            // Cuidamos de NO borrar el "Resumen del Mes" ni "Mi Billetera"
            if (!contenido.includes('Resumen del Mes') && !contenido.includes('Mi Billetera')) {
                
                tarjeta.remove(); 
            }
        }
    });

    // 3. Limpieza final de botones y selectores explícitos
    // 🚨 CAMBIO: Agregamos 'btn-mi-familia' a la lista de destrucción
    const extras = ['btn-config-fijos', 'btn-administrar-fijos', 'btn-analisis', 'admin-controls-container', 'panel-estrategia', 'btn-mi-familia'];
    
    extras.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.remove(); // Destrucción total del botón
    });

   // 4. Limpiar categorías y grupos en el selector
    const selectCat = document.getElementById('categoria');
    if (selectCat) {
        // A. Volar el título / grupo de "GASTOS FIJOS" completo
        const grupos = selectCat.querySelectorAll('optgroup');
        grupos.forEach(grupo => {
            if (grupo.label.includes('GASTOS FIJOS')) {
                grupo.remove();
            }
        });

        // B. Limpiar opciones individuales de ingresos/gastos de adultos
        const categoriasAdultos = ['LUZ', 'GAS', 'AGUA', 'INTERNET', 'TELEFON_A_M_VIL', 'ALQUILER', 'EXPENSAS', 'SUELDO', 'SALARIO', 'OTROS_INGRESOS'];
        
        Array.from(selectCat.options).forEach(opt => {
            // Borramos lo de adultos
            if (categoriasAdultos.some(c => opt.value.includes(c))) {
                opt.remove();
            }
            
            // Renombramos "Emprendimiento" visualmente a "Ingresos Varios"
            if (opt.value === 'EMPRENDIMIENTO') {
                opt.textContent = 'Ingresos Varios / Changas';
            }
            
            // Renombramos "REGALO"
            if (opt.value === 'REGALO') {
                opt.textContent = 'Regalo / Mesada extra';
            }
        });
    }

    // 🎯 ELIMINACIÓN TOTAL DEL RASTRO DE INFLACIÓN
    const ipcSpan = document.getElementById('ipc-valor');
    if (ipcSpan) {
        const parrafoInflacion = ipcSpan.closest('p');
        if (parrafoInflacion) parrafoInflacion.remove();
    }

    // Limpieza de rezagos de texto
    document.querySelectorAll('p, span, h2, h3').forEach(el => {
        if (el.textContent.includes('Inflación Personal') || el.textContent.includes('Pronóstico')) {
            el.remove();
        }
    });

    console.log("🛡️ Filtro de Hierro aplicado: El hijo solo ve su billetera.");
}

window.abrirConfigPresupuestoHijo = async (emailHijo) => {
    // 1. Buscamos si ya tiene una configuración previa para mostrarla en el modal
    const docRef = doc(db, FAMILIAS_COLLECTION, familiaIdActual);
    const docSnap = await getDoc(docRef);
    const familiaData = docSnap.data();
    const configActual = familiaData.presupuestos?.[emailHijo] || { monto: 0, frecuencia: 'semanal' };

    const { value: formValues } = await Swal.fire({
        title: `💰 Presupuesto para ${emailHijo}`,
        html: `
            <div class="text-left space-y-4">
                <label class="block text-xs font-bold text-gray-500 uppercase">Monto de la Mesada</label>
                <input id="swal-monto" type="number" class="swal2-input !mt-1" value="${configActual.monto}" placeholder="Ej: 15000">
                
                <label class="block text-xs font-bold text-gray-500 uppercase">Frecuencia de Entrega</label>
                <select id="swal-frecuencia" class="swal2-input !mt-1">
                    <option value="semanal" ${configActual.frecuencia === 'semanal' ? 'selected' : ''}>Semanal (Cada Lunes)</option>
                    <option value="mensual" ${configActual.frecuencia === 'mensual' ? 'selected' : ''}>Mensual (Día 1 del mes)</option>
                </select>
                <p class="text-[10px] text-gray-400 italic">La app te avisará cuándo registrar el pago para impactar en ambos balances.</p>
            </div>
        `,
        showCancelButton: true,
        confirmButtonText: 'Guardar Regla',
        confirmButtonColor: '#1D4ED8',
        preConfirm: () => {
            return {
                monto: parseFloat(document.getElementById('swal-monto').value),
                frecuencia: document.getElementById('swal-frecuencia').value
            }
        }
    });

    if (formValues) {
        try {
            // Guardamos la REGLA en el documento de la familia
            const presupuestos = familiaData.presupuestos || {};
            presupuestos[emailHijo] = {
                ...formValues,
                fecha_actualizacion: new Date()
            };

            await updateDoc(docRef, { presupuestos: presupuestos });
            mostrarNotificacion('success', 'Regla de presupuesto guardada correctamente.');
            cargarMiembrosFamilia();
        } catch (error) {
            console.error("Error al guardar presupuesto:", error);
            mostrarNotificacion('error', 'No se pudo guardar la configuración.');
        }
    }
};

async function verificarPagosMesadaPendientes() {
    if (rolUsuarioActual !== 'admin') return;

    try {
        const docRef = doc(db, FAMILIAS_COLLECTION, familiaIdActual);
        const docSnap = await getDoc(docRef);
        const familiaData = docSnap.data();
        const presupuestos = familiaData.presupuestos || {};
        const hoy = new Date();

        for (const [emailHijo, config] of Object.entries(presupuestos)) {
            let debePagar = false;
            const ultimaFecha = config.ultimo_pago ? config.ultimo_pago.toDate() : null;

            if (!ultimaFecha) {
                debePagar = true; // Nunca se le pagó
            } else {
                if (config.frecuencia === 'semanal') {
                    // Si pasaron más de 7 días desde el último pago
                    const diffDias = Math.floor((hoy - ultimaFecha) / (1000 * 60 * 60 * 24));
                    if (diffDias >= 7) debePagar = true;
                } else if (config.frecuencia === 'mensual') {
                    // Si cambió el mes desde el último pago
                    if (hoy.getMonth() !== ultimaFecha.getMonth() || hoy.getFullYear() !== ultimaFecha.getFullYear()) {
                        debePagar = true;
                    }
                }
            }

            if (debePagar) {
                mostrarAlertaPagoMesada(emailHijo, config.monto);
            }
        }
    } catch (e) {
        console.error("Error verificando pagos:", e);
    }
}

function mostrarAlertaPagoMesada(emailHijo, monto) {
    Swal.fire({
        title: '💸 Toca pagar mesada',
        html: `Es momento de entregar <b>${formatoMoneda.format(monto)}</b> a <b>${emailHijo}</b>.<br><br>¿Querés registrar el gasto ahora?`,
        icon: 'info',
        showCancelButton: true,
        confirmButtonText: 'Sí, registrar pago',
        cancelButtonText: 'Más tarde',
        confirmButtonColor: '#059669' // Verde éxito
    }).then(async (result) => {
        if (result.isConfirmed) {
            await procesarPagoMesada(emailHijo, monto);
        }
    });
}

async function procesarPagoMesada(emailHijo, monto) {
    try {
        const fechaHoy = new Date().toISOString().split('T')[0];
        const mesRef = fechaHoy.substring(0, 7);

        
        await addDoc(collection(db, MOVIMIENTOS_COLLECTION), {
            uid: familiaIdActual,
            quien_cargo: usuarioActual.email, // El padre paga
            fecha: fechaHoy,
            tipo: 'egreso',
            categoria: 'Hijos', 
            detalle: `Mesada para ${emailHijo}`,
            monto: monto,
            mes_ref: mesRef,
            esFijo: false,
            esMesada: true, 
            destinatario: emailHijo 
        });

        // 2. ACTUALIZAMOS LA FECHA DE ÚLTIMO PAGO
        const docRef = doc(db, FAMILIAS_COLLECTION, familiaIdActual);
        const docSnap = await getDoc(docRef);
        let presupuestos = docSnap.data().presupuestos;
        presupuestos[emailHijo].ultimo_pago = new Date();

        await updateDoc(docRef, { presupuestos: presupuestos });

        mostrarNotificacion('success', 'Pago registrado y saldo enviado al hijo.');
        inicializarDashboard(); // Recargamos para ver el gasto reflejado
    } catch (e) {
        console.error("Error al procesar pago:", e);
        mostrarNotificacion('error', 'Error al procesar el pago.');
    }
}

function calcularTotales(movimientos) {
    let ingresos = 0;
    let egresos = 0;

    movimientos.forEach(m => {
        const monto = parseFloat(m.monto) || 0;
        const esMio = m.quien_cargo === usuarioActual.email;
        const esParaMi = String(m.destinatario).toLowerCase().trim() === String(usuarioActual.email).toLowerCase().trim();

        if (rolUsuarioActual === 'dependiente') {
            // --- LÓGICA HIJO ---
            if (m.tipo === 'ingreso' && esMio) {
                ingresos += monto; 
            } else if (m.esMesada && esParaMi) {
                ingresos += monto; 
            } else if (m.tipo === 'egreso' && esMio) {
                egresos += monto; 
            }
        } else {
    // --- LÓGICA ADMIN (Papá/Mamá) ---
    
    if (m.tipo === 'ingreso' && !m.esMesada) {
        ingresos += monto;
    } else if (m.tipo === 'egreso' || m.esMesada) {
        egresos += monto;
    }
}
    });

    const balance = ingresos - egresos;

    // --- ACTUALIZAR LA INTERFAZ (UI) ---
    const setTexto = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.textContent = formatoMoneda.format(val);
    };

    setTexto('total-ingresos', ingresos);
    setTexto('total-egresos', egresos);
    setTexto('balance-final', balance);
    
    // Versión móvil
    setTexto('total-ingresos-movil', ingresos);
    setTexto('total-egresos-movil', egresos);
    setTexto('balance-final-movil', balance);

    // Color del balance
    const balanceEl = document.getElementById('balance-final');
    if (balanceEl) {
        balanceEl.className = balance >= 0 ? 'text-lg sm:text-2xl font-bold text-success' : 'text-lg sm:text-2xl font-bold text-danger';
    }

    // --- WIDGET DINÁMICO PARA EL HIJO ---
    if (rolUsuarioActual === 'dependiente') {
        const panelHijo = document.getElementById('panel-hijo-presupuesto');
        const barra = document.getElementById('hijo-barra-progreso');
        const montoDisp = document.getElementById('hijo-monto-disponible');
        const textoPresupuesto = document.getElementById('hijo-texto-presupuesto'); // 👈 Agregamos esto

        if (panelHijo) {
            panelHijo.classList.remove('hidden');
            montoDisp.textContent = formatoMoneda.format(balance);

            let porcentaje = ingresos > 0 ? (balance / ingresos) * 100 : 0;
            porcentaje = Math.max(0, Math.min(100, porcentaje));

            if (barra) {
                barra.style.width = `${porcentaje}%`;
                barra.classList.remove('bg-success', 'bg-amber-500', 'bg-danger');
                
                if (porcentaje > 50) {
                    barra.classList.add('bg-success');
                    textoPresupuesto.textContent = "✅ ¡Vas bien! Tu presupuesto está saludable.";
                } else if (porcentaje > 20) {
                    barra.classList.add('bg-amber-500');
                    textoPresupuesto.textContent = "⚠️ ¡Cuidado! Ya gastaste más de la mitad.";
                } else {
                    barra.classList.add('bg-danger');
                    textoPresupuesto.textContent = "🚨 ¡Alerta! Te queda muy poca plata.";
                }
            }
        }
    }
}

async function calcularSaldoHistoricoHijo() {
    if (rolUsuarioActual !== 'dependiente') return;

    try {
        // 🔍 Buscamos TODOS los movimientos históricos de la familia
        const q = query(
            collection(db, MOVIMIENTOS_COLLECTION),
            where("uid", "==", familiaIdActual)
        );
        const querySnapshot = await getDocs(q);
        
        let ingresosTotales = 0;
        let egresosTotales = 0;

        querySnapshot.forEach((doc) => {
            const m = doc.data();
            const monto = parseFloat(m.monto) || 0;
            const esParaMi = String(m.destinatario || '').toLowerCase().trim() === String(usuarioActual.email).toLowerCase().trim();
            const loCargoElHijo = m.quien_cargo === usuarioActual.email;

            // Ingresos: Mesadas recibidas o plata cargada por él mismo
            if (m.esMesada && esParaMi) {
                ingresosTotales += monto;
            } else if (m.tipo === 'ingreso' && loCargoElHijo) {
                ingresosTotales += monto;
            }
            
            // Egresos: Solo lo que gastó él
            if (m.tipo === 'egreso' && loCargoElHijo) {
                egresosTotales += monto;
            }
        });

        const saldoHistorico = ingresosTotales - egresosTotales;

        // 🎨 Pintamos la Billetera
        const montoDisp = document.getElementById('hijo-monto-disponible');
        const barra = document.getElementById('hijo-barra-progreso');
        
        if (montoDisp) montoDisp.textContent = formatoMoneda.format(saldoHistorico);

        if (barra) {
            let porcentaje = ingresosTotales > 0 ? (saldoHistorico / ingresosTotales) * 100 : 0;
            porcentaje = Math.max(0, Math.min(100, porcentaje));
            barra.style.width = `${porcentaje}%`;
            
            barra.classList.remove('bg-success', 'bg-amber-500', 'bg-danger');
            if (porcentaje > 50) barra.classList.add('bg-success');
            else if (porcentaje > 20) barra.classList.add('bg-amber-500');
            else barra.classList.add('bg-danger');
        }

    } catch (error) {
        console.error("❌ Error calculando saldo histórico:", error);
    }
}

async function verificarAlertasVencimiento(mesSeleccionado, movimientosMesActual) {
    // Solo el Admin o el Dueño necesitan ver esto
    if (rolUsuarioActual !== 'admin') return;

    // 🛑 ESCUDO ANTI-SPAM Y AHORRO DE FIREBASE
    const hoyStr = new Date().toLocaleDateString('es-AR');
    const ultimoAviso = localStorage.getItem('avisoVencimientosZorWel');

    // Si ya lo vio hoy, cortamos la función acá nomás. ¡No gasta lecturas!
    if (ultimoAviso === hoyStr) {
        console.log("🤫 Alertas de vencimiento ya mostradas hoy. Silenciando...");
        return; 
    }

    let configFijosMaestro = {};
    const q = query(
        collection(db, FIJOS_CONFIG_COLLECTION),
        where("uid", "==", familiaIdActual),
        where("mes_ref", "<=", mesSeleccionado),
        orderBy("mes_ref", "desc"),
        limit(1)
    );

    const querySnapshot = await getDocs(q);
    if (querySnapshot.empty) return;
    configFijosMaestro = querySnapshot.docs[0].data();

    const fijosPagados = movimientosMesActual
        .filter(m => m.esFijo && m.tipo === 'egreso')
        .reduce((acc, m) => {
            acc[m.categoria] = (acc[m.categoria] || 0) + m.monto;
            return acc;
        }, {});

    let criticos = [];
    let proximos = [];

    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);

    categoriasFijasActuales.forEach(cat => {
        const config = configFijosMaestro[cat.value];
        if (config && config.activo && config.vencimiento) {
            const montoPagado = fijosPagados[cat.value] || 0;
            const montoEstimado = config.monto || 0;

            if (montoPagado < montoEstimado) {
                const [anio, mes, dia] = config.vencimiento.split('-');
                const fechaVto = new Date(anio, mes - 1, dia);
                const diffDias = Math.ceil((fechaVto - hoy) / (1000 * 60 * 60 * 24));

                if (diffDias < 0) criticos.push(cat.label);
                else if (diffDias <= 3) proximos.push(`${cat.label} (vence en ${diffDias}d)`);
            }
        }
    });

    if (criticos.length > 0 || proximos.length > 0) {
        let mensajeHTML = '<div class="text-left text-sm space-y-2">';
        
        if (criticos.length > 0) {
            mensajeHTML += `<p class="text-red-600 font-bold">🚨 VENCIDOS:</p>
                            <ul class="list-disc list-inside text-red-500 mb-2">
                                ${criticos.map(c => `<li>${c}</li>`).join('')}
                            </ul>`;
        }
        
        if (proximos.length > 0) {
            mensajeHTML += `<p class="text-amber-600 font-bold">⏳ POR VENCER:</p>
                            <ul class="list-disc list-inside text-amber-500">
                                ${proximos.map(p => `<li>${p}</li>`).join('')}
                            </ul>`;
        }
        mensajeHTML += '</div>';

        Swal.fire({
            title: '¡Atención, ZorWel!',
            html: mensajeHTML,
            icon: criticos.length > 0 ? 'error' : 'warning',
            confirmButtonText: 'Entendido, voy a pagar',
            confirmButtonColor: '#1D4ED8',
            backdrop: `rgba(0,0,123,0.1)` // Un toque de color de fondo
        }).then(() => {
            // 📝 MAGIA ACÁ: Una vez que cierra el cartel, guardamos la fecha de hoy
            // para que no lo vuelva a molestar hasta mañana.
            localStorage.setItem('avisoVencimientosZorWel', hoyStr);
        });
    }
}

// ==========================================
// 👑 PANEL MAESTRO ZORWEL
// ==========================================
async function abrirPanelMaestro() {
    Swal.fire({
        title: 'Escaneando base de datos...',
        allowOutsideClick: false,
        didOpen: () => { Swal.showLoading(); }
    });

    try {
        const familiasSnap = await getDocs(collection(db, FAMILIAS_COLLECTION));
        
        let totalFamilias = 0;
        let familiasPro = 0;
        let familiasFree = 0;
        let listaFamiliasHTML = '';

        familiasSnap.forEach(doc => {
            const data = doc.data();
            totalFamilias++;
            
            if (data.es_pro) familiasPro++;
            else familiasFree++;

            // 🕵️ RASTREADOR DE IDENTIDAD
            let identidad = 'ID: ' + doc.id; 
            if (data.nombre_familia) {
                identidad = data.nombre_familia;
            } else if (data.miembros && data.miembros.length > 0) {
                const admin = data.miembros.find(m => m.rol === 'admin') || data.miembros[0];
                if (admin.email) identidad = admin.email;
            }

            const badge = data.es_pro 
                ? '<span class="bg-amber-500 text-black text-[9px] px-2 py-0.5 rounded-full font-black">PRO</span>' 
                : '<span class="bg-slate-700 text-slate-400 text-[9px] px-2 py-0.5 rounded-full">FREE</span>';
            
            listaFamiliasHTML += `
                <div class="flex flex-col border-b border-slate-700/30 py-4">
                    <div class="flex justify-between items-center mb-1">
                        <span class="text-white font-bold text-xs truncate max-w-[170px]">${identidad}</span>
                        ${badge}
                    </div>
                    <div class="flex items-center gap-2">
                        <span class="text-[9px] text-slate-600 font-mono tracking-tighter">REF: ${doc.id}</span>
                        <button onclick="navigator.clipboard.writeText('${doc.id}'); mostrarNotificacion('success', 'ID Copiado')" class="text-[8px] bg-slate-800 text-slate-400 px-1 rounded hover:bg-slate-700">📋 Copiar ID</button>
                    </div>
                </div>`;
        });

        const conversion = totalFamilias > 0 ? ((familiasPro / totalFamilias) * 100).toFixed(1) : 0;

        Swal.fire({
            title: '<span class="text-amber-500 italic tracking-widest">ZORWEL COMMAND CENTER</span>',
            background: '#0f172a', 
            color: '#f8fafc',
            html: `
                <div class="grid grid-cols-2 gap-4 mb-6">
                    <div class="bg-slate-800/50 p-3 rounded-2xl border border-slate-700 shadow-inner">
                        <p class="text-[9px] text-slate-500 uppercase font-black tracking-tighter">Total Registros</p>
                        <p class="text-2xl font-black text-white">${totalFamilias}</p>
                    </div>
                    <div class="bg-slate-800/50 p-3 rounded-2xl border border-slate-700 shadow-inner">
                        <p class="text-[9px] text-slate-500 uppercase font-black tracking-tighter">Conversión Pro</p>
                        <p class="text-2xl font-black text-amber-500">${conversion}%</p>
                    </div>
                </div>

                <div class="p-4 bg-slate-900 rounded-2xl border border-amber-500/30 mb-6 shadow-xl text-left">
                    <label class="text-[10px] uppercase font-black text-amber-500 mb-2 block tracking-wider">Gestión de Suscripciones VIP</label>
                    <input type="email" id="swal-input-email-vip" placeholder="Pegá el email del cliente acá..." 
                        class="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500 mb-3">
                    
                    <div class="flex gap-2">
                        <button onclick="cambiarEstadoVIP(true)" class="flex-1 bg-gradient-to-r from-green-500 to-emerald-600 text-white py-2 rounded-xl font-bold text-xs uppercase shadow-lg shadow-green-500/20 active:scale-95 transition-transform">
                            💎 Dar PRO
                        </button>
                        <button onclick="cambiarEstadoVIP(false)" class="flex-1 bg-gradient-to-r from-red-500 to-rose-600 text-white py-2 rounded-xl font-bold text-xs uppercase shadow-lg shadow-red-500/20 active:scale-95 transition-transform">
                            ❌ Quitar
                        </button>
                    </div>
                </div>
                
                <div class="text-left">
                    <p class="text-[10px] font-black text-slate-400 uppercase mb-3 tracking-widest">Base de Clientes:</p>
                    <div class="max-h-64 overflow-y-auto px-3 bg-black/20 rounded-2xl border border-slate-800">
                        ${listaFamiliasHTML || '<p class="text-center py-8 text-slate-600 italic">No hay datos.</p>'}
                    </div>
                </div>
            `,
            confirmButtonText: 'SALIR DEL SISTEMA',
            confirmButtonColor: '#fbbf24',
            width: '95%',
            customClass: {
                confirmButton: 'text-black font-black uppercase py-4 rounded-2xl shadow-xl w-full tracking-widest'
            }
        });

    } catch (error) {
        console.error("Error en Panel Maestro:", error);
        Swal.fire('Error de Acceso', 'No se pudo conectar con la base de datos.', 'error');
    }
}

// ==========================================
// ⚙️ FUNCIÓN PARA CAMBIAR EL ESTADO PRO
// ==========================================
window.cambiarEstadoVIP = async (esPro) => {
    const emailInput = document.getElementById('swal-input-email-vip').value.toLowerCase().trim();
    if (!emailInput) {
        return mostrarNotificacion('warning', 'Ingresá un email primero.');
    }

    try {
        Swal.fire({ title: 'Procesando...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

        const q = query(collection(db, FAMILIAS_COLLECTION), where("creador_email", "==", emailInput));
        const querySnapshot = await getDocs(q);

        if (querySnapshot.empty) {
            Swal.fire('No encontrado', 'No existe ninguna casa creada con ese email.', 'error');
            return;
        }

        const docCasa = querySnapshot.docs[0];
        const casaRef = doc(db, FAMILIAS_COLLECTION, docCasa.id);

        await updateDoc(casaRef, { es_pro: esPro });

        // Cartel de éxito y recargamos el panel maestro automáticamente
        Swal.fire({
            icon: 'success',
            title: esPro ? '¡Modo PRO Activado! 💎' : 'Modo PRO Desactivado ❌',
            text: `Usuario actualizado con éxito.`,
            confirmButtonColor: '#fbbf24'
        }).then(() => {
            abrirPanelMaestro(); // 🪄 Magia: vuelve a abrir tu panel para que veas el cambio
        });

    } catch (error) {
        console.error("Error al cambiar VIP:", error);
        Swal.fire('Error', 'Hubo un problema al conectar con la base de datos.', 'error');
    }
};

// Escuchador para el botón principal de la app
document.addEventListener('DOMContentLoaded', () => {
    const btnMaestro = document.getElementById('btn-maestro');
    if (btnMaestro) {
        btnMaestro.addEventListener('click', abrirPanelMaestro);
    }
});

// ==========================================
// 🏠 BOTÓN PARA EDITAR IDENTIDAD DE LA CASA
// ==========================================
const btnEditarNombre = document.getElementById('btn-editar-nombre-casa');

if (btnEditarNombre) {
    btnEditarNombre.addEventListener('click', async () => {
        const user = auth.currentUser;
        if (!user) {
            mostrarNotificacion('error', 'Debes estar logueado.');
            return;
        }

        const nombreActual = document.getElementById('display-nombre-casa').textContent;
        const valorInicial = nombreActual.includes('Definir') ? '' : nombreActual;

        const { value: nuevoNombre } = await Swal.fire({
            title: 'Identidad de tu Casa',
            input: 'text',
            inputLabel: '¿Cómo querés llamar a este espacio de finanzas?',
            inputValue: valorInicial,
            inputPlaceholder: 'Ej: Familia Pérez...',
            showCancelButton: true,
            confirmButtonText: 'Guardar',
            cancelButtonText: 'Cancelar',
            confirmButtonColor: '#fbbf24',
            customClass: {
                confirmButton: 'text-black font-bold uppercase rounded-xl px-4 py-2',
                cancelButton: 'rounded-xl',
                popup: 'rounded-2xl dark:bg-slate-800 dark:text-white'
            }
        });

        if (nuevoNombre && nuevoNombre.trim() !== '') {
            try {
                // Buscamos el ID real de la familia para guardarlo en el lugar correcto
                let idParaGuardar = user.uid;
                const invitacionRef = doc(db, INVITACIONES_COLLECTION, user.email.toLowerCase().trim());
                const invitacionSnap = await getDoc(invitacionRef);
                if (invitacionSnap.exists()) {
                    idParaGuardar = invitacionSnap.data().familia_id;
                }

                // Guardamos en Firebase
                const familiaRef = doc(db, FAMILIAS_COLLECTION, idParaGuardar);
                await updateDoc(familiaRef, { nombre_familia: nuevoNombre.trim() });
                
                // Actualizamos la pantalla al toque
                document.getElementById('display-nombre-casa').textContent = nuevoNombre.trim();
                mostrarNotificacion('success', '¡Nombre actualizado!');

            } catch (error) {
                console.error("Error al guardar nombre en Firebase:", error);
                Swal.fire('Error', 'No pudimos guardar el nombre.', 'error');
            }
        }
    });
}

// ==========================================
// 👑 FUNCIONES DEL PANEL MAESTRO (ADMIN)
// ==========================================
const btnMaestroLegacy = document.getElementById('btn-maestro');
const panelGestionUsuarios = document.getElementById('panel-gestion-usuarios');

if (btnMaestroLegacy && panelGestionUsuarios) {
    btnMaestroLegacy.addEventListener('click', () => {
        panelGestionUsuarios.classList.toggle('hidden');
    });
}

// Función compartida para cambiar el estado PRO
async function cambiarEstadoVIP(esPro) {
    const emailInput = document.getElementById('input-email-vip').value.toLowerCase().trim();
    if (!emailInput) {
        return Swal.fire('Error', 'Ingresá el email del usuario primero.', 'warning');
    }

    try {
        Swal.fire({ title: 'Buscando...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

        // 1. Buscamos la casa que le pertenece a ese email
        const q = query(collection(db, FAMILIAS_COLLECTION), where("creador_email", "==", emailInput));
        const querySnapshot = await getDocs(q);

        if (querySnapshot.empty) {
            Swal.fire('No encontrado', 'No existe ninguna casa creada con ese email.', 'error');
            return;
        }

        // 2. Encontramos la casa, ahora le cambiamos el estado
        const docCasa = querySnapshot.docs[0];
        const casaRef = doc(db, FAMILIAS_COLLECTION, docCasa.id);

        await updateDoc(casaRef, { es_pro: esPro });

        Swal.fire({
            icon: 'success',
            title: esPro ? '¡Modo PRO Activado! 💎' : 'Modo PRO Desactivado ❌',
            text: `El usuario ${emailInput} ha sido actualizado con éxito.`,
            confirmButtonColor: '#fbbf24'
        });

        document.getElementById('input-email-vip').value = ''; // Limpiamos el input

    } catch (error) {
        console.error("Error al cambiar VIP:", error);
        Swal.fire('Error grave', 'Hubo un problema al conectar con la base de datos.', 'error');
    }
}

// Conectamos los botones
document.getElementById('btn-dar-pro')?.addEventListener('click', () => cambiarEstadoVIP(true));
document.getElementById('btn-quitar-pro')?.addEventListener('click', () => cambiarEstadoVIP(false));


window.verInfoRegla503020 = () => {
    Swal.fire({
        title: '💡 La Regla 50/30/20',
        html: `
            <div class="text-left text-sm space-y-4 mt-2">
                <p class="text-gray-700 dark:text-gray-300">Esta es la regla de oro en finanzas personales para saber si la economía familiar está sana:</p>
                
                <div class="p-3 bg-blue-50 dark:bg-blue-900/30 border-l-4 border-blue-500 rounded-r-lg">
                    <p class="font-bold text-blue-700 dark:text-blue-400">🏠 Fijos (Ideal: Hasta 50%)</p>
                    <p class="text-xs text-gray-600 dark:text-gray-400 mt-1">Gastos de supervivencia: alquiler, luz, internet, súper básico, cuotas de deudas.</p>
                </div>

                <div class="p-3 bg-red-50 dark:bg-red-900/30 border-l-4 border-red-500 rounded-r-lg">
                    <p class="font-bold text-red-700 dark:text-red-400">🍕 Variables (Ideal: Hasta 30%)</p>
                    <p class="text-xs text-gray-600 dark:text-gray-400 mt-1">Estilo de vida y gustos: salidas, delivery, ropa, kiosco, ocio.</p>
                </div>

                <div class="p-3 bg-green-50 dark:bg-green-900/30 border-l-4 border-green-500 rounded-r-lg">
                    <p class="font-bold text-green-700 dark:text-green-400">💰 Ahorro (Ideal: Mínimo 20%)</p>
                    <p class="text-xs mt-1" style="color: ${document.documentElement.classList.contains('dark') ? '#000000' : '#4b5563'}">Remanente libre para invertir en emprendimientos, guardar dólares o fondo de emergencias.</p>
                </div>
            </div>
        `,
        icon: 'info',
        confirmButtonText: '¡Entendido!',
        confirmButtonColor: '#1D4ED8',
        // Esto fuerza a SweetAlert a pintar su propio fondo oscuro si el usuario tiene el modo noche activado
        background: document.documentElement.classList.contains('dark') ? '#1e293b' : '#ffffff',
        color: document.documentElement.classList.contains('dark') ? '#f8fafc' : '#1f2937'
    });
};

window.verInfoIPC = () => {
    Swal.fire({
        title: '📈 Inflación Personal (IPC)',
        html: `
            <div class="text-left text-sm space-y-4 mt-2">
                <p class="text-gray-700 dark:text-gray-300">Este indicador mide cómo evolucionó tu <b>nivel de gasto</b> en comparación con el mes anterior.</p>
                
                <div class="p-3 bg-red-50 dark:bg-red-900/30 border-l-4 border-red-500 rounded-r-lg">
                    <p class="font-bold text-red-700 dark:text-red-400">🔺 Porcentaje en Rojo (Positivo)</p>
                    <p class="text-xs text-gray-600 dark:text-gray-400 mt-1">Gastaste MÁS plata que el mes pasado. Puede ser por la inflación real del país o porque tuviste consumos más grandes.</p>
                </div>

                <div class="p-3 bg-green-50 dark:bg-green-900/30 border-l-4 border-green-500 rounded-r-lg">
                    <p class="font-bold text-green-700 dark:text-green-400">🔻 Porcentaje en Verde (Negativo)</p>
                    <p class="text-xs mt-1" style="color: ${document.documentElement.classList.contains('dark') ? '#000000' : '#4b5563'}">Gastaste MENOS que el mes pasado. ¡Excelente! Lograste achicar tus costos o evitaste gastos innecesarios.</p>
                </div>
            </div>
        `,
        icon: 'info',
        confirmButtonText: '¡Comprendido!',
        confirmButtonColor: '#1D4ED8',
        background: document.documentElement.classList.contains('dark') ? '#1e293b' : '#ffffff',
        color: document.documentElement.classList.contains('dark') ? '#f8fafc' : '#1f2937'
    });
};

// ==========================================
// 📡 RADAR DE CONEXIÓN (Modo Offline)
// ==========================================

window.addEventListener('offline', () => {
    Swal.fire({
        toast: true,
        position: 'top',
        icon: 'warning',
        title: 'Estás sin conexión 📡',
        text: 'ZorWel sigue funcionando. Todo lo que guardes se subirá cuando vuelva internet.',
        showConfirmButton: false,
        timer: 4000,
        background: document.documentElement.classList.contains('dark') ? '#1e293b' : '#ffffff',
        color: document.documentElement.classList.contains('dark') ? '#f8fafc' : '#1f2937'
    });
});

window.addEventListener('online', () => {
    const Toast = Swal.mixin({
        toast: true,
        position: 'top-end',
        showConfirmButton: false,
        timer: 3000
    });
    Toast.fire({
        icon: 'success',
        title: '¡Conexión recuperada! Sincronizando en la nube...'
    });
});

// ==========================================
// 🚀 FUNCIONALIDADES PRO (Límites y Pronóstico)
// ==========================================

// 1. Modales Informativos y de Venta
window.verInfoPronostico = () => {
    Swal.fire({
        title: '🔮 Pronóstico',
        html: '<p class="text-sm text-gray-600 dark:text-gray-300">Calcula tu ritmo de gasto diario y lo proyecta a fin de mes para saber con cuánta plata vas a llegar antes de que sea tarde.</p>',
        icon: 'info',
        confirmButtonColor: '#1D4ED8',
        background: document.documentElement.classList.contains('dark') ? '#1e293b' : '#ffffff',
        color: document.documentElement.classList.contains('dark') ? '#f8fafc' : '#1f2937'
    });
};

// 1. Modales Informativos y de Venta
window.mostrarPaywallPro = () => {
    Swal.fire({
        title: '👑 Funcionalidad Premium',
        html: `
            <p class="text-sm text-gray-600 dark:text-gray-300 mb-4">
                Desbloqueá el pronóstico exacto, añadí límites personalizados y compartí los gastos de la casa con tu familia por solo <b>$3.500 ARS/mes</b>.
            </p>
        `,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: '💳 Suscribirme por Mercado Pago',
        cancelButtonText: 'Quizás más tarde',
        confirmButtonColor: '#009EE3',
        cancelButtonColor: '#6b7280',
        background: document.documentElement.classList.contains('dark') ? '#1e293b' : '#ffffff',
        color: document.documentElement.classList.contains('dark') ? '#f8fafc' : '#1f2937'
    }).then(async (result) => {
        if (result.isConfirmed) {
            Swal.fire({ title: 'Generando link de pago...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

            try {
                const crearSuscripcionMP = httpsCallable(functions, 'crearSuscripcionMP');
                const resultado = await crearSuscripcionMP({ familiaId: familiaIdActual });

                localStorage.setItem('zorwel_pago_pendiente', 'true');
                window.location.href = resultado.data.init_point;

            } catch (error) {
                console.error("Error generando suscripción:", error);
                Swal.fire('Error', 'No se pudo generar el link de pago. Intentá de nuevo.', 'error');
            }
        }
    });
};

// ==========================================
// 🚀 MOTOR DE CÁLCULO PRO (Versión Definitiva)
// ==========================================
window.actualizarModulosPro = (totalIngresos, totalEgresos, egresosPorCategoria, mesSeleccionado) => {
    
    // 🔑 LA LLAVE MAESTRA PRO
    // (OJO: Cambiá "usuarioActual.esPro" por el nombre exacto de la variable que uses en tu base de datos para saber si pagó)
    const esUsuarioPro = rolUsuarioActual === 'admin' || (usuarioActual && usuarioActual.es_pro === true) || (window.datosFamiliaActual && window.datosFamiliaActual.es_pro === true);

    // --- 1. MATEMÁTICA DEL PRONÓSTICO INTELIGENTE ---
    const hoy = new Date();
    const [anio, mes] = mesSeleccionado.split('-').map(Number);
    const diasDelMes = new Date(anio, mes, 0).getDate();
    let diaActual = hoy.getDate();

    // Si estamos viendo un mes que ya pasó o el futuro, no proyectamos por día actual
    if (anio !== hoy.getFullYear() || mes !== (hoy.getMonth() + 1)) {
        diaActual = diasDelMes; 
    }

    // 🧮 SEPARACIÓN DE GASTOS PARA NO PROYECTAR FIJOS
    let totalFijosMes = 0;
    let totalVariablesMes = 0;

    for (let cat in egresosPorCategoria) {
        const monto = egresosPorCategoria[cat];
        // Si la categoría está en el mapa de fijos, la sumamos como fijo
        if (CATEGORIAS_FIJAS_VALUES.includes(cat)) {
            totalFijosMes += monto;
        } else {
            totalVariablesMes += monto;
        }
    }

    // 🔮 PROYECCIÓN: Solo proyectamos los variables (comida, kiosco, etc)
    const ritmoDiarioVariables = totalVariablesMes / diaActual;
    const variablesProyectados = ritmoDiarioVariables * diasDelMes;

    // Balance Final Proyectado = Ingresos - (Fijos Reales + Variables Proyectados)
    const balanceProyectado = totalIngresos - (totalFijosMes + variablesProyectados);

    // 🕵️‍♂️ REVELACIÓN VIP (Muestra u oculta según el pago)
    const divPronostico = document.getElementById('pronostico-valor');
    if (divPronostico) {
        if (esUsuarioPro) {
            // Sos PRO o Admin: Chau blur, chau candado
            divPronostico.textContent = formatoMoneda.format(balanceProyectado);
            divPronostico.style.textShadow = 'none'; 
            divPronostico.className = `text-xs font-bold ${balanceProyectado >= 0 ? 'text-success' : 'text-danger'}`;
            divPronostico.parentElement.onclick = null; 
            
            const candado = divPronostico.nextElementSibling;
            if (candado) candado.style.display = 'none';
        } else {
            // Usuario Gratis: Restaurar efecto borroso
            divPronostico.textContent = '~$0';
            divPronostico.style.textShadow = '0 0 5px rgba(29,78,216,0.6)';
            divPronostico.className = 'text-xs font-bold text-transparent select-none';
            divPronostico.parentElement.onclick = mostrarPaywallPro;
            const candado = divPronostico.nextElementSibling;
            if (candado) candado.style.display = 'inline-block';
        }
    }

    // --- 2. DIBUJADO DINÁMICO DE BARRAS DE LÍMITE (DESDE LA NUBE) ---
const contenedorLimites = document.getElementById('contenedor-limites');
if (contenedorLimites) {
    contenedorLimites.innerHTML = '<p class="text-center text-xs text-gray-400">Sincronizando límites...</p>';
    
    const mesVigencia = mesSeleccionado;
    const configId = `${familiaIdActual}_${mesVigencia}`;
    
    // Leemos de la nube
    getDoc(doc(db, FIJOS_CONFIG_COLLECTION, configId)).then(docSnap => {
        let limitesGuardados = { 'Kiosco': 15000 }; // Default
        
        if (docSnap.exists() && docSnap.data().limites_variables) {
            limitesGuardados = docSnap.data().limites_variables;
        }
        
        let htmlBarras = '';
        const entradasLimites = Object.entries(limitesGuardados);

        entradasLimites.forEach(([cat, limiteMensual]) => {
            let gastado = 0;
            const catBuscada = cat.toLowerCase().trim();
            
            for (let keyFirebase in egresosPorCategoria) {
                let nombreVisible = (CATEGORIA_LABEL_MAP[keyFirebase] || keyFirebase).toLowerCase().trim();
                let nombreID = keyFirebase.toLowerCase().trim();
                if (nombreVisible === catBuscada || nombreID === catBuscada) {
                    gastado += egresosPorCategoria[keyFirebase]; 
                }
            }

            let porcentaje = (gastado / limiteMensual) * 100;
            let anchoBarra = porcentaje > 100 ? 100 : porcentaje; 
            let colorBarra = porcentaje > 75 ? (porcentaje >= 100 ? 'bg-danger' : 'bg-amber-500') : 'bg-success';

            htmlBarras += `
                <div>
                    <div class="flex justify-between items-end mb-1">
                        <span class="text-xs font-bold text-gray-700 dark:text-gray-300 capitalize">${cat}</span>
                        <span class="text-[10px] text-gray-500 font-medium">${formatoMoneda.format(gastado)} / ${formatoMoneda.format(limiteMensual)}</span>
                    </div>
                    <div class="w-full bg-gray-100 dark:bg-slate-700 rounded-full h-2">
                        <div class="${colorBarra} h-2 rounded-full transition-all duration-1000" style="width: ${anchoBarra}%"></div>
                    </div>
                </div>
            `;
        });

        // Paywall para no-PROs
        if (!esUsuarioPro) {
            htmlBarras += `
                <div class="relative mt-4 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-xl p-4 text-center cursor-pointer hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors" onclick="mostrarPaywallPro()">
                    <div class="absolute -top-3 left-1/2 transform -translate-x-1/2 bg-white dark:bg-slate-800 px-2">
                        <span class="text-xs font-black text-amber-500 uppercase tracking-widest">🔒 Premium</span>
                    </div>
                    <p class="text-xs text-gray-500 dark:text-gray-400 font-medium mt-2">Añadí hasta 3 límites y sincronizalos con tu familia.</p>
                </div>
            `;
        }

        contenedorLimites.innerHTML = htmlBarras;
    });
}

    // 📱 MAGIA MÓVIL: Toast combinado (Solo para la tarjeta Balance)
    const elBalance = document.getElementById('balance-final');
    
    // Verificamos que exista la tarjeta en el HTML
    if (elBalance && elBalance.parentElement && elBalance.parentElement.parentElement) {
        const tarjetaBalance = elBalance.parentElement.parentElement;
        const balanceActual = totalIngresos - totalEgresos;
        
        // Limpiamos el click que le habíamos puesto en el paso 1 (el hacerTocableMovil) para que no se pisen
        tarjetaBalance.onclick = null; 
        
        // 📱 TOAST MEJORADO (UX PRO)
tarjetaBalance.onclick = () => {
    if (window.innerWidth <= 768) {
        
        let htmlToast = `
            <div class="flex flex-col gap-3 mt-2 text-left">
                <div class="bg-gray-50 dark:bg-slate-700/50 p-3 rounded-lg border border-gray-100 dark:border-gray-600">
                    <span class="text-[10px] text-gray-500 dark:text-gray-400 block font-bold uppercase tracking-wider mb-1">Balance Actual</span>
                    <span class="text-3xl font-black ${balanceActual >= 0 ? 'text-green-600' : 'text-red-600'}">${formatoMoneda.format(balanceActual)}</span>
                </div>
        `;

        if (esUsuarioPro) {
            htmlToast += `
                <div class="bg-blue-50 dark:bg-blue-900/20 p-3 rounded-lg border border-blue-100 dark:border-blue-800/50">
                    <div class="flex justify-between items-start">
                        <span class="text-[10px] text-blue-600 dark:text-blue-400 block font-bold uppercase tracking-wider mb-1">🔮 Pronóstico a fin de mes</span>
                    </div>
                    <span class="text-2xl font-bold ${balanceProyectado >= 0 ? 'text-green-600' : 'text-red-600'}">${formatoMoneda.format(balanceProyectado)}</span>
                    <p class="text-[10px] text-blue-500/70 mt-1 italic">Basado en tu ritmo de gasto diario actual.</p>
                </div>
            `;
        } else {
            htmlToast += `
                <div class="bg-amber-50 dark:bg-amber-900/10 p-3 rounded-lg border border-amber-200 dark:border-amber-800/50 cursor-pointer" onclick="mostrarPaywallPro()">
                    <span class="text-[10px] text-amber-600 dark:text-amber-500 block font-bold uppercase tracking-wider mb-1">🔮 Pronóstico a fin de mes</span>
                    <div class="flex items-center gap-2">
                        <span class="text-2xl font-bold text-transparent select-none" style="text-shadow: 0 0 8px rgba(217,119,6,0.5);">~$000</span>
                        <span class="text-[10px] bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-400 px-1.5 py-0.5 rounded font-black">🔒 PRO</span>
                    </div>
                    <p class="text-[9px] text-amber-600/60 mt-1">Estimación de cómo vas a llegar a fin de mes.</p>
                </div>
            `;
        }

        htmlToast += `</div>`;

        Swal.fire({
            title: '📊 Resumen General',
            html: htmlToast,
            toast: true,
            position: 'top',
            showConfirmButton: false,
            timer: 5000, // Le damos 5 seg para que llegue a leer el texto chico
            timerProgressBar: true,
            background: document.documentElement.classList.contains('dark') ? '#1e293b' : '#ffffff',
            color: document.documentElement.classList.contains('dark') ? '#f8fafc' : '#1f2937'
        });
    }
};
    }
};

// ==========================================
// 🎯 CONFIGURACIÓN DE LÍMITES (Para que funcione el botón +Configurar)
// ==========================================
window.abrirConfiguracionLimites = async () => {
    const mesVigencia = document.getElementById('mes-actual').textContent;
    // 🚨 CAMBIO 1: El ID se vincula a la casa, para que todos vean el mismo kiosco
    const configId = `${familiaIdActual}_${mesVigencia}`; 
    
    let limitesGuardados = { 'Kiosco': 15000 }; 
    let esCasaPro = false; // Saber si la casa pagó la suscripción
    
    try {
        Swal.fire({ title: 'Cargando...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
        
        // 🚨 CAMBIO 2: Consultamos a Firebase si LA CASA es PRO
        const familiaSnap = await getDoc(doc(db, FAMILIAS_COLLECTION, familiaIdActual));
        if (familiaSnap.exists()) {
            esCasaPro = familiaSnap.data().es_pro === true;
        }

        // Leemos los límites guardados de la casa
        const docSnap = await getDoc(doc(db, FIJOS_CONFIG_COLLECTION, configId));
        if (docSnap.exists() && docSnap.data().limites_variables) {
            limitesGuardados = docSnap.data().limites_variables;
        }
        Swal.close();
    } catch (e) { 
        console.error("Error leyendo nube:", e); 
        Swal.close();
    }

    const categoriasGuardadas = Object.keys(limitesGuardados);

    // Arrancamos el HTML del modal siempre con el Kiosco (Gratis)
    let formHtml = `
        <div class="text-left space-y-4 mt-2">
            <div>
                <label class="text-xs font-bold text-gray-700 dark:text-gray-300">Límite Kiosco (Gratis)</label>
                <input id="swal-lim-kiosco" type="number" class="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-lg mt-1 text-gray-800 dark:text-white dark:bg-slate-700" value="${limitesGuardados['Kiosco'] || ''}" placeholder="Monto Ej: 15000">
            </div>
    `;

    if (esCasaPro) {
        // ES PRO: Le pintamos los otros dos inputs
        formHtml += `
            <div>
                <label class="text-xs font-bold text-gray-700 dark:text-gray-300">Límite Extra 1 (PRO)</label>
                <div class="flex gap-2 mt-1">
                    <input id="swal-cat-1" type="text" class="w-1/2 p-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-800 dark:text-white dark:bg-slate-700" placeholder="Cat (Ej: Delivery)" value="${categoriasGuardadas[1] || ''}">
                    <input id="swal-lim-1" type="number" class="w-1/2 p-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-800 dark:text-white dark:bg-slate-700" placeholder="Monto" value="${limitesGuardados[categoriasGuardadas[1]] || ''}">
                </div>
            </div>
            <div>
                <label class="text-xs font-bold text-gray-700 dark:text-gray-300">Límite Extra 2 (PRO)</label>
                <div class="flex gap-2 mt-1">
                    <input id="swal-cat-2" type="text" class="w-1/2 p-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-800 dark:text-white dark:bg-slate-700" placeholder="Cat (Ej: Ocio)" value="${categoriasGuardadas[2] || ''}">
                    <input id="swal-lim-2" type="number" class="w-1/2 p-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-800 dark:text-white dark:bg-slate-700" placeholder="Monto" value="${limitesGuardados[categoriasGuardadas[2]] || ''}">
                </div>
            </div>
        `;
    } else {
        // ES FREE: Le mostramos que se está perdiendo de algo genial
        formHtml += `
            <div class="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 p-3 rounded-lg text-center mt-4 cursor-pointer hover:bg-amber-100 transition-colors" onclick="Swal.close(); mostrarPaywallPro()">
                <p class="text-xs text-amber-700 dark:text-amber-500 font-bold mb-1">🔒 Límites Extra Bloqueados</p>
                <p class="text-[10px] text-gray-600 dark:text-gray-400">Pásate a PRO para añadir límites ilimitados.</p>
            </div>
        `;
    }

    formHtml += `</div>`;

    Swal.fire({
        title: '🎯 Límites Mensuales',
        html: formHtml,
        showCancelButton: true,
        confirmButtonText: 'Guardar en la Nube',
        confirmButtonColor: '#1D4ED8',
        background: document.documentElement.classList.contains('dark') ? '#1e293b' : '#ffffff',
        preConfirm: () => {
            let nuevosLimites = {};
            const valKiosco = document.getElementById('swal-lim-kiosco').value;
            if(valKiosco) nuevosLimites['Kiosco'] = Number(valKiosco);

            if (esCasaPro) {
                const cat1 = document.getElementById('swal-cat-1')?.value;
                const lim1 = document.getElementById('swal-lim-1')?.value;
                if(cat1 && lim1) nuevosLimites[cat1.trim()] = Number(lim1);

                const cat2 = document.getElementById('swal-cat-2')?.value;
                const lim2 = document.getElementById('swal-lim-2')?.value;
                if(cat2 && lim2) nuevosLimites[cat2.trim()] = Number(lim2);
            }
            return nuevosLimites;
        }
    }).then(async (result) => {
        if (result.isConfirmed) {
            try {
                Swal.fire({ title: 'Sincronizando Casa...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
                
                const docRef = doc(db, FIJOS_CONFIG_COLLECTION, configId);

                // 1. Nos aseguramos de que el documento exista (sin pisar los fijos)
                await setDoc(docRef, {
                    mes_ref: mesVigencia,
                    uid: familiaIdActual,
                    ultimaActualizacion: new Date()
                }, { merge: true });

                // 2. 🚨 LA CLAVE ANTI-ZOMBIES: updateDoc reemplaza la lista entera, matando fantasmas
                await updateDoc(docRef, {
                    limites_variables: result.value
                });

                Swal.close();
                mostrarNotificacion('success', 'Límites sincronizados en tu casa.');
                cargarMovimientos(mesVigencia);
            } catch (e) {
                console.error(e);
                Swal.fire('Error', 'No se pudo subir a la nube.', 'error');
            }
        }
    });
}; 

// 💎 GESTOR DE PERMISOS SaaS (FREE vs PRO)
function aplicarCandadosSaaS(esPro) {
    // 1. Candado al Pronóstico
    const pronosticoValor = document.getElementById('pronostico-valor');
    if (pronosticoValor) {
        if (esPro) {
            // Liberar el Kraken
            pronosticoValor.classList.remove('blur-md', 'select-none', 'opacity-50');
            pronosticoValor.style.cursor = 'default';
            pronosticoValor.onclick = null;
        } else {
            // Poner candado (Blur)
            pronosticoValor.classList.add('blur-md', 'select-none', 'opacity-50');
            pronosticoValor.style.cursor = 'pointer';
            pronosticoValor.onclick = () => mostrarPaywallPro(); // Si toca el borroso, le vendemos
        }
    }

    // 2. Candado a la tarjeta publicitaria de Límites (El HTML que me pasaste)
    const contenedorLimites = document.getElementById('contenedor-limites');
    if (contenedorLimites) {
        // Buscamos el div con el borde punteado (el anuncio Premium)
        const cartelPremium = contenedorLimites.querySelector('.border-dashed');
        if (cartelPremium) {
            if (esPro) {
                cartelPremium.style.display = 'none'; // Desaparece la publicidad
            } else {
                cartelPremium.style.display = 'block'; // Aparece la publicidad
            }
        }
    }
}