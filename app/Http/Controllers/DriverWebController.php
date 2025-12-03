<?php

namespace App\Http\Controllers;

use App\Models\Branch;
use App\Models\User;
use App\Models\Vehicle;

class DriverWebController extends Controller
{
    public function index()
    {
        // Choferes (rol CHOFER)
        $drivers = User::where('role', 'CHOFER')
            ->orderBy('name')
            ->get(['id', 'name']);

        // Sedes
        $branches = Branch::orderBy('name')
            ->get(['id', 'name', 'code']);

        // Vehículos
        $vehicles = Vehicle::orderBy('plate')
            ->get(['id', 'plate', 'capacity_seats']);

        return view('driver.demo', compact('drivers', 'branches', 'vehicles'));
    }
}
