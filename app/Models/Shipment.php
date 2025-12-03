<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Shipment extends Model
{
    protected $fillable = [
        'code',
        'trip_id',
        'driver_id',
        'origin_branch_id',
        'destination_branch_id',
        'sender_name',
        'sender_phone',
        'receiver_name',
        'receiver_phone',
        'description',
        'amount_total',
        'company_percentage',
        'company_amount',
        'driver_amount',
        'payment_location',
        'payment_status',
        'cash_holder',
        'status',
        'paid_at',
        'delivered_at',
        'received_by_name',
        'received_document',
        'cash_transferred_at',
    ];


    public function trip()
    {
        return $this->belongsTo(Trip::class);
    }

    public function driver()
    {
        return $this->belongsTo(User::class, 'driver_id');
    }

    public function originBranch()
    {
        return $this->belongsTo(Branch::class, 'origin_branch_id');
    }

    public function destinationBranch()
    {
        return $this->belongsTo(Branch::class, 'destination_branch_id');
    }
}
