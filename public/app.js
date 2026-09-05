/* Tourismo Irasola — PWA de facturación (vanilla JS, sin build). */

const $app = document.getElementById('app');
const $cabecera = document.getElementById('cabecera');

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

/* ---------- Config de tipos de operación ---------- */

const TIPOS = {
  pasaje:     { titulo: 'Pasaje',        icono: '🚌', rubro: 'transporte', ejemplo: 'Pasaje Pucallpa - San Alejandro' },
  encomienda: { titulo: 'Encomienda',    icono: '📦', rubro: 'transporte', ejemplo: 'Encomienda: caja mediana' },
  hospedaje:  { titulo: 'Hospedaje',     icono: '🛏️', rubro: 'hospedaje',  ejemplo: 'Hospedaje 1 noche, hab. 4' },
  otro:       { titulo: 'Otro servicio', icono: '🚐', rubro: 'transporte', ejemplo: 'Servicio de transporte contratado a Huánuco' },
};

const SERIES = {
  transporte: { boleta: 'B001', factura: 'F001' },
  hospedaje:  { boleta: 'B002', factura: 'F002' },
};

const ESTADOS = {
  pendiente: { clase: 'pendiente', texto: 'Emitido ✔ · envío a SUNAT en curso' },
  aceptado:  { clase: 'aceptado',  texto: 'Aceptado por SUNAT' },
  rechazado: { clase: 'rechazado', texto: 'Rechazado — revisar' },
};

/* ---------- Vistas ---------- */

function vistaLogin() {
  $cabecera.hidden = true;
  $app.innerHTML = `
    <div class="tarjeta" style="max-width:420px;margin:40px auto">
      <h1>🚌 Tourismo Irasola</h1>
      <p>Sistema de facturación</p>
      <label for="clave">Clave de acceso</label>
      <input id="clave" type="password" autocomplete="current-password" inputmode="numeric">
      <p class="error" id="err" hidden>Clave incorrecta, intente de nuevo.</p>
      <br>
      <button class="boton-grande" id="entrar">Entrar</button>
    </div>`;
  const entrar = async () => {
    localStorage.setItem('clave', document.getElementById('clave').value);
    try {
      await api('/api/yo');
      location.hash = '#home';
    } catch {
      document.getElementById('err').hidden = false;
    }
  };
  document.getElementById('entrar').onclick = entrar;
  document.getElementById('clave').onkeydown = (e) => { if (e.key === 'Enter') entrar(); };
}

function vistaHome() {
  $app.innerHTML = `
    <h1>¿Qué desea emitir?</h1>
    <div class="accesos">
      ${Object.entries(TIPOS).map(([k, t]) => `
        <a class="acceso" href="#emitir/${k}"><span class="icono">${t.icono}</span>${t.titulo}</a>
      `).join('')}
    </div>
    <h2>Accesos</h2>
    <div class="accesos">
      <a class="acceso" href="#lista"><span class="icono">📋</span>Comprobantes</a>
      <a class="acceso" href="#reportes"><span class="icono">📊</span>Reportes</a>
    </div>`;
}

