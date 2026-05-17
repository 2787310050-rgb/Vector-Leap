const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 3000;
const ROOT = path.join(__dirname, "public");
const LEADS_DIR = path.join(__dirname, "leads");

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".ico": "image/x-icon"
};

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

  if (!lead.name || !lead.company || !lead.contact || !lead.product || !lead.message) {
    return { error: "请完整填写姓名、公司、联系方式、感兴趣产品和需求描述。" };
  }

  if (lead.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(lead.email)) {
    return { error: "邮箱格式不正确。" };
  }

  return { lead };
}

function handleContact(req, res) {
  let body = "";
  req.on("data", (chunk) => {
    body += chunk;
    if (body.length > 1_000_000) {
      req.destroy();
    }
  });

  req.on("end", () => {
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
      fs.writeFileSync(path.join(LEADS_DIR, fileName), JSON.stringify(record, null, 2), "utf8");

      sendJson(res, 200, {
        ok: true,
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

  fs.readFile(filePath, (error, data) => {
    if (error) {
      fs.readFile(path.join(ROOT, "404.html"), (notFoundError, notFoundData) => {
        res.writeHead(404, { "Content-Type": MIME_TYPES[".html"] });
        res.end(notFoundError ? "Not found" : notFoundData);
      });
      return;
    }

    const ext = path.extname(filePath);
    res.writeHead(200, { "Content-Type": MIME_TYPES[ext] || "application/octet-stream" });
    res.end(data);
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
