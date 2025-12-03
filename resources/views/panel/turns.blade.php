<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <title>Panel de Turnos</title>
    <link
        href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css"
        rel="stylesheet"
    >
</head>
<body class="bg-light">

<div class="container py-4">

    <h1 class="mb-3">Turnos de Choferes</h1>

    {{-- Filtro por fecha --}}
    <div class="card mb-4">
        <div class="card-body">
            <form method="GET" action="{{ url('/panel/turnos') }}" class="row g-2">
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
                Se muestran los turnos registrados en la fecha seleccionada.
            </small>
        </div>
    </div>

    {{-- Tabla de turnos --}}
    <div class="card">
        <div class="card-header">
            Turnos del día {{ $date ?? now()->toDateString() }}
        </div>
        <div class="card-body p-0">
            @if(isset($turns) && $turns->count() > 0)
                <div class="table-responsive">
                    <table class="table table-hover mb-0">
                        <thead class="table-light">
                            <tr>
                                <th>#</th>
                                <th>Sede</th>
                                <th>Chofer</th>
                                <th>Vehículo</th>
                                <th>Hora de llegada</th>
                                <th>Estado</th>
                                <th>Forzado por</th>
                                <th>Motivo</th>
                            </tr>
                        </thead>
                        <tbody>
                            @foreach($turns as $turn)
                                <tr>
                                    <td>{{ $turn->id }}</td>
                                    <td>{{ $turn->branch?->name }}</td>
                                    <td>{{ $turn->driver?->name }}</td>
                                    <td>
                                        {{ $turn->vehicle?->plate }}
                                        <br>
                                        <small class="text-muted">
                                            {{ $turn->vehicle?->description }}
                                        </small>
                                    </td>
                                    <td>{{ $turn->arrival_time }}</td>
                                    <td>{{ $turn->status }}</td>
                                    <td>{{ $turn->forced_by_user_id }}</td>
                                    <td>{{ $turn->forced_reason }}</td>
                                </tr>
                            @endforeach
                        </tbody>
                    </table>
                </div>
            @else
                <p class="p-3 mb-0">No hay turnos registrados para esta fecha.</p>
            @endif
        </div>
    </div>

</div>

</body>
</html>
