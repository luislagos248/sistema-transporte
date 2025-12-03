<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::create('trips', function (Blueprint $table) {
            $table->id();

            // Código del viaje (para mostrar a clientes, etc.)
            $table->string('code', 30)->unique();

            // Chofer
            $table->foreignId('driver_id')
                ->constrained('users')
                ->cascadeOnDelete();

            // Vehículo
            $table->foreignId('vehicle_id')
                ->constrained('vehicles')
                ->cascadeOnDelete();

            // Sede origen
            $table->foreignId('origin_branch_id')
                ->constrained('branches')
                ->cascadeOnDelete();

            // Sede destino
            $table->foreignId('destination_branch_id')
                ->constrained('branches')
                ->cascadeOnDelete();

            // Turno del que nació este viaje
            $table->foreignId('turn_id')
                ->constrained('turns')
                ->cascadeOnDelete();

            // Estado del viaje
            $table->enum('status', ['PROGRAMADO', 'EN_RUTA', 'FINALIZADO', 'CANCELADO'])
                ->default('PROGRAMADO');

            // Horas
            $table->timestamp('departure_scheduled_at')->nullable();
            $table->timestamp('departure_actual_at')->nullable();
            $table->timestamp('arrival_actual_at')->nullable();

            // Capacidad de asientos (copiada del vehículo)
            $table->unsignedTinyInteger('capacity_seats')->nullable();

            // Última posición reportada
            $table->decimal('last_latitude', 10, 7)->nullable();
            $table->decimal('last_longitude', 10, 7)->nullable();
            $table->timestamp('last_position_at')->nullable();

            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('trips');
    }
};
