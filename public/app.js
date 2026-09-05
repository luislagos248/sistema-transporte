/* Turismo Irazola — PWA de facturación (vanilla JS, sin build). */

const $app = document.getElementById('app');
const $cabecera = document.getElementById('cabecera');
const $navInferior = document.getElementById('navInferior');

/* ---------- Utilidades ---------- */

const S = (centimos) => `S/ ${(centimos / 100).toFixed(2)}`;

function montoACentimos(texto) {
  const limpio = String(texto).replace(',', '.').trim();
  if (!/^\d+(\.\d{1,2})?$/.test(limpio)) return null;
  return Math.round(parseFloat(limpio) * 100);
}

function esc(s) {
  const d = document.createElement('div');
  d.textContent = String(s ?? '');
  return d.innerHTML;
}

function clave() {
  return localStorage.getItem('clave') || '';
}

async function api(ruta, opciones = {}) {
  const res = await fetch(ruta, {
    ...opciones,
    headers: { 'Content-Type': 'application/json', 'X-Clave': clave(), ...(opciones.headers || {}) },
  });
  if (res.status === 401) {
    localStorage.removeItem('clave');
    location.hash = '#login';
    throw new Error('Clave incorrecta');
  }
  const datos = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(datos.error || `Error ${res.status}`);
  return datos;
}

function hoyLima() {
  return new Date(Date.now() - 5 * 3600 * 1000).toISOString().slice(0, 10);
}

function primerDiaDelMes() {
  return hoyLima().slice(0, 8) + '01';
}

/* Sugerencias de descripciones recientes, por tipo de operación. */
function sugerencias(tipo) {
  try { return JSON.parse(localStorage.getItem(`sug:${tipo}`)) || []; } catch { return []; }
}
function guardarSugerencia(tipo, texto) {
  const lista = [texto, ...sugerencias(tipo).filter((s) => s !== texto)].slice(0, 6);
  localStorage.setItem(`sug:${tipo}`, JSON.stringify(lista));
}

/* ---------- Configuración ---------- */

/** Reconocimiento de voz del navegador (gratis; Chrome/Android y Safari). */
const RecVoz = window.SpeechRecognition || window.webkitSpeechRecognition || null;

const SERIES = {
  transporte: { boleta: 'B001', factura: 'F001' },
  hospedaje:  { boleta: 'B002', factura: 'F002' },
};

const ESTADOS = {
  pendiente: { clase: 'pendiente', texto: 'Emitido ✔ · envío a SUNAT en curso' },
  aceptado:  { clase: 'aceptado',  texto: 'Aceptado por SUNAT' },
  rechazado: { clase: 'rechazado', texto: 'Rechazado — revisar' },
  anulado:   { clase: 'rechazado', texto: 'Anulado con nota de crédito' },
};

const MOTIVOS_NC = {
  '01': 'Anulación de la operación',
  '02': 'Anulación por error en el RUC',
  '06': 'Devolución total',
};

const NOMBRE_TIPO = { '01': 'Factura', '03': 'Boleta', '07': 'Nota de crédito' };

/* ---------- Vistas ---------- */

function vistaLogin() {
  $cabecera.hidden = true;
  $navInferior.hidden = true;
  $app.innerHTML = `
    <div class="tarjeta" style="max-width:400px;margin:56px auto;text-align:center">
      <img src="/icon.svg" alt="" width="72" height="72" style="border-radius:20px;margin-bottom:8px">
      <h1 style="margin:4px 0 2px">Turismo Irazola</h1>
      <p class="ayuda" style="margin-bottom:18px">Boletas y facturas electrónicas</p>
      <div style="text-align:left">
      <label for="clave">Clave de acceso</label>
      <input id="clave" type="password" autocomplete="current-password" inputmode="numeric">
      <p class="error" id="err" hidden></p>
      </div>
      <br>
      <button class="boton-grande" id="entrar">Entrar</button>
    </div>`;
  const entrar = async () => {
    localStorage.setItem('clave', document.getElementById('clave').value);
    try {
      await api('/api/yo');
      location.hash = '#home';
    } catch (e) {
      const $err = document.getElementById('err');
      $err.textContent = e.message === 'Clave incorrecta' ? 'Clave incorrecta, intente de nuevo.' : e.message;
      $err.hidden = false;
    }
  };
  document.getElementById('entrar').onclick = entrar;
  document.getElementById('clave').onkeydown = (e) => { if (e.key === 'Enter') entrar(); };
}

async function vistaHome() {
  $app.innerHTML = `
    <div class="resumen-dia">
      <div class="etiqueta">Ventas de hoy</div>
      <div class="monto" id="ventasHoy">S/ —</div>
      <div class="detalle" id="detalleHoy">Cargando…</div>
    </div>
    <a class="boton boton-grande" href="#emitir" style="display:block;margin-bottom:14px">🧾 EMITIR BOLETA O FACTURA</a>
    <a class="boton boton-grande boton-suave" href="#importar" style="display:block">📷 ESCANEAR O IMPORTAR MENSAJE</a>
    <p class="ayuda" style="text-align:center;margin-top:14px">Comprobantes y Reportes están en la barra de abajo.</p>`;

  // Resumen del día, como el saldo de un banco.
  try {
    const hoy = hoyLima();
    const filas = await api(`/api/comprobantes?desde=${hoy}&hasta=${hoy}`);
    const emitidos = filas.filter((f) => f.tipo !== '07' && !f.anulado_por);
    const total = emitidos.reduce((a, f) => a + Number(f.total), 0);
    const pendientes = filas.filter((f) => f.estado === 'pendiente').length;
    document.getElementById('ventasHoy').textContent = S(total);
    document.getElementById('detalleHoy').textContent =
      `${emitidos.length} comprobante${emitidos.length === 1 ? '' : 's'}` +
      (pendientes ? ` · ${pendientes} en envío a SUNAT` : ' · todo enviado a SUNAT');
  } catch {
    document.getElementById('ventasHoy').textContent = 'S/ 0.00';
    document.getElementById('detalleHoy').textContent = 'Sin ventas registradas hoy';
  }
}

/* ---------- Importar mensaje de WhatsApp / escanear papel ---------- */

