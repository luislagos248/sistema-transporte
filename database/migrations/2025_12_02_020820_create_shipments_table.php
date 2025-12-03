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
        Schema::create('shipments', function (Blueprint $table) {
            $table->id();

            // Código corto de la encomienda (para el cliente y para escribir en el paquete)
            $table->string('code', 20)->unique();

            // Relación con viaje y chofer
            $table->foreignId('trip_id')
                ->constrained('trips')
                ->cascadeOnDelete();

            $table->foreignId('driver_id')
                ->constrained('users')
                ->cascadeOnDelete();

            // Origen y destino
            $table->foreignId('origin_branch_id')
                ->constrained('branches')
                ->cascadeOnDelete();

            $table->foreignId('destination_branch_id')
                ->constrained('branches')
                ->cascadeOnDelete();

            // Datos de remitente / destinatario
            $table->string('sender_name');
            $table->string('sender_phone')->nullable();

            $table->string('receiver_name');
            $table->string('receiver_phone')->nullable();

            // Descripción básica del paquete
            $table->string('description')->nullable();

            // Montos
            $table->decimal('amount_total', 10, 2);          // lo que paga el cliente
            $table->decimal('company_percentage', 5, 2)->default(30.00); // % para empresa
            $table->decimal('company_amount', 10, 2);        // S/ para empresa
            $table->decimal('driver_amount', 10, 2);         // S/ para chofer

            // Dónde se paga
            $table->enum('payment_location', ['ORIGEN', 'DESTINO']);

            // Estado del pago
            $table->enum('payment_status', ['PENDIENTE', 'PAGADO'])
                ->default('PENDIENTE');

            // Quién tiene la plata en este momento
            $table->enum('cash_holder', ['DRIVER', 'EMPRESA', 'NINGUNO'])
                ->default('NINGUNO');

            // Estado operativo de la encomienda
            $table->enum('status', [
                'REGISTRADO',      // se registró en origen
                'EN_RUTA',         // ya va en el carro
                'EN_SEDE_DESTINO', // llegó a sede, esperando recojo
                'ENTREGADO',
                'CANCELADO',
            ])->default('REGISTRADO');

            $table->timestamps();
        });
    }


    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('shipments');
    }
};
