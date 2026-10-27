# QRcode-Converter（碁石名刺QR）

URLを碁石（囲碁・オセロ）や通常の四角で描いたQRコードにし、名刺（91×55mm）として印刷会社に入稿できるPDFを作るWebアプリ。

- 入稿用：**PDF**（CMYK・黒はK100・塗り足し3mm込み97×61mm・仕上がり枠つき・文字はアウトライン化）
- 確認用：**PNG**（350dpi・解像度情報つき）
- 片面／両面、横／縦、QRの寄せと大きさ、文字の追加・配置（ドラッグ可）
- 入稿チェック：QRの読み取り（ZXing＋jsQR、350dpi／200dpi／150dpi／ぼかし）、安全域、文字サイズ、線の太さ、1マスの大きさ、重なり、背景の明るさ
- 「実機確認」でQRを画面いっぱいに表示し、スマホのカメラで読めるか試せる
- すべてブラウザ内で処理（入力した内容はサーバーに送らない）。設定はそのブラウザに自動保存

設計の詳細は [docs/DESIGN.md](docs/DESIGN.md)。

## 使い方（手元で動かす）

```sh
npm install
npm run dev        # http://localhost:5173
```

## テスト

```sh
npm test           # 可読性（全図案×入力×解像度）・PDF・PNG・レイアウトのテスト
npm run typecheck
```

PDFを画像化して読むテストには `pdftoppm`（poppler-utils）が必要です（ない環境ではそのテストだけ省略されます）。

## 公開（Cloudflare）

```sh
npx wrangler login # 初回のみ
npm run deploy     # ビルドして Cloudflare Workers の静的アセットとして公開
```

自分だけで使う場合は、Cloudflare Access でアクセスを制限できます。

## ライセンス

- コード：MIT
- フォント：Noto Sans JP／Noto Serif JP（SIL Open Font License 1.1。`public/fonts/` に同梱）
