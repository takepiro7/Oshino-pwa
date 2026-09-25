# OshiNow PWA 試作版

## 今できること
- iPhone / Android / PCブラウザで動作
- iPhoneのホーム画面に追加すると、アプリ風の全画面表示
- ホーム / 通知 / カレンダー / 推し設定
- 「原因は自分にある。」をモデルにしたサンプルデータ
- 情報詳細を「誰・何・いつ・すること」に圧縮
- Instagram Liveの「予兆通知」UI
- オフラインキャッシュ
- 端末上の通知許可・通知表示テスト
- Push受信処理用Service Workerの土台

## まだ未接続
- 公式サイト / X / YouTube / Instagram等からの実データ自動取得
- AIによる実データの自動要約
- アプリを閉じている時にサーバーから送る本番Web Push

## まずMacで確認する方法
ターミナルでこのフォルダへ移動して、簡易Webサーバーを起動します。

```bash
cd OshiNow_PWA
python3 -m http.server 8080
```

Safariで `http://localhost:8080` を開きます。

※ Service WorkerはlocalhostまたはHTTPSで動きます。ファイルを直接ダブルクリックして `file://` で開く方法ではPWA機能が動きません。

## 娘さんへ無料配布する方法
一番簡単なのはGitHub PagesまたはCloudflare Pagesなどの無料HTTPSホスティングに、このフォルダ一式を置く方法です。

公開URLをiPhoneのSafariで開き、
1. 共有ボタン
2. 「ホーム画面に追加」
3. ホーム画面のOshiNowから起動

で利用できます。

## iPhone通知テスト
Web PushはiOS/iPadOS 16.4以降の「ホーム画面に追加したWebアプリ」で利用できます。本試作版の「通知を試す」は端末上の通知表示を確認するものです。アプリを閉じている時の本番Pushには、次にPush配信サーバーを接続します。

## 次の開発段階
1. 無料HTTPSホスティングへ公開
2. 娘さんのiPhoneへホーム画面追加
3. UIフィードバック
4. 公開情報取得Repositoryを実データ化
5. AI要約処理
6. 無料のWeb Push基盤を接続
7. Instagram Live予兆検知を実データで検証

## 注意
現在表示されるイベントはサンプルです。「原因は自分にある。」の公式アプリではありません。公開時には第三者のロゴ・写真・文章の権利、各サービスの利用規約を確認してください。
