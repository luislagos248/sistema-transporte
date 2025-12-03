<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <title>App Chofer – Demo</title>

    <meta name="viewport" content="width=device-width, initial-scale=1">

    {{-- Bootstrap CDN sencillo --}}
    <link
        href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css"
        rel="stylesheet"
    >

    <style>
        body {
            background: #f5f5f5;
        }
        .card {
            margin-bottom: 1rem;
        }
        pre {
            white-space: pre-wrap;
            font-size: 0.8rem;
        }
    </style>
</head>
<body>
<div class="container py-3">
    <h3 class="mb-3">App de Chofer – Demo</h3>

    {{-- 1. Configuración rápida --}}
    <div class="card">
        <div class="card-header">1. Datos del chofer</div>
        <div class="card-body row g-2">
            <div class="col-12 col-md-4">
                <label class="form-label">Chofer</label>
                <select id="driver_id" class="form-select">
                    @foreach($drivers as $driver)
                        <option value="{{ $driver->id }}">
                            {{ $driver->name }} (ID: {{ $driver->id }})
                        </option>
                    @endforeach
                </select>
            </div>

            <div class="col-12 col-md-4">
                <label class="form-label">Sede donde estoy</label>
                <select id="branch_id" class="form-select">
                    @foreach($branches as $branch)
                        <option value="{{ $branch->id }}">
                            {{ $branch->name }} ({{ $branch->code }})
                        </option>
                    @endforeach
                </select>
            </div>

            <div class="col-12 col-md-4">
                <label class="form-label">Vehículo</label>
                <select id="vehicle_id" class="form-select">
                    @foreach($vehicles as $vehicle)
                        <option value="{{ $vehicle->id }}">
                            {{ $vehicle->plate }} ({{ $vehicle->capacity_seats }} asientos)
                        </option>
                    @endforeach
                </select>
            </div>
        </div>
    </div>

    {{-- 2. Marcar llegada / turno --}}
    <div class="card">
        <div class="card-header">2. Marcar llegada a la sede (crear Turno)</div>
        <div class="card-body">
            <button id="btnCreateTurn" class="btn btn-primary mb-2">
                Marcar llegada / Crear turno
            </button>

            <p class="mb-1">
                Último turno creado: <strong id="last_turn_id">–</strong>
            </p>
            <small class="text-muted">
                Regla: solo se permite un turno activo por chofer.
            </small>
        </div>
    </div>

    {{-- 3. Crear viaje --}}
    <div class="card">
        <div class="card-header">3. Crear viaje desde turno</div>
        <div class="card-body row g-2">
            <div class="col-12 col-md-6">
                <label class="form-label">Turno (ID)</label>
                <input type="number" id="turn_id" class="form-control"
                       placeholder="ID de turno (se llena al crear turno)">
            </div>

            <div class="col-12 col-md-6">
                <label class="form-label">Sede destino</label>
                <select id="destination_branch_id" class="form-select">
                    @foreach($branches as $branch)
                        <option value="{{ $branch->id }}">
                            {{ $branch->name }} ({{ $branch->code }})
                        </option>
                    @endforeach
                </select>
            </div>

            <div class="col-12 mt-2">
                <label class="form-label">Hora salida programada</label>
                <input type="datetime-local" id="departure_scheduled_at"
                       class="form-control">
            </div>

            <div class="col-12 mt-3">
                <button id="btnCreateTrip" class="btn btn-success">
                    Crear viaje
                </button>
            </div>

            <div class="col-12 mt-2">
                <p class="mb-1">
                    Último viaje creado: <strong id="last_trip_id">–</strong>
                    <span id="last_trip_code" class="ms-2 text-muted"></span>
                </p>
            </div>
        </div>
    </div>

    {{-- 4. Registrar encomienda --}}
    <div class="card">
        <div class="card-header">4. Registrar encomienda en este viaje</div>
        <div class="card-body row g-2">
            <div class="col-12 col-md-4">
                <label class="form-label">Viaje (ID)</label>
                <input type="number" id="trip_id" class="form-control"
                       placeholder="ID de viaje (se llena al crear viaje)">
            </div>

            <div class="col-12 col-md-4">
                <label class="form-label">Pago</label>
                <select id="payment_location" class="form-select">
                    <option value="ORIGEN">ORIGEN</option>
                    <option value="DESTINO">DESTINO</option>
                </select>
            </div>

            <div class="col-12 col-md-4">
                <label class="form-label">Monto total (S/)</label>
                <input type="number" id="amount_total" class="form-control" value="100">
            </div>

            <div class="col-12 col-md-6">
                <label class="form-label">Remitente</label>
                <input type="text" id="sender_name" class="form-control" value="Cliente Origen">
            </div>

            <div class="col-12 col-md-6">
                <label class="form-label">Tel. remitente</label>
                <input type="text" id="sender_phone" class="form-control" value="999000111">
            </div>

            <div class="col-12 col-md-6">
                <label class="form-label">Destinatario</label>
                <input type="text" id="receiver_name" class="form-control" value="Cliente Destino">
            </div>

            <div class="col-12 col-md-6">
                <label class="form-label">Tel. destinatario</label>
                <input type="text" id="receiver_phone" class="form-control" value="988222333">
            </div>

            <div class="col-12 mt-2">
                <label class="form-label">Descripción paquete</label>
                <textarea id="description" rows="2" class="form-control">Caja pequeña</textarea>
            </div>

            <div class="col-12 mt-3">
                <button id="btnCreateShipment" class="btn btn-warning">
                    Registrar encomienda
                </button>
            </div>

            <div class="col-12 mt-2">
                <p>Código última encomienda: <strong id="last_shipment_code">–</strong></p>
            </div>
        </div>
    </div>

    {{-- Log de respuestas --}}
    <div class="card">
        <div class="card-header">Log de respuestas API</div>
        <div class="card-body">
            <pre id="api_log">Aquí verás las respuestas de la API…</pre>
        </div>
    </div>
