# Vector Leap Corporate Website

向量跃迁企业官网第一版，包含中英双语页面、产品展示、解决方案、关于我们和客户咨询表单。

## Run Locally

```powershell
npm.cmd start
```

Then open:

```text
http://localhost:3000/
```

## Test

```powershell
npm.cmd test
```

## Email Notifications

Copy `.env.example` to `.env` on the server and fill in SMTP credentials. When a visitor submits the contact form, the server saves a local backup under `leads/` and sends a notification email to `LEAD_EMAIL_TO`.

## Notes

- Static pages live in `public/`.
- Brand assets live in `public/assets/`.
- Contact form submissions are saved to `leads/` locally and ignored by Git.