async function vistaImportar(sub) {
  if (sub) {
    if (flujoActivo && flujoActivo.base === '#importar' && flujoActivo.pasos[sub]) { flujoActivo.pasos[sub](); return; }
    location.replace('#importar'); // recarga o enlace suelto: a la pantalla de pegado
    return;
  }
  flujoActivo = null;
  // 'importar:texto' llega del botón Compartir de WhatsApp y se analiza solo;
  // 'importar:borrador' solo rellena el recuadro (al volver atrás o tras un error).
  const compartido = sessionStorage.getItem('importar:texto') || '';
  const borrador = sessionStorage.getItem('importar:borrador') || '';
  sessionStorage.removeItem('importar:texto');
  sessionStorage.removeItem('importar:borrador');
  const errorPrevio = sessionStorage.getItem('importar:error') || '';
  sessionStorage.removeItem('importar:error');

  $app.innerHTML = `
    <h1>📥 Importar mensaje</h1>
    <div class="tarjeta" style="max-width:560px">
      ${errorPrevio ? `<p class="error">${esc(errorPrevio)}</p>` : ''}
      <label for="txtMsg">Mensaje de WhatsApp o nota</label>
      <textarea id="txtMsg" rows="7" style="width:100%;font:inherit;padding:14px;border:1.5px solid transparent;border-radius:12px;background:var(--campo);resize:vertical">${esc(compartido || borrador)}</textarea>
      <p class="ayuda">Desde WhatsApp: mantenga presionado el mensaje → Compartir → <b>Turismo Irazola</b> (con la app instalada desde Chrome). También puede copiar y pegar aquí. Cada línea del mensaje es un producto distinto.</p>
      <p class="error" id="impErrEntrada" hidden></p>
      <br>
      <button class="boton-grande" id="analizar">🔍 Analizar mensaje</button>
      <button class="boton-suave" id="btnEscanear" style="width:100%;margin-top:10px">📷 Escanear papel (tomar foto)</button>
      <input type="file" id="fotoNota" accept="image/*" capture="environment" hidden>
      <p class="ayuda">Si le dejaron una nota en papel, tómele foto: el sistema la lee y le muestra todo por pasos para revisarlo antes de emitir.</p>
    </div>`;

  const cargando = (msg) => {
    window.scrollTo(0, 0);
    $app.innerHTML = `<div class="tarjeta" style="max-width:560px;text-align:center;padding:44px 20px">
      <p style="font-size:1.15rem;margin:0 0 6px">${msg}</p>
      <p class="ayuda" style="margin:0">Un momento…</p></div>`;
  };
  const volverConError = (texto, mensaje) => {
    sessionStorage.setItem('importar:borrador', texto);
    sessionStorage.setItem('importar:error', mensaje);
    vistaImportar();
  };

  // Analiza el texto y SALTA a los pasos de confirmación (pantallas nuevas,
  // nada se carga "abajo": la señora siempre ve una sola cosa a la vez).
  const analizarTexto = async (texto) => {
    cargando('🔍 Leyendo el mensaje…');
    let a;
    try {
      a = await api('/api/analizar-mensaje', { method: 'POST', body: JSON.stringify({ texto }) });
    } catch (e) {
      volverConError(texto, e.message);
      return;
    }
    const estado = {
      origen: 'importar',
      tipo: a.tipoDoc === '6' ? 'factura' : 'boleta',
      doc: a.numDoc || '',
      nombre: a.nombre || '',
      faltaDoc: a.faltantes.includes('documento'),
      rubro: 'transporte',
      igv: false,
      avisos: a.avisos || [],
      items: a.items.map((it) => ({
        descripcion: it.descripcion || '',
        cantidad: it.reparto ? it.reparto.cantidad : it.cantidad || 1,
        precioCentimos: it.reparto ? it.reparto.precioUnitarioCentimos : null,
        faltantes: it.faltantes || [],
      })),
    };
    sessionStorage.setItem('importar:borrador', texto); // si vuelve atrás, el texto sigue
    flujoActivo = {
      base: '#importar',
      pasos: {
        '1': () => pasoCliente(estado, { alAtras: () => history.back(), alContinuar: () => { location.hash = '#importar/2'; } }),
        '2': () => pasoDetalleImportar(estado, { alAtras: () => history.back(), alContinuar: () => { location.hash = '#importar/3'; } }),
        '3': () => pasoResumen(estado, { alAtras: () => history.back() }),
      },
    };
    location.hash = '#importar/1';
  };

  document.getElementById('analizar').onclick = () => {
    const texto = document.getElementById('txtMsg').value.trim();
    if (!texto) {
      const $e = document.getElementById('impErrEntrada');
      $e.textContent = 'Pegue o comparta primero el mensaje.';
      $e.hidden = false;
      return;
    }
    analizarTexto(texto);
  };

  // Escaneo asistido: foto → OCR en el servidor → mismos pasos de confirmación.
  const $foto = document.getElementById('fotoNota');
  document.getElementById('btnEscanear').onclick = () => $foto.click();
  $foto.onchange = async () => {
    const archivo = $foto.files && $foto.files[0];
    $foto.value = '';
    if (!archivo) return;
    cargando('📷 Leyendo la foto…');
    try {
      const imagen = await reducirFoto(archivo);
      const r = await api('/api/ocr', { method: 'POST', body: JSON.stringify({ imagen }) });
      await analizarTexto(r.texto);
    } catch (e) {
      volverConError('', `No se pudo leer la foto (${e.message}). Pruebe con más luz y el papel plano, o escriba la nota en el recuadro.`);
    }
  };

  if (compartido) analizarTexto(compartido);
}

/* ---------- Asistente por pasos (compartido: manual, WhatsApp y OCR) ----------
   Paso 1: ¿boleta o factura? ¿para quién?
   Paso 2: el detalle (productos, cantidades, precios).
   Paso 3: resumen grande y EMITIR.
   Cada paso REEMPLAZA la pantalla (nunca se agrega contenido abajo). */

/* El asistente en curso. Cada paso vive en el hash (#emitir/1, #importar/2…):
   así el botón atrás del teléfono baja de paso en paso, y desde el paso 1
   vuelve a donde se empezó (menú o pantalla de pegado). */
let flujoActivo = null; // { base: '#emitir' | '#importar', pasos: { '1', '2', '3' } }

function pasoCabecera(n, titulo, idAtras) {
  return `
    <div class="paso-cab">
      <button type="button" class="paso-atras" id="${idAtras}">← Atrás</button>
      <div class="paso-num">Paso ${n} de 3</div>
    </div>
    <div class="paso-barra"><div style="width:${Math.round((n / 3) * 100)}%"></div></div>
    <h1 style="margin-top:12px">${titulo}</h1>`;
}

/** Construye el cliente para la API a partir del estado; valida y explica. */
function clienteDeEstado(estado) {
  const doc = (estado.doc || '').trim();
  const nombre = (estado.nombre || '').trim();
  const direccion = (estado.direccion || '').trim();
  if (estado.tipo === 'factura') {
    if (!/^\d{11}$/.test(doc)) throw new Error('La factura necesita el RUC (11 dígitos)');
    if (!nombre) throw new Error('Falta la razón social (se busca sola al poner el RUC)');
    return { tipoDoc: '6', numDoc: doc, nombre, ...(direccion ? { direccion } : {}) };
  }
  if (/^\d{8}$/.test(doc)) {
    return { tipoDoc: '1', numDoc: doc, nombre: nombre || `CLIENTE DNI ${doc}`, ...(direccion ? { direccion } : {}) };
  }
  if (doc) throw new Error('El documento debe ser DNI (8 dígitos) o RUC (11)');
  return { tipoDoc: '0', numDoc: '-', nombre: 'CLIENTES VARIOS' };
}

/** Paso 1 de 3: tipo de comprobante y cliente (el nombre se busca solo). */
function pasoCliente(estado, nav) {
  window.scrollTo(0, 0);
  $app.innerHTML = `
    ${pasoCabecera(1, '¿Boleta o factura?', 'p1Atras')}
    <div class="tarjeta" style="max-width:560px">
      <div class="conmutador" id="p1Tipo">
        <button data-v="boleta" class="${estado.tipo === 'boleta' ? 'activa' : ''}">BOLETA</button>
        <button data-v="factura" class="${estado.tipo === 'factura' ? 'activa' : ''}">FACTURA</button>
      </div>
      <h2>¿Para quién?</h2>
      ${estado.faltaDoc ? '<p class="error">En el mensaje no venía el DNI/RUC: pídalo al cliente, o deje vacío si es venta al paso.</p>' : ''}
      <label for="p1Doc">DNI o RUC del cliente</label>
      <input id="p1Doc" inputmode="numeric" maxlength="11" placeholder="Escriba los 8 u 11 números" value="${esc(estado.doc || '')}" ${estado.faltaDoc ? 'style="box-shadow:0 0 0 2.5px var(--ambar)"' : ''}>
      <p class="ayuda" id="p1Pista"></p>
      <div id="p1Resultado"></div>
      <div id="p1Manual" hidden>
        <label for="p1Nombre">Nombre / Razón social</label>
        <input id="p1Nombre" value="${esc(estado.nombre || '')}" placeholder="Escríbalo tal como debe salir">
      </div>
      <p class="error" id="p1Err" hidden></p>
      <br>
      <button class="boton-grande" id="p1Seguir">CONTINUAR →</button>
    </div>`;

  const $ = (id) => document.getElementById(id);
  $('p1Atras').onclick = nav.alAtras;

  let nombreAuto = ''; // lo halló la consulta: no se escribe encima
  let direccionAuto = '';
  let ultimaConsulta = '';

  const pintaPista = () => {
    $('p1Pista').textContent = estado.tipo === 'factura'
      ? 'La razón social se busca sola al terminar de escribir el RUC.'
      : 'El nombre se busca solo. ¿Venta al paso? Deje el documento vacío y continúe.';
  };
  const marcarFactura = () => {
    estado.tipo = 'factura';
    document.querySelectorAll('#p1Tipo button').forEach((x) => x.classList.toggle('activa', x.dataset.v === 'factura'));
    pintaPista();
  };
  document.querySelectorAll('#p1Tipo button').forEach((b) => {
    b.onclick = () => {
      estado.tipo = b.dataset.v;
      document.querySelectorAll('#p1Tipo button').forEach((x) => x.classList.toggle('activa', x === b));
      pintaPista();
    };
  });
  pintaPista();

  const buscar = async (doc) => {
    if (doc === ultimaConsulta) return;
    ultimaConsulta = doc;
    $('p1Manual').hidden = true;
    $('p1Resultado').innerHTML = '<p class="ayuda">Buscando el nombre…</p>';
    try {
      const r = await api(`/api/consulta-doc?numero=${doc}`);
      if ($('p1Doc')?.value !== doc) return; // ya cambió el número o se salió
      nombreAuto = r.nombre;
      direccionAuto = r.direccion || '';
      $('p1Resultado').innerHTML = `
        <div class="cliente-hallado">✔ <b>${esc(r.nombre)}</b>
        ${direccionAuto ? `<span>${esc(direccionAuto)}</span>` : ''}
        <span>${r.fuente === 'cache' ? 'Cliente conocido' : 'Consulta en línea'}</span></div>`;
      if (doc.length === 11) marcarFactura();
    } catch {
      if ($('p1Doc')?.value !== doc) return;
      nombreAuto = '';
      direccionAuto = '';
      $('p1Resultado').innerHTML = '<p class="ayuda">No se encontró el nombre: escríbalo usted.</p>';
      $('p1Manual').hidden = false;
      $('p1Nombre').focus();
    }
  };

  // Busca solo, apenas el número llega a 8 (DNI) u 11 (RUC) dígitos.
  $('p1Doc').addEventListener('input', () => {
    const doc = $('p1Doc').value.replace(/\D/g, '');
    if ($('p1Doc').value !== doc) $('p1Doc').value = doc;
    if (doc.length === 8 || doc.length === 11) {
      buscar(doc);
    } else {
      nombreAuto = '';
      direccionAuto = '';
      ultimaConsulta = '';
      $('p1Resultado').innerHTML = '';
      $('p1Manual').hidden = true;
    }
  });
  if (/^\d{8}$|^\d{11}$/.test(estado.doc || '')) buscar(estado.doc);

  $('p1Seguir').onclick = () => {
    estado.doc = $('p1Doc').value.trim();
    estado.nombre = nombreAuto || $('p1Nombre').value.trim();
    estado.direccion = nombreAuto ? direccionAuto : '';
    try {
      clienteDeEstado(estado); // solo valida; si algo falta, lo explica
      estado.faltaDoc = false;
      nav.alContinuar();
    } catch (e) {
      $('p1Err').textContent = e.message;
      $('p1Err').hidden = false;
    }
  };
}