function vistaEmitir(tipoOp) {
  const cfg = TIPOS[tipoOp] || TIPOS.otro;
  const items = [];

  $app.innerHTML = `
    <h1>${cfg.icono} ${cfg.titulo}</h1>
    <div class="dos-columnas">
    <div>
    <div class="tarjeta">
      <div class="conmutador" id="tipoDoc">
        <button data-v="boleta" class="activa">BOLETA</button>
        <button data-v="factura">FACTURA</button>
      </div>

      <div id="datosCliente"></div>

      <label for="desc">Descripción</label>
      <input id="desc" placeholder="Ej: ${esc(cfg.ejemplo)}" autocomplete="off">
      <div class="sugerencias" id="sug"></div>

      <label for="monto">Monto (S/)</label>
      <input id="monto" class="monto" inputmode="decimal" placeholder="0.00" autocomplete="off">

      <label><input type="checkbox" id="conIgv" style="width:auto"> Operación con IGV (18%)</label>
      <p class="ayuda">Dejar sin marcar para operaciones exoneradas (Amazonía). Consultar con el contador qué operaciones llevan IGV.</p>

      <br>
      <button class="boton-suave" id="agregar" style="width:100%">+ Agregar este ítem y seguir</button>
    </div>
    </div>
    <div>
    <div class="tarjeta">
      <h2 style="margin-top:0">Resumen</h2>
      <div id="lineas"><p class="ayuda">Aún no hay ítems. Puede emitir directamente con la descripción y monto de la izquierda.</p></div>
      <div class="total-grande" id="total"></div>
      <p class="error" id="err" hidden></p>
      <button class="boton-grande" id="emitir">EMITIR</button>
    </div>
    </div>
    </div>`;

  let tipoDoc = 'boleta';
  const $err = document.getElementById('err');

  const pintaCliente = () => {
    const d = document.getElementById('datosCliente');
    if (tipoDoc === 'factura') {
      d.innerHTML = `
        <label for="ruc">RUC del cliente</label>
        <input id="ruc" inputmode="numeric" maxlength="11" placeholder="20XXXXXXXXX" autocomplete="off">
        <label for="razon">Razón social</label>
        <input id="razon" placeholder="EMPRESA S.A.C." autocomplete="off">`;
    } else {
      d.innerHTML = `
        <label for="dni">DNI del cliente (opcional)</label>
        <input id="dni" inputmode="numeric" maxlength="8" placeholder="Vacío = clientes varios" autocomplete="off">
        <label for="nombre">Nombre (opcional)</label>
        <input id="nombre" placeholder="Vacío = CLIENTES VARIOS" autocomplete="off">`;
    }
  };
  pintaCliente();

  document.querySelectorAll('#tipoDoc button').forEach((b) => {
    b.onclick = () => {
      tipoDoc = b.dataset.v;
      document.querySelectorAll('#tipoDoc button').forEach((x) => x.classList.toggle('activa', x === b));
      pintaCliente();
    };
  });

  const pintaSugerencias = () => {
    document.getElementById('sug').innerHTML = sugerencias(tipoOp)
      .map((s) => `<button type="button">${esc(s)}</button>`)
      .join('');
    document.querySelectorAll('#sug button').forEach((b) => {
      b.onclick = () => { document.getElementById('desc').value = b.textContent; };
    });
  };
  pintaSugerencias();

  const pintaLineas = () => {
    const cont = document.getElementById('lineas');
    if (items.length === 0) {
      cont.innerHTML = '<p class="ayuda">Aún no hay ítems. Puede emitir directamente con la descripción y monto de la izquierda.</p>';
    } else {
      cont.innerHTML = items
        .map((it, i) => `
          <div class="item-linea">
            <div>${esc(it.descripcion)}</div>
            <div><b>${S(it.montoCentimos)}</b> <button class="quitar" data-i="${i}" title="Quitar">✕</button></div>
          </div>`)
        .join('');
      cont.querySelectorAll('.quitar').forEach((b) => {
        b.onclick = () => { items.splice(Number(b.dataset.i), 1); pintaLineas(); };
      });
    }
    const suma = items.reduce((a, it) => a + it.montoCentimos, 0);
    document.getElementById('total').textContent = suma ? `Total: ${S(suma)}` : '';
  };
  pintaLineas();

  const tomarItemActual = () => {
    const desc = document.getElementById('desc').value.trim();
    const monto = montoACentimos(document.getElementById('monto').value);
    if (!desc && monto === null) return null;
    if (!desc) throw new Error('Escriba la descripción');
    if (monto === null || monto <= 0) throw new Error('Escriba un monto válido, ej. 25.00');
    return { descripcion: desc, montoCentimos: monto, afectacion: document.getElementById('conIgv').checked ? '10' : '20' };
  };

  document.getElementById('agregar').onclick = () => {
    $err.hidden = true;
    try {
      const it = tomarItemActual();
      if (!it) throw new Error('Escriba la descripción y el monto');
      items.push(it);
      guardarSugerencia(tipoOp, it.descripcion);
      document.getElementById('desc').value = '';
      document.getElementById('monto').value = '';
      pintaSugerencias();
      pintaLineas();
    } catch (e) { $err.textContent = e.message; $err.hidden = false; }
  };

  document.getElementById('emitir').onclick = async () => {
    $err.hidden = true;
    const boton = document.getElementById('emitir');
    try {
      const pendiente = tomarItemActual();
      const todos = pendiente ? [...items, pendiente] : [...items];
      if (todos.length === 0) throw new Error('Agregue al menos un ítem');

      let cliente;
      if (tipoDoc === 'factura') {
        const ruc = document.getElementById('ruc').value.trim();
        const razon = document.getElementById('razon').value.trim();
        if (!/^\d{11}$/.test(ruc)) throw new Error('La factura necesita el RUC del cliente (11 dígitos)');
        if (!razon) throw new Error('Escriba la razón social del cliente');
        cliente = { tipoDoc: '6', numDoc: ruc, nombre: razon };
      } else {
        const dni = document.getElementById('dni').value.trim();
        const nombre = document.getElementById('nombre').value.trim();
        cliente = dni
          ? { tipoDoc: '1', numDoc: dni, nombre: nombre || `CLIENTE DNI ${dni}` }
          : { tipoDoc: '0', numDoc: '-', nombre: 'CLIENTES VARIOS' };
        if (dni && !/^\d{8}$/.test(dni)) throw new Error('El DNI debe tener 8 dígitos');
      }

      boton.disabled = true;
      boton.textContent = 'Emitiendo…';
      const serie = SERIES[cfg.rubro][tipoDoc];
      const res = await api('/api/comprobantes', {
        method: 'POST',
        body: JSON.stringify({ serie, cliente, items: todos }),
      });
      if (pendiente) guardarSugerencia(tipoOp, pendiente.descripcion);
      location.hash = `#ticket/${res.id}`;
    } catch (e) {
      $err.textContent = e.message;
      $err.hidden = false;
      boton.disabled = false;
      boton.textContent = 'EMITIR';
    }
  };
}

