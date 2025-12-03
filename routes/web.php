<?php

use Illuminate\Support\Facades\Route;
use Illuminate\Foundation\Http\Middleware\ValidateCsrfToken;

use App\Http\Controllers\Api\DriverController;
use App\Http\Controllers\PanelController;
use App\Http\Controllers\TrackingController;
use App\Http\Controllers\DriverWebController;

use App\Models\Turn;
use App\Models\Trip;

/*
|--------------------------------------------------------------------------
| Web Routes
|--------------------------------------------------------------------------
*/

// Página de bienvenida simple
Route::get('/', function () {
    return view('welcome');
});

// =========================
//  API PARA CHOFERES / APP
// =========================
Route::prefix('api')
    ->withoutMiddleware([ValidateCsrfToken::class])
    ->group(function () {

        // ---- Sedes ----
        Route::get('/driver/branches', [DriverController::class, 'branches']);

        // ---- Turnos ----
        Route::post('/driver/turns', [DriverController::class, 'createTurn']);
        Route::get('/driver/turns', function () {
            return Turn::with(['driver', 'branch', 'vehicle'])->get();
        });

        // ---- Viajes ----
        Route::post('/driver/trips', [DriverController::class, 'createTrip']);
        Route::get('/driver/trips', function () {
            return Trip::with(['driver', 'originBranch', 'destinationBranch', 'vehicle'])->get();
        });

        Route::post('/driver/trips/{trip}/position', [DriverController::class, 'updateTripPosition']);
        Route::post('/driver/trips/{trip}/start',    [DriverController::class, 'startTrip']);
        Route::post('/driver/trips/{trip}/finish',   [DriverController::class, 'finishTrip']);
        Route::post('/driver/trips/{trip}/cancel',   [DriverController::class, 'cancelTrip']);

        // ---- Encomiendas ----
        Route::post('/driver/shipments',                    [DriverController::class, 'createShipment']);
        Route::get('/driver/trips/{trip}/shipments',        [DriverController::class, 'tripShipments']);
        Route::post('/driver/shipments/{shipment}/status',  [DriverController::class, 'updateShipmentStatus']);
        Route::post('/driver/shipments/{shipment}/mark-paid',     [DriverController::class, 'markShipmentPaid']);
        Route::post('/driver/shipments/{shipment}/transfer-cash', [DriverController::class, 'transferShipmentCashToCompany']);
        Route::post('/driver/shipments/{shipment}/delivered',     [DriverController::class, 'markShipmentDelivered']);

        // ---- Endpoint público de tracking para apps ----
        Route::get('/public/shipments/{code}', [TrackingController::class, 'apiShipmentByCode']);
    });

// =========================
//  PANEL PARA LA DUEÑA
// =========================
Route::get('/panel/turnos',      [PanelController::class, 'turns']);
Route::get('/panel/viajes',      [PanelController::class, 'trips']);
Route::get('/panel/encomiendas', [PanelController::class, 'shipments']);

// =========================
//  PÁGINA PÚBLICA TRACKING
// =========================
Route::get('/tracking', [TrackingController::class, 'index'])
    ->name('tracking.index');

// =========================
//  VISTA WEB DEMO PARA CHOFER
// =========================
Route::get('/driver/demo', [DriverWebController::class, 'index'])
    ->name('driver.demo');
