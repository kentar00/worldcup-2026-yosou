# W杯2026 予想ダッシュボード（自動更新セット）

## 構成
- `index.html` … ダッシュボード本体。`config.json` と `results.json` を読み込みます（無ければ内蔵データで動作）。
- `config.json` … 手動情報（メンバー・色・ティア・保有者・ラッキー国・ベット・ドラフト順）。
- `results.json` … 試合スコア／決勝T勝者。**GitHub Actions が自動更新**。
- `.github/workflows/update.yml` … 定期実行（cron）。
- `scripts/update.mjs` … APIを取得して `results.json` を更新（既定: football-data.org v4）。

## セットアップ
1. このフォルダ一式をGitHubの新規リポジトリ（Public）にアップロード。
2. **Settings → Pages** で Branch=`main` / `/ (root)` を選び保存 → 公開URLが発行されます。
3. football-data.org で無料トークンを取得 → **Settings → Secrets and variables → Actions → New repository secret**
   - Name: `FOOTBALL_API_KEY` / Value: 取得したトークン
4. **Actions タブ → Update WC results → Run workflow** で手動実行し、動作確認。

## 毎日の流れ
- スコアは Actions が `0 6,14,22 *(UTC)` に自動更新（JST 15:00 / 23:00 / 翌7:00 目安）。回数はcronで調整可。
- ドラフト確定後は、アプリの「保存」タブで **config.json を保存** → リポジトリにコミット（保有者・色・ティアを反映）。
- ラッキー国・ファイナルベットも config 側。決まったら同様に config.json を更新。

## 注意・確認事項
- **要確認:** 2026 W杯の competition code（既定 `WC`）と、無料プランで当大会が取得可能か。取得不可なら有料プラン、または API-Football 等へ差し替え（`scripts/update.mjs` の `fetchMatches()` だけ書き換え）。
- チーム名は英語→日本語の対応表で突き合わせます（`update.mjs` の `JP`）。表記揺れで未一致があれば対応表に追記してください。
- 自動：スコア・グループ順位・決勝T加点・グループ1位ボーナス・ジャイキリ×2。
- 手動：保有者割り当て・ラッキー国・ファイナルベット。
- ライブ動作確認はこのセット作成環境からはAPIへ通信できないため未実施です。最初の `Run workflow` でログを確認してください。