async function vistaTicket(id) {
  $app.innerHTML = '<p class="cargando">Cargando ticket…</p>';
  const d = await api(`/api/comprobantes/${id}`);
  const emp = d.empresa;
  const titulo = d.tipo === '01' ? 'FACTURA ELECTRÓNICA' : 'BOLETA DE VENTA ELECTRÓNICA';
  const est = ESTADOS[d.estado] || ESTADOS.pendiente;

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
      <div class="linea"><span>Fecha:</span><span>${d.fecha_emision} ${d.hora_emision}</span></div>
      <div class="linea"><span>Cliente:</span><span>${esc(d.cliente_nombre)}</span></div>
      ${d.cliente_num_doc !== '-' ? `<div class="linea"><span>Doc:</span><span>${esc(d.cliente_num_doc)}</span></div>` : ''}
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
      <button id="compartir">📲 Compartir</button>
      <button class="boton-linea" id="imprimir">🖨️ Imprimir</button>
      <a class="boton boton-suave ancho" href="#home">➕ Nuevo comprobante</a>
    </div>`;

  try {
    const qr = qrcode(0, 'M');
    qr.addData(d.qr);
    qr.make();
    document.getElementById('qr').innerHTML = qr.createSvgTag({ cellSize: 4, margin: 0 });
  } catch { /* el QR es opcional en pantalla */ }

  document.getElementById('imprimir').onclick = () => window.print();
  document.getElementById('compartir').onclick = async () => {
    const texto =
      `${emp.razonSocial}\n${titulo} ${d.serie}-${d.correlativo}\n` +
      `Fecha: ${d.fecha_emision}\nTotal: ${S(d.total)}\n${d.leyenda}`;
    if (navigator.share) {
      try { await navigator.share({ title: `${d.serie}-${d.correlativo}`, text: texto }); } catch { /* cancelado */ }
    } else {
      await navigator.clipboard.writeText(texto);
      alert('Copiado al portapapeles');
    }
  };
}

async function vistaLista() {
  $app.innerHTML = `
    <h1>Comprobantes</h1>
    <div class="filtros no-imprimir">
      <div><label>Desde</label><input type="date" id="desde" value="${primerDiaDelMes()}"></div>
      <div><label>Hasta</label><input type="date" id="hasta" value="${hoyLima()}"></div>
      <div><button id="buscar" style="width:100%">Buscar</button></div>
    </div>
    <div id="resultados"><p class="cargando">Cargando…</p></div>`;

  const cargar = async () => {
    const desde = document.getElementById('desde').value;
    const hasta = document.getElementById('hasta').value;
    const filas = await api(`/api/comprobantes?desde=${desde}&hasta=${hasta}`);
    const cont = document.getElementById('resultados');
    if (filas.length === 0) { cont.innerHTML = '<p class="ayuda">No hay comprobantes en ese rango.</p>'; return; }
    const chip = (e) => { const x = ESTADOS[e] || ESTADOS.pendiente; return `<span class="estado ${x.clase}">${e}</span>`; };
    cont.innerHTML = `
      <div class="lista-movil">
        ${filas.map((f) => `
          <div class="comp-fila" data-id="${f.id}">
            <div>
              <div class="num">${f.serie}-${f.correlativo} ${f.tipo === '01' ? '· Factura' : '· Boleta'}</div>
              <div class="cli">${esc(f.cliente_nombre)} · ${f.fecha_emision}</div>
            </div>
            <div class="imp">${S(f.total)}<br>${chip(f.estado)}</div>
          </div>`).join('')}
      </div>
      <table class="lista-pc">
        <thead><tr><th>Número</th><th>Tipo</th><th>Fecha</th><th>Cliente</th><th>Doc.</th><th>Estado</th><th style="text-align:right">Total</th></tr></thead>
        <tbody>
          ${filas.map((f) => `
            <tr data-id="${f.id}">
              <td><b>${f.serie}-${f.correlativo}</b></td>
              <td>${f.tipo === '01' ? 'Factura' : 'Boleta'}</td>
              <td>${f.fecha_emision}</td>
              <td>${esc(f.cliente_nombre)}</td>
              <td>${esc(f.cliente_num_doc)}</td>
              <td>${chip(f.estado)}</td>
              <td class="imp">${S(f.total)}</td>
            </tr>`).join('')}
        </tbody>
      </table>`;
    cont.querySelectorAll('[data-id]').forEach((el) => {
      el.onclick = () => { location.hash = `#ticket/${el.dataset.id}`; };
    });
  };
  document.getElementById('buscar').onclick = cargar;
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
    </div>`;

  const calcular = async () => {
    const desde = document.getElementById('desde').value;
    const hasta = document.getElementById('hasta').value;
    const filas = await api(`/api/comprobantes?desde=${desde}&hasta=${hasta}`);
    const suma = (fn) => filas.reduce((a, f) => a + fn(f), 0);
    const totalVentas = suma((f) => Number(f.total));
    const igv = suma((f) => Number(f.total_igv || 0));
    document.getElementById('resumen').innerHTML = `
      <div class="total-grande" style="text-align:left">Ventas: ${S(totalVentas)}</div>
      <p>${filas.length} comprobantes · IGV: ${S(igv)} ·
        Pendientes de envío: ${filas.filter((f) => f.estado === 'pendiente').length} ·
        Rechazados: ${filas.filter((f) => f.estado === 'rechazado').length}</p>`;
  };
  document.getElementById('calcular').onclick = calcular;
  document.getElementById('descargar').onclick = () => {
    const desde = document.getElementById('desde').value;
    const hasta = document.getElementById('hasta').value;
    location.href = `/api/export.csv?desde=${desde}&hasta=${hasta}&clave=${encodeURIComponent(clave())}`;
  };
  await calcular();
}

/* ---------- Enrutador ---------- */

async function enrutar() {
  const hash = location.hash || '#home';
  if (!clave() && hash !== '#login') { location.hash = '#login'; return; }

  $cabecera.hidden = hash === '#login';
  document.querySelectorAll('#cabecera nav a').forEach((a) => {
    a.classList.toggle('activa', hash.startsWith(a.getAttribute('href')));
  });
  $app.classList.remove('cargando');

  try {
    if (hash === '#login') vistaLogin();
    else if (hash === '#home') vistaHome();
    else if (hash.startsWith('#emitir/')) vistaEmitir(hash.split('/')[1]);
    else if (hash.startsWith('#ticket/')) await vistaTicket(hash.split('/')[1]);
    else if (hash === '#lista') await vistaLista();
    else if (hash === '#reportes') await vistaReportes();
    else vistaHome();
  } catch (e) {
    if (e.message !== 'Clave incorrecta') {
      $app.innerHTML = `<div class="tarjeta"><p class="error">${esc(e.message)}</p><a class="boton boton-suave" href="#home">Volver</a></div>`;
    }
  }
}

window.addEventListener('hashchange', enrutar);
enrutar();

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(() => {});
}
