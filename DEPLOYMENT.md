# Umi Cash — Deployment Guide

**Stack:** Vercel (hosting) · Supabase (PostgreSQL database) · custom domain

---

## Overview

| Layer | Service | Cost |
|---|---|---|
| Hosting | Vercel | Free tier / Pro $20/mo |
| Database | Supabase | Free tier / Pro $25/mo |
| Email | Resend | Free up to 3,000/mo |
| Apple Wallet | Apple Developer | $99/year |
| Google Wallet | Google Cloud | Free |
| Domain | Your registrar | Already owned |

---

## Accounts you need before starting

- [ ] GitHub account
- [ ] Vercel account — [vercel.com](https://vercel.com) (sign up with GitHub)
- [ ] Supabase account — you already have this
- [ ] Resend account — [resend.com](https://resend.com) (optional, for emails)
- [ ] Apple Developer account — [developer.apple.com](https://developer.apple.com) ($99/year, for Apple Wallet)
- [ ] Google Cloud account — [console.cloud.google.com](https://console.cloud.google.com) (free, for Google Wallet)

---

## Part 1 — Prepare the code

### 1.1 Switch the database from SQLite to PostgreSQL

Open `prisma/schema.prisma` and change the datasource block:

```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}
```

Then delete the old SQLite migration folder (it's SQLite-specific and won't work with PostgreSQL):

```bash
rm -rf prisma/migrations
```

### 1.2 Push code to GitHub

If your project isn't on GitHub yet, go to [github.com](https://github.com) → **New repository** → name it `umi-cash` → **Private** → **Create repository**.

Then in your terminal inside the project folder:

```bash
git init
git add .
git commit -m "Initial commit — switch to PostgreSQL"
git remote add origin https://github.com/YOUR_USERNAME/umi-cash.git
git push -u origin main
```

> **Important:** make sure `.env.local` is listed in your `.gitignore` file. Never push secrets to GitHub.

---

## Part 2 — Set up Supabase

### 2.1 Create a new project

1. Log in to [supabase.com](https://supabase.com)
2. Click **New project**
3. Name it `umi-cash`, choose a strong database password (save it somewhere safe), pick the region closest to Mexico (US East or US West)
4. Wait ~2 minutes for the project to provision

### 2.2 Get your connection string

1. In your Supabase project, go to **Settings** (gear icon) → **Database**
2. Scroll to **Connection string** → select **URI** tab
3. Copy the string — it looks like:
   ```
   postgresql://postgres:[YOUR-PASSWORD]@db.xxxxxxxxxxxx.supabase.co:5432/postgres
   ```
4. Replace `[YOUR-PASSWORD]` with the database password you chose in step 2.1
5. Keep this safe — this is your `DATABASE_URL`

> **Supabase tip:** also copy the **Session mode** connection string (port 5432) not the transaction mode (port 6543) — Prisma works better with session mode.

---

## Part 3 — Set up Vercel

### 3.1 Import your project

1. Go to [vercel.com](https://vercel.com) → **Add New Project**
2. Click **Import** next to your `umi-cash` GitHub repository
3. Vercel will detect Next.js automatically
4. **Do not deploy yet** — add environment variables first (next step)

### 3.2 Generate secrets

Run each of these commands in your terminal to generate strong random secrets. Run it three separate times and save each output:

```bash
openssl rand -base64 32
```

You need three outputs: one for each of `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, and `APP_QR_SECRET`.

### 3.3 Add environment variables

In the Vercel import screen, expand **Environment Variables** and add every variable below. You can also add them later via **Project Settings → Environment Variables**.

#### Required — app will not start without these

| Variable | Value |
|---|---|
| `DATABASE_URL` | Your Supabase connection string from Part 2 |
| `JWT_ACCESS_SECRET` | Generated secret #1 |
| `JWT_REFRESH_SECRET` | Generated secret #2 |
| `APP_QR_SECRET` | Generated secret #3 |
| `UMI_ADMIN_PASSWORD` | Your master admin password (make it strong) |
| `NEXT_PUBLIC_APP_URL` | `https://cash.umiconsulting.co` |

#### Apple Wallet — required for Apple Wallet passes

| Variable | Value |
|---|---|
| `APPLE_TEAM_ID` | Your 10-character Apple Team ID |
| `APPLE_PASS_TYPE_ID` | `pass.co.umicash.loyalty` |
| `APPLE_CERT_BASE64` | Your signer certificate (Base64-encoded) |
| `APPLE_KEY_BASE64` | Your signer private key (Base64-encoded) |
| `APPLE_KEY_PASSPHRASE` | Your certificate passphrase (or leave blank) |
| `APPLE_WWDR_BASE64` | Apple WWDR certificate (Base64-encoded) |
| `APPLE_APN_KEY_ID` | Your APN key ID |
| `APPLE_APN_KEY_BASE64` | Your APN .p8 key (Base64-encoded) |
| `APPLE_APN_BUNDLE_ID` | `pass.co.umicash.loyalty` |

> See Part 5 for how to obtain and encode Apple certificates.

#### Google Wallet — required for Google Wallet passes

| Variable | Value |
|---|---|
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | `wallet@your-project.iam.gserviceaccount.com` |
| `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` | The private key from your service account JSON |
| `GOOGLE_WALLET_ISSUER_ID` | Your Google Wallet issuer ID |
| `GOOGLE_WALLET_CLASS_ID` | `umicash_loyalty_v1` |

> See Part 6 for how to obtain Google Wallet credentials.

#### Email — optional but recommended

| Variable | Value |
|---|---|
| `RESEND_API_KEY` | From resend.com dashboard |
| `EMAIL_FROM` | `Umi Cash <noreply@umiconsulting.co>` |

### 3.4 Deploy

Click **Deploy**. Vercel will build the app (~2–3 minutes). It will fail on the first run if the database tables don't exist yet — that's expected. Fix it in the next step.

---

## Part 4 — Initialize the database

### 4.1 Run database migrations

After the first deploy, open your terminal and run:

```bash
# Set your Supabase DATABASE_URL temporarily in your local environment
export DATABASE_URL="postgresql://postgres:[PASSWORD]@db.xxxx.supabase.co:5432/postgres"

# Push the schema to Supabase (creates all tables)
npx prisma db push
```

This creates every table in Supabase. You only need to do this once, and again whenever you change `prisma/schema.prisma`.

### 4.2 Trigger a redeploy

Go to Vercel → your project → **Deployments** → click the three dots on the latest deployment → **Redeploy**. The app should now start successfully.

### 4.3 Verify the app is running

Visit `https://your-project.vercel.app/umi/admin` and log in with your `UMI_ADMIN_PASSWORD`. If you see the master admin dashboard, the database and app are working.

---

## Part 5 — Custom domain

### 5.1 Add the domain in Vercel

1. Go to your Vercel project → **Settings** → **Domains**
2. Type `cash.umiconsulting.co` → **Add**
3. Vercel will show you the DNS records to add — it will be a CNAME record

### 5.2 Add DNS records at your registrar

Log in to wherever you manage `umiconsulting.co` (GoDaddy, Namecheap, Cloudflare, etc.) → DNS settings → add:

| Type | Name | Value |
|---|---|---|
| CNAME | `cash` | `cname.vercel-dns.com` |

> If your domain is already on Cloudflare, set the proxy to **DNS only** (gray cloud) for the CNAME record initially.

DNS propagation takes between 5 minutes and 24 hours. Vercel handles SSL (HTTPS) automatically once DNS is verified — no certificate setup needed.

---

## Part 6 — Apple Wallet certificates

You need an **Apple Developer account** ($99/year) at [developer.apple.com](https://developer.apple.com).

### 6.1 Create a Pass Type ID

1. Log in → **Certificates, IDs & Profiles** → **Identifiers** → **+**
2. Select **Pass Type IDs** → Continue
3. Description: `Umi Cash Loyalty`, Identifier: `pass.co.umicash.loyalty` → Register

### 6.2 Create the Pass certificate

1. **Certificates** → **+** → **Pass Type ID Certificate** → Continue
2. Select your Pass Type ID → Continue
3. Follow the instructions to create a CSR using Keychain Access on your Mac
4. Upload the CSR → download the certificate (`pass.cer`)
5. Double-click `pass.cer` to install it in Keychain

### 6.3 Export and convert to PEM

Open **Keychain Access** → find the pass certificate → right-click → **Export** → save as `pass.p12` with a passphrase.

Then in Terminal:

```bash
# Extract the certificate
openssl pkcs12 -in pass.p12 -clcerts -nokeys -out signerCert.pem

# Extract the private key
openssl pkcs12 -in pass.p12 -nocerts -nodes -out signerKey.pem

# Download Apple WWDR G4 certificate from:
# https://www.apple.com/certificateauthority/
# Save as wwdr.pem
```

### 6.4 Create APN key (for push notifications)

1. **Keys** → **+** → check **Apple Push Notifications service (APNs)** → name it `Umi Cash APN`
2. Download the `.p8` file (you can only download it once — keep it safe)
3. Note the **Key ID** — this is your `APPLE_APN_KEY_ID`

### 6.5 Base64-encode for Vercel

Vercel environment variables are text, not files. Encode each file:

```bash
base64 -i signerCert.pem | tr -d '\n'    # → APPLE_CERT_BASE64
base64 -i signerKey.pem | tr -d '\n'     # → APPLE_KEY_BASE64
base64 -i wwdr.pem | tr -d '\n'          # → APPLE_WWDR_BASE64
base64 -i AuthKey_XXXXXXXX.p8 | tr -d '\n'  # → APPLE_APN_KEY_BASE64
```

Copy each output into the corresponding Vercel environment variable.

> **After adding these variables** the code will need to be updated to read from Base64 env vars instead of file paths. Ask the developer to update the certificate loading code once you have the certificates ready.

---

## Part 7 — Google Wallet

### 7.1 Create a Google Cloud project

1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. **Select a project** → **New Project** → name it `umi-cash` → Create

### 7.2 Enable the Google Wallet API

1. In your project → **APIs & Services** → **Library**
2. Search for **Google Wallet API** → Enable

### 7.3 Create a service account

1. **IAM & Admin** → **Service Accounts** → **Create Service Account**
2. Name: `wallet-service` → Create
3. Role: **Editor** (or Wallet Objects Editor if available) → Done
4. Click the service account → **Keys** tab → **Add Key** → **JSON** → Create
5. A JSON file downloads — open it and copy:
   - `client_email` → `GOOGLE_SERVICE_ACCOUNT_EMAIL`
   - `private_key` → `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` (include the full `-----BEGIN...END-----` block)

### 7.4 Set up Google Wallet issuer

1. Go to [pay.google.com/business/console](https://pay.google.com/business/console)
2. Register as an issuer → fill in business details → submit for approval
3. Once approved, note your **Issuer ID** → `GOOGLE_WALLET_ISSUER_ID`
4. Create a **Loyalty class** with ID `umicash_loyalty_v1`

> Google Wallet approval can take 1–5 business days. The app works without it in the meantime.

---

## Part 8 — Email with Resend (optional)

1. Go to [resend.com](https://resend.com) → sign up → **API Keys** → **Create API Key**
2. Copy the key → `RESEND_API_KEY`
3. Go to **Domains** → **Add Domain** → enter `umiconsulting.co`
4. Add the DNS records Resend provides (similar to what you did for Vercel)
5. Once verified, emails will send from `noreply@umiconsulting.co`

---

## Part 9 — Go live checklist

Run through this after everything is configured:

**Core functionality**
- [ ] `https://cash.umiconsulting.co/umi/admin` loads and login works
- [ ] Can create a new tenant (coffee shop) from master admin
- [ ] Customer registration works at `/{slug}/register`
- [ ] QR scan registers a visit correctly
- [ ] Top-up adds balance correctly
- [ ] Reward redemption works

**Wallet passes**
- [ ] Apple Wallet pass downloads on iPhone
- [ ] Google Wallet pass opens on Android

**Domain & security**
- [ ] Site loads on `https://cash.umiconsulting.co` (HTTPS, not HTTP)
- [ ] `http://` redirects to `https://` automatically (Vercel handles this)
- [ ] Master admin password is strong and not shared

---

## Ongoing maintenance

### Deploying code changes

Every time you make changes to the code:

```bash
git add .
git commit -m "describe what changed"
git push
```

Vercel automatically detects the push and redeploys within ~2 minutes. No manual steps needed.

### Changing the database schema

If the schema in `prisma/schema.prisma` changes:

```bash
# Run locally with your Supabase DATABASE_URL set
npx prisma db push
```

Then push the schema file to GitHub as normal.

### Monitoring

- **Vercel dashboard** → Functions tab → shows API response times and errors
- **Supabase dashboard** → Table Editor → browse your data directly
- **Supabase** → Logs → see database query logs

### Backups

Supabase Pro ($25/mo) includes daily backups. On the free tier, export manually:

```bash
pg_dump "postgresql://postgres:[PASSWORD]@db.xxxx.supabase.co:5432/postgres" > backup.sql
```

---

## Recommended order of operations

| # | Task | Time | Blocker? |
|---|---|---|---|
| 1 | Push code to GitHub | 15 min | Yes — everything else depends on this |
| 2 | Set up Supabase + get connection string | 10 min | Yes |
| 3 | Deploy to Vercel + env vars | 30 min | Yes |
| 4 | Run `prisma db push` | 5 min | Yes |
| 5 | Add custom domain + DNS | 15 min + propagation | No — app works on vercel.app URL meanwhile |
| 6 | Resend email setup | 20 min | No — app works without email |
| 7 | Apple Wallet certificates | 1–2 hours | No — web card view works without it |
| 8 | Google Wallet setup | 1 hour + approval wait | No — web card view works without it |

**Bottom line:** steps 1–4 get you a working live app. Steps 5–8 can be done after launch.
