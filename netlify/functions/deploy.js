// Netlify Deploy API プロキシ
// ブラウザから受け取ったHTML文字列を、レポート専用サイトの /index.html として上書きデプロイする
// Deploy APIは3ステップ:
//   1. デプロイ作成（ファイルのSHA-1ハッシュを送る）
//   2. ファイルアップロード（required に含まれていれば）
//   3. ポーリング（state が 'ready' になるまで）
const crypto = require("crypto");

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const POLL_INTERVAL_MS = 1500;
const POLL_MAX_ATTEMPTS = 6; // 6 × 1.5秒 = 9秒（Functions の10秒上限内に収める）

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: CORS_HEADERS, body: "" };
  }
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: "Method Not Allowed" }),
    };
  }

  const TOKEN = process.env.NETLIFY_DEPLOY_TOKEN;
  const SITE_ID = process.env.NETLIFY_REPORT_SITE_ID;
  if (!TOKEN || !SITE_ID) {
    return {
      statusCode: 500,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      body: JSON.stringify({
        error: "NETLIFY_DEPLOY_TOKEN または NETLIFY_REPORT_SITE_ID が未設定",
      }),
    };
  }

  try {
    const { html } = JSON.parse(event.body || "{}");
    if (!html || typeof html !== "string") {
      return {
        statusCode: 400,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        body: JSON.stringify({ error: "html が指定されていません" }),
      };
    }

    const htmlBuffer = Buffer.from(html, "utf-8");
    const sha1 = crypto.createHash("sha1").update(htmlBuffer).digest("hex");

    // Step 1: デプロイ作成
    const createRes = await fetch(
      `https://api.netlify.com/api/v1/sites/${SITE_ID}/deploys`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ files: { "/index.html": sha1 } }),
      }
    );
    if (!createRes.ok) {
      const errText = await createRes.text();
      throw new Error(
        `デプロイ作成失敗 (HTTP ${createRes.status}): ${errText}`
      );
    }
    const createData = await createRes.json();
    const deployId = createData.id;
    const required = createData.required || [];
    const fallbackUrl = createData.ssl_url || createData.url;

    // Step 2: ファイルアップロード（必要な場合のみ）
    if (required.includes(sha1)) {
      const uploadRes = await fetch(
        `https://api.netlify.com/api/v1/deploys/${deployId}/files/index.html`,
        {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${TOKEN}`,
            "Content-Type": "application/octet-stream",
          },
          body: htmlBuffer,
        }
      );
      if (!uploadRes.ok) {
        const errText = await uploadRes.text();
        throw new Error(
          `ファイルアップロード失敗 (HTTP ${uploadRes.status}): ${errText}`
        );
      }
    }

    // Step 3: ポーリング（state が 'ready' になるまで）
    for (let i = 0; i < POLL_MAX_ATTEMPTS; i++) {
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
      const checkRes = await fetch(
        `https://api.netlify.com/api/v1/deploys/${deployId}`,
        { headers: { Authorization: `Bearer ${TOKEN}` } }
      );
      if (!checkRes.ok) {
        const errText = await checkRes.text();
        throw new Error(
          `デプロイ状態確認失敗 (HTTP ${checkRes.status}): ${errText}`
        );
      }
      const data = await checkRes.json();
      if (data.state === "ready") {
        return {
          statusCode: 200,
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
          body: JSON.stringify({ url: data.ssl_url || fallbackUrl }),
        };
      }
      if (data.state === "error") {
        throw new Error("Deploy failed: " + (data.error_message || "unknown"));
      }
    }

    throw new Error(
      `デプロイがタイムアウトしました（${(POLL_INTERVAL_MS * POLL_MAX_ATTEMPTS) / 1000}秒）`
    );
  } catch (e) {
    return {
      statusCode: 500,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      body: JSON.stringify({ error: "deploy failed: " + e.message }),
    };
  }
};
