<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Branch;
use App\Models\Turn;
use App\Models\Trip;
use App\Models\User;
use App\Models\Vehicle;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use App\Models\Shipment;

class DriverController extends Controller
{
    /**
     * Listar sedes para que el chofer las vea en la app.
     */
    public function branches()
    {
        $branches = Branch::where('is_active', true)
            ->orderBy('name')
            ->get(['id', 'name', 'code', 'address', 'latitude', 'longitude', 'radius_meters']);

        return response()->json($branches);
    }

    /**
     * Marcar llegada a una sede (crear Turno).
     *
     * POR AHORA sin autenticación real, solo usamos driver_id directo.
     * Más adelante esto saldrá del usuario autenticado (token).
     */
    public function createTurn(Request $request)
    {
        $data = $request->validate([
            'driver_id'  => 'required|exists:users,id',
            'branch_id'  => 'required|exists:branches,id',
            'vehicle_id' => 'nullable|exists:vehicles,id',
            // para GPS (opcional):
            'latitude'   => 'nullable|numeric',
            'longitude'  => 'nullable|numeric',
        ]);

        // En producción: driver_id vendrá del usuario autenticado
        $driver = User::where('id', $data['driver_id'])
            ->where('role', 'CHOFER')
            ->firstOrFail();

        $branch = Branch::findOrFail($data['branch_id']);

        // ✅ Regla: un solo turno activo por chofer (EN_COLA o ASIGNADO)
        $existingTurn = Turn::where('driver_id', $driver->id)
            ->whereIn('status', ['EN_COLA', 'ASIGNADO'])
            ->first();

        if ($existingTurn) {
            return response()->json([
                'message' => 'El chofer ya tiene un turno activo',
                'turn'    => $existingTurn,
            ], 422);
        }

        // ✅ (Opcional) Validación por GPS si mandan lat/lon y la sede tiene coordenadas
        if (
            !empty($data['latitude']) && !empty($data['longitude']) &&
            !empty($branch->latitude) && !empty($branch->longitude) &&
            !empty($branch->radius_meters)
        ) {
            $distance = $this->distanceInMeters(
                $data['latitude'],
                $data['longitude'],
                $branch->latitude,
                $branch->longitude
            );

            if ($distance > $branch->radius_meters) {
                return response()->json([
                    'message'  => 'El chofer está fuera del radio permitido de la sede',
                    'distance' => round($distance, 2),
                    'radius'   => $branch->radius_meters,
                ], 422);
            }
        }

        // Crear el turno
        $turn = Turn::create([
            'driver_id'         => $driver->id,
            'branch_id'         => $branch->id,
            'vehicle_id'        => $data['vehicle_id'] ?? null,
            'arrival_time'      => now(),
            'status'            => 'EN_COLA',
            'forced_by_user_id' => null,
            'forced_reason'     => null,
        ]);

        return response()->json([
            'message' => 'Turno creado correctamente',
            'turn'    => $turn,
        ], 201);
    }

    /**
     * Crear viaje a partir de un turno.
     */
    public function createTrip(Request $request)
    {
        $data = $request->validate([
            'turn_id'               => 'required|exists:turns,id',
            'destination_branch_id' => 'required|exists:branches,id',
            'departure_scheduled_at'=> 'nullable|date', // puedes mandarlo o se usa "ahora"
        ]);

        $turn = Turn::with(['driver', 'branch', 'vehicle'])->findOrFail($data['turn_id']);

        if ($turn->status !== 'EN_COLA') {
            return response()->json([
                'message' => 'El turno no está disponible para crear viaje',
            ], 422);
        }

        if (!$turn->vehicle_id) {
            return response()->json([
                'message' => 'Este turno no tiene vehículo asignado',
            ], 422);
        }

        $vehicle = Vehicle::findOrFail($turn->vehicle_id);

        // Generar código de viaje (simple, luego lo podemos mejorar)
        $code = 'TRIP-' . Str::upper(Str::random(6));

        $trip = Trip::create([
            'code'                 => $code,
            'driver_id'            => $turn->driver_id,
            'vehicle_id'           => $turn->vehicle_id,
            'origin_branch_id'     => $turn->branch_id,
            'destination_branch_id'=> $data['destination_branch_id'],
            'turn_id'              => $turn->id,
            'status'               => 'PROGRAMADO',
            'departure_scheduled_at'=> $data['departure_scheduled_at'] ?? Carbon::now(),
            'capacity_seats'       => $vehicle->capacity_seats,
        ]);

        // Marcamos el turno como ASIGNADO
        $turn->update([
            'status' => 'ASIGNADO',
        ]);

        return response()->json([
            'message' => 'Viaje creado correctamente',
            'trip'    => $trip,
        ], 201);
    }