/** Paso 2 de 3 (importación/OCR): revisar y corregir los productos leídos. */
function pasoDetalleImportar(estado, nav) {
  window.scrollTo(0, 0);
  if (!estado.items.length) estado.items.push({ descripcion: '', cantidad: 1, precioCentimos: null, faltantes: [] });
  const marca = (cond) => (cond ? 'style="box-shadow:0 0 0 2.5px var(--ambar)"' : '');
  const fila = (it, i) => `
    <div class="item-import" style="${i ? 'border-top:1.5px dashed var(--linea);padding-top:12px;margin-top:12px' : ''}">
      <label>Producto ${i + 1} — descripción</label>
      <input id="p2Desc_${i}" value="${esc(it ? it.descripcion : '')}" ${marca(it && it.faltantes.includes('descripcion'))}>
      <div class="fila">
        <div><label>Cantidad</label><input id="p2Cant_${i}" inputmode="numeric" value="${it ? it.cantidad : 1}"></div>
        <div><label>Precio c/u (S/)</label><input id="p2Monto_${i}" class="monto" inputmode="decimal" value="${it && it.precioCentimos ? (it.precioCentimos / 100).toFixed(2) : ''}" ${marca(it && it.faltantes.includes('monto'))}></div>
      </div>
    </div>`;

  const hayFaltantes = estado.items.some((it) => it.faltantes.length);
  $app.innerHTML = `
    ${pasoCabecera(2, 'Revise los productos', 'p2Atras')}
    <div class="tarjeta" style="max-width:560px">
      ${hayFaltantes ? '<p class="error">Complete lo marcado en ámbar (pregunte al cliente si hace falta).</p>' : '<p class="ayuda">Así se leyó el mensaje. Corrija lo que haga falta.</p>'}
      ${(estado.avisos || []).map((v) => `<p class="ayuda">ℹ️ ${esc(v)}</p>`).join('')}
      <div class="conmutador" id="p2Rubro">
        <button data-v="transporte" class="${estado.rubro === 'transporte' ? 'activa' : ''}">TRANSPORTE</button>
        <button data-v="hospedaje" class="${estado.rubro === 'hospedaje' ? 'activa' : ''}">HOSPEDAJE</button>
      </div>
      <div id="p2Items" style="margin-top:14px">${estado.items.map((it, i) => fila(it, i)).join('')}</div>
      <button class="boton-suave" id="p2Mas" style="width:100%;margin-top:10px">➕ Agregar otro producto</button>
      <label style="margin-top:14px"><input type="checkbox" id="p2Igv" style="width:auto" ${estado.igv ? 'checked' : ''}> Operación con IGV (18%)</label>
      <div class="total-grande" id="p2Total"></div>
      <p class="error" id="p2Err" hidden></p>
      <br>
      <button class="boton-grande" id="p2Seguir">CONTINUAR →</button>
    </div>`;

  const $ = (id) => document.getElementById(id);
  $('p2Atras').onclick = nav.alAtras;
  document.querySelectorAll('#p2Rubro button').forEach((b) => {
    b.onclick = () => {
      estado.rubro = b.dataset.v;
      document.querySelectorAll('#p2Rubro button').forEach((x) => x.classList.toggle('activa', x === b));
    };
  });

  let numFilas = estado.items.length;
  const total = () => {
    let suma = 0;
    for (let i = 0; i < numFilas; i++) {
      const $m = $(`p2Monto_${i}`);
      if (!$m) continue;
      const p = montoACentimos($m.value);
      const n = Math.max(1, parseInt($(`p2Cant_${i}`).value || '1', 10));
      if (p) suma += p * n;
    }
    $('p2Total').textContent = suma ? `Total: ${S(suma)}` : '';
  };
  $('p2Items').addEventListener('input', total);
  total();

  $('p2Mas').onclick = () => {
    $('p2Items').insertAdjacentHTML('beforeend', fila(null, numFilas));
    numFilas++;
  };

  $('p2Seguir').onclick = () => {
    const $err = $('p2Err');
    $err.hidden = true;
    try {
      const items = [];
      for (let i = 0; i < numFilas; i++) {
        const el = $(`p2Desc_${i}`);
        if (!el) continue;
        const descripcion = el.value.trim();
        const precioCentimos = montoACentimos($(`p2Monto_${i}`).value);
        const cantidad = Math.max(1, parseInt($(`p2Cant_${i}`).value || '1', 10));
        if (!descripcion && precioCentimos === null) continue; // fila vacía agregada de más
        if (!descripcion) throw new Error(`Falta la descripción del producto ${i + 1}`);
        if (precioCentimos === null || precioCentimos <= 0) throw new Error(`Falta el precio del producto ${i + 1} (pregunte al cliente)`);
        items.push({ descripcion, cantidad, precioCentimos, faltantes: [] });
      }
      if (!items.length) throw new Error('No hay productos para emitir');
      estado.items = items;
      estado.igv = $('p2Igv').checked;
      nav.alContinuar();
    } catch (e) {
      $err.textContent = e.message;
      $err.hidden = false;
    }
  };
}

/** Paso 3 de 3: resumen grande y botón EMITIR. */
function pasoResumen(estado, nav) {
  window.scrollTo(0, 0);
  const rubro = estado.origen === 'manual' ? SERVICIOS[estado.items[0].servicio].rubro : estado.rubro;
  const serie = SERIES[rubro][estado.tipo];
  const cliente = clienteDeEstado(estado);
  const total = estado.items.reduce((a, it) => a + it.cantidad * it.precioCentimos, 0);

  $app.innerHTML = `
    ${pasoCabecera(3, 'Revise y emita', 'p3Atras')}
    <div class="tarjeta" style="max-width:560px">
      <div class="res-linea"><span>Comprobante</span><b>${estado.tipo === 'factura' ? 'FACTURA' : 'BOLETA'} ${serie}</b></div>
      <div class="res-linea"><span>Cliente</span><b style="text-align:right">${esc(cliente.nombre)}</b></div>
      ${cliente.numDoc !== '-' ? `<div class="res-linea"><span>${cliente.tipoDoc === '6' ? 'RUC' : 'DNI'}</span><b>${esc(cliente.numDoc)}</b></div>` : ''}
      <div style="border-top:1.5px dashed var(--linea);margin:10px 0 4px"></div>
      ${estado.items.map((it) => `
        <div class="res-linea"><span>${esc(it.descripcion)}${it.cantidad > 1 ? ` × ${it.cantidad}` : ''}</span><b>${S(it.cantidad * it.precioCentimos)}</b></div>`).join('')}
      <div class="total-grande">Total: ${S(total)}</div>
      <p class="error" id="p3Err" hidden></p>
      <button class="boton-grande" id="p3Emitir">✅ EMITIR</button>
      <button class="boton-suave" id="p3Corregir" style="width:100%;margin-top:10px">✏️ Corregir algo</button>
    </div>`;

  document.getElementById('p3Atras').onclick = nav.alAtras;
  document.getElementById('p3Corregir').onclick = nav.alAtras;
  document.getElementById('p3Emitir').onclick = async (ev) => {
    const boton = ev.target;
    const $err = document.getElementById('p3Err');
    $err.hidden = true;
    boton.disabled = true;
    boton.textContent = 'Emitiendo…';
    try {
      const res = await api('/api/comprobantes', {
        method: 'POST',
        body: JSON.stringify({
          serie,
          cliente,
          items: estado.items.map((it) => ({
            descripcion: it.descripcion,
            montoCentimos: it.precioCentimos,
            cantidad: it.cantidad,
            ...(estado.origen === 'importar' ? { afectacion: estado.igv ? '10' : '20' } : {}),
          })),
        }),
      });
      flujoActivo = null;
      sessionStorage.removeItem('importar:borrador');
      location.hash = `#ticket/${res.id}`;
    } catch (e) {
      $err.textContent = e.message;
      $err.hidden = false;
      boton.disabled = false;
      boton.textContent = '✅ EMITIR';
    }
  };
}

