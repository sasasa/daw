<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class StoreSongRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'title' => ['required', 'string', 'max:255'],
            'bpm' => ['nullable', 'integer', 'min:20', 'max:300'],
            'beats_per_measure' => ['nullable', 'integer', 'min:1', 'max:16'],
        ];
    }
}