    /**
     * Actualizar posición del viaje (tracking básico).
     */
    public function updateTripPosition(Request $request, Trip $trip)
    {
        $data = $request->validate([
            'latitude'  => 'required|numeric',
            'longitude' => 'required|numeric',
        ]);

        $trip->update([
            'last_latitude'  => $data['latitude'],
            'last_longitude' => $data['longitude'],
            'last_position_at'=> Carbon::now(),
        ]);

        return response()->json([
            'message' => 'Posición actualizada',
            'trip'    => $trip,
        ]);
    }

    /**
     * Distancia entre dos puntos GPS en metros (fórmula de Haversine).
     */
    protected function distanceInMeters($lat1, $lon1, $lat2, $lon2): float
    {
        $earthRadius = 6371000; // metros

        $lat1 = deg2rad($lat1);
        $lon1 = deg2rad($lon1);
        $lat2 = deg2rad($lat2);
        $lon2 = deg2rad($lon2);

        $dLat = $lat2 - $lat1;
        $dLon = $lon2 - $lon1;

        $a = sin($dLat / 2) ** 2 +
            cos($lat1) * cos($lat2) * sin($dLon / 2) ** 2;

        $c = 2 * atan2(sqrt($a), sqrt(1 - $a));

        return $earthRadius * $c;
    }

    public function startTrip(Request $request, Trip $trip)
    {
        $data = $request->validate([
            'driver_id' => 'required|exists:users,id',
            'latitude'  => 'nullable|numeric',
            'longitude' => 'nullable|numeric',
        ]);

        // Validar que el viaje pertenece a ese chofer
        if ($trip->driver_id !== (int) $data['driver_id']) {
            return response()->json([
                'message' => 'Este viaje no pertenece a este chofer',
            ], 403);
        }

        // Solo se puede iniciar si está PROGRAMADO
        if ($trip->status !== 'PROGRAMADO') {
            return response()->json([
                'message' => 'Solo se pueden iniciar viajes en estado PROGRAMADO',
            ], 422);
        }

        $update = [
            'status'             => 'EN_RUTA',
            'departure_actual_at'=> Carbon::now(),
        ];

        if (!empty($data['latitude']) && !empty($data['longitude'])) {
            $update['last_latitude']   = $data['latitude'];
            $update['last_longitude']  = $data['longitude'];
            $update['last_position_at']= Carbon::now();
        }

        $trip->update($update);

        return response()->json([
            'message' => 'Viaje iniciado correctamente',
            'trip'    => $trip->fresh(),
        ]);
    }