/** Reduce la foto a ~1600 px de lado mayor y la devuelve en base64 (JPEG). */
async function reducirFoto(archivo) {
  const img = await new Promise((ok, mal) => {
    const url = URL.createObjectURL(archivo);
    const el = new Image();
    el.onload = () => { URL.revokeObjectURL(url); ok(el); };
    el.onerror = () => { URL.revokeObjectURL(url); mal(new Error('la foto no se pudo abrir')); };
    el.src = url;
  });
  const lado = Math.max(img.width, img.height);
  const escala = lado > 1600 ? 1600 / lado : 1;
  const cv = document.createElement('canvas');
  cv.width = Math.round(img.width * escala);
  cv.height = Math.round(img.height * escala);
  cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
  return cv.toDataURL('image/jpeg', 0.85).split(',')[1];
}

/* ---------- Asistente de emisión: todo por toques ---------- */

const SERVICIOS = {
  pasaje: {
    titulo: '🚌 Pasaje',
    rubro: 'transporte',
    etiquetaCant: 'Pasajes',
    etiquetaPrecio: 'Precio por pasaje (S/)',
    semillas: ['Pasaje Pucallpa - San Alejandro', 'Pasaje San Alejandro - Pucallpa', 'Pasaje Pucallpa - Km 86', 'Pasaje Km 86 - Pucallpa'],
  },
  encomienda: {
    titulo: '📦 Encomienda',
    rubro: 'transporte',
    etiquetaCant: 'Bultos',
    etiquetaPrecio: 'Precio por bulto (S/)',
    semillas: ['Encomienda: caja', 'Encomienda: sobre', 'Encomienda: saco', 'Encomienda: paquete'],
  },
  hospedaje: {
    titulo: '🛏️ Hospedaje',
    rubro: 'hospedaje',
    etiquetaCant: 'Días / noches',
    etiquetaPrecio: 'Precio por día (S/)',
    semillas: ['Alquiler de habitación', 'Hospedaje'],
  },
};

async function vistaEmitir(sub) {
  if (sub) {
    if (flujoActivo && flujoActivo.base === '#emitir' && flujoActivo.pasos[sub]) { flujoActivo.pasos[sub](); return; }
    location.replace('#emitir'); // recarga o enlace viejo: se empieza de nuevo
    return;
  }
  const estado = { origen: 'manual', tipo: 'boleta', doc: '', nombre: '', servicio: 'pasaje', items: [], avisos: [] };
  flujoActivo = {
    base: '#emitir',
    pasos: {
      '1': () => pasoCliente(estado, { alAtras: () => history.back(), alContinuar: () => { location.hash = '#emitir/2'; } }),
      '2': () => pasoDetalleManual(estado, { alAtras: () => history.back(), alContinuar: () => { location.hash = '#emitir/3'; } }),
      '3': () => pasoResumen(estado, { alAtras: () => history.back() }),
    },
  };
  location.replace('#emitir/1');
}

