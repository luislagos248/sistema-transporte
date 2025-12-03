<?php

namespace App\Http\Controllers;

use App\Models\Turn;
use App\Models\Trip;
use App\Models\Shipment;
use Illuminate\Http\Request;

class PanelController extends Controller
{
    /**
     * Lista de turnos de choferes (cola por sede).
     */
    public function turns(Request $request)
    {
        $date = $request->input('date');

        $query = Turn::with(['driver', 'branch', 'vehicle'])
            ->orderBy('arrival_time', 'asc');

        if ($date) {
            $query->whereDate('created_at', $date);
        } else {
            $date = now()->toDateString();
            $query->whereDate('created_at', $date);
        }

        $turns = $query->get();

        return view('panel.turns', [
            'turns' => $turns,
            'date'  => $date,
        ]);
    }

    /**
     * Lista de viajes (salidas de carros).
     */
    public function trips(Request $request)
    {
        $date = $request->input('date');

        $query = Trip::with([
                'driver',
                'originBranch',
                'destinationBranch',
                'vehicle',
            ])
            ->orderBy('departure_scheduled_at', 'asc');

        if ($date) {
            $query->whereDate('departure_scheduled_at', $date);
        } else {
            $date = now()->toDateString();
            $query->whereDate('departure_scheduled_at', $date);
        }

        $trips = $query->get();

        return view('panel.trips', [
            'trips' => $trips,
            'date'  => $date,
        ]);
    }

    /**
     * Encomiendas + resumen por chofer (ya lo estábamos usando).
     */
    public function shipments(Request $request)
    {
        $date = $request->input('date');

        if ($date) {
            $shipments = Shipment::with(['driver', 'originBranch', 'destinationBranch', 'trip'])
                ->whereDate('created_at', $date)
                ->orderBy('created_at', 'asc')
                ->get();
        } else {
            $date = now()->toDateString();
            $shipments = Shipment::with(['driver', 'originBranch', 'destinationBranch', 'trip'])
                ->whereDate('created_at', $date)
                ->orderBy('created_at', 'asc')
                ->get();
        }

        $summaryByDriver = $shipments->groupBy('driver_id')->map(function ($group) {
            $driver = $group->first()->driver;

            $amountTotal  = $group->sum('amount_total');
            $companyTotal = $group->sum('company_amount');
            $driverTotal  = $group->sum('driver_amount');

            $companyCollected = $group->where('cash_holder', 'EMPRESA')->sum('company_amount');
            $companyPending   = $group->where('cash_holder', 'DRIVER')->sum('company_amount');

            return [
                'driver_id'        => $driver?->id,
                'driver_name'      => $driver?->name,
                'shipments_count'  => $group->count(),
                'amount_total'     => $amountTotal,
                'company_total'    => $companyTotal,
                'driver_total'     => $driverTotal,
                'company_collected'=> $companyCollected,
                'company_pending'  => $companyPending,
            ];
        });

        return view('panel.shipments', [
            'shipments'       => $shipments,
            'summaryByDriver' => $summaryByDriver,
            'date'            => $date,
        ]);
    }
}
