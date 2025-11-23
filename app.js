/**
 * PWA QRコードリーダー - メインアプリケーション
 * 
 * 機能:
 * - カメラからの映像取得と表示
 * - QRコードのリアルタイム読み取り
 * - 前面/背面カメラの切り替え
 * - カメラのオン/オフ制御
 */

class QRCodeReader {
    constructor() {
        // DOM要素の取得
        this.video = document.getElementById('video');
        this.canvas = document.getElementById('canvas');
        this.canvasContext = this.canvas.getContext('2d');
        this.resultDiv = document.getElementById('result');
        this.statusDiv = document.getElementById('status');
        this.toggleCameraBtn = document.getElementById('toggleCamera');
        this.switchCameraBtn = document.getElementById('switchCamera');
        this.copyBtn = document.getElementById('copyBtn');
        this.cameraIcon = document.getElementById('cameraIcon');
        this.cameraText = document.getElementById('cameraText');

        // 状態管理
        this.stream = null; // 現在のメディアストリーム
        this.scanning = false; // スキャン中かどうか
        this.cameraActive = false; // カメラが有効かどうか
        this.facingMode = 'environment'; // カメラの向き: 'environment'(背面) or 'user'(前面)
        this.lastResult = ''; // 最後に読み取った結果
        this.statusTimeout = null; // ステータス表示のタイムアウトID
        this.frameCount = 0; // フレームカウンター（パフォーマンス最適化用）

        // イベントリスナーの設定
        this.setupEventListeners();
    }

    /**
     * イベントリスナーを設定
     * ボタンクリック時の動作を定義
     */
    setupEventListeners() {
        this.toggleCameraBtn.addEventListener('click', () => this.toggleCamera());
        this.switchCameraBtn.addEventListener('click', () => this.switchCamera());
        this.copyBtn.addEventListener('click', () => this.copyToClipboard());
    }

    /**
     * カメラのオン/オフを切り替え
     */
    async toggleCamera() {
        if (this.cameraActive) {
            // カメラをオフにする
            this.stopCamera();
            this.updateUI(false);
            this.showStatus('カメラを停止しました');
        } else {
            // カメラをオンにする
            try {
                await this.startCamera();
                this.updateUI(true);
                this.showStatus('カメラを起動しました', 'success');
            } catch (error) {
                this.showStatus('カメラの起動に失敗しました: ' + error.message, 'error');
                console.error('カメラエラー:', error);
            }
        }
    }

    /**
     * 前面/背面カメラを切り替え
     */
    async switchCamera() {
        if (!this.cameraActive) {
            this.showStatus('カメラが起動していません', 'error');
            return;
        }

        // カメラの向きを切り替え
        this.facingMode = this.facingMode === 'environment' ? 'user' : 'environment';
        
        // 一度停止してから再起動
        this.stopCamera();
        try {
            await this.startCamera();
            const cameraType = this.facingMode === 'environment' ? '背面' : '前面';
            this.showStatus(`${cameraType}カメラに切り替えました`, 'success');
        } catch (error) {
            this.showStatus('カメラの切り替えに失敗しました', 'error');
            console.error('カメラ切り替えエラー:', error);
            // 元に戻す
            this.facingMode = this.facingMode === 'environment' ? 'user' : 'environment';
        }
    }

    /**
     * カメラを起動
     */
    async startCamera() {
        const constraints = {
            video: {
                facingMode: this.facingMode,
                width: { ideal: 1280 },
                height: { ideal: 720 }
            }
        };

        try {
            this.stream = await navigator.mediaDevices.getUserMedia(constraints);
            this.video.srcObject = this.stream;
            this.cameraActive = true;

            // ビデオが再生されたらスキャンを開始
            this.video.addEventListener('loadedmetadata', () => {
                this.canvas.width = this.video.videoWidth;
                this.canvas.height = this.video.videoHeight;
                this.startScanning();
            }, { once: true });
        } catch (error) {
            this.cameraActive = false;
            throw error;
        }
    }

    /**
     * カメラを停止
     */
    stopCamera() {
        if (this.stream) {
            this.stream.getTracks().forEach(track => track.stop());
            this.stream = null;
        }
        this.video.srcObject = null;
        this.cameraActive = false;
        this.stopScanning();
    }

    /**
     * QRコードのスキャンを開始
     */
    startScanning() {
        this.scanning = true;
        this.scan();
    }

    /**
     * QRコードのスキャンを停止
     */
    stopScanning() {
        this.scanning = false;
    }

