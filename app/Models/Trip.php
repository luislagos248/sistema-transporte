<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Trip extends Model
{
    protected $fillable = [
        'code',
        'driver_id',
        'vehicle_id',
        'origin_branch_id',
        'destination_branch_id',
        'turn_id',
        'status',
        'departure_scheduled_at',
        'departure_actual_at',
        'arrival_actual_at',
        'capacity_seats',
        'last_latitude',
        'last_longitude',
        'last_position_at',
    ];

    protected $casts = [
        'departure_scheduled_at' => 'datetime',
        'departure_actual_at'    => 'datetime',
        'arrival_actual_at'      => 'datetime',
        'last_position_at'       => 'datetime',
    ];

    public function driver()
    {
        return $this->belongsTo(User::class, 'driver_id');
    }

    public function vehicle()
    {
        return $this->belongsTo(Vehicle::class);
    }

    public function originBranch()
    {
        return $this->belongsTo(Branch::class, 'origin_branch_id');
    }

    public function destinationBranch()
    {
        return $this->belongsTo(Branch::class, 'destination_branch_id');
    }

    public function turn()
    {
        return $this->belongsTo(Turn::class);
    }

    public function shipments()
    {
        return $this->hasMany(Shipment::class);
    }

    
}