/** Paso 2 de 3 (manual): qué le cobramos — chips, cantidad y precio, sin teclear letras. */
async function pasoDetalleManual(estado, nav) {
  window.scrollTo(0, 0);
  const sugerenciasApi = pasoDetalleManual.cache || (pasoDetalleManual.cache = {});

  $app.innerHTML = `
    ${pasoCabecera(2, '¿Qué le cobramos?', 'pmAtras')}
    <div class="tarjeta" style="max-width:560px">
      <div id="pmLista"></div>
      <div class="conmutador" id="pmServicio">
        <button data-v="pasaje" class="${estado.servicio === 'pasaje' ? 'activa' : ''}">🚌 Pasaje</button>
        <button data-v="encomienda" class="${estado.servicio === 'encomienda' ? 'activa' : ''}">📦 Encomienda</button>
        <button data-v="hospedaje" class="${estado.servicio === 'hospedaje' ? 'activa' : ''}">🛏️ Hospedaje</button>
      </div>
      <div id="pmZona"></div>
      <p class="error" id="pmErr" hidden></p>
      <br>
      <button class="boton-grande" id="pmSeguir">CONTINUAR →</button>
    </div>`;

  const $ = (id) => document.getElementById(id);
  $('pmAtras').onclick = nav.alAtras;

  // Lo ya agregado, arriba y compacto, con su suma parcial.
  const pintaLista = () => {
    const cont = $('pmLista');
    if (!estado.items.length) { cont.innerHTML = ''; return; }
    const suma = estado.items.reduce((a, it) => a + it.cantidad * it.precioCentimos, 0);
    cont.innerHTML = estado.items.map((it, i) => `
      <div class="item-linea">
        <div>${esc(it.descripcion)}${it.cantidad > 1 ? ` x${it.cantidad}` : ''}</div>
        <div><b>${S(it.cantidad * it.precioCentimos)}</b> <button class="quitar" data-i="${i}">✕</button></div>
      </div>`).join('') +
      `<p class="ayuda" style="text-align:right;margin:6px 0 0"><b>Va sumando: ${S(suma)}</b></p>
       <div style="border-top:1.5px dashed var(--linea);margin:10px 0 14px"></div>`;
    cont.querySelectorAll('.quitar').forEach((b) => {
      b.onclick = () => { estado.items.splice(Number(b.dataset.i), 1); pintaLista(); };
    });
  };

  const tomarActual = () => {
    const desc = $('pmDesc').value.trim();
    const precio = montoACentimos($('pmPrecio').value);
    const cant = Math.max(1, parseInt($('pmCant').value || '1', 10));
    if (!desc && precio === null) return { vacio: true };
    if (!desc) return { error: 'Toque una opción del detalle (o dicte con el micrófono 🎤)' };
    if (precio === null || precio <= 0) return { error: 'Ponga el precio' };
    return { item: { servicio: estado.servicio, descripcion: desc, cantidad: cant, precioCentimos: precio } };
  };

  const pintaZona = async () => {
    const cfg = SERVICIOS[estado.servicio];
    const esHosp = estado.servicio === 'hospedaje';
    $('pmZona').innerHTML = `
      <div class="sugerencias" id="pmChips" style="margin-top:12px"></div>
      <label>Detalle</label>
      <div class="fila">
        <input id="pmDesc" placeholder="Toque una opción o el micrófono">
        ${RecVoz ? '<button type="button" class="boton-suave mic" id="pmMic" title="Dictar por voz">🎤</button>' : ''}
      </div>
      <div id="pmVoz" hidden style="background:var(--acento-tinte);border-radius:12px;padding:12px 14px;margin-top:8px">
        <p style="margin:0 0 8px" id="pmVozTexto"></p>
        <div class="fila">
          <button type="button" id="pmVozOk">✔ Está bien</button>
          <button type="button" class="boton-linea" id="pmVozRepetir">🎤 Repetir</button>
        </div>
      </div>
      ${esHosp ? `
        <button class="boton-suave" id="pmBtnFechas" style="margin-top:8px;padding:8px 14px;font-size:.85rem">📅 Agregar fechas (opcional)</button>
        <div class="fila" id="pmFechas" hidden style="margin-top:8px">
          <div><label>Desde</label><input type="date" id="pmDesde"></div>
          <div><label>Hasta</label><input type="date" id="pmHasta"></div>
        </div>` : ''}
      <div class="fila" style="margin-top:4px">
        <div>
          <label>${cfg.etiquetaCant}</label>
          <div class="stepper">
            <button type="button" id="pmMenos">−</button>
            <input id="pmCant" inputmode="numeric" value="1">
            <button type="button" id="pmMas">+</button>
          </div>
        </div>
        <div>
          <label>${cfg.etiquetaPrecio}</label>
          <input id="pmPrecio" class="monto" inputmode="decimal" placeholder="0.00">
        </div>
      </div>
      <p class="ayuda" id="pmSubtotal"></p>
      <button class="boton-suave" id="pmAgregar" style="width:100%;margin-top:8px">➕ Agregar otro producto</button>`;

    // Chips: historial propio + opciones fijas.
    if (!sugerenciasApi[estado.servicio]) {
      try { sugerenciasApi[estado.servicio] = (await api(`/api/sugerencias?tipo=${estado.servicio}`)).map((x) => x.descripcion); }
      catch { sugerenciasApi[estado.servicio] = []; }
    }
    const chips = [...new Set([...sugerenciasApi[estado.servicio], ...cfg.semillas])].slice(0, 6);
    $('pmChips').innerHTML = chips.map((t) => `<button type="button">${esc(t)}</button>`).join('');
    document.querySelectorAll('#pmChips button').forEach((b) => {
      b.onclick = () => {
        $('pmDesc').value = b.textContent;
        document.querySelectorAll('#pmChips button').forEach((x) => x.classList.toggle('elegida', x === b));
        $('pmPrecio').focus();
      };
    });

    const subtotal = () => {
      const n = Math.max(1, parseInt($('pmCant').value || '1', 10));
      const p = montoACentimos($('pmPrecio').value);
      $('pmSubtotal').textContent = p ? `Subtotal: ${n} × ${S(p)} = ${S(n * p)}` : '';
    };
    $('pmMenos').onclick = () => { $('pmCant').value = Math.max(1, parseInt($('pmCant').value || '1', 10) - 1); subtotal(); };
    $('pmMas').onclick = () => { $('pmCant').value = Math.min(200, parseInt($('pmCant').value || '1', 10) + 1); subtotal(); };
    $('pmCant').addEventListener('input', subtotal);
    $('pmPrecio').addEventListener('input', subtotal);

    // --- Dictado por voz: habla, confirma lo entendido, y se llena solo ---
    if (RecVoz && $('pmMic')) {
      let ultimoTexto = '';
      const escuchar = () => {
        const rec = new RecVoz();
        rec.lang = 'es-PE';
        rec.interimResults = false;
        rec.maxAlternatives = 1;
        $('pmMic').classList.add('grabando');
        $('pmMic').textContent = '🔴';
        $('pmVoz').hidden = true;
        rec.onresult = (ev) => {
          ultimoTexto = ev.results[0][0].transcript.trim();
          $('pmVozTexto').innerHTML = `Le entendí: <b>«${esc(ultimoTexto)}»</b>`;
          $('pmVoz').hidden = false;
        };
        rec.onerror = () => {
          $('pmVozTexto').innerHTML = 'No le escuché bien. Toque 🎤 Repetir y hable un poquito más despacio.';
          $('pmVoz').hidden = false;
        };
        rec.onend = () => {
          $('pmMic').classList.remove('grabando');
          $('pmMic').textContent = '🎤';
        };
        rec.start();
      };
      $('pmMic').onclick = escuchar;
      $('pmVozRepetir').onclick = escuchar;
      $('pmVozOk').onclick = async () => {
        $('pmVoz').hidden = true;
        if (!ultimoTexto) return;
        try {
          const a = await api('/api/analizar-mensaje', { method: 'POST', body: JSON.stringify({ texto: ultimoTexto }) });
          $('pmDesc').value = a.descripcion || ultimoTexto;
          if (a.reparto) {
            $('pmCant').value = a.reparto.cantidad;
            $('pmPrecio').value = (a.reparto.precioUnitarioCentimos / 100).toFixed(2);
          } else if (a.cantidad > 1) {
            $('pmCant').value = a.cantidad;
          }
          if (esHosp && a.fechas) {
            $('pmFechas').hidden = false;
            $('pmBtnFechas').hidden = true;
            $('pmDesde').value = a.fechas.desde;
            $('pmHasta').value = a.fechas.hasta;
            $('pmCant').value = a.fechas.dias;
          }
          $('pmCant').dispatchEvent(new Event('input'));
        } catch {
          $('pmDesc').value = ultimoTexto;
        }
      };
    }

    if (esHosp) {
      $('pmBtnFechas').onclick = () => { $('pmFechas').hidden = false; $('pmBtnFechas').hidden = true; };
      const fechas = () => {
        const d1 = $('pmDesde').value, d2 = $('pmHasta').value;
        if (!d1 || !d2 || d2 <= d1) return;
        const dias = Math.round((new Date(d2) - new Date(d1)) / 86400000);
        $('pmCant').value = dias;
        const fmtF = (x) => { const [, m, d] = x.split('-'); return `${d}/${m}`; };
        const base = ($('pmDesc').value || 'Alquiler de habitación').replace(/ del \d{2}\/\d{2} al \d{2}\/\d{2}$/, '');
        $('pmDesc').value = `${base} del ${fmtF(d1)} al ${fmtF(d2)}`;
        subtotal();
      };
      $('pmDesde').addEventListener('change', fechas);
      $('pmHasta').addEventListener('change', fechas);
    }

    $('pmAgregar').onclick = () => {
      const r = tomarActual();
      const $err = $('pmErr');
      $err.hidden = true;
      if (r.error) { $err.textContent = r.error; $err.hidden = false; return; }
      if (r.vacio) { $err.textContent = 'Primero llene este producto (detalle y precio)'; $err.hidden = false; return; }
      estado.items.push(r.item);
      $('pmDesc').value = '';
      $('pmPrecio').value = '';
      $('pmCant').value = '1';
      $('pmSubtotal').textContent = '';
      document.querySelectorAll('#pmChips button').forEach((x) => x.classList.remove('elegida'));
      pintaLista();
    };
  };

  document.querySelectorAll('#pmServicio button').forEach((b) => {
    b.onclick = () => {
      estado.servicio = b.dataset.v;
      document.querySelectorAll('#pmServicio button').forEach((x) => x.classList.toggle('activa', x === b));
      pintaZona();
    };
  });

  $('pmSeguir').onclick = () => {
    const $err = $('pmErr');
    $err.hidden = true;
    const r = tomarActual();
    if (r.error) { $err.textContent = r.error; $err.hidden = false; return; }
    const items = r.item ? [...estado.items, r.item] : [...estado.items];
    if (!items.length) { $err.textContent = 'Agregue al menos un servicio (toque una opción y ponga el precio)'; $err.hidden = false; return; }
    const rubros = new Set(items.map((it) => SERVICIOS[it.servicio].rubro));
    if (rubros.size > 1) { $err.textContent = 'El hospedaje va en un comprobante aparte del transporte (series distintas)'; $err.hidden = false; return; }
    estado.items = items;
    nav.alContinuar();
  };

  pintaLista();
  pintaZona();
}

