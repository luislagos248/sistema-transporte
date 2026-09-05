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
      <p class="error" id="err" hidden>Clave incorrecta, intente de nuevo.</p>
      </div>
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

async function vistaHome() {
  $app.innerHTML = `
    <div class="resumen-dia">
      <div class="etiqueta">Ventas de hoy</div>
      <div class="monto" id="ventasHoy">S/ —</div>
      <div class="detalle" id="detalleHoy">Cargando…</div>
    </div>
    <a class="boton boton-grande" href="#emitir" style="display:block;margin-bottom:16px">🧾 EMITIR BOLETA O FACTURA</a>
    <div class="accesos accesos-3">
      <a class="acceso" href="#importar"><span class="icono">📥</span>Importar mensaje</a>
      <a class="acceso" href="#lista"><span class="icono">📋</span>Comprobantes</a>
      <a class="acceso" href="#reportes"><span class="icono">📊</span>Reportes</a>
    </div>`;

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

/* ---------- Importar mensaje de WhatsApp ---------- */

async function vistaImportar() {
  const compartido = sessionStorage.getItem('importar:texto') || '';
  sessionStorage.removeItem('importar:texto');

  $app.innerHTML = `
    <h1>📥 Importar mensaje</h1>
    <div class="dos-columnas">
    <div>
    <div class="tarjeta">
      <label for="txtMsg">Mensaje de WhatsApp o nota</label>
      <textarea id="txtMsg" rows="7" style="width:100%;font:inherit;padding:14px;border:1.5px solid transparent;border-radius:12px;background:var(--campo);resize:vertical">${esc(compartido)}</textarea>
      <p class="ayuda">Desde WhatsApp: mantenga presionado el mensaje → Compartir → <b>Turismo Irazola</b> (con la app instalada). También puede copiar y pegar aquí. Si mandaron los datos en varios mensajes, péguelos todos juntos.</p>
      <br>
      <button class="boton-grande" id="analizar">🔍 Analizar mensaje</button>
    </div>
    </div>
    <div id="resultado"></div>
    </div>`;

  const $res = document.getElementById('resultado');

  const analizar = async () => {
    const texto = document.getElementById('txtMsg').value.trim();
    if (!texto) { $res.innerHTML = '<div class="tarjeta"><p class="error">Pegue o comparta primero el mensaje.</p></div>'; return; }
    $res.innerHTML = '<div class="tarjeta"><p class="ayuda">Analizando…</p></div>';
    let a;
    try { a = await api('/api/analizar-mensaje', { method: 'POST', body: JSON.stringify({ texto }) }); }
    catch (e) { $res.innerHTML = `<div class="tarjeta"><p class="error">${esc(e.message)}</p></div>`; return; }

    const falta = (campo) => a.faltantes.includes(campo);
    const marca = (cond) => (cond ? 'style="box-shadow:0 0 0 2.5px var(--ambar)"' : '');
    const tipoCpe = a.tipoDoc === '6' ? 'factura' : 'boleta';
    const reparto = a.reparto || { cantidad: a.cantidad || 1, precioUnitarioCentimos: null };

    $res.innerHTML = `
    <div class="tarjeta">
      <h2 style="margin-top:0">Datos detectados</h2>
      ${a.faltantes.length ? `<p class="error">Falta confirmar: ${a.faltantes.map((f) => ({ documento: 'el DNI/RUC', monto: 'el monto', descripcion: 'la descripción' })[f] || f).join(', ')}. Pregunte al cliente y complete abajo.</p>` : '<p class="ayuda">Revise que todo esté correcto y emita.</p>'}
      ${a.avisos.map((v) => `<p class="ayuda">ℹ️ ${esc(v)}</p>`).join('')}

      <div class="conmutador" id="impTipo">
        <button data-v="boleta" class="${tipoCpe === 'boleta' ? 'activa' : ''}">BOLETA</button>
        <button data-v="factura" class="${tipoCpe === 'factura' ? 'activa' : ''}">FACTURA</button>
      </div>
      <div class="conmutador" id="impRubro" style="margin-top:8px">
        <button data-v="transporte" class="activa">TRANSPORTE</button>
        <button data-v="hospedaje">HOSPEDAJE</button>
      </div>

      <label>DNI o RUC del cliente</label>
      <input id="impDoc" inputmode="numeric" maxlength="11" value="${esc(a.numDoc || '')}" ${marca(falta('documento'))}>
      <label>Nombre / Razón social</label>
      <input id="impNombre" value="${esc(a.nombre || '')}" placeholder="Se busca solo al poner el documento">
      <p class="ayuda" id="impBusqueda"></p>

      <label>Descripción</label>
      <input id="impDesc" value="${esc(a.descripcion || '')}" ${marca(falta('descripcion'))}>
      <div class="fila">
        <div><label>Cantidad</label><input id="impCant" inputmode="numeric" value="${reparto.cantidad}"></div>
        <div><label>Monto TOTAL (S/)</label><input id="impMonto" class="monto" inputmode="decimal" value="${a.montoTotalCentimos ? (a.montoTotalCentimos / 100).toFixed(2) : ''}" ${marca(falta('monto'))}></div>
      </div>
      <label><input type="checkbox" id="impIgv" style="width:auto"> Operación con IGV (18%)</label>
      <p class="error" id="impErr" hidden></p>
      <br>
      <button class="boton-grande" id="impEmitir">EMITIR</button>
    </div>`;

    const seg = (id) => {
      document.querySelectorAll(`#${id} button`).forEach((b) => {
        b.onclick = () => document.querySelectorAll(`#${id} button`).forEach((x) => x.classList.toggle('activa', x === b));
      });
    };
    seg('impTipo');
    seg('impRubro');

    // Consulta automática del nombre por RUC/DNI (con caché en el servidor).
    const buscarNombre = async () => {
      const doc = document.getElementById('impDoc').value.trim();
      if (!/^\d{8}$|^\d{11}$/.test(doc)) return;
      const $b = document.getElementById('impBusqueda');
      $b.textContent = 'Buscando nombre…';
      try {
        const r = await api(`/api/consulta-doc?numero=${doc}`);
        document.getElementById('impNombre').value = r.nombre;
        $b.textContent = `✔ Encontrado (${r.fuente === 'cache' ? 'cliente conocido' : 'consulta en línea'})`;
        document.querySelectorAll('#impTipo button').forEach((x) => x.classList.toggle('activa', x.dataset.v === (doc.length === 11 ? 'factura' : 'boleta')));
      } catch {
        $b.textContent = 'No se encontró: escriba el nombre manualmente.';
      }
    };
    document.getElementById('impDoc').addEventListener('change', buscarNombre);
    if (a.numDoc && !a.nombre) buscarNombre();

    document.getElementById('impEmitir').onclick = async (ev) => {
      const boton = ev.target;
      const $err = document.getElementById('impErr');
      $err.hidden = true;
      try {
        const tipo = document.querySelector('#impTipo button.activa').dataset.v;
        const rubro = document.querySelector('#impRubro button.activa').dataset.v;
        const doc = document.getElementById('impDoc').value.trim();
        const nombre = document.getElementById('impNombre').value.trim();
        const descr = document.getElementById('impDesc').value.trim();
        const cantidad = Math.max(1, parseInt(document.getElementById('impCant').value || '1', 10));
        const montoTotal = montoACentimos(document.getElementById('impMonto').value);
        if (!descr) throw new Error('Falta la descripción');
        if (montoTotal === null || montoTotal <= 0) throw new Error('Falta el monto (pregunte al cliente)');
        let cliente;
        if (tipo === 'factura') {
          if (!/^\d{11}$/.test(doc)) throw new Error('La factura necesita RUC de 11 dígitos');
          if (!nombre) throw new Error('Falta la razón social');
          cliente = { tipoDoc: '6', numDoc: doc, nombre };
        } else if (/^\d{8}$/.test(doc)) {
          cliente = { tipoDoc: '1', numDoc: doc, nombre: nombre || `CLIENTE DNI ${doc}` };
        } else {
          cliente = { tipoDoc: '0', numDoc: '-', nombre: 'CLIENTES VARIOS' };
        }
        // Reparto exacto: si el total no divide entre la cantidad, va 1 ítem por el total.
        let cant = cantidad, unit = montoTotal;
        if (cantidad > 1 && montoTotal % cantidad === 0) unit = montoTotal / cantidad;
        else cant = 1;
        boton.disabled = true;
        boton.textContent = 'Emitiendo…';
        const res = await api('/api/comprobantes', {
          method: 'POST',
          body: JSON.stringify({
            serie: SERIES[rubro][tipo],
            cliente,
            items: [{ descripcion: descr, montoCentimos: unit, cantidad: cant, afectacion: document.getElementById('impIgv').checked ? '10' : '20' }],
          }),
        });
        location.hash = `#ticket/${res.id}`;
      } catch (e) {
        $err.textContent = e.message;
        $err.hidden = false;
        boton.disabled = false;
        boton.textContent = 'EMITIR';
      }
    };
  };

  document.getElementById('analizar').onclick = analizar;
  if (compartido) analizar();
}

/* ---------- Guía de Remisión Transportista ---------- */

const ESTADOS_GUIA = {
  pendiente: { clase: 'pendiente', texto: 'Emitida ✔ · envío a SUNAT en curso' },
  enviada:   { clase: 'pendiente', texto: 'Enviada · esperando respuesta de SUNAT' },
  aceptada:  { clase: 'aceptado',  texto: 'Aceptada por SUNAT' },
  rechazada: { clase: 'rechazado', texto: 'Rechazada — revisar' },
};

async function vistaGuiaNueva() {
  const rec = await api('/api/guias/recursos');
  const hoy = hoyLima();
  const emp = rec.empresa;

  $app.innerHTML = `
    <h1>🚚 Guía de carga (GRE Transportista)</h1>
    <div class="dos-columnas">
    <div>
    <div class="tarjeta">
      <h2 style="margin-top:0">Remitente (quien envía)</h2>
      <div class="fila">
        <div><label>RUC o DNI</label><input id="remDoc" inputmode="numeric" maxlength="11"></div>
        <div><label>Nombre / Razón social</label><input id="remNombre"></div>
      </div>
      <h2>Destinatario (quien recibe)</h2>
      <div class="fila">
        <div><label>RUC o DNI</label><input id="desDoc" inputmode="numeric" maxlength="11"></div>
        <div><label>Nombre</label><input id="desNombre"></div>
      </div>
      <h2>Carga</h2>
      <label>Descripción de los bienes</label>
      <input id="bienDesc" placeholder="Ej: 2 cajas de repuestos">
      <div class="fila">
        <div><label>Cantidad (bultos)</label><input id="bienCant" inputmode="numeric" value="1"></div>
        <div><label>Peso total (kg)</label><input id="pesoKg" inputmode="decimal" placeholder="10"></div>
      </div>
    </div>
    </div>
    <div>
    <div class="tarjeta">
      <h2 style="margin-top:0">Traslado</h2>
      <div class="fila">
        <div><label>Placa del vehículo</label><input id="placa" list="dlPlacas" style="text-transform:uppercase"></div>
        <div><label>Fecha de traslado</label><input id="fecTraslado" type="date" value="${hoy}"></div>
      </div>
      <datalist id="dlPlacas">${rec.vehiculos.map((v) => `<option value="${esc(v.placa)}">`).join('')}</datalist>
      <label>Conductor (DNI)</label>
      <input id="conDoc" list="dlConductores" inputmode="numeric" maxlength="8">
      <datalist id="dlConductores">${rec.conductores.map((x) => `<option value="${esc(x.num_doc)}">${esc(x.nombres)} ${esc(x.apellidos)}</option>`).join('')}</datalist>
      <div class="fila">
        <div><label>Nombres</label><input id="conNombres"></div>
        <div><label>Apellidos</label><input id="conApellidos"></div>
      </div>
      <label>Licencia de conducir</label>
      <input id="conLicencia" style="text-transform:uppercase">
      <h2>Ruta</h2>
      <label>Punto de partida (ubigeo y dirección)</label>
      <div class="fila">
        <div style="flex:0 0 110px"><input id="parUbigeo" inputmode="numeric" maxlength="6" value="${esc(emp.ubigeo)}"></div>
        <div><input id="parDir" value="${esc(emp.direccion)}"></div>
      </div>
      <label>Punto de llegada (ubigeo y dirección)</label>
      <div class="fila">
        <div style="flex:0 0 110px"><input id="lleUbigeo" inputmode="numeric" maxlength="6" placeholder="250101"></div>
        <div><input id="lleDir" placeholder="Dirección de entrega"></div>
      </div>
      <p class="ayuda">El ubigeo es el código de 6 dígitos del distrito (ej. 250101 Callería). Los usados quedan guardados como sugerencia.</p>
      <p class="error" id="errG" hidden></p>
      <button class="boton-grande" id="emitirGuia">EMITIR GUÍA</button>
    </div>
    </div>
    </div>`;

  // Autocompletar conductor al elegir un DNI conocido.
  document.getElementById('conDoc').addEventListener('change', (ev) => {
    const c0 = rec.conductores.find((x) => x.num_doc === ev.target.value);
    if (c0) {
      document.getElementById('conNombres').value = c0.nombres;
      document.getElementById('conApellidos').value = c0.apellidos;
      document.getElementById('conLicencia').value = c0.licencia;
    }
  });

  // Recordar la última llegada usada.
  try {
    const ult = JSON.parse(localStorage.getItem('gre:llegada') || 'null');
    if (ult) { document.getElementById('lleUbigeo').value = ult.ubigeo; document.getElementById('lleDir').value = ult.direccion; }
  } catch { /* sin valor guardado */ }

  document.getElementById('emitirGuia').onclick = async (ev) => {
    const boton = ev.target;
    const $e = document.getElementById('errG');
    $e.hidden = true;
    const v = (id) => document.getElementById(id).value.trim();
    try {
      const docParte = (doc, nombre, quien) => {
        if (!/^\d{8}$|^\d{11}$/.test(doc)) throw new Error(`El documento del ${quien} debe ser DNI (8) o RUC (11)`);
        if (!nombre) throw new Error(`Falta el nombre del ${quien}`);
        return { tipoDoc: doc.length === 11 ? '6' : '1', numDoc: doc, nombre };
      };
      const cuerpo = {
        remitente: docParte(v('remDoc'), v('remNombre'), 'remitente'),
        destinatario: docParte(v('desDoc'), v('desNombre'), 'destinatario'),
        bienes: [{ descripcion: v('bienDesc'), cantidad: Number(v('bienCant') || '1') }],
        pesoKg: Number(v('pesoKg').replace(',', '.')),
        placa: v('placa').toUpperCase(),
        conductor: { numDoc: v('conDoc'), nombres: v('conNombres'), apellidos: v('conApellidos'), licencia: v('conLicencia').toUpperCase() },
        partida: { ubigeo: v('parUbigeo'), direccion: v('parDir') },
        llegada: { ubigeo: v('lleUbigeo'), direccion: v('lleDir') },
        fechaTraslado: v('fecTraslado'),
      };
      if (!cuerpo.bienes[0].descripcion) throw new Error('Describa los bienes a transportar');
      if (!(cuerpo.pesoKg > 0)) throw new Error('Indique el peso total en kilos');
      boton.disabled = true;
      boton.textContent = 'Emitiendo…';
      await api('/api/guias', { method: 'POST', body: JSON.stringify(cuerpo) });
      localStorage.setItem('gre:llegada', JSON.stringify(cuerpo.llegada));
      location.hash = '#guias';
    } catch (e) {
      $e.textContent = e.message;
      $e.hidden = false;
      boton.disabled = false;
      boton.textContent = 'EMITIR GUÍA';
    }
  };
}

async function vistaGuias() {
  const filas = await api('/api/guias');
  const chip = (e) => { const x = ESTADOS_GUIA[e] || ESTADOS_GUIA.pendiente; return `<span class="estado ${x.clase}">${e}</span>`; };
  $app.innerHTML = `
    <h1>🗒️ Guías de remisión emitidas</h1>
    <p class="no-imprimir"><a class="boton" href="#guia">🚚 Nueva guía</a></p>
    ${filas.length === 0 ? '<p class="ayuda">Aún no hay guías.</p>' : `
    <div class="lista-movil">
      ${filas.map((f) => `
        <div class="comp-fila">
          <div>
            <div class="num">${f.serie}-${f.correlativo} · ${esc(f.placa)}</div>
            <div class="cli">${esc(f.remitente_nombre)} → ${esc(f.destinatario_nombre)}</div>
            <div class="cli">${f.fecha_traslado} · ${f.peso_kg} kg</div>
            ${f.estado === 'rechazada' && f.cdr_descripcion ? `<div class="cli" style="color:var(--rojo)">${esc(f.cdr_descripcion)}</div>` : ''}
          </div>
          <div class="imp">${chip(f.estado)}</div>
        </div>`).join('')}
    </div>
    <table class="lista-pc">
      <thead><tr><th>Número</th><th>Traslado</th><th>Remitente</th><th>Destinatario</th><th>Placa</th><th>Peso</th><th>Estado</th></tr></thead>
      <tbody>
        ${filas.map((f) => `
          <tr>
            <td><b>${f.serie}-${f.correlativo}</b></td>
            <td>${f.fecha_traslado}</td>
            <td>${esc(f.remitente_nombre)}</td>
            <td>${esc(f.destinatario_nombre)}</td>
            <td>${esc(f.placa)}</td>
            <td>${f.peso_kg} kg</td>
            <td>${chip(f.estado)}${f.estado === 'rechazada' && f.cdr_descripcion ? `<div class="ayuda">${esc(f.cdr_descripcion)}</div>` : ''}</td>
          </tr>`).join('')}
      </tbody>
    </table>`}`;
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

async function vistaEmitir() {
  const items = []; // { servicio, descripcion, cantidad, precioCentimos }
  let tipoDoc = 'boleta';
  let servicio = 'pasaje';
  const sugerenciasApi = {}; // caché por servicio

  $app.innerHTML = `
    <h1>Emitir</h1>
    <div class="dos-columnas">
    <div>
    <div class="tarjeta">
      <div class="conmutador" id="emTipo">
        <button data-v="boleta" class="activa">BOLETA</button>
        <button data-v="factura">FACTURA</button>
      </div>
      <h2>¿Para quién?</h2>
      <div class="sugerencias" id="emFrecuentes"></div>
      <div class="fila" style="margin-top:8px">
        <input id="emDoc" inputmode="numeric" maxlength="11" placeholder="DNI o RUC">
        <button class="boton-suave" id="emVarios" style="flex:0 0 auto">Al paso</button>
      </div>
      <input id="emNombre" placeholder="El nombre se busca solo" style="margin-top:8px">
      <p class="ayuda" id="emBusqueda"></p>
    </div>

    <div class="tarjeta">
      <h2 style="margin-top:0">¿Qué le cobramos?</h2>
      <div class="conmutador" id="emServicio">
        <button data-v="pasaje" class="activa">🚌 Pasaje</button>
        <button data-v="encomienda">📦 Encomienda</button>
        <button data-v="hospedaje">🛏️ Hospedaje</button>
      </div>
      <div id="emZona"></div>
    </div>
    </div>

    <div>
    <div class="tarjeta">
      <h2 style="margin-top:0">Resumen</h2>
      <div id="emLineas"><p class="ayuda">Elija el servicio, toque una opción y ponga el precio.</p></div>
      <div class="total-grande" id="emTotal"></div>
      <p class="error" id="emErr" hidden></p>
      <button class="boton-grande" id="emEmitir">EMITIR</button>
    </div>
    </div>
    </div>`;

  const $ = (id) => document.getElementById(id);

  // --- Tipo de comprobante ---
  document.querySelectorAll('#emTipo button').forEach((b) => {
    b.onclick = () => {
      tipoDoc = b.dataset.v;
      document.querySelectorAll('#emTipo button').forEach((x) => x.classList.toggle('activa', x === b));
      $('emVarios').style.display = tipoDoc === 'factura' ? 'none' : '';
    };
  });

  // --- Cliente: frecuentes con un toque + búsqueda automática ---
  const elegirCliente = (numDoc, nombre) => {
    $('emDoc').value = numDoc;
    $('emNombre').value = nombre;
    $('emBusqueda').textContent = '✔ Cliente elegido';
    if (numDoc.length === 11) {
      tipoDoc = 'factura';
      document.querySelectorAll('#emTipo button').forEach((x) => x.classList.toggle('activa', x.dataset.v === 'factura'));
    }
  };
  api('/api/clientes-frecuentes').then((lista) => {
    $('emFrecuentes').innerHTML = lista
      .map((f) => `<button type="button" data-doc="${esc(f.numDoc)}" data-nom="${esc(f.nombre)}">👤 ${esc(f.nombre.split(' ').slice(0, 3).join(' '))}</button>`)
      .join('');
    document.querySelectorAll('#emFrecuentes button').forEach((b) => {
      b.onclick = () => elegirCliente(b.dataset.doc, b.dataset.nom);
    });
  }).catch(() => {});
  $('emDoc').addEventListener('change', async () => {
    const doc = $('emDoc').value.trim();
    if (!/^\d{8}$|^\d{11}$/.test(doc)) return;
    $('emBusqueda').textContent = 'Buscando nombre…';
    try {
      const r = await api(`/api/consulta-doc?numero=${doc}`);
      $('emNombre').value = r.nombre;
      $('emBusqueda').textContent = `✔ Encontrado (${r.fuente === 'cache' ? 'cliente conocido' : 'consulta en línea'})`;
      if (doc.length === 11) {
        tipoDoc = 'factura';
        document.querySelectorAll('#emTipo button').forEach((x) => x.classList.toggle('activa', x.dataset.v === 'factura'));
      }
    } catch {
      $('emBusqueda').textContent = 'No se encontró: escriba el nombre.';
    }
  });
  $('emVarios').onclick = () => {
    $('emDoc').value = '';
    $('emNombre').value = '';
    $('emBusqueda').textContent = '✔ Se emitirá a CLIENTES VARIOS (sin documento)';
  };

  // --- Zona del servicio: chips + cantidad + precio (sin teclear letras) ---
  const pintaZona = async () => {
    const cfg = SERVICIOS[servicio];
    const esHosp = servicio === 'hospedaje';
    $('emZona').innerHTML = `
      <div class="sugerencias" id="emChips" style="margin-top:12px"></div>
      <label>Detalle</label>
      <div class="fila">
        <input id="emDesc" placeholder="Toque una opción o el micrófono">
        ${RecVoz ? '<button type="button" class="boton-suave mic" id="emMic" title="Dictar por voz">🎤</button>' : ''}
      </div>
      <div id="emVoz" hidden style="background:var(--acento-tinte);border-radius:12px;padding:12px 14px;margin-top:8px">
        <p style="margin:0 0 8px" id="emVozTexto"></p>
        <div class="fila">
          <button type="button" id="emVozOk">✔ Está bien</button>
          <button type="button" class="boton-linea" id="emVozRepetir">🎤 Repetir</button>
        </div>
      </div>
      ${esHosp ? `
        <button class="boton-suave" id="emBtnFechas" style="margin-top:8px;padding:8px 14px;font-size:.85rem">📅 Agregar fechas (opcional)</button>
        <div class="fila" id="emFechas" hidden style="margin-top:8px">
          <div><label>Desde</label><input type="date" id="emDesde"></div>
          <div><label>Hasta</label><input type="date" id="emHasta"></div>
        </div>` : ''}
      <div class="fila" style="margin-top:4px">
        <div>
          <label>${cfg.etiquetaCant}</label>
          <div class="stepper">
            <button type="button" id="emMenos">−</button>
            <input id="emCant" inputmode="numeric" value="1">
            <button type="button" id="emMas">+</button>
          </div>
        </div>
        <div>
          <label>${cfg.etiquetaPrecio}</label>
          <input id="emPrecio" class="monto" inputmode="decimal" placeholder="0.00">
        </div>
      </div>
      <p class="ayuda" id="emSubtotal"></p>
      <button class="boton-suave" id="emAgregar" style="width:100%;margin-top:8px">➕ Agregar a la lista</button>`;

    // Chips: historial propio + opciones fijas.
    if (!sugerenciasApi[servicio]) {
      try { sugerenciasApi[servicio] = (await api(`/api/sugerencias?tipo=${servicio}`)).map((x) => x.descripcion); }
      catch { sugerenciasApi[servicio] = []; }
    }
    const chips = [...new Set([...sugerenciasApi[servicio], ...cfg.semillas])].slice(0, 6);
    $('emChips').innerHTML = chips.map((t) => `<button type="button">${esc(t)}</button>`).join('');
    document.querySelectorAll('#emChips button').forEach((b) => {
      b.onclick = () => {
        $('emDesc').value = b.textContent;
        document.querySelectorAll('#emChips button').forEach((x) => x.classList.toggle('elegida', x === b));
        $('emPrecio').focus();
      };
    });

    const subtotal = () => {
      const n = Math.max(1, parseInt($('emCant').value || '1', 10));
      const p = montoACentimos($('emPrecio').value);
      $('emSubtotal').textContent = p ? `Subtotal: ${n} × ${S(p)} = ${S(n * p)}` : '';
    };
    $('emMenos').onclick = () => { $('emCant').value = Math.max(1, parseInt($('emCant').value || '1', 10) - 1); subtotal(); };
    $('emMas').onclick = () => { $('emCant').value = Math.min(200, parseInt($('emCant').value || '1', 10) + 1); subtotal(); };
    $('emCant').addEventListener('input', subtotal);
    $('emPrecio').addEventListener('input', subtotal);

    // --- Dictado por voz: habla, confirma lo entendido, y se llena solo ---
    if (RecVoz && $('emMic')) {
      let ultimoTexto = '';
      const escuchar = () => {
        const rec = new RecVoz();
        rec.lang = 'es-PE';
        rec.interimResults = false;
        rec.maxAlternatives = 1;
        $('emMic').classList.add('grabando');
        $('emMic').textContent = '🔴';
        $('emVoz').hidden = true;
        rec.onresult = (ev) => {
          ultimoTexto = ev.results[0][0].transcript.trim();
          $('emVozTexto').innerHTML = `Le entendí: <b>«${esc(ultimoTexto)}»</b>`;
          $('emVoz').hidden = false;
        };
        rec.onerror = () => {
          $('emVozTexto').innerHTML = 'No le escuché bien. Toque 🎤 Repetir y hable un poquito más despacio.';
          $('emVoz').hidden = false;
        };
        rec.onend = () => {
          $('emMic').classList.remove('grabando');
          $('emMic').textContent = '🎤';
        };
        rec.start();
      };
      $('emMic').onclick = escuchar;
      $('emVozRepetir').onclick = escuchar;
      $('emVozOk').onclick = async () => {
        $('emVoz').hidden = true;
        if (!ultimoTexto) return;
        try {
          const a = await api('/api/analizar-mensaje', { method: 'POST', body: JSON.stringify({ texto: ultimoTexto }) });
          $('emDesc').value = a.descripcion || ultimoTexto;
          if (a.reparto) {
            $('emCant').value = a.reparto.cantidad;
            $('emPrecio').value = (a.reparto.precioUnitarioCentimos / 100).toFixed(2);
          } else if (a.cantidad > 1) {
            $('emCant').value = a.cantidad;
          }
          if (esHosp && a.fechas) {
            $('emFechas').hidden = false;
            $('emBtnFechas').hidden = true;
            $('emDesde').value = a.fechas.desde;
            $('emHasta').value = a.fechas.hasta;
            $('emCant').value = a.fechas.dias;
          }
          $('emCant').dispatchEvent(new Event('input'));
        } catch {
          $('emDesc').value = ultimoTexto;
        }
      };
    }

    if (esHosp) {
      $('emBtnFechas').onclick = () => { $('emFechas').hidden = false; $('emBtnFechas').hidden = true; };
      const fechas = () => {
        const d1 = $('emDesde').value, d2 = $('emHasta').value;
        if (!d1 || !d2 || d2 <= d1) return;
        const dias = Math.round((new Date(d2) - new Date(d1)) / 86400000);
        $('emCant').value = dias;
        const fmtF = (x) => { const [, m, d] = x.split('-'); return `${d}/${m}`; };
        const base = ($('emDesc').value || 'Alquiler de habitación').replace(/ del \d{2}\/\d{2} al \d{2}\/\d{2}$/, '');
        $('emDesc').value = `${base} del ${fmtF(d1)} al ${fmtF(d2)}`;
        subtotal();
      };
      $('emDesde').addEventListener('change', fechas);
      $('emHasta').addEventListener('change', fechas);
    }

    $('emAgregar').onclick = () => {
      const it = tomarItem();
      if (!it) return;
      items.push(it);
      $('emDesc').value = '';
      $('emPrecio').value = '';
      $('emCant').value = '1';
      $('emSubtotal').textContent = '';
      document.querySelectorAll('#emChips button').forEach((x) => x.classList.remove('elegida'));
      pintaLineas();
    };
  };

  const tomarItem = () => {
    const $err = $('emErr');
    $err.hidden = true;
    const desc = $('emDesc').value.trim();
    const precio = montoACentimos($('emPrecio').value);
    const cant = Math.max(1, parseInt($('emCant').value || '1', 10));
    if (!desc && precio === null) return null;
    if (!desc) { $err.textContent = 'Toque una opción del detalle'; $err.hidden = false; return null; }
    if (precio === null || precio <= 0) { $err.textContent = 'Ponga el precio'; $err.hidden = false; return null; }
    return { servicio, descripcion: desc, cantidad: cant, precioCentimos: precio };
  };

  const pintaLineas = () => {
    const cont = $('emLineas');
    if (!items.length) {
      cont.innerHTML = '<p class="ayuda">Elija el servicio, toque una opción y ponga el precio.</p>';
    } else {
      cont.innerHTML = items.map((it, i) => `
        <div class="item-linea">
          <div>${esc(it.descripcion)}${it.cantidad > 1 ? ` x${it.cantidad}` : ''}</div>
          <div><b>${S(it.cantidad * it.precioCentimos)}</b> <button class="quitar" data-i="${i}">✕</button></div>
        </div>`).join('');
      cont.querySelectorAll('.quitar').forEach((b) => {
        b.onclick = () => { items.splice(Number(b.dataset.i), 1); pintaLineas(); };
      });
    }
    const suma = items.reduce((a, it) => a + it.cantidad * it.precioCentimos, 0);
    $('emTotal').textContent = suma ? `Total: ${S(suma)}` : '';
  };

  document.querySelectorAll('#emServicio button').forEach((b) => {
    b.onclick = () => {
      servicio = b.dataset.v;
      document.querySelectorAll('#emServicio button').forEach((x) => x.classList.toggle('activa', x === b));
      pintaZona();
    };
  });

  $('emEmitir').onclick = async (ev) => {
    const boton = ev.target;
    const $err = $('emErr');
    $err.hidden = true;
    try {
      const suelto = tomarItem();
      const todos = suelto ? [...items, suelto] : [...items];
      if (!todos.length) throw new Error('Agregue al menos un servicio');
      const rubros = new Set(todos.map((it) => SERVICIOS[it.servicio].rubro));
      if (rubros.size > 1) throw new Error('El hospedaje va en un comprobante aparte del transporte (series distintas)');
      const rubro = [...rubros][0];

      const doc = $('emDoc').value.trim();
      const nombre = $('emNombre').value.trim();
      let cliente;
      if (tipoDoc === 'factura') {
        if (!/^\d{11}$/.test(doc)) throw new Error('La factura necesita el RUC (11 dígitos)');
        if (!nombre) throw new Error('Falta la razón social (se busca sola al poner el RUC)');
        cliente = { tipoDoc: '6', numDoc: doc, nombre };
      } else if (/^\d{8}$/.test(doc)) {
        cliente = { tipoDoc: '1', numDoc: doc, nombre: nombre || `CLIENTE DNI ${doc}` };
      } else if (doc) {
        throw new Error('El documento debe ser DNI (8 dígitos) o RUC (11)');
      } else {
        cliente = { tipoDoc: '0', numDoc: '-', nombre: 'CLIENTES VARIOS' };
      }

      boton.disabled = true;
      boton.textContent = 'Emitiendo…';
      const res = await api('/api/comprobantes', {
        method: 'POST',
        body: JSON.stringify({
          serie: SERIES[rubro][tipoDoc],
          cliente,
          items: todos.map((it) => ({ descripcion: it.descripcion, montoCentimos: it.precioCentimos, cantidad: it.cantidad })),
        }),
      });
      location.hash = `#ticket/${res.id}`;
    } catch (e) {
      $err.textContent = e.message;
      $err.hidden = false;
      boton.disabled = false;
      boton.textContent = 'EMITIR';
    }
  };

  pintaZona();
}

/** Genera el comprobante como PDF (formato ticket de 80 mm) con su QR. */
function generarPdfTicket(d, emp) {
  const { jsPDF } = window.jspdf;
  const W = 80, M = 6, ancho = W - 2 * M;
  const items = d.items || [];
  const titulo = d.tipo === '01' ? 'FACTURA ELECTRÓNICA' : d.tipo === '07' ? 'NOTA DE CRÉDITO ELECTRÓNICA' : 'BOLETA DE VENTA ELECTRÓNICA';
  const doc = new jsPDF({ unit: 'mm', format: [W, 150 + items.length * 8] });
  let y = 10;

  const centro = (txt, size, negrita) => {
    doc.setFontSize(size);
    doc.setFont('helvetica', negrita ? 'bold' : 'normal');
    const lineas = doc.splitTextToSize(txt, ancho);
    doc.text(lineas, W / 2, y, { align: 'center' });
    y += lineas.length * size * 0.42 + 1.2;
  };
  const parejas = (izq, der, size, negrita) => {
    doc.setFontSize(size);
    doc.setFont('helvetica', negrita ? 'bold' : 'normal');
    const lineasIzq = doc.splitTextToSize(izq, ancho - 20);
    doc.text(lineasIzq, M, y);
    doc.text(der, W - M, y, { align: 'right' });
    y += lineasIzq.length * size * 0.42 + 1.2;
  };
  const separador = () => {
    doc.setDrawColor(160);
    doc.setLineDashPattern([1, 1], 0);
    doc.line(M, y, W - M, y);
    doc.setLineDashPattern([], 0);
    y += 3.2;
  };

  centro(emp.razonSocial, 11, true);
  centro(`RUC ${emp.ruc}`, 9, false);
  centro(`${emp.direccion} · ${emp.distrito} - ${emp.departamento}`, 7, false);
  y += 1;
  centro(titulo, 10, true);
  centro(`${d.serie}-${d.correlativo}`, 11, true);
  separador();
  parejas('Fecha:', `${d.fecha_emision} ${d.hora_emision}`, 8, false);
  parejas('Cliente:', '', 8, false);
  centro(d.cliente_nombre, 8, false);
  if (d.cliente_num_doc !== '-') parejas('Doc:', d.cliente_num_doc, 8, false);
  separador();
  for (const it of items) {
    parejas(`${it.descripcion}${it.cantidad !== 1 ? ` x${it.cantidad}` : ''}`, S(Math.round(it.precio_unitario * it.cantidad)), 8, false);
  }
  separador();
  if (Number(d.total_igv)) parejas('IGV 18%:', S(d.total_igv), 8, false);
  parejas('TOTAL:', S(d.total), 11, true);
  centro(d.leyenda, 7, false);
  y += 2;

  // QR reglamentario dibujado en un canvas y pegado como imagen.
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
    doc.addImage(cv.toDataURL('image/png'), 'PNG', (W - 28) / 2, y, 28, 28);
    y += 30;
  } catch { /* sin QR el PDF sigue siendo válido como representación */ }

  centro('Representación impresa del comprobante electrónico.', 6.5, false);
  centro(`Hash: ${d.hash_firma || ''}`, 6.5, false);
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
    const chip = (f) => {
      const e = f.anulado_por ? 'anulado' : f.estado;
      const x = ESTADOS[e] || ESTADOS.pendiente;
      return `<span class="estado ${x.clase}">${e}</span>`;
    };
    cont.innerHTML = `
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
  $navInferior.hidden = hash === '#login';
  document.querySelectorAll('#cabecera nav a, #navInferior a').forEach((a) => {
    a.classList.toggle('activa', hash.startsWith(a.getAttribute('href')));
  });
  $app.classList.remove('cargando');

  try {
    if (hash === '#login') vistaLogin();
    else if (hash === '#home') vistaHome();
    else if (hash.startsWith('#emitir')) await vistaEmitir();
    else if (hash.startsWith('#ticket/')) await vistaTicket(hash.split('/')[1]);
    else if (hash === '#lista') await vistaLista();
    else if (hash === '#importar') await vistaImportar();
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