    public function finishTrip(Request $request, Trip $trip)
    {
        $data = $request->validate([
            'driver_id' => 'required|exists:users,id',
            'latitude'  => 'nullable|numeric',
            'longitude' => 'nullable|numeric',
        ]);

        if ($trip->driver_id !== (int) $data['driver_id']) {
            return response()->json([
                'message' => 'Este viaje no pertenece a este chofer',
            ], 403);
        }

        if ($trip->status !== 'EN_RUTA') {
            return response()->json([
                'message' => 'Solo se pueden finalizar viajes en estado EN_RUTA',
            ], 422);
        }

        $update = [
            'status'           => 'FINALIZADO',
            'arrival_actual_at'=> Carbon::now(),
        ];

        if (!empty($data['latitude']) && !empty($data['longitude'])) {
            $update['last_latitude']   = $data['latitude'];
            $update['last_longitude']  = $data['longitude'];
            $update['last_position_at']= Carbon::now();
        }

        $trip->update($update);

        // IMPORTANTE: liberar el turno para que el chofer pueda tomar otro
        if ($trip->turn) {
            $trip->turn->update([
                'status' => 'CANCELADO', // usamos CANCELADO como "cerrado / consumido"
            ]);
        }

        return response()->json([
            'message' => 'Viaje finalizado correctamente',
            'trip'    => $trip->fresh(),
        ]);
    }

    public function cancelTrip(Request $request, Trip $trip)
    {
        $data = $request->validate([
            'driver_id' => 'required|exists:users,id',
            'reason'    => 'nullable|string',
        ]);

        if ($trip->driver_id !== (int) $data['driver_id']) {
            return response()->json([
                'message' => 'Este viaje no pertenece a este chofer',
            ], 403);
        }

        if (!in_array($trip->status, ['PROGRAMADO', 'EN_RUTA'])) {
            return response()->json([
                'message' => 'Solo se pueden cancelar viajes PROGRAMADO o EN_RUTA',
            ], 422);
        }

        $trip->update([
            'status' => 'CANCELADO',
        ]);

        if ($trip->turn) {
            $trip->turn->update([
                'status' => 'CANCELADO',
            ]);
        }

        return response()->json([
            'message' => 'Viaje cancelado',
            'trip'    => $trip->fresh(),
        ]);
    }

    public function createShipment(Request $request)
    {
        $data = $request->validate([
            'driver_id'         => 'required|exists:users,id',
            'trip_id'           => 'required|exists:trips,id',
            'sender_name'       => 'required|string',
            'sender_phone'      => 'nullable|string',
            'receiver_name'     => 'required|string',
            'receiver_phone'    => 'nullable|string',
            'description'       => 'nullable|string',
            'amount_total'      => 'required|numeric|min:0',
            'payment_location'  => 'required|in:ORIGEN,DESTINO',
        ]);

        $driver = User::where('id', $data['driver_id'])
            ->where('role', 'CHOFER')
            ->firstOrFail();

        $trip = Trip::with(['originBranch', 'destinationBranch'])->findOrFail($data['trip_id']);

        // Validar que el viaje sea del chofer
        if ($trip->driver_id !== $driver->id) {
            return response()->json([
                'message' => 'Este viaje no pertenece a este chofer',
            ], 403);
        }

        // Calcular 30% para empresa
        $companyPercentage = 30.0;
        $companyAmount     = round($data['amount_total'] * $companyPercentage / 100, 2);
        $driverAmount      = $data['amount_total'] - $companyAmount;

        // Lógica de pago inicial según dónde se paga
        $paymentStatus = 'PENDIENTE';
        $cashHolder    = 'NINGUNO';

        if ($data['payment_location'] === 'ORIGEN') {
            // Asumimos que el cliente paga en el momento al chofer
            $paymentStatus = 'PAGADO';
            $cashHolder    = 'DRIVER';
        }

        $shipment = Shipment::create([
            'code'                 => 'E-' . Str::upper(Str::random(6)),
            'trip_id'              => $trip->id,
            'driver_id'            => $driver->id,
            'origin_branch_id'     => $trip->origin_branch_id,
            'destination_branch_id'=> $trip->destination_branch_id,
            'sender_name'          => $data['sender_name'],
            'sender_phone'         => $data['sender_phone'] ?? null,
            'receiver_name'        => $data['receiver_name'],
            'receiver_phone'       => $data['receiver_phone'] ?? null,
            'description'          => $data['description'] ?? null,
            'amount_total'         => $data['amount_total'],
            'company_percentage'   => $companyPercentage,
            'company_amount'       => $companyAmount,
            'driver_amount'        => $driverAmount,
            'payment_location'     => $data['payment_location'],
            'payment_status'       => $paymentStatus,
            'cash_holder'          => $cashHolder,
            'status'               => 'EN_RUTA', // ya va en el carro
        ]);

        return response()->json([
            'message'  => 'Encomienda registrada correctamente',
            'shipment' => $shipment,
        ], 201);
    }