/** Genera el comprobante como PDF (ticket de 80 mm) con jerarquía y aire. */
function generarPdfTicket(d, emp) {
  const { jsPDF } = window.jspdf;
  const W = 80, M = 5, ancho = W - 2 * M;
  const items = d.items || [];
  const titulo = d.tipo === '01' ? 'FACTURA ELECTRÓNICA' : d.tipo === '07' ? 'NOTA DE CRÉDITO ELECTRÓNICA' : 'BOLETA DE VENTA ELECTRÓNICA';
  const GRIS = 115, NEGRO = 25;
  // Dos pasadas: la primera mide cuánto papel se usa y la segunda genera el
  // PDF al alto exacto (sin cola blanca al final).
  const dibujar = (doc) => {
  let y = 10;

  const fuente = (size, negrita, gris, cursiva) => {
    doc.setFont('helvetica', cursiva ? 'italic' : negrita ? 'bold' : 'normal');
    doc.setFontSize(size);
    doc.setTextColor(gris ? GRIS : NEGRO);
  };
  const centro = (txt, size, negrita, gris, cursiva) => {
    fuente(size, negrita, gris, cursiva);
    const lineas = doc.splitTextToSize(String(txt), ancho);
    doc.text(lineas, W / 2, y, { align: 'center' });
    y += lineas.length * size * 0.42 + 1.2;
  };
  const linea = (tono, grosor) => {
    doc.setDrawColor(tono);
    doc.setLineWidth(grosor || 0.2);
    doc.line(M, y, W - M, y);
    y += 3;
  };

  // --- Cabecera del emisor ---
  centro(emp.razonSocial, 10.5, true);
  centro(`RUC ${emp.ruc}`, 8.5);
  centro(emp.direccion, 6.8, false, true);
  centro(`${emp.distrito} · ${emp.provincia} · ${emp.departamento}`, 6.8, false, true);
  y += 1.5;

  // --- Recuadro con el tipo y número ---
  doc.setDrawColor(NEGRO);
  doc.setLineWidth(0.35);
  doc.roundedRect(M, y - 3.5, ancho, 12.5, 1.6, 1.6);
  centro(titulo, 8, true);
  centro(`${d.serie}-${d.correlativo}`, 11.5, true);
  y += 3;

  // --- Datos del comprobante (etiqueta gris + valor) ---
  const dato = (etq, val) => {
    fuente(7.2, false, true);
    doc.text(etq, M, y);
    fuente(7.6);
    const lineas = doc.splitTextToSize(String(val), ancho - 15);
    doc.text(lineas, M + 15, y);
    y += lineas.length * 3.3 + 0.9;
  };
  dato('Fecha', `${d.fecha_emision}   ${d.hora_emision}`);
  dato('Cliente', d.cliente_nombre);
  if (d.cliente_num_doc !== '-') dato(d.cliente_tipo_doc === '6' ? 'RUC' : 'DNI', d.cliente_num_doc);
  if (d.cliente_direccion) dato('Dirección', d.cliente_direccion);
  if (d.referencia) {
    dato('Modifica', `${d.referencia.tipo === '01' ? 'FACTURA' : 'BOLETA'} ${d.referencia.serie}-${d.referencia.correlativo}`);
    if (d.motivo_nota) dato('Motivo', d.motivo_nota);
  }
  y += 0.8;

  // --- Tabla de productos: CANT | DESCRIPCIÓN | P. UNIT | IMPORTE (en S/) ---
  const X_DESC = M + 9;
  const X_PU = W - M - 15;
  fuente(6.3, true, true);
  doc.text('CANT.', M, y);
  doc.text('DESCRIPCIÓN', X_DESC, y);
  doc.text('P. UNIT', X_PU, y, { align: 'right' });
  doc.text('IMPORTE', W - M, y, { align: 'right' });
  y += 1.8;
  linea(150, 0.3);
  for (const it of items) {
    fuente(7.6);
    const lineasDesc = doc.splitTextToSize(String(it.descripcion), X_PU - X_DESC - 12);
    doc.text(String(it.cantidad), M + 2.5, y, { align: 'center' });
    doc.text(lineasDesc, X_DESC, y);
    doc.text((it.precio_unitario / 100).toFixed(2), X_PU, y, { align: 'right' });
    doc.text((Math.round(it.precio_unitario * it.cantidad) / 100).toFixed(2), W - M, y, { align: 'right' });
    y += lineasDesc.length * 3.4 + 1.1;
  }
  linea(150, 0.3);

  // --- Totales ---
  const tot = (etq, val) => {
    fuente(7.2, false, true);
    doc.text(etq, W - M - 22, y, { align: 'right' });
    fuente(7.6);
    doc.text(val, W - M, y, { align: 'right' });
    y += 4;
  };
  if (Number(d.total_gravado)) tot('Op. gravadas', S(d.total_gravado));
  if (Number(d.total_exonerado)) tot('Op. exoneradas', S(d.total_exonerado));
  if (Number(d.total_inafecto)) tot('Op. inafectas', S(d.total_inafecto));
  if (Number(d.total_igv)) tot('IGV 18%', S(d.total_igv));

  // Banda gris con el TOTAL bien grande.
  doc.setFillColor(235, 235, 235);
  doc.roundedRect(M, y - 3.2, ancho, 8, 1.2, 1.2, 'F');
  fuente(10, true);
  doc.text('TOTAL', M + 2.5, y + 2);
  doc.text(S(d.total), W - M - 2.5, y + 2, { align: 'right' });
  y += 9;
  centro(d.leyenda || '', 6.6, false, true, true);
  y += 1.5;

  // --- QR reglamentario, centrado y con su pie ---
  try {
    const qr = qrcode(0, 'M');
    qr.addData(d.qr);
    qr.make();
    const n = qr.getModuleCount();
    const celda = 4;
    const cv = document.createElement('canvas');
    cv.width = cv.height = n * celda;
    const cx = cv.getContext('2d');
    cx.fillStyle = '#fff';
    cx.fillRect(0, 0, cv.width, cv.height);
    cx.fillStyle = '#000';
    for (let f = 0; f < n; f++) for (let c = 0; c < n; c++) if (qr.isDark(f, c)) cx.fillRect(c * celda, f * celda, celda, celda);
    doc.addImage(cv.toDataURL('image/png'), 'PNG', (W - 26) / 2, y, 26, 26);
    y += 28.5;
  } catch { /* sin QR el PDF sigue siendo válido como representación */ }

  centro('Representación impresa del comprobante electrónico.', 6.2, false, true);
  centro('Consulte el documento con el código QR o en SUNAT.', 6.2, false, true);
  if (d.hash_firma) centro(`Hash: ${d.hash_firma}`, 5.8, false, true);
  return y;
  };

  const medida = new jsPDF({ unit: 'mm', format: [W, 600] });
  const alto = dibujar(medida) + 3;
  const doc = new jsPDF({ unit: 'mm', format: [W, alto] });
  dibujar(doc);
  return doc.output('blob');
}

