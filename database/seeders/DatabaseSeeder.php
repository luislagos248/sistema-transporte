<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Database\Console\Seeds\WithoutModelEvents; // ← IMPORTANTE
use App\Models\User;
use App\Models\Branch;
use App\Models\Vehicle;
use Illuminate\Support\Facades\Hash;

class DatabaseSeeder extends Seeder
{
    use WithoutModelEvents;

    public function run(): void
    {
        // Usuario ADMIN
        User::firstOrCreate(
            ['email' => 'admin@transporte.com'],
            [
                'name'            => 'Admin',
                'password'        => Hash::make('password'), // cámbialo luego
                'role'            => 'ADMIN',
                'document_number' => '00000000',
                'phone_number'    => '999999999',
            ]
        );

        // Usuario CHOFER de prueba
        User::firstOrCreate(
            ['email' => 'chofer1@transporte.com'],
            [
                'name'            => 'Chofer Prueba',
                'password'        => Hash::make('password'),
                'role'            => 'CHOFER',
                'document_number' => '12345678',
                'phone_number'    => '988888888',
            ]
        );

        // Sede Pucallpa
        Branch::firstOrCreate(
            ['code' => 'PUC'],
            [
                'name'          => 'Pucallpa',
                'address'       => 'Sede Pucallpa',
                'radius_meters' => 200,
            ]
        );

        // Sede Von Humboldt
        Branch::firstOrCreate(
            ['code' => 'VON'],
            [
                'name'          => 'Von Humboldt',
                'address'       => 'Sede Von Humboldt',
                'radius_meters' => 200,
            ]
        );

        // Vehículo de prueba
        Vehicle::firstOrCreate(
            ['plate' => 'XYZ-123'],
            [
                'description'    => 'Coaster blanca',
                'capacity_seats' => 15,
                'type'           => 'minivan',
                'is_active'      => true,
            ]
        );
    }
}