</div>

<script>
    const baseUrl = window.location.origin; // ej: http://127.0.0.1:8000

    const logEl = document.getElementById('api_log');
    function log(data) {
        const text = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
        logEl.textContent = text;
    }

    // ================================
    // NO PERMITIR MISMA SEDE COMO DESTINO
    // ================================
    const originBranchSelect      = document.getElementById('branch_id');              // "Sede donde estoy"
    const destinationBranchSelect = document.getElementById('destination_branch_id'); // "Sede destino"

    if (originBranchSelect && destinationBranchSelect) {
        // Guardamos todas las opciones originales del destino
        const allDestinationOptions = Array.from(destinationBranchSelect.options).map(opt => ({
            value: opt.value,
            text: opt.textContent,
        }));

        function refreshDestinationOptions() {
            const originId = originBranchSelect.value;

            // Limpiar el select de destino
            destinationBranchSelect.innerHTML = '';

            // Volver a crear opciones excluyendo la sede origen
            allDestinationOptions.forEach(opt => {
                // Si quieres mantener una opción "Seleccione..." con value=""
                if (opt.value === '') {
                    const option = document.createElement('option');
                    option.value = '';
                    option.textContent = opt.text;
                    destinationBranchSelect.appendChild(option);
                    return;
                }

                if (opt.value !== originId) {
                    const option = document.createElement('option');
                    option.value = opt.value;
                    option.textContent = opt.text;
                    destinationBranchSelect.appendChild(option);
                }
            });
        }

        originBranchSelect.addEventListener('change', refreshDestinationOptions);
        // Ejecutar al cargar
        refreshDestinationOptions();
    }

    // 2. Crear turno
    document.getElementById('btnCreateTurn').addEventListener('click', async () => {
        const driverId  = document.getElementById('driver_id').value;
        const branchId  = document.getElementById('branch_id').value;
        const vehicleId = document.getElementById('vehicle_id').value;

        try {
            const res = await fetch(`${baseUrl}/api/driver/turns`, {
                method: 'POST',
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    driver_id: Number(driverId),
                    branch_id: Number(branchId),
                    vehicle_id: Number(vehicleId),
                }),
            });

            const data = await res.json();
            log(data);

            if (data.turn && data.turn.id) {
                document.getElementById('last_turn_id').textContent = data.turn.id;
                document.getElementById('turn_id').value = data.turn.id;
            }
        } catch (e) {
            log(e.toString());
        }
    });

    // 3. Crear viaje
    document.getElementById('btnCreateTrip').addEventListener('click', async () => {
        const turnId   = document.getElementById('turn_id').value;
        const destId   = document.getElementById('destination_branch_id').value;
        const depAtRaw = document.getElementById('departure_scheduled_at').value;

        const depAt = depAtRaw || null; // si no eligen fecha, null

        try {
            const res = await fetch(`${baseUrl}/api/driver/trips`, {
                method: 'POST',
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    turn_id: Number(turnId),
                    destination_branch_id: Number(destId),
                    departure_scheduled_at: depAt,
                }),
            });

            const data = await res.json();
            log(data);

            if (data.trip && data.trip.id) {
                document.getElementById('last_trip_id').textContent = data.trip.id;
                document.getElementById('last_trip_code').textContent = `(${data.trip.code})`;
                document.getElementById('trip_id').value = data.trip.id;
            }
        } catch (e) {
            log(e.toString());
        }
    });

    // 4. Crear encomienda
    document.getElementById('btnCreateShipment').addEventListener('click', async () => {
        const driverId   = document.getElementById('driver_id').value;
        const tripId     = document.getElementById('trip_id').value;
        const payLoc     = document.getElementById('payment_location').value;
        const amount     = document.getElementById('amount_total').value;
        const sName      = document.getElementById('sender_name').value;
        const sPhone     = document.getElementById('sender_phone').value;
        const rName      = document.getElementById('receiver_name').value;
        const rPhone     = document.getElementById('receiver_phone').value;
        const desc       = document.getElementById('description').value;

        try {
            const res = await fetch(`${baseUrl}/api/driver/shipments`, {
                method: 'POST',
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    driver_id: Number(driverId),
                    trip_id: Number(tripId),
                    sender_name: sName,
                    sender_phone: sPhone,
                    receiver_name: rName,
                    receiver_phone: rPhone,
                    description: desc,
                    amount_total: Number(amount),
                    payment_location: payLoc,
                }),
            });

            const data = await res.json();
            log(data);

            if (data.shipment && data.shipment.code) {
                document.getElementById('last_shipment_code').textContent = data.shipment.code;
            }
        } catch (e) {
            log(e.toString());
        }
    });
</script>
</body>
</html>