async function vistaTicket(id) {
  $app.innerHTML = '<p class="cargando">Cargando ticket…</p>';
  const d = await api(`/api/comprobantes/${id}`);
  const emp = d.empresa;
  const titulo =
    d.tipo === '01' ? 'FACTURA ELECTRÓNICA' :
    d.tipo === '07' ? 'NOTA DE CRÉDITO ELECTRÓNICA' :
    'BOLETA DE VENTA ELECTRÓNICA';
  const est = d.anulado_por ? ESTADOS.anulado : (ESTADOS[d.estado] || ESTADOS.pendiente);

  $app.innerHTML = `
    <p class="no-imprimir" style="text-align:center"><span class="estado ${est.clase}">${est.texto}</span></p>
    <div id="ticket">
      <div class="centro">
        <div class="emp">${esc(emp.razonSocial)}</div>
        <div>RUC ${emp.ruc}</div>
        <div>${esc(emp.direccion)}</div>
        <div>${esc(emp.distrito)} - ${esc(emp.provincia)} - ${esc(emp.departamento)}</div>
        <div class="doc-titulo">${titulo}<br>${d.serie}-${d.correlativo}</div>
      </div>
      <hr>
      ${d.referencia ? `
        <div class="linea"><span>Modifica:</span><span>${d.referencia.tipo === '01' ? 'FACTURA' : 'BOLETA'} ${d.referencia.serie}-${d.referencia.correlativo}</span></div>
        <div class="linea"><span>Motivo:</span><span>${esc(d.motivo_nota || '')}</span></div>
        <hr>` : ''}
      <div class="linea"><span>Fecha:</span><span>${d.fecha_emision} ${d.hora_emision}</span></div>
      <div class="linea"><span>Cliente:</span><span>${esc(d.cliente_nombre)}</span></div>
      ${d.cliente_num_doc !== '-' ? `<div class="linea"><span>Doc:</span><span>${esc(d.cliente_num_doc)}</span></div>` : ''}
      ${d.cliente_direccion ? `<div class="linea"><span>Dirección:</span><span>${esc(d.cliente_direccion)}</span></div>` : ''}
      <hr>
      ${d.items.map((it) => `
        <div class="linea"><span>${esc(it.descripcion)}${it.cantidad !== 1 ? ` x${it.cantidad}` : ''}</span>
        <span>${S(Math.round(it.precio_unitario * it.cantidad))}</span></div>`).join('')}
      <hr>
      ${Number(d.total_gravado) ? `<div class="linea"><span>Op. gravadas:</span><span>${S(d.total_gravado)}</span></div>` : ''}
      ${Number(d.total_exonerado) ? `<div class="linea"><span>Op. exoneradas:</span><span>${S(d.total_exonerado)}</span></div>` : ''}
      ${Number(d.total_inafecto) ? `<div class="linea"><span>Op. inafectas:</span><span>${S(d.total_inafecto)}</span></div>` : ''}
      ${Number(d.total_igv) ? `<div class="linea"><span>IGV 18%:</span><span>${S(d.total_igv)}</span></div>` : ''}
      <div class="linea tot"><span>TOTAL:</span><span>${S(d.total)}</span></div>
      <div class="leyenda">${esc(d.leyenda)}</div>
      <div class="qr" id="qr"></div>
      <div class="centro leyenda">Representación impresa del comprobante electrónico.<br>Hash: ${esc(d.hash_firma || '')}</div>
    </div>
    <div class="acciones-ticket no-imprimir">
      <button id="compartir">📲 Enviar por WhatsApp</button>
      <button class="boton-linea" id="imprimir">🖨️ Imprimir</button>
      <div class="ancho" id="panelWa" hidden>
        <div class="tarjeta" style="margin:0">
          <h2 style="margin-top:0">Enviar el comprobante en PDF</h2>
          <button id="waPdf" style="width:100%">📄 Compartir PDF → elegir chofer o cliente</button>
          <p class="ayuda">Se abre la lista para compartir: elija WhatsApp y el contacto; el PDF ya va adjunto. En computadora, el PDF se descarga para adjuntarlo.</p>
          <hr style="border:none;border-top:1.5px dashed var(--linea);margin:14px 0">
          <label for="waNum">¿Es un número nuevo que no es contacto? (del papelito)</label>
          <div class="fila">
            <input id="waNum" inputmode="numeric" maxlength="9" placeholder="9XXXXXXXX">
            <button class="boton-suave" id="waAbrir" style="flex:0 0 auto">1º Abrir chat</button>
          </div>
          <p class="ayuda">Se abre el chat con ese número sin agregarlo como contacto. Luego regrese y toque <b>Compartir PDF</b>: ese chat aparecerá primero en WhatsApp.</p>
          <div id="waRecientes" class="sugerencias"></div>
        </div>
      </div>
      ${d.anulado_por && d.anuladoPor ? `
        <a class="boton boton-suave ancho" href="#ticket/${d.anuladoPor.id}">Ver nota de crédito ${d.anuladoPor.serie}-${d.anuladoPor.correlativo}</a>` : ''}
      ${(d.tipo === '01' || d.tipo === '03') && !d.anulado_por && d.estado !== 'rechazado' ? `
        <button class="boton-linea ancho" id="anular" style="color:var(--rojo);border-color:var(--rojo)">🚫 Anular (nota de crédito)</button>
        <div class="ancho" id="confirmarAnulacion" hidden>
          <label for="motivoNc">Motivo de la anulación</label>
          <select id="motivoNc">
            ${Object.entries(MOTIVOS_NC).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}
          </select>
          <p class="ayuda">Se emitirá una nota de crédito por el total (${S(d.total)}). El comprobante original no se borra: así lo exige SUNAT.</p>
          <p class="error" id="errNc" hidden></p>
          <br>
          <button id="confirmarNc" style="background:var(--rojo);width:100%">Confirmar anulación</button>
        </div>` : ''}
      <a class="boton boton-suave ancho" href="#home">➕ Nuevo comprobante</a>
    </div>`;

  try {
    const qr = qrcode(0, 'M');
    qr.addData(d.qr);
    qr.make();
    document.getElementById('qr').innerHTML = qr.createSvgTag({ cellSize: 4, margin: 0 });
  } catch { /* el QR es opcional en pantalla */ }

  document.getElementById('imprimir').onclick = () => window.print();
  const $anular = document.getElementById('anular');
  if ($anular) {
    $anular.onclick = () => {
      document.getElementById('confirmarAnulacion').hidden = false;
      $anular.hidden = true;
    };
    document.getElementById('confirmarNc').onclick = async (ev) => {
      const boton = ev.target;
      const $errNc = document.getElementById('errNc');
      $errNc.hidden = true;
      boton.disabled = true;
      boton.textContent = 'Emitiendo nota de crédito…';
      try {
        const res = await api(`/api/comprobantes/${id}/nota-credito`, {
          method: 'POST',
          body: JSON.stringify({ motivoCodigo: document.getElementById('motivoNc').value }),
        });
        location.hash = `#ticket/${res.id}`;
      } catch (e) {
        $errNc.textContent = e.message;
        $errNc.hidden = false;
        boton.disabled = false;
        boton.textContent = 'Confirmar anulación';
      }
    };
  }
  // ---- Envío por WhatsApp: el comprobante viaja como PDF ----
  const saludoWa = `Le enviamos su comprobante *${d.serie}-${d.correlativo}* de ${emp.razonSocial}. Total: *${S(d.total)}*`;

  const recientesWa = () => {
    try { return JSON.parse(localStorage.getItem('wa:recientes')) || []; } catch { return []; }
  };
  const abrirChatWa = (num) => {
    const lista = [{ num, nombre: d.cliente_nombre !== 'CLIENTES VARIOS' ? d.cliente_nombre : '' },
      ...recientesWa().filter((r) => r.num !== num)].slice(0, 6);
    localStorage.setItem('wa:recientes', JSON.stringify(lista));
    window.open(`https://wa.me/51${num}?text=${encodeURIComponent(saludoWa)}`, '_blank');
  };

  const compartirPdf = async () => {
    const archivo = new File([generarPdfTicket(d, emp)], `${d.serie}-${d.correlativo}.pdf`, { type: 'application/pdf' });
    if (navigator.canShare && navigator.canShare({ files: [archivo] })) {
      try { await navigator.share({ files: [archivo], title: `${d.serie}-${d.correlativo}` }); } catch { /* cancelado */ }
    } else {
      // PC u otro navegador: se descarga y se adjunta a mano.
      const url = URL.createObjectURL(archivo);
      const a = document.createElement('a');
      a.href = url;
      a.download = archivo.name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    }
  };

  const pintaRecientes = () => {
    const lista = recientesWa();
    document.getElementById('waRecientes').innerHTML = lista.length
      ? `<p class="ayuda" style="width:100%;margin:0 0 4px">Chats recientes (abre el chat; luego comparta el PDF):</p>` +
        lista.map((r) => `<button type="button" data-num="${r.num}">📞 ${r.num}${r.nombre ? ` · ${esc(r.nombre.split(' ').slice(0, 2).join(' '))}` : ''}</button>`).join('')
      : '';
    document.querySelectorAll('#waRecientes button').forEach((b) => { b.onclick = () => abrirChatWa(b.dataset.num); });
  };

  document.getElementById('compartir').onclick = () => {
    const p = document.getElementById('panelWa');
    p.hidden = !p.hidden;
    if (!p.hidden) pintaRecientes();
  };
  document.getElementById('waPdf').onclick = compartirPdf;
  document.getElementById('waAbrir').onclick = () => {
    const num = document.getElementById('waNum').value.trim();
    if (!/^9\d{8}$/.test(num)) { alert('El número debe tener 9 dígitos y empezar con 9 (ej. 961234567)'); return; }
    abrirChatWa(num);
  };
}

async function vistaLista() {
  $app.innerHTML = `
    <h1>Comprobantes</h1>
    <input id="q" placeholder="🔍 Nombre, DNI/RUC o número (B001-12)" style="margin-bottom:10px" class="no-imprimir">
    <div class="filtros no-imprimir">
      <div><label>Desde</label><input type="date" id="desde" value="${primerDiaDelMes()}"></div>
      <div><label>Hasta</label><input type="date" id="hasta" value="${hoyLima()}"></div>
      <div><button id="buscar" style="width:100%">Buscar</button></div>
    </div>
    <div id="resultados"><p class="cargando">Cargando…</p></div>`;

  const cargar = async () => {
    if (!document.getElementById('q')) return; // ya se salió de la vista
    const q = document.getElementById('q').value.trim();
    const desde = document.getElementById('desde').value;
    const hasta = document.getElementById('hasta').value;
    // Con búsqueda se revisan TODAS las fechas (para ubicar uno puntual).
    const ruta = q ? `/api/comprobantes?q=${encodeURIComponent(q)}` : `/api/comprobantes?desde=${desde}&hasta=${hasta}`;
    const filas = await api(ruta);
    const cont = document.getElementById('resultados');
    if (!cont) return;
    if (filas.length === 0) {
      cont.innerHTML = `<p class="ayuda">${q ? `No se encontró nada con «${esc(q)}».` : 'No hay comprobantes en ese rango.'}</p>`;
      return;
    }
    const nota = q ? `<p class="ayuda">Resultados de todas las fechas para «${esc(q)}»:</p>` : '';
    const chip = (f) => {
      const e = f.anulado_por ? 'anulado' : f.estado;
      const x = ESTADOS[e] || ESTADOS.pendiente;
      return `<span class="estado ${x.clase}">${e}</span>`;
    };
    cont.innerHTML = nota + `
      <div class="lista-movil">
        ${filas.map((f) => `
          <div class="comp-fila" data-id="${f.id}">
            <div>
              <div class="num">${f.serie}-${f.correlativo} · ${NOMBRE_TIPO[f.tipo] || f.tipo}</div>
              <div class="cli">${esc(f.cliente_nombre)} · ${f.fecha_emision}</div>
            </div>
            <div class="imp">${S(f.total)}<br>${chip(f)}</div>
          </div>`).join('')}
      </div>
      <table class="lista-pc">
        <thead><tr><th>Número</th><th>Tipo</th><th>Fecha</th><th>Cliente</th><th>Doc.</th><th>Estado</th><th style="text-align:right">Total</th></tr></thead>
        <tbody>
          ${filas.map((f) => `
            <tr data-id="${f.id}">
              <td><b>${f.serie}-${f.correlativo}</b></td>
              <td>${NOMBRE_TIPO[f.tipo] || f.tipo}</td>
              <td>${f.fecha_emision}</td>
              <td>${esc(f.cliente_nombre)}</td>
              <td>${esc(f.cliente_num_doc)}</td>
              <td>${chip(f)}</td>
              <td class="imp">${S(f.total)}</td>
            </tr>`).join('')}
        </tbody>
      </table>`;
    cont.querySelectorAll('[data-id]').forEach((el) => {
      el.onclick = () => { location.hash = `#ticket/${el.dataset.id}`; };
    });
  };
  document.getElementById('buscar').onclick = cargar;
  let tmrBusqueda;
  document.getElementById('q').addEventListener('input', () => {
    clearTimeout(tmrBusqueda);
    tmrBusqueda = setTimeout(cargar, 400);
  });
  await cargar();
}

