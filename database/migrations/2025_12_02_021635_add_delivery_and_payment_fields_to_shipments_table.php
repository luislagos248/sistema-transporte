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
        Schema::table('shipments', function (Blueprint $table) {
            $table->timestamp('paid_at')->nullable()->after('payment_status');
            $table->timestamp('delivered_at')->nullable()->after('status');
            $table->string('received_by_name')->nullable()->after('delivered_at');
            $table->string('received_document')->nullable()->after('received_by_name');
            $table->timestamp('cash_transferred_at')->nullable()->after('cash_holder');
        });
    }

    public function down(): void
    {
        Schema::table('shipments', function (Blueprint $table) {
            $table->dropColumn([
                'paid_at',
                'delivered_at',
                'received_by_name',
                'received_document',
                'cash_transferred_at',
            ]);
        });
    }


};
