<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class StoreAudioTrackRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'audio' => ['required', 'file', 'mimetypes:audio/webm,audio/ogg,audio/mp4,audio/mpeg,video/webm', 'max:51200'],
            'name' => ['required', 'string', 'max:255'],
            'duration_ms' => ['nullable', 'integer', 'min:0'],
            'offset_ms' => ['nullable', 'integer', 'min:0'],
        ];
    }
}