async function vistaReportes() {
  $app.innerHTML = `
    <h1>Reportes</h1>
    <div class="tarjeta">
      <div class="filtros">
        <div><label>Desde</label><input type="date" id="desde" value="${primerDiaDelMes()}"></div>
        <div><label>Hasta</label><input type="date" id="hasta" value="${hoyLima()}"></div>
        <div><button id="calcular" style="width:100%">Calcular</button></div>
      </div>
      <div id="resumen"></div>
      <br>
      <button class="boton-linea" id="descargar" style="width:100%">⬇️ Descargar Excel/CSV para la computadora</button>
      <p class="ayuda">El archivo se abre en Excel y sirve de base para el Registro de Ventas del contador.</p>
      <button class="boton-grande" id="paquete" style="width:100%;margin-top:12px">📦 Paquete completo para el contador (ZIP)</button>
      <p class="ayuda">Arma un ZIP del rango elegido con TODO: el registro en Excel/CSV, y cada boleta, factura y
        nota de crédito con su PDF, su XML firmado y su constancia CDR de SUNAT. Ideal una vez al mes.</p>
      <p class="ayuda" id="paqueteEstado"></p>
    </div>`;

  const calcular = async () => {
    const desde = document.getElementById('desde').value;
    const hasta = document.getElementById('hasta').value;
    const filas = await api(`/api/comprobantes?desde=${desde}&hasta=${hasta}`);
    // Las notas de crédito RESTAN de la venta (anulaciones y devoluciones).
    const signo = (f) => (f.tipo === '07' ? -1 : 1);
    const suma = (fn) => filas.reduce((a, f) => a + signo(f) * fn(f), 0);
    const totalVentas = suma((f) => Number(f.total));
    const igv = suma((f) => Number(f.total_igv || 0));
    const notas = filas.filter((f) => f.tipo === '07');
    const notasTotal = notas.reduce((a, f) => a + Number(f.total), 0);
    document.getElementById('resumen').innerHTML = `
      <div class="total-grande" style="text-align:left">Ventas: ${S(totalVentas)}</div>
      <p>${filas.filter((f) => f.tipo !== '07').length} comprobantes
        ${notas.length ? ` · ${notas.length} nota${notas.length === 1 ? '' : 's'} de crédito (−${S(notasTotal)})` : ''}
        · IGV: ${S(igv)} ·
        Pendientes de envío: ${filas.filter((f) => f.estado === 'pendiente').length} ·
        Rechazados: ${filas.filter((f) => f.estado === 'rechazado').length}</p>`;
  };
  document.getElementById('calcular').onclick = calcular;
  document.getElementById('descargar').onclick = () => {
    const desde = document.getElementById('desde').value;
    const hasta = document.getElementById('hasta').value;
    location.href = `/api/export.csv?desde=${desde}&hasta=${hasta}&clave=${encodeURIComponent(clave())}`;
  };
  document.getElementById('paquete').onclick = () => armarPaqueteContador();
  await calcular();
}

/** Convierte base64 a bytes (para los CDR guardados). */
function base64AU8(b64) {
  const bin = atob(b64);
  const u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  return u8;
}

/**
 * Paquete para el contador: ZIP con el registro (CSV) y cada comprobante con
 * su PDF, su XML firmado y su CDR. Se arma aquí en el navegador, por páginas.
 */
async function armarPaqueteContador() {
  const boton = document.getElementById('paquete');
  const $est = document.getElementById('paqueteEstado');
  const desde = document.getElementById('desde').value;
  const hasta = document.getElementById('hasta').value;
  boton.disabled = true;
  try {
    $est.textContent = 'Preparando el registro de ventas…';
    const csv = await (await fetch(`/api/export.csv?desde=${desde}&hasta=${hasta}&clave=${encodeURIComponent(clave())}`)).text();
    const archivos = {
      'registro-ventas.csv': fflate.strToU8(csv),
      'LEEME.txt': fflate.strToU8(
        `Paquete de comprobantes electrónicos — Turismo Irazola\n` +
        `Rango: ${desde} a ${hasta}\n\n` +
        `registro-ventas.csv  Registro de ventas (las notas de crédito van en negativo).\n` +
        `pdf/                 Representación impresa de cada comprobante.\n` +
        `xml/                 XML firmados enviados a SUNAT (documento legal).\n` +
        `cdr/                 Constancias de recepción de SUNAT (solo de lo ya aceptado).\n`,
      ),
    };
    let pagina = 0;
    let hayMas = true;
    let n = 0;
    while (hayMas) {
      const lote = await api(`/api/paquete?desde=${desde}&hasta=${hasta}&pagina=${pagina}`);
      for (const d of lote.comprobantes) {
        const carpeta = d.tipo === '01' ? 'facturas' : d.tipo === '07' ? 'notas-credito' : 'boletas';
        const nom = `${d.serie}-${d.correlativo}`;
        if (d.xml) archivos[`xml/${carpeta}/${nom}.xml`] = fflate.strToU8(d.xml);
        if (d.cdrZipBase64) archivos[`cdr/${carpeta}/R-${nom}.zip`] = base64AU8(d.cdrZipBase64);
        try {
          archivos[`pdf/${carpeta}/${nom}.pdf`] = new Uint8Array(await generarPdfTicket(d, d.empresa).arrayBuffer());
        } catch { /* sin ese PDF el paquete sigue sirviendo */ }
        n++;
        $est.textContent = `Armando comprobante ${n} (${nom})…`;
      }
      hayMas = lote.hayMas;
      pagina++;
    }
    if (!n) throw new Error('No hay comprobantes en ese rango');
    $est.textContent = 'Comprimiendo…';
    const zip = fflate.zipSync(archivos, { level: 6 });
    const archivo = new File([zip], `paquete-contador_${desde}_a_${hasta}.zip`, { type: 'application/zip' });
    let compartido = false;
    if (navigator.canShare && navigator.canShare({ files: [archivo] })) {
      try { await navigator.share({ files: [archivo], title: archivo.name }); compartido = true; } catch { /* cancelado */ }
    }
    if (!compartido) {
      const url = URL.createObjectURL(archivo);
      const a = document.createElement('a');
      a.href = url;
      a.download = archivo.name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    }
    $est.textContent = `Listo: ${n} comprobantes en el ZIP.`;
  } catch (e) {
    $est.textContent = `No se pudo armar el paquete: ${e.message}`;
  }
  boton.disabled = false;
}

/* ---------- Enrutador ---------- */

async function enrutar() {
  const hash = location.hash || '#home';
  if (!clave() && hash !== '#login') { location.hash = '#login'; return; }

  $cabecera.hidden = hash === '#login';
  $navInferior.hidden = hash === '#login';
  document.querySelectorAll('#cabecera nav a, #navInferior a').forEach((a) => {
    a.classList.toggle('activa', hash.startsWith(a.getAttribute('href')));
  });
  $app.classList.remove('cargando');

  try {
    if (hash === '#login') vistaLogin();
    else if (hash === '#home') vistaHome();
    else if (hash.startsWith('#emitir')) await vistaEmitir(hash.split('/')[1]);
    else if (hash.startsWith('#ticket/')) await vistaTicket(hash.split('/')[1]);
    else if (hash === '#lista') await vistaLista();
    else if (hash.startsWith('#importar')) await vistaImportar(hash.split('/')[1]);
    else if (hash === '#guia') await vistaGuiaNueva();
    else if (hash === '#guias') await vistaGuias();
    else if (hash === '#reportes') await vistaReportes();
    else vistaHome();
  } catch (e) {
    if (e.message !== 'Clave incorrecta') {
      $app.innerHTML = `<div class="tarjeta"><p class="error">${esc(e.message)}</p><a class="boton boton-suave" href="#home">Volver</a></div>`;
    }
  }
}

// Texto compartido desde WhatsApp (Web Share Target del manifest).
{
  const q = new URLSearchParams(location.search);
  const compartido = [q.get('titulo'), q.get('texto'), q.get('urlcomp')].filter(Boolean).join('\n').trim();
  if (compartido) {
    sessionStorage.setItem('importar:texto', compartido);
    // replaceState no dispara hashchange: la vista se renderiza una sola vez.
    history.replaceState(null, '', '/#importar');
  }
}

window.addEventListener('hashchange', enrutar);
enrutar();

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(() => {});
}
