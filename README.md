# えづ録（えづろく）

家族会議の録音から、要約・決定事項・タスク一覧をまとめたHTMLレポートを自動生成し、家族にURLで共有するツール。

手動操作は「録音開始」と「録音終了」の**2タップのみ**。

> **正式名称**: 家族会議レポート自動化ツール<br>
> **愛称**: えづ録<br>
> **プロジェクト名**: `ezuroku`<br>

---

## これは何か

家族会議を録音すると、AIが内容を文字起こしして構造化し、見やすいHTMLレポートにしてNetlify上の固定URLへ配信する。家族はURLをブックマークしておけば、毎回のレポートをブラウザから見られる。

### 解決したい課題

- 家族会議で決めたことを誰も覚えていない
- 議事録を取る手間で会議そのものが面倒になる
- 口頭の「じゃあ〇〇お願い」が流れて、タスクが宙に浮く

### レポートに含まれる内容

- **要約**：何を話したかを思い出せる2〜3文のメモ
- **決定事項**：方針・ルール・大きな決め事
- **タスク一覧**：担当者と期限付きの「誰かがやること」

---

## 検証したい仮説（MVP）

**家族会議のたびに、2タップUXで使い続けられるか。**

### 成功条件

4週連続で、家族会議のたびに使用された状態。4週間で最低4本のレポートがデプロイされているかで判定する。

### 非ゴール（MVPでは判定しない）

- Claude の抽出精度が運用に足るか（品質はプロンプト設計でのみ担保する）
- 家族全員がレポートを実際に読むかの閲覧行動検証
- 長時間会議（Whisper 25MB超過）への対応

---

## アーキテクチャ

```
[ブラウザ録音]
   ↓ (音声ファイル)
[Netlify Functions プロキシ]
   ├─→ OpenAI Whisper API   (文字起こし)
   ├─→ Anthropic Claude API (構造化)
   └─→ Netlify Deploy API   (HTMLデプロイ)
   ↓
[デプロイ済みURLを画面表示]
```

APIキーはすべて Netlify Functions の環境変数に格納し、ブラウザ側には置かない。

### 利用技術

| 役割 | 採用技術 |
|---|---|
| 録音 | ブラウザ MediaRecorder API |
| APIプロキシ | Netlify Functions |
| 文字起こし | OpenAI Whisper API (`whisper-1`) |
| レポート生成 | Anthropic Claude API (`claude-sonnet-4-20250514`) |
| レポート配信 | Netlify Deploy API |
| ホスティング | Netlify |
| スタイリング | Tailwind CSS (CDN) |

---

## リポジトリ構成

```
.
├── README.md                                    # このファイル
├── docs/
│   ├── system-prompt.md                         # Claudeに渡すシステムプロンプト本体
│   └── step1-instructions.md                    # Step1プロトタイプ実装指示書
├── prototype/
│   └── prototype.html                           # Step1: ローカル検証用プロトタイプ
└── ...（Step2以降で netlify/functions/ などを追加予定）
```

---

## セットアップ

### 必要なAPIキー

| キー | 取得先 |
|---|---|
| OpenAI API Key | https://platform.openai.com/api-keys |
| Anthropic API Key | https://console.anthropic.com/ |
| Netlify Personal Access Token | https://app.netlify.com/user/applications |
| Netlify Site ID（レポート配信用） | Netlifyダッシュボード → Site configuration |

### 環境変数（Step2以降のNetlify Functions用）

| 環境変数名 | 用途 |
|---|---|
| `OPENAI_API_KEY` | Whisper API認証 |
| `ANTHROPIC_API_KEY` | Claude API認証 |
| `NETLIFY_DEPLOY_TOKEN` | レポート配信用 |
| `NETLIFY_REPORT_SITE_ID` | レポートを置くサイトのID |
| `APP_SHARED_SECRET` | ブラウザ⇔Functions間の簡易認証用（任意文字列） |

---

## 使い方（想定フロー）

1. ブラウザで `family-tool.netlify.app` を開く（ブックマーク推奨）
2. 「録音開始」ボタンで会議を録音
3. 会議終了時に「録音終了」ボタンを押す
4. 自動で以下が走る：
   - 音声の文字起こし（Whisper）
   - 要約・タスク・決定事項の抽出（Claude）
   - HTMLレポート生成とNetlifyへのデプロイ
5. 画面にデプロイURLが表示される
6. 家族はそのURLをブックマークしておけば、次回以降も最新レポートを見られる（毎回上書き）

### エラー時の挙動

- どのステップで失敗したかを画面に表示
- APIのレスポンス本文をそのまま表示（隠さない）
- 録音ファイルはダウンロード可能（失敗しても音声は失われない）

---

## 開発ステップ

### Step 1: ローカルパイプライン検証 ← 現在地

ブラウザで開くだけの単一HTMLファイル（`prototype.html`）で、録音→Whisper→Claude→HTML生成までを動かす。APIキーは開発中のみブラウザ入力で扱う。

詳細は [`docs/step1-instructions.md`](./docs/step1-instructions.md) を参照。

### Step 2: Netlify Functions化

3つのエンドポイント（`/api/transcribe`、`/api/generate-report`、`/api/deploy`）を実装し、APIキーを環境変数に移す。ブラウザからキーを消す。

### Step 3: 2画面UIの実装

メイン画面（録音）＋結果画面（URL表示／エラー表示）。エラー時の録音ダウンロード導線を含む。

### Step 4: 運用開始

家族へのプライバシー説明を共有し、ブックマーク配布。4週間の利用状況を計測する。

---

## MVPで作らないもの（拡張候補）

以下はMVP成功後に検討する：

- 抽出結果の修正UI（家族共有前の編集）
- 過去レポートの履歴表示
- 25MB超過時の自動分割
- 話者識別（パパ／ママ）
- PDF出力
- iPhoneショートカット版
- レポートURLのパスワード保護

---

## プライバシーについて

### 外部APIへのデータ送信

- 音声は OpenAI Whisper API に送られる
- 文字起こしテキストは Anthropic Claude API に送られる
- レポートHTMLは Netlify の公開URLにデプロイされる

### 運用上の前提

- OpenAI・Anthropic は企業向けに「APIデータを学習に使わない」方針を示している
- レポートは公開URL上に置かれるが、URLを知る人しかアクセスできない
- 録音内容がセンシティブすぎる会議はツールを使わない運用で回す

### URL推測対策

Netlifyのサイト名は推測されにくい文字列にする（例: `family-mtg-a8x92k.netlify.app`）。必要性が見えたらNetlifyのパスワード保護を検討する。

---

## 計測と振り返り

### 計測対象

- 4週間で何回使われたか（レポートの更新頻度＋手動メモ）
- エラー発生回数と発生ステップ
- 25MB超過の発生回数

### 振り返りタイミング

- 2週目：中間レビュー。パイプラインに大きな問題があれば即対処
- 4週目：最終評価。成功条件を満たしたか判定

### 4週間後の意思決定

- 成功 → 運用中に出た要望を元に、次の機能を決める
- 失敗 → 失敗理由を分析し、仮説を立て直す

---

## 関連ドキュメント

- [システムプロンプト](./docs/system-prompt.md) - Claudeに渡すプロンプト本体と設計判断
- [Step1 実装指示書](./docs/step1-instructions.md) - ローカル検証プロトタイプの実装手順

---

## ライセンス

個人・家族利用を想定したプロジェクトのため、ライセンスは設定していません。
