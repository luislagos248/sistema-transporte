<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <title>Panel de Encomiendas</title>
    <link
        href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css"
        rel="stylesheet"
    >
</head>
<body class="bg-light">

<div class="container py-4">

    <h1 class="mb-3">Panel de Encomiendas</h1>

    {{-- Filtro por fecha --}}
    <div class="card mb-4">
        <div class="card-body">
            <form method="GET" action="{{ url('/panel/encomiendas') }}" class="row g-2">
                <div class="col-12 col-md-4">
                    <label for="date" class="form-label">Fecha</label>
                    <input
                        type="date"
                        id="date"
                        name="date"
                        class="form-control"
                        value="{{ $date ?? now()->toDateString() }}"
                    >
                </div>
                <div class="col-12 col-md-4 d-flex align-items-end">
                    <button type="submit" class="btn btn-primary w-100 mt-2 mt-md-0">
                        Filtrar
                    </button>
                </div>
            </form>
            <small class="text-muted">
                Se muestran las encomiendas registradas en la fecha seleccionada.
            </small>
        </div>
    </div>

    {{-- Resumen por chofer --}}
    @if(isset($summaryByDriver) && count($summaryByDriver) > 0)
        <div class="card mb-4">
            <div class="card-header">
                Resumen por chofer
            </div>
            <div class="card-body p-0">
                <div class="table-responsive">
                    <table class="table table-striped mb-0">
                        <thead>
                            <tr>
                                <th>Código</th>
                                <th>Origen</th>
                                <th>Destino</th>
                                <th>Chofer</th>
                                <th>Estado</th>
                                <th>Pago</th>
                                <th>Monto total</th>
                                <th>Empresa (30%)</th>
                                <th>Chofer (70%)</th>
                                <th>Viaje</th>
                                <th>Hora registro</th>
                                {{-- 🔹 NUEVA COLUMNA --}}
                                <th>Tracking</th>
                            </tr>
                        </thead>

                        <tbody>
                        @forelse($shipments as $shipment)
                            <tr>
                                <td>{{ $shipment->code }}</td>
                                <td>{{ $shipment->originBranch?->name }}</td>
                                <td>{{ $shipment->destinationBranch?->name }}</td>
                                <td>{{ $shipment->driver?->name }}</td>
                                <td>{{ $shipment->status }}</td>
                                <td>
                                    {{ $shipment->payment_status }}
                                    ({{ $shipment->payment_location }})
                                </td>
                                <td>S/ {{ number_format($shipment->amount_total, 2) }}</td>
                                <td>S/ {{ number_format($shipment->company_amount, 2) }}</td>
                                <td>S/ {{ number_format($shipment->driver_amount, 2) }}</td>
                                <td>{{ $shipment->trip?->code ?? '—' }}</td>
                                <td>{{ $shipment->created_at }}</td>

                                {{-- 🔹 NUEVA CELDA TRACKING --}}
                                <td>
                                    <a
                                        href="{{ route('tracking.index', ['code' => $shipment->code]) }}"
                                        target="_blank"
                                        class="btn btn-sm btn-outline-primary"
                                    >
                                        Ver
                                    </a>
                                </td>
                            </tr>
                        @empty
                            <tr>
                                <td colspan="12" class="text-center text-muted">
                                    No hay encomiendas registradas en esta fecha.
                                </td>
                            </tr>
                        @endforelse
                        </tbody>

                    </table>
                </div>
            </div>
        </div>
    @endif

    {{-- Listado detallado de encomiendas --}}
    <div class="card">
        <div class="card-header">
            Encomiendas del día {{ $date ?? now()->toDateString() }}
        </div>
        <div class="card-body p-0">
            @if(isset($shipments) && $shipments->count() > 0)
                <div class="table-responsive">
                    <table class="table table-hover mb-0">
                        <thead class="table-light">
                            <tr>
                                <th>Código</th>
                                <th>Origen</th>
                                <th>Destino</th>
                                <th>Chofer</th>
                                <th>Estado</th>
                                <th>Pago</th>
                                <th class="text-end">Monto total</th>
                                <th class="text-end">Empresa (30%)</th>
                                <th class="text-end">Chofer (70%)</th>
                                <th>Viaje</th>
                                <th>Hora registro</th>
                            </tr>
                        </thead>
                        <tbody>
                            @foreach($shipments as $shipment)
                                <tr>
                                    <td>{{ $shipment->code }}</td>
                                    <td>{{ $shipment->originBranch?->name }}</td>
                                    <td>{{ $shipment->destinationBranch?->name }}</td>
                                    <td>{{ $shipment->driver?->name }}</td>
                                    <td>{{ $shipment->status }}</td>
                                    <td>
                                        {{ $shipment->payment_status }}
                                        <br>
                                        <small class="text-muted">
                                            {{ $shipment->payment_location }}
                                        </small>
                                    </td>
                                    <td class="text-end">S/ {{ number_format($shipment->amount_total, 2) }}</td>
                                    <td class="text-end">S/ {{ number_format($shipment->company_amount, 2) }}</td>
                                    <td class="text-end">S/ {{ number_format($shipment->driver_amount, 2) }}</td>
                                    <td>
                                        {{ $shipment->trip?->code }}
                                        <br>
                                        <small class="text-muted">
                                            {{ $shipment->trip?->status }}
                                        </small>
                                    </td>
                                    <td>{{ $shipment->created_at }}</td>
                                </tr>
                            @endforeach
                        </tbody>
                    </table>
                </div>
            @else
                <p class="p-3 mb-0">
                    No hay encomiendas registradas para esta fecha.
                </p>
            @endif
        </div>
    </div>

</div>

</body>
</html>
