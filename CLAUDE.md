# CLAUDE.md — W杯2026 5人対抗 予想ゲーム ダッシュボード

Claude Code 向けプロジェクト指示書。**このファイルを最初に読むこと。**

---

## 1. 概要
2026 FIFAワールドカップを題材にした、友人5人（KT / KO / AI / MM / NK）の勝敗予想ゲームの
スコア集計ダッシュボード。各メンバーがドラフトで保有した国の戦績からポイントを自動集計し、
5人の総合順位・12グループの順位・日程を1ページに表示する。

- 単一の静的HTML（ビルド不要・フレームワークなし・バニラJS）。
- ホスティングは GitHub Pages。試合結果は GitHub Actions（cron）が `results.json` を自動更新。
- UIは日本語。デザインは「ダーク＋シャンパンゴールド基調＋公式アートの多色アクセント」。

## 2. 技術スタック / 制約
- HTML + CSS + バニラJS（`index.html` 1ファイルに同梱）。ビルドステップなし。
- 外部依存は Google Fonts（Anton / Noto Sans JP）のみ。
- **localStorage / sessionStorage は使用しない**（永続化はJSONファイル＋書き出しで行う）。
- データ保存方式：状態オブジェクト `G` をJSONとして扱う。`config.json`＝手動情報、`results.json`＝自動更新情報。
- Node は自動更新スクリプト（`scripts/update.mjs`, Node 20, ESM, グローバル `fetch` 使用）でのみ使う。

## 3. ファイル構成
```
index.html                     ダッシュボード本体（UI + ロジック）
config.json                    手動情報: players, colors, config, lucky, bets, draftOrder, teams
results.json                   自動情報: gsMatches(スコア), koMatches(勝者)  ← Actionsが更新
scripts/update.mjs             API取得→results.json更新（既定: football-data.org v4）
.github/workflows/update.yml   cron定期実行 + 自動コミット
README_SETUP.md                セットアップ手順
CLAUDE.md                      このファイル
```

## 4. データモデル（`G` オブジェクト）
`index.html` 内に**フォールバック用の埋め込みJSON**（`<script id="gamedata">`）があり、
`config.json`/`results.json` の取得に成功するとそれで上書きする（`boot()` 参照）。
file:// やオフラインでは埋め込みのみで動作する。**この二重構造を壊さないこと。**

- `players`: `["KT","KO","AI","MM","NK"]`
- `colors`: `{ プレイヤー名: "#hex" }`（順位表バー・保有者バッジの色）
- `config`: `{ gk: true }` … `gk` = ジャイキリ・ボーナス有効フラグ
- `lucky`: `{ プレイヤー名: 国名 }` … 救済ルーレットのラッキー国
- `bets`: `[ {player, team, amount} ]` … ファイナルベット
- `draftOrder`: `[プレイヤー名...]` … ルーレットで確定した指名順（任意）
- `teams`: `{ 国名(日本語): { group:"A".."L", tier:"A|B|C|D|''", owner:プレイヤー名|null, flag:"🇯🇵" } }`（48カ国）
- `gsMatches`: `[ {id, group, home, away, date:"YYYY-MM-DD", time:"HH:MM"(JST), hs:null|int, as:null|int} ]`（72試合）
- `koMatches`: `[ {round:"R32|R16|QF|SF|F", home, away, winner:国名|""} ]`

国名は日本語が正（例: `日本`, `コートジボワール`, `コンゴ民主共和国`, `ボスニア・ヘルツェゴビナ`）。

## 5. ゲームルールと得点ロジック（`compute()` が真実）
変更時は必ず `compute()` と「ルール」タブ（`renderRules()`）の両方を更新する。

**ドラフト/ティア**
- FIFAランキング(2026/4/1)上位45カ国を5人で分配（1人9カ国）。ティア別にルーレットで指名順を決める。
- ティア配分: A=上位5, B=6〜15, C=16〜30, D=31〜45。**最下位3カ国（ハイチ/キュラソー/ニュージーランド）は tier="" で対象外。**
- ティアの用途はジャイキリ判定。設定タブで個別変更可。

**グループステージ（保有者に加算）**
- 勝ち=1pt、引き分け=各0.5pt、負け=0。
- グループ**1位通過ボーナス=+2pt**。ただし当該グループ6試合すべてにスコアが入った（`complete`）時のみ確定。
- グループ順位ソート: 勝点 → 得失点差 → 総得点。

**決勝トーナメント（勝者の保有者に加算 / 突破ポイント）**
- R32突破=3, ベスト16突破=6, ベスト8突破=12, ベスト4突破=20, 優勝=30（`KO_PTS`）。
- チャンピオン = round `F` の勝者。

**特別ルール**
1. ジャイキリ・ボーナス: 勝者ティアが C/D かつ 敗者ティアが A/B のとき、その試合のポイントを×2（GS・KO両方、`config.gk`）。
2. 救済ルーレット（相乗り）: `lucky[player]=国` のとき、その国のKO突破ポイントを player にも加算（保有者にも通常加算＝複製。チームは奪わない）。
3. ファイナル・ベット: 各 `bets` 要素は、チャンピオン未確定なら -amount（保留）、的中で +amount、外れで -amount。上限10pt。

