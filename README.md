# AIM CARTE (エイムカルテ)

プレイを分析して弱点を診断し、練習を処方する FPS エイム練習ソフト (ブラウザで動作)。Three.js + Chart.js + Vite。

## 起動

```bash
npm install
npm run dev
```

http://localhost:5173 を Chrome / Edge で開く。プレイ中はマウスがロックされ、ESC で一時停止。

## GitHub Pages で公開

`main` ブランチに push すると、`.github/workflows/deploy.yml` がビルドして GitHub Pages に公開する。
最初の 1 回だけ、GitHub のリポジトリの Settings → Pages → Build and deployment の Source を「GitHub Actions」にする。
ビルド結果は相対パスで出力する設定 (`vite.config.js` の `base: './'`) なので、`https://<ユーザー>.github.io/<リポジトリ>/` のようなサブパスでも動く。

## 主な機能

- **感度・FOV**: Overwatch 2 / VALORANT / Apex Legends / カスタム。ゲーム内の値をそのまま入力すると振り向き量 (cm/360) と視野が一致する。他ゲームへの感度換算つき
- **要素別シナリオ**: フリック、マイクロ精度、ターゲット切替、トラッキング、リアクティブ、反応速度、総合 (コンバット・ミックス)
- **トレーニングメニュー**: ウォームアップ → 集中練習 → ミックス → 確認 の順に組んだメニュー (おまかせ・基礎バランス・フリック強化・トラッキング強化・試合前ウォームアップ)。各ステップの前に「意識すること」と目標を表示し、終了後に達成状況をまとめる
- **総合ベンチマーク**: 6 要素 × 30 秒。スキルレーダーと総合フィードバック
- **記録**: スコアと内訳、上級者比 (上級者の目安 = 100%)、7 段階のランク (最上位はグランドマスター)、自己ベスト、履歴グラフ、練習カレンダー
- **リプレイ**: 最新 30 件。再生速度変更、照準の軌跡と射撃位置の表示
- **フィードバック**: 行き過ぎ/手前止まり、修正回数、動き出し、フィッツの法則による距離・方向別の苦手検出、トラッキングの遅れ/追い越し・切り返し反応・ブレを分析し、根拠となる文献とともに意識すべき点を提示
- **シナリオ生成**: 弱点とレーティングから練習シナリオを生成・保存

## ファイル構成

- `src/settings.js` 感度・FOV の換算
- `src/scenarios.js` シナリオ定義
- `src/engine.js` 描画・入力・記録・リプレイ
- `src/analysis.js` 指標計算・スコア
- `src/feedback.js` 診断・参考文献・シナリオ生成
- `src/main.js` 画面
- `public/sfx/` 効果音 (ComfyUI / Stable Audio 3 で生成)

## ライセンス

MIT License ([LICENSE](LICENSE))。

- 依存ライブラリ (three.js, Chart.js, Vite ほか) は MIT / ISC / BSD-3-Clause。
- `public/sfx/` の効果音は Stable Audio 3 Medium (Stability AI Community License) で生成したもの。
- フォント (Rajdhani, Noto Sans JP) は Google Fonts から読み込んでいて、リポジトリには含まない (SIL Open Font License)。
