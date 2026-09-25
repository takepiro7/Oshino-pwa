# 最初にここだけ

## 1. Macで見てみる
このフォルダを開き、ターミナルで以下を実行します。

```bash
cd ~/Downloads/OshiNow_PWA
python3 -m http.server 8080
```

Safariで `http://localhost:8080` を開きます。

## 2. 娘さんへ配るには
PWAは「URL」が必要です。次はこのフォルダを無料HTTPSホスティングへ置きます。

おすすめ順：
1. GitHub Pages（長期運用向き）
2. Cloudflare Pages（高速・無料枠あり）

公開後は、娘さんにURLを送るだけです。

娘さんのiPhoneでは：
SafariでURLを開く → 共有 →「ホーム画面に追加」→ OshiNowを起動

## 3. 今回の到達点
- アプリ風UI：完成
- ホーム画面追加：対応
- オフライン表示：対応
- 通知の許可・端末通知テスト：対応
- 本番の自動巡回 / AI要約 / アプリ終了中のPush：次段階
