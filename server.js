const http = require("http");
const fs = require("fs");
const path = require("path");
const nodemailer = require("nodemailer");

loadEnvFile();

const PORT = process.env.PORT || 3000;
const ROOT = path.join(__dirname, "public");
const LEADS_DIR = path.join(__dirname, "leads");

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".webp": "image/webp",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".ico": "image/x-icon"
};

const LONG_CACHE_EXTENSIONS = new Set([".avif", ".gif", ".ico", ".jpeg", ".jpg", ".png", ".svg", ".webp"]);
const SHORT_CACHE_EXTENSIONS = new Set([".css", ".js", ".json", ".txt", ".xml"]);

function getStaticHeaders(filePath, stats) {
  const ext = path.extname(filePath);
  const headers = {
    "Content-Type": MIME_TYPES[ext] || "application/octet-stream",
    "ETag": `W/"${stats.size}-${Number(stats.mtimeMs).toString(16)}"`,
    "Last-Modified": stats.mtime.toUTCString()
  };

  if (ext === ".html") {
    headers["Cache-Control"] = "no-cache";
  } else if (LONG_CACHE_EXTENSIONS.has(ext)) {
    headers["Cache-Control"] = "public, max-age=31536000, immutable";
  } else if (SHORT_CACHE_EXTENSIONS.has(ext)) {
    headers["Cache-Control"] = "no-cache";
  }

  return headers;
}

function loadEnvFile() {
  const envPath = path.join(__dirname, ".env");
  if (!fs.existsSync(envPath)) return;

  const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const separator = trimmed.indexOf("=");
    if (separator === -1) continue;

    const key = trimmed.slice(0, separator).trim();
    let value = trimmed.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    if (key && !process.env[key]) {
      process.env[key] = value;
    }
  }
}

function sendJson(res, status, payload) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

function sanitizeLead(input) {
  const lead = {
    name: String(input.name || "").trim(),
    company: String(input.company || "").trim(),
    contact: String(input.contact || "").trim(),
    email: String(input.email || "").trim(),
    product: String(input.product || "").trim(),
    message: String(input.message || "").trim(),
    language: String(input.language || "zh").trim()
  };

  if (!lead.name || !lead.contact || !lead.product || !lead.message) {
    return { error: "请完整填写姓名、联系方式、感兴趣产品和需求描述。" };
  }

  if (lead.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(lead.email)) {
    return { error: "邮箱格式不正确。" };
  }

  return { lead };
}

function getEmailConfig() {
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const to = process.env.LEAD_EMAIL_TO;

  if (!host || !user || !pass || !to) return null;

  const port = Number(process.env.SMTP_PORT || 465);
  return {
    host,
    port,
    secure: String(process.env.SMTP_SECURE || port === 465).toLowerCase() === "true",
    user,
    pass,
    to,
    from: process.env.LEAD_EMAIL_FROM || `"向量跃迁官网" <${user}>`
  };
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildLeadEmail(record) {
  const leadIdentity = record.company || "个人咨询";
  const subject = `官网咨询：${leadIdentity} - ${record.product}`;
  const rows = [
    ["姓名", record.name],
    ["公司/身份", record.company || "个人/未填写"],
    ["联系方式", record.contact],
    ["邮箱", record.email || "未填写"],
    ["感兴趣产品", record.product],
    ["提交语言", record.language],
    ["提交时间", record.submittedAt],
    ["需求描述", record.message]
  ];

  const text = rows.map(([label, value]) => `${label}: ${value}`).join("\n");
  const htmlRows = rows.map(([label, value]) => `
    <tr>
      <th style="text-align:left;padding:10px 12px;border-bottom:1px solid #e7ebf2;width:120px;color:#111827;">${escapeHtml(label)}</th>
      <td style="padding:10px 12px;border-bottom:1px solid #e7ebf2;color:#344054;">${escapeHtml(value).replace(/\n/g, "<br>")}</td>
    </tr>
  `).join("");

  const html = `
    <div style="font-family:Arial,'Microsoft YaHei',sans-serif;line-height:1.6;color:#111827;">
      <h2 style="margin:0 0 16px;">向量跃迁官网收到新的客户咨询</h2>
      <table style="border-collapse:collapse;width:100%;max-width:720px;border:1px solid #e7ebf2;">${htmlRows}</table>
    </div>
  `;

  return { subject, text, html };
}

async function sendLeadEmail(record) {
  const config = getEmailConfig();
  if (!config) return "skipped";

  const transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: {
      user: config.user,
      pass: config.pass
    }
  });

  const email = buildLeadEmail(record);
  await transporter.sendMail({
    from: config.from,
    to: config.to,
    replyTo: record.email || undefined,
    subject: email.subject,
    text: email.text,
    html: email.html
  });

  return "sent";
}

