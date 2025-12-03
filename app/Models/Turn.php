<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Turn extends Model
{
    protected $fillable = [
        'driver_id',
        'branch_id',
        'vehicle_id',
        'arrival_time',
        'status',
        'forced_by_user_id',
        'forced_reason',
    ];

    protected $casts = [
        'arrival_time' => 'datetime',
    ];

    public function driver()
    {
        return $this->belongsTo(User::class, 'driver_id');
    }

    public function branch()
    {
        return $this->belongsTo(Branch::class);
    }

    public function vehicle()
    {
        return $this->belongsTo(Vehicle::class);
    }

    public function forcedBy()
    {
        return $this->belongsTo(User::class, 'forced_by_user_id');
    }

    public function trip()
    {
        return $this->hasOne(Trip::class);
    }
}
