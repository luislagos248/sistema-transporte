<?php

namespace App\Http\Controllers;

use App\Models\Shipment;
use Illuminate\Http\Request;

class TrackingController extends Controller
{
    /**
     * Página pública de tracking de encomiendas.
     * GET /tracking?code=E-XXXXXX
     */
    public function index(Request $request)
    {
        $code = trim((string) $request->input('code', ''));
        $shipment = null;

        if ($code !== '') {
            $shipment = Shipment::with([
                'driver',
                'originBranch',
                'destinationBranch',
                'trip',
            ])->where('code', $code)->first();
        }

        return view('tracking.index', [
            'code'     => $code,
            'shipment' => $shipment,
        ]);
    }

    /**
     * Endpoint público JSON para apps externas:
     * GET /api/public/shipments/{code}
     *
     * IMPORTANTE:
     * - Mantengo las claves actuales (code, status, payment_status, origin, destination,
     *   sender_name, receiver_name, trip).
     * - Solo AGREGO campos extra que pueden servir a futuras apps.
     * - Ya NO uso ->toDateTimeString() para evitar errores cuando el campo es string.
     */
    public function apiShipmentByCode(string $code)
    {
        $shipment = Shipment::with([
            'driver',
            'originBranch',
            'destinationBranch',
            'trip',
        ])->where('code', $code)->first();

        if (!$shipment) {
            return response()->json([
                'message' => 'Encomienda no encontrada',
            ], 404);
        }

        $trip = $shipment->trip; // para no repetir

        return response()->json([
            // Campos que ya tenías
            'code'           => $shipment->code,
            'status'         => $shipment->status,
            'payment_status' => $shipment->payment_status,
            'origin'         => $shipment->originBranch?->name,
            'destination'    => $shipment->destinationBranch?->name,
            'sender_name'    => $shipment->sender_name,
            'receiver_name'  => $shipment->receiver_name,

            // 🔹 Campos extra (no rompen nada)
            'payment_location' => $shipment->payment_location,   // ORIGEN / DESTINO
            'cash_holder'      => $shipment->cash_holder,        // DRIVER / EMPRESA / NINGUNO

            'amount_total'     => (float) $shipment->amount_total,
            'company_amount'   => (float) $shipment->company_amount,
            'driver_amount'    => (float) $shipment->driver_amount,

            'sender_phone'     => $shipment->sender_phone,
            'receiver_phone'   => $shipment->receiver_phone,

            'origin_code'      => $shipment->originBranch?->code,
            'destination_code' => $shipment->destinationBranch?->code,

            // 👇 Aquí evitamos ->toDateTimeString() y simplemente casteamos a string si existe
            'created_at'       => $shipment->created_at
                ? (string) $shipment->created_at
                : null,
            'delivered_at'     => $shipment->delivered_at
                ? (string) $shipment->delivered_at
                : null,

            // Datos del viaje asociado (estructura que ya tenías)
            'trip' => $trip ? [
                'code'                   => $trip->code,
                'status'                 => $trip->status,
                'departure_scheduled_at' => $trip->departure_scheduled_at
                    ? (string) $trip->departure_scheduled_at
                    : null,
                'departure_actual_at'    => $trip->departure_actual_at
                    ? (string) $trip->departure_actual_at
                    : null,
                'arrival_actual_at'      => $trip->arrival_actual_at
                    ? (string) $trip->arrival_actual_at
                    : null,
                'driver_name'            => $shipment->driver?->name,
            ] : null,
        ]);
    }
}
