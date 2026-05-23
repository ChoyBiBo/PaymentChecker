# HOA Payment Checker

Homeowners Association management system with:
- **Web Admin Panel** (Node.js + Express + PostgreSQL)
- **Android QR Scanner App** (Native Kotlin)

---

## Setup Instructions

### 1. Database Setup

Make sure PostgreSQL is running with a database named `HOA_App`.

```
psql -U postgres -c "CREATE DATABASE \"HOA_App\";"
```

### 2. Server Setup

```bash
cd "C:\Users\ASUS Vivobook\Desktop\AI Projects\PaymentChecker"

# Install dependencies
npm install

# Create .env file
copy .env.example .env
```

Edit `.env` with your PostgreSQL password and set strong values for:
- `SESSION_SECRET` — any long random string
- `SCAN_API_KEY` — this is the key you'll enter in the Android app

```bash
# Initialize database (creates tables + admin user)
npm run setup-db

# Start the server
npm start
```

Open http://localhost:3000 in your browser.

**Default login:** `admin` / `admin123` — change after first login!

### 3. Android App Setup

1. Open `android/` folder in Android Studio
2. Let Gradle sync (downloads dependencies automatically)
3. Build → Generate Signed APK (or Run on device via USB)

**First-time app setup:**
1. Open the app → tap Settings (⚙ icon)
2. Enter **Server URL**: `http://YOUR_PC_IP:3000` (e.g., `http://192.168.1.50:3000`)
3. Enter **API Key**: same value as `SCAN_API_KEY` in your `.env` file
4. Tap **Test Connection** to verify
5. Tap **Save Settings**

> Both your PC and Android phone must be on the same WiFi network.

---

## Usage

### Admin Panel
| Page | URL |
|------|-----|
| Dashboard | `/dashboard.html` |
| Homeowners | `/homeowners.html` |
| Record Payment | `/payments.html` |
| Print QR Codes | `/qr-print.html` |
| Reports | `/reports.html` |
| Announcements | `/announcements.html` |
| Settings | `/settings.html` |

### Android App
1. Open app → camera starts automatically
2. Point camera at homeowner's QR code
3. **Green screen** = payment is updated ✓
4. **Red screen** = payment is outdated ✕
5. Screen auto-dismisses after 2.5 seconds

### QR Codes
1. Go to **QR Codes** page in admin panel
2. Select a homeowner → preview appears
3. Click **Print This QR** for a single card
4. Click **Print All QR Codes** for all homeowners (6 per A4 page)
5. Print and give each homeowner their card

---

## Development

```bash
npm run dev    # Start with nodemon (auto-restart on file changes)
npm start      # Production start
```

---

## Project Structure

```
PaymentChecker/
├── .env                  ← Your config (create from .env.example)
├── package.json
├── server/
│   ├── index.js          ← Express app entry point
│   ├── db.js             ← PostgreSQL connection
│   ├── schema.sql        ← Database schema
│   ├── setup-db.js       ← Run once to initialize database
│   ├── middleware/
│   │   └── auth.js
│   └── routes/
│       ├── auth.js
│       ├── homeowners.js
│       ├── payments.js
│       ├── qr.js         ← QR code image generation
│       ├── scan.js       ← Android scan endpoint
│       ├── reports.js
│       ├── announcements.js
│       └── admin-users.js
├── web/                  ← Admin panel (served as static files)
│   ├── login.html
│   ├── dashboard.html
│   ├── homeowners.html
│   ├── payments.html
│   ├── qr-print.html
│   ├── reports.html
│   ├── announcements.html
│   ├── settings.html
│   ├── css/app.css
│   └── js/
│       ├── api.js
│       ├── auth.js
│       ├── dashboard.js
│       ├── homeowners.js
│       ├── payments.js
│       ├── qr.js
│       ├── reports.js
│       ├── announcements.js
│       └── settings.js
└── android/              ← Native Kotlin Android app
    └── app/src/main/java/com/hoa/paymentchecker/
```
