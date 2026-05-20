const assert = require("assert");
const { server } = require("./server");

async function run() {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  const base = `http://127.0.0.1:${port}`;

  for (const route of ["/", "/products", "/solutions", "/about", "/contact"]) {
    const response = await fetch(`${base}${route}`);
    assert.strictEqual(response.status, 200, `${route} should return 200`);
    const html = await response.text();
    assert(html.includes("data-i18n") || html.includes("向量跃迁"), `${route} should contain page content`);
  }

  const badResponse = await fetch(`${base}/api/contact`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "测试" })
  });
  assert.strictEqual(badResponse.status, 400, "invalid lead should return 400");

  const leadResponse = await fetch(`${base}/api/contact`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "测试客户",
      company: "测试公司",
      contact: "13800000000",
      email: "test@example.com",
      product: "AI客服",
      message: "想了解AI客服接入",
      language: "zh"
    })
  });
  assert.strictEqual(leadResponse.status, 200, "valid lead should return 200");
  const leadResult = await leadResponse.json();
  assert.strictEqual(leadResult.ok, true, "valid lead should be accepted");

  const personalLeadResponse = await fetch(`${base}/api/contact`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "个人客户",
      contact: "wx-personal",
      product: "灵感方舟",
      message: "个人身份先了解一下产品",
      language: "zh"
    })
  });
  assert.strictEqual(personalLeadResponse.status, 200, "lead without company should return 200");
  const personalLeadResult = await personalLeadResponse.json();
  assert.strictEqual(personalLeadResult.ok, true, "lead without company should be accepted");

  await new Promise((resolve) => server.close(resolve));
  console.log("site checks passed");
}

run().catch(async (error) => {
  console.error(error);
  await new Promise((resolve) => server.close(resolve));
  process.exit(1);
});
