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
        Schema::create('turns', function (Blueprint $table) {
            $table->id();

            // Chofer (usuario con rol CHOFER)
            $table->foreignId('driver_id')
                ->constrained('users')
                ->cascadeOnDelete();

            // Sede donde tomó el turno
            $table->foreignId('branch_id')
                ->constrained('branches')
                ->cascadeOnDelete();

            // Vehículo que usará en este turno (opcional)
            $table->foreignId('vehicle_id')
                ->nullable()
                ->constrained('vehicles')
                ->nullOnDelete();

            // Hora en que llegó y se puso en la cola
            $table->timestamp('arrival_time');

            // Estado del turno
            $table->enum('status', ['EN_COLA', 'ASIGNADO', 'CANCELADO'])
                ->default('EN_COLA');

            // Para “forzar llegada” desde oficina/supervisor
            $table->foreignId('forced_by_user_id')
                ->nullable()
                ->constrained('users')
                ->nullOnDelete();

            $table->string('forced_reason')->nullable();

            $table->timestamps();
        });
    }


    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('turns');
    }
};