    public function tripShipments(Trip $trip)
    {
        $shipments = $trip->shipments()
            ->orderBy('created_at')
            ->get();

        return response()->json($shipments);
    }

    public function updateShipmentStatus(Request $request, Shipment $shipment)
    {
        $data = $request->validate([
            'driver_id' => 'required|exists:users,id',
            'status'    => 'required|in:REGISTRADO,EN_RUTA,EN_SEDE_DESTINO,ENTREGADO,CANCELADO',
        ]);

        if ($shipment->driver_id !== (int) $data['driver_id']) {
            return response()->json([
                'message' => 'Esta encomienda no pertenece a este chofer',
            ], 403);
        }

        $shipment->update([
            'status' => $data['status'],
        ]);

        return response()->json([
            'message'  => 'Estado actualizado',
            'shipment' => $shipment->fresh(),
        ]);
    }

    public function markShipmentPaid(Request $request, Shipment $shipment)
    {
        $data = $request->validate([
            'user_id'        => 'required|exists:users,id',            // quién registra el pago (chofer o secretaria)
            'paid_by'        => 'required|in:DRIVER,EMPRESA',          // quién recibe el dinero
        ]);

        // Si ya estaba pagado, no hacemos nada grave
        if ($shipment->payment_status === 'PAGADO') {
            return response()->json([
                'message'  => 'La encomienda ya estaba marcada como pagada',
                'shipment' => $shipment,
            ]);
        }

        $shipment->update([
            'payment_status' => 'PAGADO',
            'cash_holder'    => $data['paid_by'],  // DRIVER o EMPRESA
            'paid_at'        => now(),
        ]);

        return response()->json([
            'message'  => 'Pago registrado correctamente',
            'shipment' => $shipment->fresh(),
        ]);
    }

    public function transferShipmentCashToCompany(Request $request, Shipment $shipment)
    {
        $data = $request->validate([
            'user_id' => 'required|exists:users,id',  // la persona en oficina que recibe
        ]);

        // Solo tiene sentido si estaba pagado y la plata la tenía el chofer
        if ($shipment->payment_status !== 'PAGADO' || $shipment->cash_holder !== 'DRIVER') {
            return response()->json([
                'message' => 'No se puede transferir: la encomienda no está pagada o el dinero no lo tiene el chofer',
            ], 422);
        }

        $shipment->update([
            'cash_holder'        => 'EMPRESA',
            'cash_transferred_at'=> now(),
        ]);

        return response()->json([
            'message'  => 'Dinero transferido a la empresa correctamente',
            'shipment' => $shipment->fresh(),
        ]);
    }

    public function markShipmentDelivered(Request $request, Shipment $shipment)
    {
        $data = $request->validate([
            'user_id'           => 'required|exists:users,id',   // chofer o secretaria
            'received_by_name'  => 'nullable|string',
            'received_document' => 'nullable|string',
        ]);

        if (!in_array($shipment->status, ['EN_RUTA', 'EN_SEDE_DESTINO', 'REGISTRADO'])) {
            return response()->json([
                'message' => 'Solo se pueden marcar como entregadas encomiendas que no estén canceladas ni ya entregadas',
            ], 422);
        }

        $shipment->update([
            'status'            => 'ENTREGADO',
            'delivered_at'      => now(),
            'received_by_name'  => $data['received_by_name'] ?? $shipment->receiver_name,
            'received_document' => $data['received_document'] ?? null,
        ]);

        return response()->json([
            'message'  => 'Encomienda marcada como entregada',
            'shipment' => $shipment->fresh(),
        ]);
    }

}
