<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <title>Panel de Viajes</title>
    <link
        href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css"
        rel="stylesheet"
    >
</head>
<body class="bg-light">

<div class="container py-4">

    <h1 class="mb-3">Viajes</h1>

    {{-- Filtro por fecha (salida programada) --}}
    <div class="card mb-4">
        <div class="card-body">
            <form method="GET" action="{{ url('/panel/viajes') }}" class="row g-2">
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
                Se muestran los viajes con salida programada en la fecha seleccionada.
            </small>
        </div>
    </div>

    {{-- Tabla de viajes --}}
    <div class="card">
        <div class="card-header">
            Viajes del día {{ $date ?? now()->toDateString() }}
        </div>
        <div class="card-body p-0">
            @if(isset($trips) && $trips->count() > 0)
                <div class="table-responsive">
                    <table class="table table-hover mb-0">
                        <thead class="table-light">
                            <tr>
                                <th>Código</th>
                                <th>Origen</th>
                                <th>Destino</th>
                                <th>Chofer</th>
                                <th>Vehículo</th>
                                <th>Estado</th>
                                <th>Salida prog.</th>
                                <th>Salida real</th>
                                <th>Llegada</th>
                                <th>Capacidad</th>
                            </tr>
                        </thead>
                        <tbody>
                            @foreach($trips as $trip)
                                <tr>
                                    <td>{{ $trip->code }}</td>
                                    <td>{{ $trip->originBranch?->name }}</td>
                                    <td>{{ $trip->destinationBranch?->name }}</td>
                                    <td>{{ $trip->driver?->name }}</td>
                                    <td>
                                        {{ $trip->vehicle?->plate }}
                                        <br>
                                        <small class="text-muted">
                                            {{ $trip->vehicle?->description }}
                                        </small>
                                    </td>
                                    <td>{{ $trip->status }}</td>
                                    <td>{{ $trip->departure_scheduled_at }}</td>
                                    <td>{{ $trip->departure_actual_at }}</td>
                                    <td>{{ $trip->arrival_actual_at }}</td>
                                    <td>{{ $trip->capacity_seats }}</td>
                                </tr>
                            @endforeach
                        </tbody>
                    </table>
                </div>
            @else
                <p class="p-3 mb-0">No hay viajes registrados para esta fecha.</p>
            @endif
        </div>
    </div>

</div>

</body>
</html>
