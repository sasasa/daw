<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class UpdateSongRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'title' => ['required', 'string', 'max:255'],
            'bpm' => ['required', 'integer', 'min:20', 'max:300'],
            'beats_per_measure' => ['required', 'integer', 'min:1', 'max:16'],
        ];
    }
}
