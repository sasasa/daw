import axios from 'axios';

// Inertia は既定の axios にインターセプタを付けるため、JSON を返すエンドポイント
// （自動保存・録音系）を window.axios で叩くと「Inertia応答でない」エラーになる。
// それを避けるため、インターセプタの付かない独立インスタンスを使う。
const token = document.querySelector('meta[name="csrf-token"]')?.getAttribute('content');

const api = axios.create({
    headers: {
        'X-Requested-With': 'XMLHttpRequest',
        ...(token ? { 'X-CSRF-TOKEN': token } : {}),
    },
});

export default api;