function handleContact(req, res) {
  let body = "";
  req.on("data", (chunk) => {
    body += chunk;
    if (body.length > 1_000_000) {
      req.destroy();
    }
  });

  req.on("end", async () => {
    try {
      const parsed = JSON.parse(body || "{}");
      const result = sanitizeLead(parsed);
      if (result.error) {
        sendJson(res, 400, { ok: false, message: result.error });
        return;
      }

      fs.mkdirSync(LEADS_DIR, { recursive: true });
      const fileName = `${new Date().toISOString().replace(/[:.]/g, "-")}-${result.lead.language}.json`;
      const record = {
        ...result.lead,
        submittedAt: new Date().toISOString(),
        recipient: process.env.LEAD_EMAIL_TO || "business@example.com"
      };

      let emailStatus = "skipped";
      try {
        emailStatus = await sendLeadEmail(record);
      } catch (error) {
        emailStatus = "failed";
        console.error("Lead email failed:", error.message);
      }

      record.emailStatus = emailStatus;
      fs.writeFileSync(path.join(LEADS_DIR, fileName), JSON.stringify(record, null, 2), "utf8");

      sendJson(res, 200, {
        ok: true,
        emailStatus,
        message: result.lead.language === "en"
          ? "Submitted successfully. Our team will contact you soon."
          : "提交成功，我们会尽快与您联系。"
      });
    } catch (error) {
      sendJson(res, 500, { ok: false, message: "提交失败，请稍后再试。" });
    }
  });
}

function serveStatic(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  let pathname = decodeURIComponent(url.pathname);

  if (pathname === "/") {
    pathname = "/index.html";
  } else if (!path.extname(pathname)) {
    pathname = `${pathname}.html`;
  }

  const filePath = path.normalize(path.join(ROOT, pathname));
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  fs.stat(filePath, (statError, stats) => {
    if (statError || !stats.isFile()) {
      fs.readFile(path.join(ROOT, "404.html"), (notFoundError, notFoundData) => {
        res.writeHead(404, { "Content-Type": MIME_TYPES[".html"] });
        res.end(notFoundError ? "Not found" : notFoundData);
      });
      return;
    }

    const headers = getStaticHeaders(filePath, stats);
    if (req.headers["if-none-match"] === headers.ETag) {
      res.writeHead(304, headers);
      res.end();
      return;
    }

    fs.readFile(filePath, (error, data) => {
      if (error) {
        res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
        res.end("Server error");
        return;
      }

      res.writeHead(200, headers);
      res.end(req.method === "HEAD" ? undefined : data);
    });
  });
}

const server = http.createServer((req, res) => {
  if (req.method === "POST" && req.url === "/api/contact") {
    handleContact(req, res);
    return;
  }

  if (req.method === "GET" || req.method === "HEAD") {
    serveStatic(req, res);
    return;
  }

  res.writeHead(405);
  res.end("Method not allowed");
});

if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`向量跃迁官网已启动：http://localhost:${PORT}`);
  });
}

module.exports = { server };
