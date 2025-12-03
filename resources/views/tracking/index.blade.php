<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <title>Tracking de Encomienda</title>
    <link
        href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css"
        rel="stylesheet"
    >
</head>
<body class="bg-light">

<div class="container py-4">

    <h1 class="mb-3 text-center">Consulta de Encomienda</h1>

    {{-- Formulario para ingresar código --}}
    <div class="card mb-4">
        <div class="card-body">
            <form method="GET" action="{{ route('tracking.index') }}" class="row g-2">
                <div class="col-12 col-md-8">
                    <label for="code" class="form-label">Código de encomienda</label>
                    <input
                        type="text"
                        id="code"
                        name="code"
                        class="form-control"
                        placeholder="Ej: E-ABC123"
                        value="{{ $code }}"
                        required
                    >
                </div>
                <div class="col-12 col-md-4 d-flex align-items-end">
                    <button type="submit" class="btn btn-primary w-100 mt-2 mt-md-0">
                        Buscar
                    </button>
                </div>
            </form>
            <small class="text-muted">
                Pide siempre tu código al momento de enviar la encomienda. Sin código no hay reclamo.
            </small>
        </div>
    </div>

    {{-- Resultado de la búsqueda --}}
    @if($code !== '')
        @php
            // Mapear estados a algo más entendible
            $statusMap = [
                'REGISTRADO'      => 'Registrado en origen',
                'EN_RUTA'         => 'En ruta hacia destino',
                'EN_SEDE_DESTINO' => 'En sede destino (por entregar)',
                'ENTREGADO'       => 'Entregado',
                'CANCELADO'       => 'Cancelado',
            ];
            $paymentStatusMap = [
                'PENDIENTE' => 'Pendiente de pago',
                'PAGADO'    => 'Pagado',
            ];
        @endphp

        @if(!$shipment)
            <div class="alert alert-danger">
                No se encontró ninguna encomienda con el código <strong>{{ $code }}</strong>.
                Verifica el código y vuelve a intentarlo.
            </div>
        @else
            @php
                $statusText  = $statusMap[$shipment->status] ?? $shipment->status;
                $payText     = $paymentStatusMap[$shipment->payment_status] ?? $shipment->payment_status;
                $payLocation = $shipment->payment_location === 'ORIGEN'
                               ? 'Pago en origen'
                               : ($shipment->payment_location === 'DESTINO'
                                   ? 'Pago en destino'
                                   : $shipment->payment_location);

                $cashHolder  = $shipment->cash_holder === 'DRIVER'
                               ? 'Dinero en poder del chofer'
                               : ($shipment->cash_holder === 'EMPRESA'
                                   ? 'Dinero entregado a la empresa'
                                   : '');
            @endphp

            <div class="card mb-4">
                <div class="card-header">
                    Detalle de la encomienda: <strong>{{ $shipment->code }}</strong>
                </div>
                <div class="card-body">

                    <div class="row mb-3">
                        <div class="col-md-6">
                            <h5>Datos de envío</h5>
                            <p class="mb-1"><strong>Origen:</strong> {{ $shipment->originBranch?->name }}</p>
                            <p class="mb-1"><strong>Destino:</strong> {{ $shipment->destinationBranch?->name }}</p>
                            <p class="mb-1"><strong>Remitente:</strong> {{ $shipment->sender_name }}</p>
                            <p class="mb-1"><strong>Destinatario:</strong> {{ $shipment->receiver_name }}</p>
                        </div>
                        <div class="col-md-6">
                            <h5>Estado</h5>
                            <p class="mb-1">
                                <strong>Estado encomienda:</strong>
                                {{ $statusText }}
                                <span class="badge bg-secondary ms-1">{{ $shipment->status }}</span>
                            </p>
                            <p class="mb-1">
                                <strong>Pago:</strong>
                                {{ $payText }}
                                ({{ $payLocation }})
                                @if($cashHolder)
                                    · <small class="text-muted">{{ $cashHolder }}</small>
                                @endif
                            </p>
                            @if($shipment->delivered_at)
                                <p class="mb-1">
                                    <strong>Entregado el:</strong> {{ $shipment->delivered_at }}
                                </p>
                                <p class="mb-1">
                                    <strong>Recibido por:</strong> {{ $shipment->received_by_name }}</strong>
                                </p>
                            @endif
                        </div>
                    </div>

                    <hr>

                    <h5>Viaje asociado</h5>
                    @if($shipment->trip)
                        <p class="mb-1"><strong>Código de viaje:</strong> {{ $shipment->trip->code }}</p>
                        <p class="mb-1"><strong>Chofer:</strong> {{ $shipment->driver?->name }}</p>
                        <p class="mb-1"><strong>Estado del viaje:</strong> {{ $shipment->trip->status }}</p>
                        <p class="mb-1">
                            <strong>Salida programada:</strong> {{ $shipment->trip->departure_scheduled_at }}
                        </p>
                        @if($shipment->trip->departure_actual_at)
                            <p class="mb-1">
                                <strong>Salida real:</strong> {{ $shipment->trip->departure_actual_at }}
                            </p>
                        @endif
                        @if($shipment->trip->arrival_actual_at)
                            <p class="mb-1">
                                <strong>Llegada:</strong> {{ $shipment->trip->arrival_actual_at }}
                            </p>
                        @endif
                    @else
                        <p class="text-muted">
                            Esta encomienda no tiene viaje asociado registrado.
                        </p>
                    @endif

                    <hr>

                    <p class="text-muted mb-0">
                        Si tienes dudas, comunícate con la empresa indicando este código:
                        <strong>{{ $shipment->code }}</strong>.
                    </p>
                </div>
            </div>
        @endif
    @endif

</div>

</body>
</html>