## 6. UI構造（`index.html` の主な関数）
- 状態: グローバル `G`（ゲーム状態）、`rlState`（ルーレット: order/remaining/spinning/timer）。
- タブ: 順位表 / グループ / 日程・結果 / ルーレット / 設定 / ルール / 保存（`<nav>` の `data-v` と `#v-*` セクション）。
- レンダラ: `renderLB / renderGroups / renderScores / renderRoulette / renderSettings / renderRules / renderData`、束ねるのが `renderAll()`。
- 集計: `compute()` → `{P(プレイヤー別内訳), standings(グループ別), champion}`。
- ヘルパ: `tier(n) owner(n) flag(n) pcol(p) tchip(n) esc(s) dstr(date) groupsOf()`。定数 `KO_ROUNDS/KO_PTS/KO_LABEL/WD`。
- 編集アクション: `setScore setOwner setTier setColor setPlayer setLucky addKO delKO addBet delBet`。
- ルーレット: `rlStart() → rlStop() → rlFinalize() / rlReset()`。**スピン中は `renderAll()` でDOMを再生成しない**（タイマーがid参照で更新しているため）。
- 起動/保存: `boot()`（fetch→`G`上書き→`renderAll`）、`saveConfig()`/`saveResults()`（JSONダウンロード）、`exportHTML()`（自己完結HTML書き出し）、`syncData()`（埋め込みJSONへ反映）。

## 7. 自動更新（Actions + API）
- `scripts/update.mjs`: `fetchMatches()` がAPIを叩き、正規化形 `{home,away,homeScore,awayScore,penHome,penAway,stage,finished}` を返す。
  以降は results.json を更新（GSはホーム/アウェイの向きを補正、KOはPK含めて勝者判定）。
- 既定プロバイダは **football-data.org v4**（`GET /v4/competitions/{COMP}/matches`, ヘッダ `X-Auth-Token`）。
- プロバイダ差し替えは **`fetchMatches()` だけ**を書き換え、正規化形を維持すれば良い。
- チーム名の英→日対応表は `update.mjs` の `JP`。`norm()` でアクセント除去・小文字化して突合。表記揺れは `JP` に追記。
- stage対応: `LAST_32→R32, LAST_16→R16, QUARTER_FINALS→QF, SEMI_FINALS→SF, FINAL→F`（`STAGE`）。
- cron は UTC（`update.yml`）。**JST = UTC+9**。既定 `0 6,14,22 * * *` ≈ JST 15:00 / 23:00 / 翌7:00。
- 必要シークレット: `FOOTBALL_API_KEY`。env `COMP_CODE`（既定 `WC`）。

## 8. 時刻・日程の前提
- 日程はFIFA公式（UK時間）を **JST = UK + 8時間** で換算済み（`gsMatches` の date/time はJST）。
- グループ割は実際の2026本大会の抽選結果と一致している前提で公式日程を流用している。

## 9. ローカル確認・テスト方法
ビルド不要。`index.html` をブラウザで直接開けば埋め込みデータで動く。
- JS構文チェック: 最後の `<script>` を抽出して `node --check`。
- 自動更新ロジックのテスト: `globalThis.fetch` をモックして `scripts/update.mjs` を import し、results.json の差分を確認（README/過去のテストパターン参照）。
- JSON検証: `python3 -c "import json;json.load(open('config.json'));json.load(open('results.json'))"`。

## 10. 規約 / 壊してはいけないもの
- 埋め込みフォールバック ⇄ `config.json`/`results.json` の二重構造を維持（オフラインでも動くこと）。
- `compute()` を変えたら「ルール」タブの記載も合わせる。
- 国名は日本語キーで統一。`teams` のキーと `gsMatches/koMatches` の `home/away/winner`、`lucky`/`bets.team` はすべて一致必須。
- localStorage 等のブラウザストレージは追加しない。
- 手動領域（owners/lucky/bets/colors/players/tier）は `config.json`、自動領域（スコア/勝者）は `results.json`。
  Actionsは `results.json` のみ書き換える（手動データを上書きしない）。
- 配色トークン（CSS `:root`）: `--g-hi/--g-mid/--g-lo`（ゴールド）、`--c1..--c8`（多色）、`--tx/--muted/--card/--line`。

## 11. よくある変更タスク
- **ティア再割り当て**: `config.json` の各 `teams[国].tier` を編集（または設定タブ）。`compute()` 改変は不要。
- **特別ルール追加**: `compute()` に加算ロジック → `renderLB` の内訳表示 → `renderRules` の説明 → 必要なら `config` にフラグ。
- **API差し替え**: `scripts/update.mjs` の `fetchMatches()` のみ。`JP` 対応表を更新。
- **更新頻度変更**: `.github/workflows/update.yml` の cron（UTC）。
- **メンバー変更**: 設定タブで改名（色・保有者・lucky・betsを追従。ルーレットは自動リセット）。

## 12. 既知の制約 / TODO
- 2026本大会の competition code（既定 `WC`）と、無料プランでの取得可否は**要確認**（不可なら有料 or API-Football等へ）。
- 自動化されるのはスコア/順位/突破pt/1位ボーナス/ジャイキリのみ。**保有者割り当て・ラッキー国・ファイナルベットは手動**。
- 決勝Tの組み合わせ（third-place進出など）はAPI結果から流入。手動追加も可。
- API疎通のライブ確認は未実施（初回 `Run workflow` のログで確認すること）。