    /**
     * QRコードをスキャン（連続実行）
     */
    scan() {
        if (!this.scanning || !this.cameraActive) {
            return;
        }

        // パフォーマンス最適化: 3フレームに1回スキャン
        this.frameCount++;
        if (this.frameCount % 3 === 0) {
            // ビデオからキャンバスに描画
            if (this.video.readyState === this.video.HAVE_ENOUGH_DATA) {
                this.canvasContext.drawImage(
                    this.video,
                    0,
                    0,
                    this.canvas.width,
                    this.canvas.height
                );

                // 画像データを取得
                const imageData = this.canvasContext.getImageData(
                    0,
                    0,
                    this.canvas.width,
                    this.canvas.height
                );

                // jsQRでQRコードを検出
                const code = jsQR(imageData.data, imageData.width, imageData.height, {
                    inversionAttempts: "dontInvert",
                });

                if (code) {
                    this.handleQRCode(code.data);
                }
            }
        }

        // 次のフレームで再度スキャン
        requestAnimationFrame(() => this.scan());
    }

    /**
     * QRコードが検出された時の処理
     * @param {string} data - QRコードのデータ
     */
    handleQRCode(data) {
        // 同じ結果の場合は処理しない（連続読み取り防止）
        if (data === this.lastResult) {
            return;
        }

        this.lastResult = data;
        this.displayResult(data);
        this.showStatus('QRコードを読み取りました！', 'success');

        // バイブレーション（対応デバイスのみ）
        if (navigator.vibrate) {
            navigator.vibrate(200);
        }
    }

    /**
     * 読み取り結果を表示
     * @param {string} data - 表示するデータ
     */
    displayResult(data) {
        // URLかどうかチェック
        const isUrl = this.isValidUrl(data);
        
        let html = '';
        if (isUrl) {
            html = `
                <p class="result-text">
                    <strong>URL:</strong><br>
                    <a href="${data}" target="_blank" rel="noopener noreferrer">${data}</a>
                </p>
            `;
        } else {
            html = `<p class="result-text">${this.escapeHtml(data)}</p>`;
        }

        this.resultDiv.innerHTML = html;
        this.resultDiv.classList.add('has-result');
        this.copyBtn.style.display = 'block';
    }

    /**
     * URLかどうかを判定
     * @param {string} string - チェックする文字列
     * @returns {boolean} URLの場合true
     */
    isValidUrl(string) {
        try {
            const url = new URL(string);
            return url.protocol === 'http:' || url.protocol === 'https:';
        } catch (_) {
            return false;
        }
    }

    /**
     * HTMLエスケープ（XSS対策）
     * @param {string} text - エスケープする文字列
     * @returns {string} エスケープされた文字列
     */
    escapeHtml(text) {
        const map = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;'
        };
        return text.replace(/[&<>"']/g, m => map[m]);
    }

    /**
     * クリップボードにコピー
     */
    async copyToClipboard() {
        try {
            await navigator.clipboard.writeText(this.lastResult);
            this.showStatus('クリップボードにコピーしました', 'success');
        } catch (error) {
            this.showStatus('コピーに失敗しました', 'error');
            console.error('コピーエラー:', error);
        }
    }

    /**
     * UIを更新
     * @param {boolean} active - カメラがアクティブかどうか
     */
    updateUI(active) {
        if (active) {
            this.cameraIcon.textContent = '⏸️';
            this.cameraText.textContent = 'カメラオフ';
            this.switchCameraBtn.disabled = false;
        } else {
            this.cameraIcon.textContent = '📹';
            this.cameraText.textContent = 'カメラオン';
            this.switchCameraBtn.disabled = true;
        }
    }

    /**
     * ステータスメッセージを表示
     * @param {string} message - 表示するメッセージ
     * @param {string} type - メッセージタイプ ('success' or 'error')
     */
    showStatus(message, type = '') {
        // 既存のタイムアウトをクリア
        if (this.statusTimeout) {
            clearTimeout(this.statusTimeout);
        }

        this.statusDiv.textContent = message;
        this.statusDiv.className = 'status show ' + type;

        // 3秒後に非表示
        this.statusTimeout = setTimeout(() => {
            this.statusDiv.classList.remove('show');
            this.statusTimeout = null;
        }, 3000);
    }
}

// Service Workerの登録
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('service-worker.js')
            .then(registration => {
                console.log('Service Worker登録成功:', registration.scope);
            })
            .catch(error => {
                console.log('Service Worker登録失敗:', error);
            });
    });
}

// アプリケーションの初期化
document.addEventListener('DOMContentLoaded', () => {
    const reader = new QRCodeReader();
    console.log('QRコードリーダー初期化完了');
});
